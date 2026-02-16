"""Topology agent - builds network topology maps from device and LLDP/CDP data."""

from __future__ import annotations

import asyncio
import logging

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.types import StreamWriter

from agents.state import AgentState
from agents.stream_util import safe_writer
from agents.tools import build_langchain_tools
from config import settings
from prompts import load_prompt
from skills.loader import load_skills_for_agent

logger = logging.getLogger(__name__)

# Timeout for individual tool calls (90 seconds for topology - LLDP/CDP can be slow)
TOOL_CALL_TIMEOUT_SEC = 90

SYSTEM_PROMPT_TEMPLATE = load_prompt("topology")


async def topology_node(state: AgentState, writer: StreamWriter) -> dict:
    """Build network topology from device and LLDP/CDP data."""
    emit = safe_writer(writer)
    query = state["user_query"]
    skills_text = load_skills_for_agent("topology")

    llm = ChatAnthropic(
        model=settings.discovery_model_name,  # Use Haiku for topology
        api_key=settings.anthropic_api_key,
        max_tokens=4096,
    )

    tools = build_langchain_tools("topology")
    if tools:
        llm_with_tools = llm.bind_tools(tools)
    else:
        llm_with_tools = llm

    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(skills=skills_text)
    # state["messages"] already contains the current query (last item)
    # plus limited recent history from websocket.py
    messages = [
        SystemMessage(content=system_prompt),
        *state["messages"],
    ]

    agent_events = list(state.get("agent_events", []))
    tool_results: list[dict] = []

    max_iterations = 10  # Topology needs more iterations (many LLDP/CDP calls)
    for iteration in range(max_iterations):
        response = await llm_with_tools.ainvoke(messages)
        messages.append(response)

        if not response.tool_calls:
            # No more tool calls - final response complete
            break

        for tool_call in response.tool_calls:
            tool_name = tool_call["name"]
            tool_args = tool_call["args"]

            source = "meraki"
            if tool_name.startswith("te_") or "thousandeyes" in tool_name.lower():
                source = "thousandeyes"

            # Stream tool_call event in real-time via StreamWriter
            emit({
                "type": "tool_call",
                "tool": tool_name,
                "source": source,
                "status": "running",
            })

            matching_tools = [t for t in tools if t.name == tool_name]
            if matching_tools:
                try:
                    result = await asyncio.wait_for(
                        matching_tools[0].ainvoke(tool_args),
                        timeout=TOOL_CALL_TIMEOUT_SEC
                    )
                except asyncio.TimeoutError:
                    logger.error("Tool call timeout: %s(%s) exceeded %d seconds", tool_name, tool_args, TOOL_CALL_TIMEOUT_SEC)
                    result = f"Error: Tool call timed out after {TOOL_CALL_TIMEOUT_SEC} seconds"
            else:
                result = f"Tool {tool_name} not found"

            tool_results.append({
                "tool": tool_name,
                "args": tool_args,
                "result": result,
            })

            # Stream tool completion in real-time
            emit({
                "type": "tool_call",
                "tool": tool_name,
                "source": source,
                "status": "complete",
            })

            messages.append(ToolMessage(content=str(result), tool_call_id=tool_call["id"]))

    # Advance plan step for multi-agent routing
    plan_step = state.get("plan_step", 0)

    return {
        "messages": [response],
        "tool_results": tool_results,
        "agent_events": agent_events,
        "plan_step": plan_step + 1,
    }
