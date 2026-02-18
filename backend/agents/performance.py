"""Performance agent - retrieves and analyzes ThousandEyes test metrics and Meraki uplink performance."""

from __future__ import annotations

import asyncio
import logging

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage
from langgraph.types import StreamWriter

from agents.state import AgentState
from agents.stream_util import safe_writer
from agents.tools import build_langchain_tools
from config import settings
from prompts import load_prompt
from skills.loader import load_skills_for_agent

logger = logging.getLogger(__name__)

# Timeout for individual tool calls (60 seconds)
TOOL_CALL_TIMEOUT_SEC = 60

SYSTEM_PROMPT_TEMPLATE = load_prompt("performance")


async def performance_node(state: AgentState, writer: StreamWriter) -> dict:
    """Retrieve and analyze performance metrics from ThousandEyes and Meraki."""
    emit = safe_writer(writer)
    query = state["user_query"]
    skills_text = load_skills_for_agent("performance")

    llm = ChatAnthropic(
        model=settings.model_name,
        api_key=settings.anthropic_api_key,
        max_tokens=4096,
    )

    tools = build_langchain_tools("performance")
    if tools:
        llm_with_tools = llm.bind_tools(tools)
    else:
        llm_with_tools = llm

    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(skills=skills_text)
    messages = [
        SystemMessage(content=system_prompt),
        *state["messages"],
    ]

    agent_events = list(state.get("agent_events", []))
    tool_results: list[dict] = []

    # Agentic loop: let the LLM call tools iteratively
    max_iterations = 10
    for _ in range(max_iterations):
        response = await llm_with_tools.ainvoke(messages)
        messages.append(response)

        # Check if the LLM wants to call tools
        if not response.tool_calls:
            break

        for tool_call in response.tool_calls:
            tool_name = tool_call["name"]
            tool_args = tool_call["args"]

            source = "meraki"
            if tool_name.startswith("te_") or "thousandeyes" in tool_name.lower():
                source = "thousandeyes"
            # ThousandEyes tools don't have a "te_" prefix in the MCP server
            te_tools = {
                "list_network_app_synthetics_tests", "get_network_app_synthetics_test",
                "get_network_app_synthetics_metrics", "get_endpoint_agent_metrics",
                "get_path_visualization_results", "get_full_path_visualization",
                "get_anomalies", "list_alerts", "get_bgp_route_test_results",
                "list_cloud_enterprise_agents", "list_endpoint_agents",
                "list_endpoint_agent_tests",
            }
            if tool_name in te_tools:
                source = "thousandeyes"

            # Stream tool_call event in real-time via StreamWriter
            emit({
                "type": "tool_call",
                "tool": tool_name,
                "source": source,
                "status": "running",
            })

            # Find and execute the tool
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

            # Add tool result back to messages
            from langchain_core.messages import ToolMessage
            messages.append(ToolMessage(content=str(result), tool_call_id=tool_call["id"]))

    # Advance plan step for multi-agent routing
    plan_step = state.get("plan_step", 0)

    return {
        "messages": [response],
        "tool_results": tool_results,
        "agent_events": agent_events,
        "plan_step": plan_step + 1,
    }
