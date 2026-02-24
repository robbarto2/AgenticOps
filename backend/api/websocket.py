"""WebSocket endpoint for chat streaming."""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from agents.graph import agent_graph
from agents.state import AgentState
from state.session import session_store

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/chat")
async def chat_websocket(websocket: WebSocket) -> None:
    """WebSocket endpoint for real-time chat with the agent system."""
    await websocket.accept()
    session_id = "default"
    processing_task: asyncio.Task | None = None
    logger.info("WebSocket connected: session=%s", session_id)

    async def process_query(content: str, sid: str, images: list[dict] | None = None) -> None:
        """Run the agent graph and stream results back via WebSocket."""
        session = session_store.get_or_create(sid)
        session.add_message("user", content)

        from langchain_core.messages import AIMessage, HumanMessage

        # Build messages from recent session history (limit context to avoid
        # bloating specialist LLM calls with full prior responses).
        # Keep last exchange (1 assistant + current user) for follow-up context.
        MAX_HISTORY_MESSAGES = 3  # prev assistant + prev user + current user
        recent = session.messages[-MAX_HISTORY_MESSAGES:]
        msg_objects = []
        for m in recent:
            if m["role"] == "user":
                msg_objects.append(HumanMessage(content=m["content"]))
            elif m["role"] == "assistant" and m["content"] != "Response delivered.":
                # Truncate long assistant responses to keep context manageable
                assistant_text = m["content"]
                if len(assistant_text) > 1500:
                    assistant_text = assistant_text[:1500] + "\n\n[...truncated for context]"
                msg_objects.append(AIMessage(content=assistant_text))

        # Replace the last HumanMessage with multimodal content if images are present
        if images and msg_objects and isinstance(msg_objects[-1], HumanMessage):
            content_blocks: list[dict] = [{"type": "text", "text": content}]
            for img in images:
                content_blocks.append({
                    "type": "image_url",
                    "image_url": {"url": img["dataUrl"]},
                })
            msg_objects[-1] = HumanMessage(content=content_blocks)

        initial_state: AgentState = {
            "messages": msg_objects,
            "user_query": content,
            "active_agent": "",
            "generate_cards": False,
            "tool_results": list(session.last_tool_results),
            "cards": [],
            "agent_events": [],
            "table_data": [],
            "has_images": bool(images),
            "agent_plan": [],
            "plan_step": 0,
            "pending_confirmation": {},
        }

        try:
            # Immediately tell the UI the orchestrator is working
            await _send_event(websocket, "agent_start", {"type": "agent_start", "agent": "orchestrator"})

            last_events_sent = 0
            accumulated_tool_results: list[dict] = []
            accumulated_assistant_text = ""

            async for event in agent_graph.astream(
                initial_state,
                stream_mode=["updates", "custom"],
            ):
                mode, payload = event

                # "custom" events: real-time tool_call events from StreamWriter
                if mode == "custom":
                    if isinstance(payload, dict) and "type" in payload:
                        await _send_event(websocket, payload["type"], payload)
                    continue

                # "updates" events: node completion with state updates
                for node_name, state_update in payload.items():
                    logger.info("Stream update from node '%s', keys: %s", node_name, list(state_update.keys()))

                    # Send agent events (orchestrator's agent_start)
                    agent_events = state_update.get("agent_events", [])
                    for evt in agent_events[last_events_sent:]:
                        await _send_event(websocket, evt["type"], evt)
                    last_events_sent = len(agent_events)

                    # Send agent_plan if available (from orchestrator)
                    agent_plan = state_update.get("agent_plan")
                    if agent_plan and len(agent_plan) > 1:
                        await _send_event(websocket, "agent_plan", {
                            "plan": agent_plan,
                            "step": state_update.get("plan_step", 0),
                        })

                    # Track tool results for session persistence
                    new_tool_results = state_update.get("tool_results", [])
                    if new_tool_results:
                        accumulated_tool_results = new_tool_results

                    # If we have messages, extract the AI response text
                    new_messages = state_update.get("messages", [])
                    for i, msg in enumerate(new_messages):
                        if hasattr(msg, "type") and msg.type == "ai" and msg.content:
                            text = _extract_text(msg.content)
                            # Send text if no tool calls OR if it's the last message (final response)
                            is_last_message = (i == len(new_messages) - 1)
                            if text and (not msg.tool_calls or is_last_message):
                                await _send_event(websocket, "text", text)
                                accumulated_assistant_text = text

                    # Send table data for interactive hover popups
                    tables = state_update.get("table_data", [])
                    if tables:
                        logger.info("Sending %d table_data events from node '%s'", len(tables), node_name)
                    for table in tables:
                        await _send_event(websocket, "table_data", table)

                    # Send card directives
                    cards = state_update.get("cards") or []
                    if cards:
                        logger.info("Sending %d card(s) from node '%s': %s",
                                    len(cards), node_name,
                                    [c.get("title", c.get("type", "?")) for c in cards])
                    for card in cards:
                        await _send_event(websocket, "card", card)

            # Persist tool results and assistant text for follow-up queries
            if accumulated_tool_results:
                session.last_tool_results = accumulated_tool_results
            if accumulated_assistant_text:
                session.last_assistant_text = accumulated_assistant_text
                session.add_message("assistant", accumulated_assistant_text)
            else:
                session.add_message("assistant", "Response delivered.")
            await _send_event(websocket, "done", None)

        except asyncio.CancelledError:
            logger.info("Query processing cancelled: %s", content[:100])
            await _send_event(websocket, "done", {"stopped": True})
        except Exception as e:
            logger.exception("Error processing query: %s", content)
            # Send more descriptive error to help with debugging
            error_msg = f"An error occurred: {type(e).__name__}"
            if str(e):
                error_msg += f" - {str(e)}"
            await _send_event(websocket, "error", {"message": error_msg})
            await _send_event(websocket, "done", None)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await _send_event(websocket, "error", {"message": "Invalid JSON"})
                continue

            msg_type = message.get("type")

            # Handle stop/cancel
            if msg_type == "stop":
                if processing_task and not processing_task.done():
                    processing_task.cancel()
                    logger.info("Stop requested, cancelling processing task")
                continue

            # Handle confirmation responses for remediation agent
            if msg_type == "confirmation_response":
                approved = message.get("approved", False)
                sid = message.get("session_id", "default")
                logger.info("Confirmation response: approved=%s", approved)
                if approved:
                    # Re-run the remediation agent with approval in state
                    session = session_store.get_or_create(sid)
                    session.add_message("user", "Approved: proceed with the change.")
                    # Cancel any existing processing before starting confirmation execution
                    if processing_task and not processing_task.done():
                        processing_task.cancel()
                        try:
                            await processing_task
                        except (asyncio.CancelledError, Exception):
                            pass
                    processing_task = asyncio.create_task(
                        process_query("Approved: proceed with the change.", sid)
                    )
                else:
                    await _send_event(websocket, "text", "Change cancelled by user.")
                    await _send_event(websocket, "done", None)
                continue

            if msg_type != "user_message":
                await _send_event(websocket, "error", {"message": f"Unknown message type: {msg_type}"})
                continue

            content = message.get("content", "").strip()
            if not content:
                continue

            session_id = message.get("session_id", "default")

            # Parse and validate image attachments
            allowed_mimes = {"image/png", "image/jpeg", "image/gif", "image/webp"}
            raw_images = message.get("images", [])
            validated_images = []
            for img in raw_images[:4]:  # Cap at 4 images
                if (
                    isinstance(img, dict)
                    and isinstance(img.get("dataUrl"), str)
                    and img["dataUrl"].startswith("data:image/")
                    and img.get("mimeType") in allowed_mimes
                ):
                    validated_images.append(img)

            # Cancel any existing processing before starting new one
            if processing_task and not processing_task.done():
                processing_task.cancel()
                try:
                    await processing_task
                except (asyncio.CancelledError, Exception):
                    pass

            processing_task = asyncio.create_task(
                process_query(content, session_id, validated_images or None)
            )

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: session=%s", session_id)
        if processing_task and not processing_task.done():
            processing_task.cancel()


def _extract_text(content: str | list) -> str:
    """Extract only text from an AI message content field.

    When Anthropic returns tool_use alongside text, msg.content is a list of
    content blocks like [{"type": "text", "text": "..."}, {"type": "tool_use", ...}].
    We only want the text portions.
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
            elif hasattr(block, "text"):
                parts.append(block.text)
        return "\n".join(parts).strip()
    return str(content)


async def _send_event(websocket: WebSocket, event_type: str, data: dict | str | None) -> None:
    """Send a typed event over the WebSocket."""
    try:
        await websocket.send_json({"type": event_type, "data": data})
    except Exception:
        pass  # Connection may already be closed
