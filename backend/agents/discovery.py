"""Discovery agent - explores inventory, topology, device status, network health."""

from __future__ import annotations

import logging
import re

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from agents.state import AgentState
from agents.table_extractor import extract_network_table
from agents.tools import build_langchain_tools
from config import settings
from prompts import load_prompt
from skills.loader import load_skills_for_agent

logger = logging.getLogger(__name__)

SYSTEM_PROMPT_TEMPLATE = load_prompt("discovery")


async def discovery_node(state: AgentState) -> dict:
    """Execute network discovery for the user query."""
    query = state["user_query"]
    skills_text = load_skills_for_agent("discovery")

    llm = ChatAnthropic(
        model=settings.model_name,
        api_key=settings.anthropic_api_key,
        max_tokens=4096,
    )

    tools = build_langchain_tools("discovery")
    if tools:
        llm_with_tools = llm.bind_tools(tools)
    else:
        llm_with_tools = llm

    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(skills=skills_text)
    messages = [
        SystemMessage(content=system_prompt),
        *state["messages"],
        HumanMessage(content=query),
    ]

    agent_events = list(state.get("agent_events", []))
    tool_results = list(state.get("tool_results", []))

    max_iterations = 10
    for _ in range(max_iterations):
        response = await llm_with_tools.ainvoke(messages)
        messages.append(response)

        if not response.tool_calls:
            break

        for tool_call in response.tool_calls:
            tool_name = tool_call["name"]
            tool_args = tool_call["args"]

            source = "meraki"
            if tool_name.startswith("te_") or "thousandeyes" in tool_name.lower():
                source = "thousandeyes"

            agent_events.append({
                "type": "tool_call",
                "tool": tool_name,
                "source": source,
                "status": "running",
            })

            matching_tools = [t for t in tools if t.name == tool_name]
            if matching_tools:
                result = await matching_tools[0].ainvoke(tool_args)
            else:
                result = f"Tool {tool_name} not found"

            tool_results.append({
                "tool": tool_name,
                "args": tool_args,
                "result": result,
            })

            agent_events.append({
                "type": "tool_call",
                "tool": tool_name,
                "source": source,
                "status": "complete",
            })

            messages.append(ToolMessage(content=str(result), tool_call_id=tool_call["id"]))

    # Extract structured table data for interactive hover popups
    table_data = extract_network_table(tool_results)
    logger.info("Discovery node: extracted %d table_data entries from %d tool_results",
                len(table_data), len(tool_results))

    # If we have interactive tables, strip duplicate markdown tables from the
    # LLM response so the user doesn't see the same data twice.
    if table_data:
        response = _strip_markdown_tables(response)

    return {
        "messages": [HumanMessage(content=query), response],
        "tool_results": tool_results,
        "agent_events": agent_events,
        "table_data": table_data,
    }


# Regex matching a full markdown table (header row, separator row, data rows)
_MD_TABLE_RE = re.compile(
    r"(?m)"                   # multiline
    r"^[ \t]*\|.+\|[ \t]*\n"  # header row
    r"^[ \t]*\|[-:\s|]+\|[ \t]*\n"  # separator row
    r"(?:^[ \t]*\|.+\|[ \t]*\n?)+"  # one or more data rows
)


def _strip_markdown_tables(msg: AIMessage) -> AIMessage:
    """Return a copy of the AI message with markdown tables removed."""
    content = msg.content
    if not isinstance(content, str):
        return msg
    cleaned = _MD_TABLE_RE.sub("", content)
    # Collapse runs of blank lines left behind
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    if cleaned == content.strip():
        return msg
    logger.info("Stripped markdown table(s) from discovery response (%d -> %d chars)",
                len(content), len(cleaned))
    return AIMessage(content=cleaned, id=msg.id)
