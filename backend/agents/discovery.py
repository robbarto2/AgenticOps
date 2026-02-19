"""Discovery agent - explores inventory, topology, device status, network health."""

from __future__ import annotations

import asyncio
import logging
import re
import time

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.types import StreamWriter

from agents.state import AgentState
from agents.stream_util import AGENT_LOOP_TIMEOUT_SEC, FORCE_SUMMARY_PROMPT, needs_forced_summary, safe_writer
from agents.table_extractor import (
    extract_network_table, extract_device_table, extract_test_table, extract_client_table,
    extract_uplink_table, _extract_network_device_counts,
)
from agents.tools import build_langchain_tools
from config import settings
from mcp_client.manager import mcp_manager
from prompts import load_prompt
from skills.loader import load_skills_for_agent

logger = logging.getLogger(__name__)

# Timeout for individual tool calls (30 seconds)
TOOL_CALL_TIMEOUT_SEC = 30

SYSTEM_PROMPT_TEMPLATE = load_prompt("discovery")


async def discovery_node(state: AgentState, writer: StreamWriter) -> dict:
    """Execute network discovery for the user query."""
    emit = safe_writer(writer)
    query = state["user_query"]
    skills_text = load_skills_for_agent("discovery")

    llm = ChatAnthropic(
        model=settings.discovery_model_name,  # Use fast Haiku model for discovery
        api_key=settings.anthropic_api_key,
        max_tokens=4096,
        timeout=120,
        max_retries=1,
    )

    tools = build_langchain_tools("discovery")
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

    max_iterations = 6  # Allow enough iterations for tool calls + analysis
    loop_start = time.time()
    for iteration in range(max_iterations):
        if time.time() - loop_start > AGENT_LOOP_TIMEOUT_SEC:
            logger.warning("Discovery agent hit %ds loop timeout", AGENT_LOOP_TIMEOUT_SEC)
            break
        try:
            response = await asyncio.wait_for(
                llm_with_tools.ainvoke(messages), timeout=60
            )
        except asyncio.TimeoutError:
            logger.error("Discovery agent: LLM call timed out after 60s")
            break
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

    # Extract interactive tables when the user is asking for network, device, client, or test listings
    table_data: list[dict] = []
    if _is_network_listing_query(query):
        # Ensure device statuses were fetched — the LLM sometimes skips
        # this call even when prompted, so we fetch programmatically.
        _status_tool_names = {"getorganizationdevicesstatuses"}
        has_status_data = any(
            r.get("tool", "").lower().rstrip() in _status_tool_names
            or (r.get("tool") == "call_meraki_api" and r.get("args", {}).get("method", "").lower() in _status_tool_names)
            for r in tool_results
        )
        if not has_status_data and mcp_manager.meraki_connected:
            emit({"type": "tool_call", "tool": "getOrganizationDevicesStatuses", "source": "meraki", "status": "running"})

            # getOrganizationDevicesStatuses is NOT a pre-registered MCP tool.
            # It must be called through the generic call_meraki_api tool.
            try:
                mcp_result = await asyncio.wait_for(
                    mcp_manager.call_tool("call_meraki_api", {
                        "section": "organizations",
                        "method": "getOrganizationDevicesStatuses",
                        "parameters": {},
                    }),
                    timeout=20,
                )
                if "error" not in mcp_result:
                    content = mcp_result.get("content", "")
                    logger.info("Discovery node: device status fetch OK (%d chars)", len(content))
                    # Store with method in args so table_extractor can identify it
                    tool_results.append({
                        "tool": "call_meraki_api",
                        "args": {"method": "getOrganizationDevicesStatuses"},
                        "result": content,
                    })
                else:
                    logger.warning("Discovery node: device status error: %s", mcp_result.get("error"))
            except asyncio.TimeoutError:
                logger.warning("Discovery node: device status timed out")
            except Exception as e:
                logger.warning("Discovery node: device status failed: %s", e)

            emit({"type": "tool_call", "tool": "getOrganizationDevicesStatuses", "source": "meraki", "status": "complete"})

        table_data = extract_network_table(tool_results)
        logger.info("Discovery node: extracted %d network table_data entries from %d tool_results",
                     len(table_data), len(tool_results))

        # Replace the LLM response with a minimal summary + health line.
        # The interactive table is auto-generated, so verbose LLM prose is redundant.
        if table_data and response:
            n_networks = sum(len(t.get("rows", [])) for t in table_data)
            summary = f"Your organization has **{n_networks} network{'s' if n_networks != 1 else ''}**."

            device_counts = _extract_network_device_counts(tool_results)
            if device_counts:
                total = sum(c["total"] for c in device_counts.values())
                online = sum(c["online"] for c in device_counts.values())
                offline = sum(c["offline"] for c in device_counts.values())
                alerting = sum(c["alerting"] for c in device_counts.values())

                if total > 0:
                    if offline == 0 and alerting == 0:
                        summary += f" All {total} devices online."
                    elif offline > 0 and alerting > 0:
                        summary += f" {offline} offline, {alerting} alerting ({online}/{total} online)."
                    elif offline > 0:
                        summary += f" {offline} device{'s' if offline != 1 else ''} offline ({online}/{total} online)."
                    else:
                        summary += f" {alerting} device{'s' if alerting != 1 else ''} alerting ({online}/{total} online)."

            response = AIMessage(content=summary, id=response.id)
    elif _is_client_listing_query(query):
        table_data = extract_client_table(tool_results)
        logger.info("Discovery node: extracted %d client table_data entries from %d tool_results",
                     len(table_data), len(tool_results))
        if table_data and response:
            n_clients = sum(len(t.get("rows", [])) for t in table_data)
            response = AIMessage(content=f"Found **{n_clients} clients**.", id=response.id)
    elif _is_device_listing_query(query):
        # Ensure device statuses were fetched — the LLM often skips this call
        _status_tool_names = {"getorganizationdevicesstatuses"}
        has_status_data = any(
            r.get("tool", "").lower().rstrip() in _status_tool_names
            or (r.get("tool") == "call_meraki_api" and r.get("args", {}).get("method", "").lower() in _status_tool_names)
            for r in tool_results
        )
        if not has_status_data and mcp_manager.meraki_connected:
            emit({"type": "tool_call", "tool": "getOrganizationDevicesStatuses", "source": "meraki", "status": "running"})
            try:
                mcp_result = await asyncio.wait_for(
                    mcp_manager.call_tool("call_meraki_api", {
                        "section": "organizations",
                        "method": "getOrganizationDevicesStatuses",
                        "parameters": {},
                    }),
                    timeout=20,
                )
                if "error" not in mcp_result:
                    content = mcp_result.get("content", "")
                    logger.info("Discovery node: device status fetch OK for device listing (%d chars)", len(content))
                    tool_results.append({
                        "tool": "call_meraki_api",
                        "args": {"method": "getOrganizationDevicesStatuses"},
                        "result": content,
                    })
                else:
                    logger.warning("Discovery node: device status error: %s", mcp_result.get("error"))
            except asyncio.TimeoutError:
                logger.warning("Discovery node: device status timed out")
            except Exception as e:
                logger.warning("Discovery node: device status failed: %s", e)
            emit({"type": "tool_call", "tool": "getOrganizationDevicesStatuses", "source": "meraki", "status": "complete"})

        table_data = extract_device_table(tool_results, user_query=query)
        logger.info("Discovery node: extracted %d device table_data entries from %d tool_results",
                     len(table_data), len(tool_results))
        if table_data and response:
            n_devices = sum(len(t.get("rows", [])) for t in table_data)
            response = AIMessage(content=f"Found **{n_devices} devices**.", id=response.id)
    elif _is_test_listing_query(query):
        table_data = extract_test_table(tool_results)
        logger.info("Discovery node: extracted %d test table_data entries from %d tool_results",
                     len(table_data), len(tool_results))
        if table_data and response:
            n_tests = sum(len(t.get("rows", [])) for t in table_data)
            response = AIMessage(content=f"Found **{n_tests} tests**.", id=response.id)
    elif _is_uplink_query(query):
        table_data = extract_uplink_table(tool_results)
        logger.info("Discovery node: extracted %d uplink table_data entries from %d tool_results",
                     len(table_data), len(tool_results))
        if table_data and response:
            # Keep the LLM's text analysis but strip any markdown tables
            response = _strip_markdown_tables(response)
    else:
        logger.info("Discovery node: skipping table extraction (not a network/device/client/test listing query)")

    # If the response is incomplete (exhausted iterations, truncated, or empty),
    # do one more LLM call WITHOUT tools to force a proper summary.
    # Skip for listing queries with table data — those have a programmatic
    # summary and the interactive table handles the rest.
    if not table_data and needs_forced_summary(response, max_iterations, "Discovery", logger, len(tool_results)):
        messages.append(HumanMessage(content=FORCE_SUMMARY_PROMPT))
        try:
            response = await asyncio.wait_for(llm.ainvoke(messages), timeout=60)
        except Exception:
            logger.error("Discovery forced summary also failed")
            response = AIMessage(content="I was unable to complete the analysis in time. Please try again with a more specific query.")
        messages.append(response)

    # Advance plan step for multi-agent routing
    plan_step = state.get("plan_step", 0)

    return {
        "messages": [response],
        "tool_results": tool_results,
        "agent_events": agent_events,
        "table_data": table_data,
        "plan_step": plan_step + 1,
    }


