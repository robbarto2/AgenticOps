"""Discovery agent - explores inventory, topology, device status, network health."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.types import StreamWriter

from agents.state import AgentState
from agents.stream_util import AGENT_LOOP_TIMEOUT_SEC, FORCE_SUMMARY_PROMPT, execute_tools_parallel, needs_forced_summary, safe_writer
from agents.table_extractor import (
    extract_network_table, extract_device_table, extract_test_table, extract_client_table,
    extract_uplink_table, _extract_network_device_counts, _detect_network_health_filter,
    _parse_result, ensure_agent_list,
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

        await execute_tools_parallel(
            response.tool_calls, tools, emit, tool_results, messages, TOOL_CALL_TIMEOUT_SEC
        )

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

        # Ensure uplink statuses were fetched — needed for WAN alerts column
        _uplink_tool_names = {"getorganizationapplianceuplinkstatuses"}
        has_uplink_data = any(
            r.get("tool", "").lower().rstrip() in _uplink_tool_names
            or (r.get("tool") == "call_meraki_api" and r.get("args", {}).get("method", "").lower() in _uplink_tool_names)
            for r in tool_results
        )
        if not has_uplink_data and mcp_manager.meraki_connected:
            emit({"type": "tool_call", "tool": "getOrganizationApplianceUplinkStatuses", "source": "meraki", "status": "running"})
            try:
                mcp_result = await asyncio.wait_for(
                    mcp_manager.call_tool("call_meraki_api", {
                        "section": "appliance",
                        "method": "getOrganizationApplianceUplinkStatuses",
                        "parameters": {},
                    }),
                    timeout=20,
                )
                if "error" not in mcp_result:
                    content = mcp_result.get("content", "")
                    logger.info("Discovery node: uplink statuses fetch OK for network table (%d chars)", len(content))
                    tool_results.append({
                        "tool": "call_meraki_api",
                        "args": {"method": "getOrganizationApplianceUplinkStatuses"},
                        "result": content,
                    })
                else:
                    logger.warning("Discovery node: uplink statuses error: %s", mcp_result.get("error"))
            except asyncio.TimeoutError:
                logger.warning("Discovery node: uplink statuses timed out")
            except Exception as e:
                logger.warning("Discovery node: uplink statuses failed: %s", e)
            emit({"type": "tool_call", "tool": "getOrganizationApplianceUplinkStatuses", "source": "meraki", "status": "complete"})

        table_data = extract_network_table(tool_results, user_query=query)
        logger.info("Discovery node: extracted %d network table_data entries from %d tool_results",
                     len(table_data), len(tool_results))

        # Replace the LLM response with a minimal summary + health line.
        # The interactive table is auto-generated, so verbose LLM prose is redundant.
        if table_data and response:
            n_networks = sum(len(t.get("rows", [])) for t in table_data)
            health_filter = _detect_network_health_filter(query)

            if health_filter == "alerting":
                summary = f"Found **{n_networks} network{'s' if n_networks != 1 else ''}** with alerting devices."
            elif health_filter == "offline":
                summary = f"Found **{n_networks} network{'s' if n_networks != 1 else ''}** with offline devices."
            elif health_filter == "problems":
                summary = f"Found **{n_networks} network{'s' if n_networks != 1 else ''}** with device issues."
            else:
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
        # Automatically fetch metrics for all tests if not already fetched
        has_metrics = any("metrics" in r.get("tool", "").lower() for r in tool_results)
        logger.info("Discovery node: test listing detected — has_metrics=%s, te_connected=%s", has_metrics, mcp_manager.te_connected)
        if not has_metrics and mcp_manager.te_connected:
            # Batch-fetch metrics using the correct API parameters.
            # The tool requires: metric_id (enum), start_date, end_date, aggregation_type.
            # Using group_by="TEST" returns per-test values in a single call.
            from datetime import datetime, timedelta, timezone as tz
            end_dt = datetime.now(tz.utc)
            start_dt = end_dt - timedelta(days=1)
            start_str = start_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
            end_str = end_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

            batch_metrics = [
                ("WEB_AVAILABILITY", "availability"),
                ("WEB_TTFB", "web latency"),
                ("NET_LATENCY", "network latency"),
                ("NET_LOSS", "packet loss"),
            ]
            emit({"type": "tool_call", "tool": "get_network_app_synthetics_metrics", "source": "thousandeyes", "status": "running"})

            async def _fetch_metric(mid: str, lbl: str) -> tuple[str, str, dict | None]:
                try:
                    result = await asyncio.wait_for(
                        mcp_manager.call_tool("get_network_app_synthetics_metrics", {
                            "metric_id": mid,
                            "start_date": start_str,
                            "end_date": end_str,
                            "aggregation_type": "MEAN",
                            "group_by": "TEST",
                        }),
                        timeout=15,
                    )
                    return mid, lbl, result
                except Exception as e:
                    logger.warning("Discovery node: %s fetch failed: %s", mid, e)
                    return mid, lbl, None

            fetch_results = await asyncio.gather(*[_fetch_metric(mid, lbl) for mid, lbl in batch_metrics])
            for metric_id, label, metrics_result in fetch_results:
                if metrics_result:
                    content = metrics_result.get("content", "")
                    is_error = "error" in metrics_result or (isinstance(content, str) and content.strip().lower().startswith("error"))
                    if not is_error and content:
                        tool_results.append({
                            "tool": "get_network_app_synthetics_metrics",
                            "args": {"metric_id": metric_id},
                            "result": content,
                        })
                        logger.info("Discovery node: fetched %s metrics OK (len=%d)", metric_id, len(content))
                    else:
                        logger.info("Discovery node: %s returned error or empty", metric_id)

            emit({"type": "tool_call", "tool": "get_network_app_synthetics_metrics", "source": "thousandeyes", "status": "complete"})
        elif has_metrics:
            logger.info("Discovery node: skipping programmatic metrics fetch — LLM already called metrics tools")

        # Fetch agent details so we can show agent names/locations in test tables
        await ensure_agent_list(tool_results)

        # Detect if user wants only active/enabled tests
        q_lower = query.lower()
        active_only = any(kw in q_lower for kw in ("active", "enabled", "running", "currently running"))
        table_data = extract_test_table(tool_results, active_only=active_only)
        logger.info("Discovery node: extracted %d test table_data entries from %d tool_results (active_only=%s)",
                     len(table_data), len(tool_results), active_only)
        if table_data and response:
            n_tests = sum(len(t.get("rows", [])) for t in table_data)
            qualifier = " active" if active_only else ""
            response = AIMessage(content=f"Found **{n_tests}{qualifier} tests**.", id=response.id)
    elif _is_uplink_query(query):
        # Programmatically ensure uplink statuses, device names, and network names
        # are fetched — the LLM often fails to call the right tools for uplinks.
        _uplink_methods = {"getorganizationapplianceuplinkstatuses"}
        has_uplink_data = any(
            r.get("tool", "").lower().rstrip() in _uplink_methods
            or (r.get("tool") == "call_meraki_api" and r.get("args", {}).get("method", "").lower() in _uplink_methods)
            for r in tool_results
        )
        _device_tool_names = {"getorganizationdevices"}
        has_device_data = any(
            r.get("tool", "").lower().rstrip() in _device_tool_names
            or (r.get("tool") == "call_meraki_api" and r.get("args", {}).get("method", "").lower() in _device_tool_names)
            for r in tool_results
        )
        _network_tool_names = {"getorganizationnetworks"}
        has_network_data = any(
            r.get("tool", "").lower().rstrip() in _network_tool_names
            or (r.get("tool") == "call_meraki_api" and r.get("args", {}).get("method", "").lower() in _network_tool_names)
            for r in tool_results
        )

        async def _fetch_uplink_statuses():
            if has_uplink_data:
                return
            emit({"type": "tool_call", "tool": "getOrganizationApplianceUplinkStatuses", "source": "meraki", "status": "running"})
            try:
                result = await asyncio.wait_for(
                    mcp_manager.call_tool("call_meraki_api", {
                        "section": "appliance",
                        "method": "getOrganizationApplianceUplinkStatuses",
                        "parameters": {},
                    }),
                    timeout=20,
                )
                if "error" not in result:
                    content = result.get("content", "")
                    logger.info("Discovery node: uplink statuses fetch OK (%d chars)", len(content))
                    tool_results.append({
                        "tool": "call_meraki_api",
                        "args": {"method": "getOrganizationApplianceUplinkStatuses"},
                        "result": content,
                    })
                else:
                    logger.warning("Discovery node: uplink statuses error: %s", result.get("error"))
            except asyncio.TimeoutError:
                logger.warning("Discovery node: uplink statuses timed out")
            except Exception as e:
                logger.warning("Discovery node: uplink statuses failed: %s", e)
            emit({"type": "tool_call", "tool": "getOrganizationApplianceUplinkStatuses", "source": "meraki", "status": "complete"})

        async def _fetch_appliance_devices():
            if has_device_data:
                return
            emit({"type": "tool_call", "tool": "getOrganizationDevices", "source": "meraki", "status": "running"})
            try:
                result = await asyncio.wait_for(
                    mcp_manager.call_tool("call_meraki_api", {
                        "section": "organizations",
                        "method": "getOrganizationDevices",
                        "parameters": {"productTypes[]": ["appliance"]},
                    }),
                    timeout=20,
                )
                if "error" not in result:
                    content = result.get("content", "")
                    logger.info("Discovery node: appliance devices fetch OK (%d chars)", len(content))
                    tool_results.append({
                        "tool": "call_meraki_api",
                        "args": {"method": "getOrganizationDevices"},
                        "result": content,
                    })
                else:
                    logger.warning("Discovery node: appliance devices error: %s", result.get("error"))
            except asyncio.TimeoutError:
                logger.warning("Discovery node: appliance devices timed out")
            except Exception as e:
                logger.warning("Discovery node: appliance devices failed: %s", e)
            emit({"type": "tool_call", "tool": "getOrganizationDevices", "source": "meraki", "status": "complete"})

        async def _fetch_networks():
            if has_network_data:
                return
            emit({"type": "tool_call", "tool": "getOrganizationNetworks", "source": "meraki", "status": "running"})
            try:
                result = await asyncio.wait_for(
                    mcp_manager.call_tool("getOrganizationNetworks", {}),
                    timeout=20,
                )
                if "error" not in result:
                    content = result.get("content", "")
                    logger.info("Discovery node: networks fetch OK (%d chars)", len(content))
                    tool_results.append({
                        "tool": "getOrganizationNetworks",
                        "args": {},
                        "result": content,
                    })
                else:
                    logger.warning("Discovery node: networks error: %s", result.get("error"))
            except asyncio.TimeoutError:
                logger.warning("Discovery node: networks timed out")
            except Exception as e:
                logger.warning("Discovery node: networks failed: %s", e)
            emit({"type": "tool_call", "tool": "getOrganizationNetworks", "source": "meraki", "status": "complete"})

        if mcp_manager.meraki_connected:
            await asyncio.gather(
                _fetch_uplink_statuses(),
                _fetch_appliance_devices(),
                _fetch_networks(),
            )

        table_data = extract_uplink_table(tool_results)
        logger.info("Discovery node: extracted %d uplink table_data entries from %d tool_results",
                     len(table_data), len(tool_results))
        if table_data and response:
            n_uplinks = sum(len(t.get("rows", [])) for t in table_data)
            # Build a concise summary
            summary_parts = [f"Found **{n_uplinks} WAN uplink{'s' if n_uplinks != 1 else ''}** across your appliances."]
            # Count statuses
            all_rows = [row for t in table_data for row in t.get("rows", [])]
            failed = sum(1 for r in all_rows if isinstance(r, dict) and r.get("status", "").lower() == "failed")
            not_connected = sum(1 for r in all_rows if isinstance(r, dict) and r.get("status", "").lower() == "not connected")
            active = sum(1 for r in all_rows if isinstance(r, dict) and r.get("status", "").lower() == "active")
            if failed > 0:
                summary_parts.append(f"**{failed} failed**")
            if not_connected > 0:
                summary_parts.append(f"{not_connected} not connected")
            if active > 0:
                summary_parts.append(f"{active} active")
            if failed > 0 or not_connected > 0:
                response = AIMessage(content=summary_parts[0] + " " + ", ".join(summary_parts[1:]) + ".", id=response.id)
            else:
                response = AIMessage(content=summary_parts[0] + " All uplinks healthy.", id=response.id)
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

# Networks qualified by device health: "networks with alerts", "networks with offline devices"
_NETWORK_HEALTH_RE = re.compile(
    r"\bnetworks?\b.*\b(alert(s|ing)?|offline|down|problem(s|atic)?|issue(s)?|unhealthy)\b",
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
    r"\b(list|show|get|what\s+(are\s+)?(all\s+)?(the\s+)?)\b.*(test|tests|monitoring|application|applications|app|apps|track|tracking)\b",
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
    # Network health queries: "networks with alerts", "networks with offline devices"
    # These take priority even if device terms are present (the subject is "networks")
    if _NETWORK_HEALTH_RE.search(query):
        return True
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
