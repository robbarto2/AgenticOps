"""Performance agent - retrieves and analyzes ThousandEyes test metrics and Meraki uplink performance."""

from __future__ import annotations

import asyncio
import logging
import time

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage
from langgraph.types import StreamWriter

from agents.state import AgentState
from agents.stream_util import AGENT_LOOP_TIMEOUT_SEC, FORCE_SUMMARY_PROMPT, needs_forced_summary, safe_writer
from agents.table_extractor import extract_test_table
from agents.tools import build_langchain_tools
from config import settings
from mcp_client.manager import mcp_manager
from prompts import load_prompt
from skills.loader import load_skills_for_agent

logger = logging.getLogger(__name__)

# Timeout for individual tool calls (30 seconds)
TOOL_CALL_TIMEOUT_SEC = 30

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
        timeout=120,
        max_retries=1,
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
    response = None

    # Agentic loop: let the LLM call tools iteratively
    max_iterations = 10
    loop_start = time.time()
    for _ in range(max_iterations):
        if time.time() - loop_start > AGENT_LOOP_TIMEOUT_SEC:
            logger.warning("Performance agent hit %ds loop timeout", AGENT_LOOP_TIMEOUT_SEC)
            break
        try:
            response = await asyncio.wait_for(
                llm_with_tools.ainvoke(messages), timeout=60
            )
        except asyncio.TimeoutError:
            logger.error("Performance agent: LLM call timed out after 60s")
            break
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

    # If the response is incomplete (exhausted iterations, truncated, or empty),
    # do one more LLM call WITHOUT tools to force a proper summary.
    if needs_forced_summary(response, max_iterations, "Performance", logger, len(tool_results)):
        from langchain_core.messages import AIMessage, HumanMessage
        messages.append(HumanMessage(content=FORCE_SUMMARY_PROMPT))
        try:
            response = await asyncio.wait_for(llm.ainvoke(messages), timeout=60)
        except Exception:
            logger.error("Performance forced summary also failed")
            response = AIMessage(content="I was unable to complete the analysis in time. Please try again with a more specific query.")
        messages.append(response)

    # Advance plan step for multi-agent routing
    plan_step = state.get("plan_step", 0)

    # Batch-fetch metrics if the LLM gathered test listings but didn't fetch metrics.
    has_test_results = any("test" in r.get("tool", "").lower() and "metrics" not in r.get("tool", "").lower() for r in tool_results)
    has_metrics = any("metrics" in r.get("tool", "").lower() for r in tool_results)
    if has_test_results and not has_metrics and mcp_manager.te_connected:
        from datetime import datetime, timedelta, timezone as tz
        end_dt = datetime.now(tz.utc)
        start_dt = end_dt - timedelta(days=1)
        start_str = start_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        end_str = end_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

        for metric_id in ("WEB_AVAILABILITY", "WEB_TTFB", "NET_LATENCY", "NET_LOSS"):
            emit({"type": "tool_call", "tool": "get_network_app_synthetics_metrics", "source": "thousandeyes", "status": "running"})
            try:
                metrics_result = await asyncio.wait_for(
                    mcp_manager.call_tool("get_network_app_synthetics_metrics", {
                        "metric_id": metric_id,
                        "start_date": start_str,
                        "end_date": end_str,
                        "aggregation_type": "MEAN",
                        "group_by": "TEST",
                    }),
                    timeout=15,
                )
                content = metrics_result.get("content", "")
                is_error = "error" in metrics_result or (isinstance(content, str) and content.strip().lower().startswith("error"))
                if not is_error and content:
                    tool_results.append({"tool": "get_network_app_synthetics_metrics", "args": {"metric_id": metric_id}, "result": content})
                    logger.info("Performance agent: fetched %s OK", metric_id)
            except Exception as e:
                logger.warning("Performance agent: %s fetch failed: %s", metric_id, e)
            emit({"type": "tool_call", "tool": "get_network_app_synthetics_metrics", "source": "thousandeyes", "status": "complete"})

    # Extract interactive tables from ThousandEyes test data if present
    table_data = extract_test_table(tool_results)
    if table_data:
        logger.info("Performance agent: extracted %d interactive tables", len(table_data))

    return {
        "messages": [response],
        "tool_results": tool_results,
        "agent_events": agent_events,
        "table_data": table_data,
        "plan_step": plan_step + 1,
    }
