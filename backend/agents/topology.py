"""Topology agent - builds network topology maps from device and LLDP/CDP data."""

from __future__ import annotations

import asyncio
import logging
import time

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.types import StreamWriter

from agents.state import AgentState
from agents.stream_util import AGENT_LOOP_TIMEOUT_SEC, FORCE_SUMMARY_PROMPT, execute_tools_parallel, needs_forced_summary, safe_writer
from agents.table_extractor import extract_topology_card
from agents.tools import build_langchain_tools
from config import settings
from mcp_client.manager import mcp_manager
from prompts import load_prompt
from skills.loader import load_skills_for_agent

logger = logging.getLogger(__name__)

# Timeout for individual tool calls (30 seconds - LLDP/CDP calls go through MCP which has its own 20s timeout)
TOOL_CALL_TIMEOUT_SEC = 30

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
        timeout=120,
        max_retries=1,
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
    response = None

    max_iterations = 10  # Topology needs more iterations (many LLDP/CDP calls)
    loop_start = time.time()
    for iteration in range(max_iterations):
        if time.time() - loop_start > AGENT_LOOP_TIMEOUT_SEC:
            logger.warning("Topology agent hit %ds loop timeout", AGENT_LOOP_TIMEOUT_SEC)
            break
        try:
            response = await asyncio.wait_for(
                llm_with_tools.ainvoke(messages), timeout=60
            )
        except asyncio.TimeoutError:
            logger.error("Topology agent: LLM call timed out after 60s")
            break
        messages.append(response)

        if not response.tool_calls:
            # No more tool calls - final response complete
            break

        await execute_tools_parallel(
            response.tool_calls, tools, emit, tool_results, messages, TOOL_CALL_TIMEOUT_SEC
        )

    # If the response is incomplete (exhausted iterations, truncated, or empty),
    # do one more LLM call WITHOUT tools to force a proper summary.
    if needs_forced_summary(response, max_iterations, "Topology", logger, len(tool_results)):
        messages.append(HumanMessage(content=FORCE_SUMMARY_PROMPT))
        try:
            response = await asyncio.wait_for(llm.ainvoke(messages), timeout=60)
        except Exception:
            logger.error("Topology forced summary also failed")
            response = AIMessage(content="I was unable to complete the analysis in time. Please try again with a more specific query.")
        messages.append(response)

    # Programmatically fetch uplink statuses if the agent didn't already
    _uplink_names = {"getorganizationapplianceuplinkstatuses"}
    has_uplink_data = any(
        r.get("tool", "").lower().rstrip() in _uplink_names
        or (r.get("tool") == "call_meraki_api" and r.get("args", {}).get("method", "").lower() in _uplink_names)
        for r in tool_results
    )
    if not has_uplink_data:
        emit({"type": "tool_call", "tool": "getOrganizationApplianceUplinkStatuses", "source": "meraki", "status": "running"})
        try:
            uplink_result = await asyncio.wait_for(
                mcp_manager.call_tool("call_meraki_api", {
                    "section": "appliance",
                    "method": "getOrganizationApplianceUplinkStatuses",
                    "parameters": {},
                }),
                timeout=20,
            )
            if "error" not in uplink_result:
                content = uplink_result.get("content", "")
                logger.info("Topology agent: uplink statuses fetch OK (%d chars)", len(content))
                tool_results.append({
                    "tool": "call_meraki_api",
                    "args": {"method": "getOrganizationApplianceUplinkStatuses"},
                    "result": content,
                })
            else:
                logger.warning("Topology agent: uplink statuses error: %s", uplink_result.get("error"))
        except asyncio.TimeoutError:
            logger.warning("Topology agent: uplink statuses timed out")
        except Exception as e:
            logger.warning("Topology agent: uplink statuses failed: %s", e)
        emit({"type": "tool_call", "tool": "getOrganizationApplianceUplinkStatuses", "source": "meraki", "status": "complete"})

    # Build topology card programmatically from raw tool results
    topology_card = extract_topology_card(tool_results)
    if topology_card:
        n_nodes = len(topology_card["data"]["nodes"])
        n_links = len(topology_card["data"]["links"])
        net_name = topology_card["data"].get("networkName", "")
        logger.info("Topology agent built card with %d nodes", n_nodes)
        # Replace LLM response with clean summary (LLM often dumps raw JSON)
        summary = f"Discovered **{n_nodes} devices** and **{n_links} connections**"
        if net_name:
            summary += f" in **{net_name}**"
        summary += "."
        response = AIMessage(content=summary, id=response.id if response else "topology-summary")

    # Advance plan step for multi-agent routing
    plan_step = state.get("plan_step", 0)

    return {
        "messages": [response],
        "tool_results": tool_results,
        "agent_events": agent_events,
        "cards": [topology_card] if topology_card else [],
        "plan_step": plan_step + 1,
    }