_NETWORK_LISTING_RE = re.compile(
    r"\b(list|show|get|what\s+(are\s+)?(all\s+)?(the\s+)?)\b.*(network|site)s\b",
    re.IGNORECASE,
)

_DEVICE_LISTING_RE = re.compile(
    r"\b(list|show|get|what\s+(are\s+)?(all\s+)?(the\s+)?)\b.*(device|ap|access\s+point|switch|appliance|firewall|camera|sensor|router|gateway)(s|es)?\b",
    re.IGNORECASE,
)

_CLIENT_LISTING_RE = re.compile(
    r"\b(list|show|get|what\s+(are\s+)?(all\s+)?(the\s+)?)\b.*client(s)?\b",
    re.IGNORECASE,
)

_DEVICE_TERMS_RE = re.compile(
    r"\b(device|ssid|switch|ap\b|access\s+point|appliance|firewall|camera|sensor|router|gateway|firmware|port)",
    re.IGNORECASE,
)

_HEALTH_SUMMARY_RE = re.compile(
    r"\b(health|status|summary|overview|dashboard)\b",
    re.IGNORECASE,
)

_TEST_LISTING_RE = re.compile(
    r"\b(list|show|get|what\s+(are\s+)?(all\s+)?(the\s+)?)\b.*(test|tests|monitoring)\b",
    re.IGNORECASE,
)

