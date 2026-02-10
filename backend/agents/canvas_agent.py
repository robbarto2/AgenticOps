"""Canvas agent - structures data from specialist agents into card directives."""

from __future__ import annotations

import json
import logging
import uuid

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from agents.state import AgentState
from config import settings
from prompts import load_prompt

logger = logging.getLogger(__name__)

CANVAS_SYSTEM_PROMPT = load_prompt("canvas")


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
