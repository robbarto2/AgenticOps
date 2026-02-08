"""WebSocket endpoint for chat streaming."""

from __future__ import annotations

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
    logger.info("WebSocket connected: session=%s", session_id)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await _send_event(websocket, "error", {"message": "Invalid JSON"})
                continue

            if message.get("type") != "user_message":
                await _send_event(websocket, "error", {"message": f"Unknown message type: {message.get('type')}"})
                continue

            content = message.get("content", "").strip()
            if not content:
                continue

            session_id = message.get("session_id", "default")

            # Get or create session
            session = session_store.get_or_create(session_id)
            session.add_message("user", content)

            # Build initial agent state
            from langchain_core.messages import HumanMessage

            initial_state: AgentState = {
                "messages": [HumanMessage(content=m["content"]) for m in session.messages if m["role"] == "user"],
                "user_query": content,
                "active_agent": "",
                "tool_results": [],
                "cards": [],
                "agent_events": [],
            }

            try:
                # Stream events from the agent graph
                last_events_sent = 0

                async for event in agent_graph.astream(
                    initial_state,
                    stream_mode="updates",
                ):
                    # event is a dict of {node_name: state_update}
                    for node_name, state_update in event.items():
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

                        # Send card directives
                        cards = state_update.get("cards", [])
                        for card in cards:
                            await _send_event(websocket, "card", card)

                # Store the assistant response in session
                # Get the final state to extract the response
                session.add_message("assistant", "Response delivered via cards and text.")

                await _send_event(websocket, "done", None)

            except Exception:
                logger.exception("Error processing query: %s", content)
                await _send_event(websocket, "error", {"message": "An error occurred while processing your query."})
                await _send_event(websocket, "done", None)

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: session=%s", session_id)


async def _send_event(websocket: WebSocket, event_type: str, data: dict | str | None) -> None:
    """Send a typed event over the WebSocket."""
    await websocket.send_json({"type": event_type, "data": data})