_UPLINK_QUERY_RE = re.compile(
    r"\b(uplinks?|wan\s+status|wan\s+uplinks?|uplinks?\s+status)\b",
    re.IGNORECASE,
)


def _is_network_listing_query(query: str) -> bool:
    """Return True if the user is asking for a list of networks (not devices in a network)."""
    # If the query is asking about health/status/summary, don't show network table
    if _HEALTH_SUMMARY_RE.search(query):
        return False
    # Must mention listing + networks (plural), but NOT mention any device-related terms
    return bool(_NETWORK_LISTING_RE.search(query)) and not bool(_DEVICE_TERMS_RE.search(query))


def _is_client_listing_query(query: str) -> bool:
    """Return True if the user is asking for a list of clients."""
    # If the query is asking about health/status/summary, don't show client table
    if _HEALTH_SUMMARY_RE.search(query):
        return False
    # Must mention listing + clients
    return bool(_CLIENT_LISTING_RE.search(query))


def _is_device_listing_query(query: str) -> bool:
    """Return True if the user is asking for a list of devices."""
    # If the query is asking about health/status/summary, don't show device table
    if _HEALTH_SUMMARY_RE.search(query):
        return False
    # Must mention listing + devices/APs/switches/etc
    return bool(_DEVICE_LISTING_RE.search(query))


def _is_test_listing_query(query: str) -> bool:
    """Return True if the user is asking for a list of tests."""
    # If the query is asking about health/status/summary, don't show test table
    if _HEALTH_SUMMARY_RE.search(query):
        return False
    # Must mention listing + test/tests/monitoring
    return bool(_TEST_LISTING_RE.search(query))


def _is_uplink_query(query: str) -> bool:
    """Return True if the user is asking about WAN/uplink status."""
    return bool(_UPLINK_QUERY_RE.search(query))


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
