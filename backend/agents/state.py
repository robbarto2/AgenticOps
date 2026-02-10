"""Shared agent state flowing through the LangGraph graph."""

from __future__ import annotations

import operator
from typing import Annotated, TypedDict

from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    """State that flows through the multi-agent graph."""

    messages: Annotated[list, add_messages]  # Chat history
    user_query: str  # Current user query
    active_agent: str  # Which specialist is currently active
    generate_cards: bool  # Whether to generate canvas cards for this query
    tool_results: list[dict]  # Collected MCP tool outputs
    cards: list[dict]  # Card directives to send to frontend
    agent_events: list[dict]  # Progress events for streaming
    table_data: Annotated[list[dict], operator.add]  # Structured table data for interactive hover popups
