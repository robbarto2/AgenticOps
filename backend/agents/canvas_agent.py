"""Canvas agent - structures data from specialist agents into card directives."""

from __future__ import annotations

import json
import logging
import uuid

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from agents.state import AgentState
from config import settings

logger = logging.getLogger(__name__)

CANVAS_SYSTEM_PROMPT = """You are the AgenticOps Canvas Agent. Your job is to take the analysis results from specialist agents and structure them as card directives for the frontend canvas.

You receive the user's query, the specialist's text response, and raw tool results. You must output a JSON array of card objects.

Available card types:
1. data_table - For tabular data
   { "type": "data_table", "title": "...", "source": "meraki|thousandeyes", "data": { "columns": ["col1", "col2"], "rows": [["val1", "val2"]] } }

2. bar_chart - For categorical comparisons
   { "type": "bar_chart", "title": "...", "source": "meraki|thousandeyes", "data": { "labels": ["A", "B"], "datasets": [{"label": "Series 1", "data": [10, 20], "color": "#3b82f6"}] } }

3. line_chart - For time-series data
   { "type": "line_chart", "title": "...", "source": "meraki|thousandeyes", "data": { "labels": ["T1", "T2"], "datasets": [{"label": "Metric", "data": [10, 15], "color": "#10b981"}] } }

4. alert_summary - For alerts and events
   { "type": "alert_summary", "title": "...", "source": "meraki|thousandeyes", "data": { "alerts": [{"severity": "critical|high|medium|low|info", "title": "...", "description": "...", "timestamp": "..."}] } }

5. text_report - For analysis narratives
   { "type": "text_report", "title": "...", "source": "meraki|thousandeyes", "data": { "content": "Markdown text..." } }

6. network_health - For metric tiles
   { "type": "network_health", "title": "...", "source": "meraki|thousandeyes", "data": { "metrics": [{"label": "Metric", "value": "95%", "status": "healthy|warning|critical", "icon": "wifi|server|shield|globe"}] } }

Guidelines:
- Choose the most appropriate card type for the data
- Use meaningful, descriptive titles
- Set the correct source ("meraki" or "thousandeyes") based on where the data came from
- Extract and transform raw tool results into clean card data
- Create multiple cards when the data covers different aspects
- Use colors that work on a dark theme (blue: #3b82f6, green: #10b981, amber: #f59e0b, red: #ef4444, purple: #8b5cf6)

Respond with ONLY a valid JSON array of card objects. No other text."""


async def canvas_node(state: AgentState) -> dict:
    """Structure specialist results into card directives."""
    query = state["user_query"]
    tool_results = state.get("tool_results", [])
    messages = state.get("messages", [])

    # Get the last AI message content as the specialist's analysis
    specialist_text = ""
    for msg in reversed(messages):
        if hasattr(msg, "content") and hasattr(msg, "type") and msg.type == "ai":
            specialist_text = msg.content if isinstance(msg.content, str) else str(msg.content)
            break

    # Prepare a summary of tool results for the canvas agent
    tool_summary_parts = []
    for tr in tool_results:
        result_preview = str(tr.get("result", ""))[:2000]
        tool_summary_parts.append(f"Tool: {tr['tool']}\nArgs: {tr.get('args', {})}\nResult: {result_preview}")
    tool_summary = "\n\n---\n\n".join(tool_summary_parts) if tool_summary_parts else "No tool results available."

    llm = ChatAnthropic(
        model=settings.model_name,
        api_key=settings.anthropic_api_key,
        max_tokens=4096,
    )

    user_content = f"""User query: {query}

Specialist analysis:
{specialist_text}

Tool results:
{tool_summary}

Generate card directives as a JSON array."""

    response = await llm.ainvoke([
        SystemMessage(content=CANVAS_SYSTEM_PROMPT),
        HumanMessage(content=user_content),
    ])

    # Parse the card JSON from the response
    cards = _parse_cards(response.content)

    # Add IDs to cards
    for card in cards:
        card["id"] = f"card-{uuid.uuid4().hex[:8]}"

    return {
        "cards": cards,
        "agent_events": state.get("agent_events", []) + [
            {"type": "cards_ready", "count": len(cards)},
        ],
    }


def _parse_cards(content: str) -> list[dict]:
    """Parse card JSON from the LLM response, handling markdown code blocks."""
    if isinstance(content, list):
        # Handle structured content blocks
        text_parts = []
        for block in content:
            if hasattr(block, "text"):
                text_parts.append(block.text)
        content = "\n".join(text_parts)

    # Strip markdown code blocks if present
    content = content.strip()
    if content.startswith("```"):
        lines = content.split("\n")
        # Remove first and last lines (```json and ```)
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        content = "\n".join(lines)

    try:
        cards = json.loads(content)
        if isinstance(cards, list):
            return cards
        if isinstance(cards, dict):
            return [cards]
    except json.JSONDecodeError:
        logger.warning("Failed to parse card JSON from canvas agent")
        # Return a fallback text report card
        return [{
            "type": "text_report",
            "title": "Analysis Results",
            "source": "meraki",
            "data": {"content": content},
        }]

    return []
