"""Shared agent state flowing through the LangGraph graph."""

from __future__ import annotations

from typing import Annotated, TypedDict

from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    """State that flows through the multi-agent graph."""

    messages: Annotated[list, add_messages]  # Chat history
    user_query: str  # Current user query
    active_agent: str  # Which specialist is currently active
    tool_results: list[dict]  # Collected MCP tool outputs
    cards: list[dict]  # Card directives to send to frontend
    agent_events: list[dict]  # Progress events for streaming
