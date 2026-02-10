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

    async def process_query(content: str, sid: str) -> None:
        """Run the agent graph and stream results back via WebSocket."""
        session = session_store.get_or_create(sid)
        session.add_message("user", content)

        from langchain_core.messages import HumanMessage

        initial_state: AgentState = {
            "messages": [HumanMessage(content=m["content"]) for m in session.messages if m["role"] == "user"],
            "user_query": content,
            "active_agent": "",
            "generate_cards": False,
            "tool_results": [],
            "cards": [],
            "agent_events": [],
            "table_data": [],
        }

        try:
            # Immediately tell the UI the orchestrator is working
            await _send_event(websocket, "agent_start", {"type": "agent_start", "agent": "orchestrator"})

            last_events_sent = 0

            async for event in agent_graph.astream(
                initial_state,
                stream_mode="updates",
            ):
                for node_name, state_update in event.items():
                    logger.info("Stream update from node '%s', keys: %s", node_name, list(state_update.keys()))

                    # Send any new agent events
                    agent_events = state_update.get("agent_events", [])
                    for evt in agent_events[last_events_sent:]:
                        await _send_event(websocket, evt["type"], evt)
                    last_events_sent = len(agent_events)

                    # If we have messages, extract the AI response text
                    new_messages = state_update.get("messages", [])
                    for msg in new_messages:
                        if hasattr(msg, "type") and msg.type == "ai" and msg.content:
                            text = msg.content if isinstance(msg.content, str) else str(msg.content)
                            if text and not msg.tool_calls:
                                await _send_event(websocket, "text", text)

                    # Send table data for interactive hover popups
                    tables = state_update.get("table_data", [])
                    if tables:
                        logger.info("Sending %d table_data events from node '%s'", len(tables), node_name)
                    for table in tables:
                        await _send_event(websocket, "table_data", table)

                    # Send card directives
                    cards = state_update.get("cards", [])
                    for card in cards:
                        await _send_event(websocket, "card", card)

            session.add_message("assistant", "Response delivered.")
            await _send_event(websocket, "done", None)

        except asyncio.CancelledError:
            logger.info("Query processing cancelled: %s", content[:100])
            await _send_event(websocket, "done", {"stopped": True})
        except Exception:
            logger.exception("Error processing query: %s", content)
            await _send_event(websocket, "error", {"message": "An error occurred while processing your query."})
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

            if msg_type != "user_message":
                await _send_event(websocket, "error", {"message": f"Unknown message type: {msg_type}"})
                continue

            content = message.get("content", "").strip()
            if not content:
                continue

            session_id = message.get("session_id", "default")

            # Cancel any existing processing before starting new one
            if processing_task and not processing_task.done():
                processing_task.cancel()
                try:
                    await processing_task
                except (asyncio.CancelledError, Exception):
                    pass

            processing_task = asyncio.create_task(process_query(content, session_id))

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: session=%s", session_id)
        if processing_task and not processing_task.done():
            processing_task.cancel()


async def _send_event(websocket: WebSocket, event_type: str, data: dict | str | None) -> None:
    """Send a typed event over the WebSocket."""
    try:
        await websocket.send_json({"type": event_type, "data": data})
    except Exception:
        pass  # Connection may already be closed
