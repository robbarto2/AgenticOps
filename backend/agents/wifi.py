"""Wi-Fi Analysis agent - wireless health, RF analysis, and client capacity planning."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.types import StreamWriter

from agents.state import AgentState
from agents.stream_util import AGENT_LOOP_TIMEOUT_SEC, FORCE_SUMMARY_PROMPT, execute_tools_parallel, needs_forced_summary, safe_writer
from agents.tools import build_langchain_tools
from config import settings
from mcp_client.manager import mcp_manager
from prompts import load_prompt
from skills.loader import load_skills_for_agent

logger = logging.getLogger(__name__)


def _safe_args(tr: dict) -> tuple[dict, dict]:
    """Extract (args_dict, parameters_dict) from a tool_result safely.

    LLMs sometimes produce ``parameters`` as a string instead of a dict,
    which would crash a chained ``.get()`` call.  This helper always
    returns two plain dicts.
    """
    args = tr.get("args") or {}
    if not isinstance(args, dict):
        try:
            args = json.loads(args) if isinstance(args, str) else {}
        except (json.JSONDecodeError, ValueError):
            args = {}
    params = args.get("parameters") or {}
    if not isinstance(params, dict):
        try:
            params = json.loads(params) if isinstance(params, str) else {}
        except (json.JSONDecodeError, ValueError):
            params = {}
    return args, params

# Timeout for individual tool calls (30 seconds)
TOOL_CALL_TIMEOUT_SEC = 30

SYSTEM_PROMPT_TEMPLATE = load_prompt("wifi")


def _conversation_context(state: AgentState) -> str:
    """Build a combined string from user_query + message history for pattern matching.

    This ensures that follow-up messages like "London" still detect RSSI intent
    from the earlier conversation turn.
    """
    parts = [state.get("user_query", "")]
    for msg in state.get("messages", []):
        if hasattr(msg, "content") and isinstance(msg.content, str):
            parts.append(msg.content)
    return " ".join(parts)


async def wifi_node(state: AgentState, writer: StreamWriter) -> dict:
    """Execute Wi-Fi analysis for the user query."""
    emit = safe_writer(writer)
    query = state["user_query"]
    plan_step = state.get("plan_step", 0)
    agent_events = list(state.get("agent_events", []))

    # Build conversation context early — needed for follow-up detection in all fast paths
    conv_context = _conversation_context(state)

    # ---- Pre-compute all direct pattern matches ----
    # Used to prevent follow-up cross-contamination: if a query directly matches
    # one fast-path (or has clear WiFi-specific intent), it should NOT be treated
    # as a follow-up for a different fast-path.
    is_band_dist_direct = bool(_BAND_DIST_PATTERN.search(query))
    is_rssi_direct = bool(_RSSI_PATTERN.search(query))
    is_cu_direct = bool(_CU_PATTERN.search(query))
    is_health_direct = bool(_HEALTH_PATTERN.search(query))
    is_rogue_direct = bool(_ROGUE_PATTERN.search(query))
    is_client_density_direct = bool(_CLIENT_DENSITY_PATTERN.search(query))
    is_other_wifi_direct = bool(_OTHER_WIFI_PATTERN.search(query))
    any_direct = is_band_dist_direct or is_rssi_direct or is_cu_direct or is_health_direct or is_rogue_direct or is_client_density_direct or is_other_wifi_direct
    # Follow-up queries are short, ambiguous messages like "London" or "for 5GHz",
    # not full analytical requests.  Cap at 5 words to avoid misclassifying
    # complex queries (e.g. "Analyze RF profiles and recommend wireless optimizations")
    # as follow-ups to unrelated fast-paths from earlier in the conversation.
    short_query = len(query.split()) <= 5 and not _COMPLEX_INTENT_PATTERN.search(query)

    # ---- Fast path: band distribution queries need NO LLM ----
    is_band_dist_followup = (
        not any_direct and short_query
        and bool(_BAND_DIST_PATTERN.search(conv_context))
    )
    if is_band_dist_direct or is_band_dist_followup:
        logger.info("WiFi agent: fast-path band distribution query")
        tool_results: list[dict] = []
        _ORG_PARAMS = {"timespan": 86400, "perPage": 1000}
        await asyncio.gather(
            _fetch_direct_tool(
                emit, tool_results,
                tool_name="getOrganizationNetworks",
                args={},
                label="organization networks",
            ),
            _fetch_org_wireless_metric(
                emit, tool_results,
                method="getOrganizationWirelessDevicesChannelUtilizationByNetwork",
                label="channel utilization by network",
                extra_params=_ORG_PARAMS,
            ),
        )

        # Check if the query targets a specific network
        target_network_id, target_network_name = _resolve_network_from_query(query, tool_results)

        pie_card = _build_band_distribution_chart(
            tool_results,
            network_id=target_network_id,
            network_name=target_network_name,
        )
        if pie_card:
            from langchain_core.messages import AIMessage
            if target_network_name:
                summary = (f"Here's the wireless band utilization distribution for **{target_network_name}**, "
                           "showing how WiFi activity is split across the 2.4 GHz, 5 GHz, and 6 GHz radio bands.")
            else:
                summary = ("Here's the wireless band utilization distribution across your organization, "
                           "showing how WiFi activity is split across the 2.4 GHz, 5 GHz, and 6 GHz radio bands.")
            return {
                "messages": [AIMessage(
                    content=summary,
                    id=f"wifi-band-dist-{uuid.uuid4().hex[:8]}",
                )],
                "tool_results": tool_results,
                "agent_events": agent_events,
                "cards": [pie_card],
                "plan_step": plan_step + 1,
            }
        logger.warning("WiFi agent: fast-path failed to build pie chart, falling through to LLM loop")

    # ---- Fast path: RSSI query — fully programmatic, no Sonnet loop ----
    is_rssi_followup = (
        not any_direct and short_query
        and bool(_RSSI_PATTERN.search(conv_context))
    )
    is_rssi = is_rssi_direct or is_rssi_followup
    if is_rssi:
        rssi_result = await _rssi_fast_path(query, conv_context, emit, agent_events, plan_step)
        if rssi_result is not None:
            return rssi_result
        logger.info("WiFi agent: RSSI fast-path couldn't resolve network, falling through to LLM loop")

    # ---- Fast path: channel utilization — lightweight, 2 API calls only (~3s) ----
    is_cu_followup = (
        not any_direct and short_query
        and bool(_CU_PATTERN.search(conv_context))
    )
    if is_cu_direct or is_cu_followup:
        cu_result = await _cu_fast_path(query, conv_context, emit, agent_events, plan_step)
        if cu_result is not None:
            return cu_result
        logger.info("WiFi agent: CU fast-path returned None, falling through to LLM loop")

    # ---- Fast path: client density — programmatic, all wireless networks ----
    is_client_density = bool(_CLIENT_DENSITY_PATTERN.search(query))
    if is_client_density:
        cd_result = await _client_density_fast_path(query, conv_context, emit, agent_events, plan_step)
        if cd_result is not None:
            return cd_result
        logger.info("WiFi agent: client density fast-path returned None, falling through to LLM loop")

    # ---- Fast path: health queries — full enrichment (~8-15s) ----
    is_health_followup = (
        not any_direct and short_query
        and bool(_HEALTH_PATTERN.search(conv_context))
    )
    if is_health_direct or is_health_followup:
        health_result = await _health_fast_path(query, conv_context, emit, agent_events, plan_step)
        if health_result is not None:
            return health_result
        logger.info("WiFi agent: health fast-path failed, falling through to LLM loop")

    # ---- Fast path: rogue AP detection — fully programmatic ----
    is_rogue_followup = (
        not any_direct and short_query
        and bool(_ROGUE_PATTERN.search(conv_context))
    )
    if is_rogue_direct or is_rogue_followup:
        rogue_result = await _rogue_ap_fast_path(query, conv_context, emit, agent_events, plan_step)
        if rogue_result is not None:
            return rogue_result
        logger.info("WiFi agent: rogue AP fast-path failed, falling through to LLM loop")

    # ---- Normal path: full LLM agentic loop ----
    skills_text = load_skills_for_agent("wifi")

    llm = ChatAnthropic(
        model=settings.model_name,
        api_key=settings.anthropic_api_key,
        max_tokens=4096,
        timeout=120,      # 2 min per API call
        max_retries=1,
    )

    tools = build_langchain_tools("wifi")
    if tools:
        llm_with_tools = llm.bind_tools(tools)
    else:
        llm_with_tools = llm

    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(skills=skills_text)
    messages = [
        SystemMessage(content=system_prompt),
        *state["messages"],
    ]

    tool_results: list[dict] = []
    response = None

    # Track which critical tools the LLM calls so we can backfill programmatically
    called_tools: set[str] = set()

    # Agentic loop: let the LLM call tools iteratively
    max_iterations = 7
    loop_start = time.time()
    for _ in range(max_iterations):
        if time.time() - loop_start > AGENT_LOOP_TIMEOUT_SEC:
            logger.warning("WiFi agent hit %ds loop timeout", AGENT_LOOP_TIMEOUT_SEC)
            break
        try:
            response = await asyncio.wait_for(
                llm_with_tools.ainvoke(messages), timeout=60
            )
        except asyncio.TimeoutError:
            logger.error("WiFi agent: LLM call timed out after 60s")
            break
        messages.append(response)

        # Check if the LLM wants to call tools
        if not response.tool_calls:
            break

        # Track tool names for programmatic enrichment check
        for tc in response.tool_calls:
            called_tools.add(tc["name"])
            # Also track call_meraki_api method names
            if tc["name"] == "call_meraki_api" and tc.get("args", {}).get("method"):
                called_tools.add(tc["args"]["method"])

        await execute_tools_parallel(
            response.tool_calls, tools, emit, tool_results, messages, TOOL_CALL_TIMEOUT_SEC
        )

    # Force summary if response is incomplete
    if needs_forced_summary(response, max_iterations, "WiFi", logger, len(tool_results)):
        messages.append(HumanMessage(content=FORCE_SUMMARY_PROMPT))
        try:
            response = await asyncio.wait_for(llm.ainvoke(messages), timeout=60)
        except Exception:
            logger.error("WiFi forced summary also failed")
            from langchain_core.messages import AIMessage
            response = AIMessage(content="I was unable to complete the WiFi analysis in time. Please try again with a more specific query.")
        messages.append(response)

    # --- Programmatic data enrichment (LLM-path only) ---
    # Health queries are handled by the fast path above and never reach here.
    # This enrichment is for non-health queries that went through the LLM loop
    # (e.g., deployment planning, config questions that the LLM partially answered).
    enrichment_tasks = []

    # Org networks for name resolution (lightweight)
    if "getOrganizationNetworks" not in called_tools:
        enrichment_tasks.append(_fetch_direct_tool(
            emit, tool_results,
            tool_name="getOrganizationNetworks",
            args={},
            label="organization networks",
        ))

    # Trend/analysis queries may benefit from org-wide CU/packet loss
    _ORG_WIRELESS_PARAMS = {"timespan": 86400, "perPage": 1000}
    _needs_metrics = bool(
        _TREND_PATTERN.search(conv_context)
        or called_tools & {"getOrganizationWirelessDevicesChannelUtilizationByNetwork",
                           "getOrganizationWirelessDevicesChannelUtilizationByDevice"}
    )
    if _needs_metrics:
        if "getOrganizationWirelessDevicesChannelUtilizationByNetwork" not in called_tools:
            enrichment_tasks.append(_fetch_org_wireless_metric(
                emit, tool_results,
                method="getOrganizationWirelessDevicesChannelUtilizationByNetwork",
                label="channel utilization by network",
                extra_params=_ORG_WIRELESS_PARAMS,
            ))

    if enrichment_tasks:
        await asyncio.gather(*enrichment_tasks)

    # Build visual chart cards from WiFi data (max 2)
    logger.info("WiFi agent: %d tool_results before chart extraction. Methods: %s",
                len(tool_results),
                [_safe_args(tr)[0].get("method", tr.get("tool", "?")) for tr in tool_results])
    chart_cards = _extract_wifi_charts(tool_results, query)
    if chart_cards:
        logger.info("WiFi agent: built %d chart cards: %s", len(chart_cards),
                     [c.get("title") for c in chart_cards])

    return {
        "messages": [response],
        "tool_results": tool_results,
        "agent_events": agent_events,
        "cards": chart_cards or [],
        "plan_step": plan_step + 1,
    }


async def _rssi_fast_path(
    query: str, conv_context: str, emit, agent_events: list, plan_step: int,
) -> dict | None:
    """Fully programmatic RSSI fast path — no Sonnet loop needed.

    1. Fetch org networks.
    2. Match query words against actual network names (ground truth).
    3. If no match, ask the user which network.
    4. Fetch signal quality history per band (2.4, 5, 6 GHz) in parallel.
    5. Build RSSI line chart and return.

    Returns None only on unexpected errors (falls through to LLM loop).
    """
    from langchain_core.messages import AIMessage

    # Step 1: Fetch org networks
    tool_results: list[dict] = []
    await _fetch_direct_tool(
        emit, tool_results,
        tool_name="getOrganizationNetworks",
        args={},
        label="organization networks",
    )

    # Build network name list for matching
    networks: list[dict] = []
    for tr in tool_results:
        parsed = _parse_wifi_result(tr.get("result"))
        if isinstance(parsed, list):
            networks = parsed
            break

    # Step 2: Match query against actual network names
    # Try both the current query and conversation context for follow-ups
    network_id = ""
    network_name = ""
    for hint in (query, conv_context):
        hint_lower = hint.lower().strip()
        for net in networks:
            if not isinstance(net, dict):
                continue
            name = net.get("name", "")
            name_clean = re.sub(r'\s*-\s*(wireless|appliance|switch|camera|sensor)$', '', name, flags=re.I)
            if name_clean.lower() in hint_lower or hint_lower in name_clean.lower():
                product_types = net.get("productTypes", [])
                if "wireless" in product_types or not network_id:
                    network_id = net.get("id", "")
                    network_name = name_clean
        if network_id:
            break

    # Step 3: No match — ask the user, listing available networks
    if not network_id:
        # Build a list of wireless-capable network names
        net_names = []
        for net in networks:
            if not isinstance(net, dict):
                continue
            product_types = net.get("productTypes", [])
            if "wireless" in product_types:
                name = net.get("name", "")
                clean = re.sub(r'\s*-\s*(wireless|appliance|switch|camera|sensor)$', '', name, flags=re.I)
                if clean and clean not in net_names:
                    net_names.append(clean)
        net_list = ", ".join(f'"{n}"' for n in net_names[:10]) if net_names else "your network names"
        return {
            "messages": [AIMessage(
                content=f"Which network would you like me to analyze RSSI/signal quality for? "
                        f"Available wireless networks: {net_list}.",
                id=f"wifi-rssi-ask-{uuid.uuid4().hex[:8]}",
            )],
            "tool_results": [], "agent_events": agent_events,
            "cards": [], "plan_step": plan_step + 1,
        }

    logger.info("WiFi agent: RSSI fast-path — resolved '%s' → %s (%s)", query, network_name, network_id)

    # Step 3: Fetch signal quality history per band in parallel
    rssi_results: list[dict] = []
    await asyncio.gather(
        *[
            _fetch_org_wireless_metric(
                emit, rssi_results,
                method="getNetworkWirelessSignalQualityHistory",
                label=f"signal quality {band}GHz",
                extra_params={"networkId": network_id, "band": band, "timespan": 86400},
            )
            for band in ("2.4", "5", "6")
        ]
    )

    # Step 4: Build RSSI chart from the per-band data
    all_results = tool_results + rssi_results
    chart_cards = _extract_wifi_charts(all_results, conv_context)

    summary = f"Here's the RSSI signal quality over the last 24 hours for **{network_name}**, broken down by radio band."
    if not chart_cards:
        summary = (f"I fetched signal quality data for **{network_name}** but no historical RSSI data "
                   f"was available. The network may not have enough wireless activity to generate signal metrics.")

    return {
        "messages": [AIMessage(content=summary, id=f"wifi-rssi-{uuid.uuid4().hex[:8]}")],
        "tool_results": all_results,
        "agent_events": agent_events,
        "cards": chart_cards,
        "plan_step": plan_step + 1,
    }


def _extract_wireless_net_ids_from_cu(tool_results: list[dict]) -> list[tuple[str, str]]:
    """Extract (networkId, networkName) pairs from CU-by-network results."""
    ids: list[tuple[str, str]] = []
    seen: set[str] = set()
    for tr in tool_results:
        args, _ = _safe_args(tr)
        if args.get("method") != "getOrganizationWirelessDevicesChannelUtilizationByNetwork":
            continue
        parsed = _parse_wifi_result(tr.get("result"))
        if isinstance(parsed, dict) and "items" in parsed:
            parsed = parsed["items"]
        if not isinstance(parsed, list):
            continue
        for item in parsed:
            if not isinstance(item, dict):
                continue
            net = item.get("network", {})
            if isinstance(net, dict):
                net_id = net.get("id", "")
                net_name = net.get("name", "")
                if net_id and net_id not in seen:
                    seen.add(net_id)
                    ids.append((net_id, net_name))
        break
    return ids


async def _cu_fast_path(
    query: str, conv_context: str, emit, agent_events: list, plan_step: int,
) -> dict | None:
    """Lightweight CU fast-path — only 2 API calls (networks + CU by network).

    Much faster than the health fast-path (~3s vs ~15s) and avoids rate-limit
    exhaustion from client/PL fetching.  Falls through to health fast-path
    for single-network queries that need per-device detail.
    """
    from langchain_core.messages import AIMessage

    tool_results: list[dict] = []
    _P = {"timespan": 86400, "perPage": 1000}

    # Only 2 parallel calls — fast and no rate-limit risk
    await asyncio.gather(
        _fetch_direct_tool(emit, tool_results, "getOrganizationNetworks", {}, "organization networks"),
        _fetch_org_wireless_metric(emit, tool_results, "getOrganizationWirelessDevicesChannelUtilizationByNetwork", "CU by network", _P),
    )

    # Check for single-network query — fall through to health fast-path for full detail
    target_id, target_name = _resolve_network_from_query(query, tool_results)
    if not target_id:
        target_id, target_name = _resolve_network_from_query(conv_context, tool_results)
    if target_id:
        return None  # let health fast-path handle single-network with per-AP data

    # Org-wide: build CU bar chart (not wifi_health card)
    # Parse CU-by-network data from tool_results
    cu_by_network: list | None = None
    for tr in tool_results:
        method = (tr.get("args") or {}).get("method", "") or tr.get("tool", "")
        if method == "getOrganizationWirelessDevicesChannelUtilizationByNetwork":
            parsed = _parse_wifi_result(tr.get("result"))
            if isinstance(parsed, dict) and "items" in parsed:
                parsed = parsed["items"]
            if isinstance(parsed, list):
                cu_by_network = parsed
            break

    cu_card = _build_util_bar_card(None, cu_by_network, None)
    if not cu_card:
        return None

    summary = _build_cu_summary(cu_by_network)

    logger.info("WiFi agent: CU fast-path complete — org-wide bar chart")

    return {
        "messages": [AIMessage(content=summary, id=f"wifi-cu-{uuid.uuid4().hex[:8]}")],
        "tool_results": tool_results,
        "agent_events": agent_events,
        "cards": [cu_card],
        "plan_step": plan_step + 1,
    }


async def _client_density_fast_path(
    query: str, conv_context: str, emit, agent_events: list, plan_step: int,
) -> dict | None:
    """Programmatic client density fast-path — fetches clients for all wireless networks.

    Steps:
    1. Fetch org networks + CU by network (to identify wireless networks) — 2 parallel calls
    2. Fetch getNetworkClients for each wireless network — parallel, capped at 10
    3. Build client density bar chart
    """
    from langchain_core.messages import AIMessage

    tool_results: list[dict] = []
    _P = {"timespan": 86400, "perPage": 1000}

    # Step 1: identify wireless networks via CU data
    await asyncio.gather(
        _fetch_direct_tool(emit, tool_results, "getOrganizationNetworks", {}, "organization networks"),
        _fetch_org_wireless_metric(emit, tool_results, "getOrganizationWirelessDevicesChannelUtilizationByNetwork", "CU by network", _P),
    )

    wireless_nets = _extract_wireless_net_ids_from_cu(tool_results)
    if not wireless_nets:
        return None

    # Build network name lookup
    network_names: dict[str, str] = {}
    for net_id, net_name in wireless_nets:
        clean = re.sub(r'\s*-\s*(wireless|appliance|switch|camera|sensor)$', '', net_name, flags=re.I)
        network_names[net_id] = clean

    # Step 2: fetch clients for all wireless networks (parallel, 15s timeout)
    try:
        await asyncio.wait_for(
            asyncio.gather(*[
                _fetch_direct_tool(
                    emit, tool_results, "getNetworkClients",
                    {"networkId": nid},
                    f"clients ({nname[:20]})",
                )
                for nid, nname in wireless_nets[:10]
            ]),
            timeout=15,
        )
    except Exception as e:
        logger.warning("WiFi agent: client density fetch partially failed: %s", e)

    # Step 3: parse client data by network
    client_by_network: dict[str, list] = {}
    for tr in tool_results:
        tool_name = tr.get("tool", "")
        if tool_name != "getNetworkClients":
            continue
        args = tr.get("args") or {}
        net_id = args.get("networkId", "")
        if not net_id:
            continue
        parsed = _parse_wifi_result(tr.get("result"))
        if isinstance(parsed, list):
            # Filter to wireless clients only
            wireless_clients = [c for c in parsed if isinstance(c, dict) and c.get("ssid")]
            if wireless_clients:
                client_by_network[net_id] = wireless_clients

    if not client_by_network:
        return None

    # Build bar chart
    card = _build_client_density_card(client_by_network, network_names)
    if not card:
        return None

    # Build text summary
    total_clients = sum(len(clients) for clients in client_by_network.values())
    total_nets = len(client_by_network)
    parts = [f"Client density across **{total_nets}** wireless network{'s' if total_nets != 1 else ''} ({total_clients} total clients)."]

    # Top networks by client count
    ranked = sorted(client_by_network.items(), key=lambda x: len(x[1]), reverse=True)
    top_items = []
    for net_id, clients in ranked[:8]:
        name = network_names.get(net_id, net_id)
        top_items.append(f"**{name}**: {len(clients)} clients")
    if top_items:
        parts.append(", ".join(top_items))

    summary = "\n\n".join(parts)

    logger.info("WiFi agent: client density fast-path complete — %d networks, %d clients", total_nets, total_clients)

    return {
        "messages": [AIMessage(content=summary, id=f"wifi-cd-{uuid.uuid4().hex[:8]}")],
        "tool_results": tool_results,
        "agent_events": agent_events,
        "cards": [card],
        "plan_step": plan_step + 1,
    }


async def _health_fast_path(
    query: str, conv_context: str, emit, agent_events: list, plan_step: int,
) -> dict | None:
    """Fully programmatic WiFi health fast path — no Sonnet loop.

    Org-wide: fetches CU + packet loss + client counts (~8s).
    Single-network: fetches devices + clients + CU + stats → wifi_health card (~8s).
    """
    from langchain_core.messages import AIMessage

    tool_results: list[dict] = []
    _P = {"timespan": 86400, "perPage": 1000}

    # Step 1: org-wide data (always needed — 3 parallel calls)
    await asyncio.gather(
        _fetch_direct_tool(emit, tool_results, "getOrganizationNetworks", {}, "organization networks"),
        _fetch_org_wireless_metric(emit, tool_results, "getOrganizationWirelessDevicesChannelUtilizationByNetwork", "channel utilization by network", _P),
        _fetch_org_wireless_metric(emit, tool_results, "getOrganizationWirelessDevicesPacketLossByNetwork", "packet loss by network", _P),
    )

    # Step 2: resolve target network (if query names one)
    target_id, target_name = _resolve_network_from_query(query, tool_results)
    if not target_id:
        # Short follow-ups: check conversation history
        target_id, target_name = _resolve_network_from_query(conv_context, tool_results)

    # Step 3: single-network or org-wide enrichment
    if target_id:
        await asyncio.gather(
            _fetch_direct_tool(emit, tool_results, "getNetworkDevices", {"networkId": target_id}, "network devices"),
            _fetch_direct_tool(emit, tool_results, "getNetworkClients", {"networkId": target_id}, "network clients"),
            _fetch_org_wireless_metric(emit, tool_results, "getNetworkWirelessConnectionStats", "connection stats", {"networkId": target_id}),
            _fetch_org_wireless_metric(emit, tool_results, "getOrganizationWirelessDevicesChannelUtilizationByDevice", "CU by device", _P),
        )
    else:
        # Org-wide: fetch client counts for top wireless networks (best-effort, capped to stay within rate limits)
        try:
            wireless_net_ids = _extract_wireless_net_ids_from_cu(tool_results)
            if wireless_net_ids:
                await asyncio.wait_for(
                    asyncio.gather(*[
                        _fetch_direct_tool(
                            emit, tool_results, "getNetworkClients",
                            {"networkId": nid},
                            f"clients ({nname[:20]})",
                        )
                        for nid, nname in wireless_net_ids[:5]
                    ]),
                    timeout=15,
                )
        except Exception as e:
            logger.warning("WiFi agent: org-wide client fetch failed (non-fatal): %s", e)

    # Step 4: build cards
    chart_cards: list[dict] = []
    if target_id:
        # Single-network: wifi_health card with per-AP details
        health_card = _build_wifi_health_card(tool_results)
        if health_card:
            chart_cards = [health_card]
    else:
        # Org-wide: wifi_health card with per-network rows
        org_card = _build_org_wifi_health_card(tool_results)
        if org_card:
            chart_cards = [org_card]

    # Step 5: programmatic summary
    summary = _build_health_summary(tool_results, target_name)

    logger.info("WiFi agent: health fast-path complete — %s, %d cards",
                f"network={target_name}" if target_name else "org-wide", len(chart_cards))

    return {
        "messages": [AIMessage(content=summary, id=f"wifi-health-{uuid.uuid4().hex[:8]}")],
        "tool_results": tool_results,
        "agent_events": agent_events,
        "cards": chart_cards,
        "plan_step": plan_step + 1,
    }


async def _rogue_ap_fast_path(
    query: str, conv_context: str, emit, agent_events: list, plan_step: int,
) -> dict | None:
    """Fully programmatic rogue AP detection — no Sonnet loop.

    1. Fetch org networks + device statuses (parallel).
    2. Build known device MAC set from inventory.
    3. Fetch Air Marshal per wireless network (parallel batches).
    4. Cross-reference detected APs against known MACs.
    5. Build data_table card listing rogues.
    """
    from langchain_core.messages import AIMessage

    tool_results: list[dict] = []

    # Step 1: Fetch org networks + device statuses in parallel
    await asyncio.gather(
        _fetch_direct_tool(emit, tool_results, "getOrganizationNetworks", {}, "organization networks"),
        _fetch_direct_tool(emit, tool_results, "getOrganizationDevicesStatuses", {}, "device statuses"),
    )

    # Step 2: Build known device MAC set
    known_macs: set[str] = set()
    for tr in tool_results:
        if tr.get("tool") != "getOrganizationDevicesStatuses":
            continue
        parsed = _parse_wifi_result(tr.get("result"))
        if isinstance(parsed, list):
            for dev in parsed:
                if not isinstance(dev, dict):
                    continue
                mac = (dev.get("mac") or "").lower().strip()
                if mac:
                    known_macs.add(mac)

    logger.info("WiFi agent: rogue AP scan — %d known device MACs", len(known_macs))

    # Step 3: Find wireless networks
    wireless_networks: list[dict] = []
    for tr in tool_results:
        if tr.get("tool") != "getOrganizationNetworks":
            continue
        parsed = _parse_wifi_result(tr.get("result"))
        if isinstance(parsed, list):
            for net in parsed:
                if isinstance(net, dict) and "wireless" in net.get("productTypes", []):
                    wireless_networks.append(net)
        break

    if not wireless_networks:
        return {
            "messages": [AIMessage(
                content="No wireless networks found in the organization.",
                id=f"wifi-rogue-{uuid.uuid4().hex[:8]}",
            )],
            "tool_results": tool_results,
            "agent_events": agent_events,
            "cards": [],
            "plan_step": plan_step + 1,
        }

    # Resolve target network if the query names a specific one
    target_id, target_name = _resolve_network_from_query(query, tool_results)
    if not target_id:
        target_id, target_name = _resolve_network_from_query(conv_context, tool_results)

    # Step 4: Fetch Air Marshal per wireless network (parallel batches of 5)
    scan_networks = (
        [n for n in wireless_networks if n.get("id") == target_id]
        if target_id
        else wireless_networks
    )

    air_marshal_results: list[dict] = []
    batch_size = 5
    for i in range(0, len(scan_networks), batch_size):
        batch = scan_networks[i : i + batch_size]
        await asyncio.gather(*[
            _fetch_org_wireless_metric(
                emit, air_marshal_results,
                method="getNetworkWirelessAirMarshal",
                label=f"air marshal — {net.get('name', '')[:30]}",
                extra_params={"networkId": net["id"]},
            )
            for net in batch
        ])

    # Build network ID → clean name map
    net_name_map: dict[str, str] = {}
    for net in wireless_networks:
        nid = net.get("id", "")
        name = net.get("name", nid)
        name = re.sub(r'\s*-\s*(wireless|appliance|switch|camera|sensor)$', '', name, flags=re.I)
        net_name_map[nid] = name

    # Also build a set of known SSIDs for spoofing detection
    known_ssids: set[str] = set()
    for tr in tool_results:
        if tr.get("tool") != "getOrganizationNetworks":
            continue
        parsed = _parse_wifi_result(tr.get("result"))
        if isinstance(parsed, list):
            for net in parsed:
                if isinstance(net, dict):
                    name = net.get("name", "")
                    if name:
                        known_ssids.add(name.lower())

    # Step 5: Cross-reference Air Marshal results against known MACs
    rogue_aps: list[dict] = []
    total_detected = 0

    for tr in air_marshal_results:
        args, params = _safe_args(tr)
        network_id = params.get("networkId", "")
        net_name = net_name_map.get(network_id, network_id)

        parsed = _parse_wifi_result(tr.get("result"))
        if not isinstance(parsed, list):
            continue

        for entry in parsed:
            if not isinstance(entry, dict):
                continue

            total_detected += 1
            ssid = entry.get("ssid") or "(hidden)"
            bssids = entry.get("bssids", [])
            wired_macs = entry.get("wiredMacs", [])

            # Check if ANY identifier matches a known device
            is_known = False
            for bssid_info in bssids:
                if not isinstance(bssid_info, dict):
                    continue
                bssid = (bssid_info.get("bssid") or "").lower().strip()
                if bssid in known_macs:
                    is_known = True
                    break
            if not is_known:
                for wm in (wired_macs or []):
                    if isinstance(wm, str) and wm.lower().strip() in known_macs:
                        is_known = True
                        break

            if is_known:
                continue

            # This is a rogue AP — extract details from each BSSID
            for bssid_info in bssids:
                if not isinstance(bssid_info, dict):
                    continue
                detected_by = bssid_info.get("detectedBy", [])
                strongest_rssi = max(
                    (d.get("rssi", -100) for d in detected_by if isinstance(d, dict)),
                    default=-100,
                )
                channels_raw = bssid_info.get("channels", {})
                channel_list: list[str] = []
                if isinstance(channels_raw, dict):
                    for band, chs in channels_raw.items():
                        if isinstance(chs, list):
                            for ch in chs:
                                channel_list.append(f"{ch}")
                channel_str = ", ".join(channel_list) if channel_list else "—"

                first_seen = bssid_info.get("firstSeen", "")
                last_seen = bssid_info.get("lastSeen", "")
                # Trim to date only for readability
                if "T" in first_seen:
                    first_seen = first_seen.split("T")[0]
                if "T" in last_seen:
                    last_seen = last_seen.split("T")[0]

                rogue_aps.append({
                    "network": net_name,
                    "ssid": ssid,
                    "bssid": bssid_info.get("bssid", ""),
                    "channel": channel_str,
                    "rssi": strongest_rssi,
                    "first_seen": first_seen,
                    "last_seen": last_seen,
                    "detected_by_count": len(detected_by),
                    "is_spoofing": ssid.lower() in known_ssids,
                })

    # Sort: spoofing first, then by signal strength (strongest first = most concerning)
    rogue_aps.sort(key=lambda r: (not r["is_spoofing"], r["rssi"]))

    logger.info("WiFi agent: rogue AP scan — %d total detected, %d rogue, %d networks scanned",
                total_detected, len(rogue_aps), len(scan_networks))

    # Step 6: Build card and summary
    cards: list[dict] = []
    scope = f"**{target_name}**" if target_name else f"**{len(scan_networks)}** wireless networks"

    if rogue_aps:
        # Build data_table card
        columns = ["Network", "SSID", "BSSID", "Ch", "Signal", "First Seen", "Last Seen"]
        rows: list[list[str]] = []
        for r in rogue_aps[:50]:  # Cap at 50 rows
            signal_str = f"{r['rssi']} dBm" if r["rssi"] > -100 else "—"
            ssid_display = f"⚠ {r['ssid']}" if r["is_spoofing"] else r["ssid"]
            rows.append([
                r["network"],
                ssid_display,
                r["bssid"],
                r["channel"],
                signal_str,
                r["first_seen"],
                r["last_seen"],
            ])

        cards.append({
            "id": f"card-{uuid.uuid4().hex[:8]}",
            "type": "data_table",
            "title": f"Rogue APs Detected — {target_name or 'Organization'}",
            "source": "meraki",
            "data": {
                "columns": columns,
                "rows": rows,
            },
        })

        # Text summary
        spoofing = [r for r in rogue_aps if r["is_spoofing"]]
        strong_signal = [r for r in rogue_aps if r["rssi"] > -60]

        parts = [f"Scanned {scope} — detected **{len(rogue_aps)} rogue/unknown APs** "
                 f"out of {total_detected} total APs seen by your Meraki radios."]

        if spoofing:
            ssid_names = ", ".join(set(f'"{r["ssid"]}"' for r in spoofing))
            parts.append(f"**{len(spoofing)} potential SSID spoofing** (evil twin): "
                         f"broadcasting your SSID names — {ssid_names}")

        if strong_signal:
            parts.append(f"**{len(strong_signal)} with strong signal** (> -60 dBm) — "
                         f"these are physically close and may warrant investigation")

        # Per-network breakdown
        net_counts: dict[str, int] = {}
        for r in rogue_aps:
            net_counts[r["network"]] = net_counts.get(r["network"], 0) + 1
        if len(net_counts) > 1:
            breakdown = ", ".join(f"**{name}** ({count})" for name, count in
                                 sorted(net_counts.items(), key=lambda x: x[1], reverse=True))
            parts.append(f"By network: {breakdown}")

        summary = "\n\n".join(parts)
    else:
        summary = (f"Scanned {scope} — **no rogue APs detected**. "
                   f"All {total_detected} APs seen by your Meraki radios are registered in your organization inventory.")

    return {
        "messages": [AIMessage(content=summary, id=f"wifi-rogue-{uuid.uuid4().hex[:8]}")],
        "tool_results": tool_results + air_marshal_results,
        "agent_events": agent_events,
        "cards": cards,
        "plan_step": plan_step + 1,
    }


def _build_cu_summary(cu_by_network: list | None) -> str:
    """Build a concise text summary focused on channel utilization."""
    if not cu_by_network:
        return "No channel utilization data available."

    entries: list[dict] = []
    for item in cu_by_network:
        if not isinstance(item, dict):
            continue
        net = item.get("network", {})
        name = net.get("name", "") if isinstance(net, dict) else ""
        name = re.sub(r'\s*-\s*(wireless|appliance|switch|camera|sensor)$', '', name, flags=re.I)
        by_band = item.get("byBand", [])
        u24 = u5 = u6 = 0.0
        for bd in by_band:
            if not isinstance(bd, dict):
                continue
            band = str(bd.get("band", ""))
            wifi = bd.get("wifi", {})
            pct = (wifi.get("percentage", 0) if isinstance(wifi, dict) else 0) or 0
            if "2.4" in band:
                u24 = pct
            elif band.startswith("5"):
                u5 = pct
            elif band.startswith("6"):
                u6 = pct
        entries.append({"name": name or "Unknown", "u24": round(u24, 1), "u5": round(u5, 1), "u6": round(u6, 1)})

    total = len(entries)
    parts = [f"Channel utilization across **{total}** wireless network{'s' if total != 1 else ''}."]

    # Classify by utilization severity
    high: list[str] = []
    moderate: list[str] = []
    low: list[str] = []
    for e in entries:
        bands = []
        if e["u24"] > 0:
            bands.append(f"2.4 GHz {e['u24']}%")
        if e["u5"] > 0:
            bands.append(f"5 GHz {e['u5']}%")
        if e["u6"] > 0:
            bands.append(f"6 GHz {e['u6']}%")
        label = f"**{e['name']}** ({', '.join(bands)})" if bands else f"**{e['name']}**"

        if e["u24"] > 60 or e["u5"] > 70 or e["u6"] > 70:
            high.append(label)
        elif e["u24"] > 40 or e["u5"] > 50 or e["u6"] > 50:
            moderate.append(label)
        else:
            low.append(label)

    if high:
        parts.append(f"**{len(high)} high utilization**: {', '.join(high)}")
    if moderate:
        parts.append(f"**{len(moderate)} moderate**: {', '.join(moderate)}")
    if low:
        parts.append(f"**{len(low)} low utilization**: {', '.join([e.split('(')[0].strip() for e in low])}")

    return "\n\n".join(parts)


def _build_health_summary(tool_results: list[dict], target_name: str | None) -> str:
    """Build a concise text summary of WiFi health from tool results."""
    # Parse CU by network
    cu_data: list[dict] = []
    for tr in tool_results:
        args, _ = _safe_args(tr)
        if args.get("method") != "getOrganizationWirelessDevicesChannelUtilizationByNetwork":
            continue
        parsed = _parse_wifi_result(tr.get("result"))
        if isinstance(parsed, dict) and "items" in parsed:
            parsed = parsed["items"]
        if not isinstance(parsed, list):
            continue
        for item in parsed:
            if not isinstance(item, dict):
                continue
            net = item.get("network", {})
            net_id = net.get("id", "") if isinstance(net, dict) else ""
            name = net.get("name", "") if isinstance(net, dict) else ""
            name = re.sub(r'\s*-\s*(wireless|appliance|switch|camera|sensor)$', '', name, flags=re.I)
            by_band = item.get("byBand", [])
            u24 = u5 = u6 = 0.0
            for bd in by_band:
                if not isinstance(bd, dict):
                    continue
                band = str(bd.get("band", ""))
                wifi = bd.get("wifi", {})
                pct = (wifi.get("percentage", 0) if isinstance(wifi, dict) else 0) or 0
                if "2.4" in band:
                    u24 = pct
                elif band.startswith("5"):
                    u5 = pct
                elif band.startswith("6"):
                    u6 = pct
            cu_data.append({"name": name, "net_id": net_id, "u24": round(u24, 1), "u5": round(u5, 1), "u6": round(u6, 1)})

    # Parse packet loss by network
    pl_map: dict[str, float] = {}
    for tr in tool_results:
        args, _ = _safe_args(tr)
        if args.get("method") != "getOrganizationWirelessDevicesPacketLossByNetwork":
            continue
        parsed = _parse_wifi_result(tr.get("result"))
        if isinstance(parsed, dict) and "items" in parsed:
            parsed = parsed["items"]
        if not isinstance(parsed, list):
            continue
        for item in parsed:
            if not isinstance(item, dict):
                continue
            net = item.get("network", {})
            name = net.get("name", "") if isinstance(net, dict) else ""
            name = re.sub(r'\s*-\s*(wireless|appliance|switch|camera|sensor)$', '', name, flags=re.I)
            downstream = item.get("downstream", {})
            loss = (downstream.get("lossPercentage", 0) if isinstance(downstream, dict) else 0) or 0
            if name:
                pl_map[name] = round(loss, 2)

    # --- Parse client counts from getNetworkClients results ---
    client_map: dict[str, int] = {}  # network_name → client count
    for tr in tool_results:
        tool_name = tr.get("tool", "")
        if tool_name != "getNetworkClients":
            continue
        args = tr.get("args") or {}
        net_id = args.get("networkId", "")
        parsed = _parse_wifi_result(tr.get("result"))
        count = len(parsed) if isinstance(parsed, list) else 0
        # Resolve network name from net_id via cu_data or net_name_map
        name = ""
        for cd in cu_data:
            if cd.get("net_id") == net_id:
                name = cd["name"]
                break
        if not name:
            # Try matching via the network list in tool_results
            for tr2 in tool_results:
                if tr2.get("tool") != "getOrganizationNetworks":
                    continue
                nets = _parse_wifi_result(tr2.get("result"))
                if isinstance(nets, list):
                    for n in nets:
                        if isinstance(n, dict) and n.get("id") == net_id:
                            name = n.get("name", "")
                            name = re.sub(r'\s*-\s*(wireless|appliance|switch|camera|sensor)$', '', name, flags=re.I)
                            break
                break
        if name:
            client_map[name] = count

    total_clients = sum(client_map.values())

    # --- Single-network summary ---
    if target_name:
        entry = next((c for c in cu_data if c["name"] == target_name), None)
        pl = pl_map.get(target_name, 0)
        clients = client_map.get(target_name, 0)
        parts = [f"### WiFi Health — {target_name}"]
        if entry:
            # Band utilization breakdown
            bands: list[str] = []
            if entry["u24"] > 0:
                level = "critical" if entry["u24"] > 60 else ("elevated" if entry["u24"] > 50 else "healthy")
                bands.append(f"2.4 GHz at **{entry['u24']}%** ({level})")
            if entry["u5"] > 0:
                level = "critical" if entry["u5"] > 70 else ("elevated" if entry["u5"] > 60 else "healthy")
                bands.append(f"5 GHz at **{entry['u5']}%** ({level})")
            if entry.get("u6", 0) > 0:
                level = "critical" if entry["u6"] > 70 else ("elevated" if entry["u6"] > 60 else "healthy")
                bands.append(f"6 GHz at **{entry['u6']}%** ({level})")
            if bands:
                parts.append("**Channel Utilization**: " + " | ".join(bands))

            if pl > 0:
                level = "critical" if pl > 3 else ("elevated" if pl > 1 else "normal")
                parts.append(f"**Packet Loss**: {pl}% ({level})")

            if clients:
                parts.append(f"**Connected Clients**: {clients}")

            # Analysis
            issues: list[str] = []
            if entry["u24"] > 60:
                issues.append(f"2.4 GHz is severely congested at {entry['u24']}% — clients on this band will experience slow speeds, high latency, and connection drops. This is common in dense environments where many legacy and IoT devices default to 2.4 GHz.")
            elif entry["u24"] > 50:
                issues.append(f"2.4 GHz utilization is elevated at {entry['u24']}%. Performance may degrade during peak hours.")
            if entry["u5"] > 70:
                issues.append(f"5 GHz is heavily congested at {entry['u5']}% — this is unusual and suggests either co-channel interference from neighboring APs or an extremely high client density.")
            elif entry["u5"] > 60:
                issues.append(f"5 GHz utilization is elevated at {entry['u5']}%. Monitor for degradation during peak periods.")
            if pl > 3:
                issues.append(f"Packet loss at {pl}% is critically high — users will see intermittent connectivity, slow page loads, and dropped video/voice calls.")
            elif pl > 1:
                issues.append(f"Packet loss at {pl}% is above normal — may cause occasional retransmissions and slight latency increases.")

            if issues:
                parts.append("**Analysis**\n" + "\n".join(f"- {i}" for i in issues))
            else:
                parts.append("All metrics are within healthy thresholds — no issues detected.")

            # Recommendations
            recs: list[str] = []
            if entry["u24"] > 50:
                recs.append("Enable or verify **band steering** to move capable clients from 2.4 GHz to 5/6 GHz")
                if entry["u24"] > 60:
                    recs.append("Consider reducing 2.4 GHz transmit power or disabling it on select APs to reduce co-channel interference")
            if entry["u5"] > 60:
                recs.append("Review AP placement and channel assignments to reduce 5 GHz co-channel interference")
            if pl > 1:
                recs.append("Investigate sources of interference (non-WiFi devices, radar, neighboring networks) using RF spectrum analysis")
            if clients and clients > 50:
                recs.append(f"With {clients} clients connected, ensure AP density is sufficient — target no more than 25-30 clients per AP")
            if recs:
                parts.append("**Recommendations**\n" + "\n".join(f"- {r}" for r in recs))

        return "\n\n".join(parts)

    # --- Org-wide summary ---
    if not cu_data:
        return "No wireless network data available for health analysis."

    critical_nets: list[dict] = []
    warning_nets: list[dict] = []
    healthy_nets: list[dict] = []

    for nd in cu_data:
        name = nd["name"] or "Unknown"
        pl = pl_map.get(name, 0)
        clients = client_map.get(name, 0)
        issues: list[str] = []
        status = "healthy"

        u6 = nd.get("u6", 0)
        if nd["u24"] > 60 or nd["u5"] > 70 or u6 > 70 or pl > 3:
            status = "critical"
        elif nd["u24"] > 50 or nd["u5"] > 60 or u6 > 60 or pl > 1:
            status = "warning"

        if nd["u24"] > 50:
            issues.append(f"2.4 GHz {nd['u24']}%")
        if nd["u5"] > 60:
            issues.append(f"5 GHz {nd['u5']}%")
        if u6 > 60:
            issues.append(f"6 GHz {u6}%")
        if pl > 1:
            issues.append(f"loss {pl}%")

        entry = {"name": name, "issues": issues, "u24": nd["u24"], "u5": nd["u5"], "u6": u6, "pl": pl, "clients": clients}
        if status == "critical":
            critical_nets.append(entry)
        elif status == "warning":
            warning_nets.append(entry)
        else:
            healthy_nets.append(entry)

    total = len(cu_data)

    # Org-wide averages
    avg_24 = round(sum(d["u24"] for d in cu_data) / total, 1) if total else 0
    avg_5 = round(sum(d["u5"] for d in cu_data) / total, 1) if total else 0
    avg_pl = round(sum(pl_map.get(d["name"], 0) for d in cu_data) / total, 2) if total else 0

    parts = [f"### WiFi Health — Organization Overview"]
    parts.append(f"Analyzed **{total}** wireless network{'s' if total != 1 else ''} "
                 f"— **{len(critical_nets)}** critical, **{len(warning_nets)}** warning, **{len(healthy_nets)}** healthy."
                 + (f" **{total_clients}** total clients connected." if total_clients else ""))

    # Org averages
    parts.append(f"**Org Averages**: 2.4 GHz utilization {avg_24}% | 5 GHz utilization {avg_5}% | Packet loss {avg_pl}%")

    # Critical networks — detailed
    if critical_nets:
        lines = [f"**Critical Networks ({len(critical_nets)})**"]
        for e in critical_nets:
            detail = f"- **{e['name']}** — "
            metrics: list[str] = []
            if e["u24"] > 50:
                metrics.append(f"2.4 GHz at {e['u24']}%")
            if e["u5"] > 60:
                metrics.append(f"5 GHz at {e['u5']}%")
            if e["u6"] > 60:
                metrics.append(f"6 GHz at {e['u6']}%")
            if e["pl"] > 1:
                metrics.append(f"packet loss {e['pl']}%")
            if e["clients"]:
                metrics.append(f"{e['clients']} clients")
            detail += ", ".join(metrics) if metrics else "elevated metrics"
            lines.append(detail)
        parts.append("\n".join(lines))

    # Warning networks — brief
    if warning_nets:
        lines = [f"**Warning Networks ({len(warning_nets)})**"]
        for e in warning_nets:
            metrics = []
            if e["u24"] > 50:
                metrics.append(f"2.4 GHz {e['u24']}%")
            if e["u5"] > 60:
                metrics.append(f"5 GHz {e['u5']}%")
            if e["pl"] > 1:
                metrics.append(f"loss {e['pl']}%")
            lines.append(f"- **{e['name']}** — {', '.join(metrics)}" if metrics else f"- **{e['name']}**")
        parts.append("\n".join(lines))

    # Healthy networks — compact list
    if healthy_nets:
        names = [e["name"] for e in healthy_nets]
        parts.append(f"**Healthy Networks ({len(healthy_nets)})**: {', '.join(names)}")

    # Key findings
    findings: list[str] = []
    high_24 = [e for e in critical_nets + warning_nets if e["u24"] > 50]
    if high_24:
        findings.append(f"**{len(high_24)} network{'s' if len(high_24) != 1 else ''} with high 2.4 GHz utilization** — "
                        "this band is the most common bottleneck due to limited non-overlapping channels (1, 6, 11) "
                        "and heavy use by legacy/IoT devices. Networks above 60% will see noticeable client performance degradation.")
    high_loss = [e for e in critical_nets + warning_nets if e["pl"] > 1]
    if high_loss:
        findings.append(f"**{len(high_loss)} network{'s' if len(high_loss) != 1 else ''} with elevated packet loss** — "
                        "this can indicate RF interference, co-channel contention, or overloaded APs. "
                        "Clients experience retransmissions and increased latency.")
    if avg_5 > 50:
        findings.append(f"Org-wide 5 GHz average is high at {avg_5}% — consider reviewing DFS channel usage and AP density.")
    if findings:
        parts.append("**Key Findings**\n" + "\n".join(f"- {f}" for f in findings))

    # Recommendations
    recs: list[str] = []
    if high_24:
        recs.append("Enable **band steering** on critical networks to shift capable clients to 5/6 GHz")
    if any(e["u24"] > 70 for e in critical_nets):
        recs.append("For networks above 70% on 2.4 GHz, consider **reducing 2.4 GHz power** or disabling it on select APs")
    if high_loss:
        recs.append("Run **RF spectrum analysis** on networks with high packet loss to identify interference sources")
    if total_clients and total > 0:
        avg_clients = total_clients // total
        if avg_clients > 40:
            recs.append(f"Average of {avg_clients} clients per network — review AP-to-client ratios and consider adding APs in dense locations")
    if recs:
        parts.append("**Recommendations**\n" + "\n".join(f"- {r}" for r in recs))

    return "\n\n".join(parts)


async def _fetch_org_wireless_metric(
    emit, tool_results: list[dict], method: str, label: str,
    extra_params: dict | None = None,
) -> None:
    """Programmatically fetch a wireless metric via call_meraki_api."""
    emit({"type": "tool_call", "tool": method, "source": "meraki", "status": "running"})
    params = extra_params or {}
    try:
        result = await asyncio.wait_for(
            mcp_manager.call_tool("call_meraki_api", {
                "section": "wireless",
                "method": method,
                "parameters": params,
            }),
            timeout=20,
        )
        if result:
            content = result.get("content", "")
            is_error = (
                "error" in result
                or (isinstance(content, str) and content.strip().lower().startswith("error"))
                or (isinstance(content, str) and '"errors"' in content[:100])
            )
            if not is_error and content:
                tool_results.append({
                    "tool": "call_meraki_api",
                    "args": {"section": "wireless", "method": method, "parameters": params},
                    "result": content,
                })
                logger.info("WiFi agent: programmatically fetched %s OK (%d chars)", label, len(content))
            else:
                logger.warning("WiFi agent: %s returned error or empty content", label)
    except Exception as e:
        logger.warning("WiFi agent: %s fetch failed: %s", label, e)
    emit({"type": "tool_call", "tool": method, "source": "meraki", "status": "complete"})


async def _fetch_direct_tool(
    emit, tool_results: list[dict], tool_name: str, args: dict, label: str,
) -> None:
    """Programmatically call a direct MCP tool (not call_meraki_api)."""
    emit({"type": "tool_call", "tool": tool_name, "source": "meraki", "status": "running"})
    try:
        result = await asyncio.wait_for(
            mcp_manager.call_tool(tool_name, args), timeout=20,
        )
        if result:
            content = result.get("content", "")
            if content:
                tool_results.append({
                    "tool": tool_name,
                    "args": args,
                    "result": content,
                })
                logger.info("WiFi agent: programmatically fetched %s OK (%d chars)", label, len(content))
    except Exception as e:
        logger.warning("WiFi agent: %s fetch failed: %s", label, e)
    emit({"type": "tool_call", "tool": tool_name, "source": "meraki", "status": "complete"})


def _find_network_id_from_results(tool_results: list[dict]) -> str:
    """Extract a networkId from tool_results (from getNetworkDevices or getNetworkClients args)."""
    for tr in tool_results:
        args, params = _safe_args(tr)
        tool_name = tr.get("tool", "")
        method = args.get("method", "")
        if method in ("getNetworkDevices", "getNetworkClients") or tool_name in ("getNetworkDevices", "getNetworkClients"):
            net_id = args.get("networkId") or params.get("networkId", "")
            if net_id:
                return net_id
    return ""


# ---------------------------------------------------------------------------
# Chart card extraction
# ---------------------------------------------------------------------------

# Queries about trends/history prefer line charts over bar charts
_TREND_PATTERN = re.compile(
    r"\b(trend|history|over\s+time|getting\s+(worse|better)|changing|growth|growing)\b",
    re.IGNORECASE,
)

_RSSI_PATTERN = re.compile(
    r"\b(rssi|signal\s+(quality|strength|metric)|snr)\b",
    re.IGNORECASE,
)

_BAND_DIST_PATTERN = re.compile(
    r"\b(band\s+(distribution|breakdown|usage|split)"
    r"|distribution.{0,20}band"
    r"|2\.4\s*g?hz?\s*vs\.?\s*5\s*g?hz"
    r"|band\s+allocation"
    r")\b",
    re.IGNORECASE,
)

# Queries that should produce the wifi_health dashboard card
_HEALTH_PATTERN = re.compile(
    r"\b(wifi\s+health|wireless\s+health|wifi\s+status|wireless\s+status"
    r"|wifi\s+(check|overview|assessment|analysis)"
    r"|wireless\s+(check|overview|assessment|analysis)"
    r"|how('?s| is)\s+(the\s+)?wifi"
    r"|how('?s| is)\s+(the\s+)?wireless"
    r"|check\s+(the\s+)?(wifi|wireless)"
    r"|wifi\s+performance|wireless\s+performance"
    r")\b",
    re.IGNORECASE,
)

# Channel utilization / RF analysis queries — lightweight fast-path (2 API calls only)
_CU_PATTERN = re.compile(
    r"\b(channel\s+utiliz\w*"
    r"|channel\s+usage"
    r"|cu\s+(analysis|report|check|across)"
    r"|rf\s+(analysis|health|check)"
    r"|wireless\s+utiliz\w*"
    r"|air(time|space)\s+(utiliz\w*|usage|analysis)"
    r")\b",
    re.IGNORECASE,
)

# Rogue / unauthorized AP detection queries
_ROGUE_PATTERN = re.compile(
    r"\b(rogue\s+aps?|unauthorized\s+aps?|unknown\s+aps?"
    r"|air\s+marshal"
    r"|rogue\s+(detection|scan|check|wireless)"
    r"|wireless\s+intruder"
    r")\b",
    re.IGNORECASE,
)

# Client density / client distribution queries — dedicated fast-path
_CLIENT_DENSITY_PATTERN = re.compile(
    r"\b(client\s+density"
    r"|client\s+distribution"
    r"|client\s+count\s+(per|by|across)"
    r"|clients?\s+per\s+(ap|access\s+point|network)"
    r"|how\s+many\s+clients"
    r")\b",
    re.IGNORECASE,
)

# Queries with clear analytical / complex intent that should ALWAYS go to the
# LLM loop, never be treated as a follow-up to a previous fast-path topic.
_COMPLEX_INTENT_PATTERN = re.compile(
    r"\b(analy[zs]\w*|recommend\w*|troubleshoot\w*|investigat\w*|diagnos\w*|optimiz\w*"
    r"|compar\w*|explain\w*|assess\w*|audit\w*|review\w*|evaluat\w*|improv\w*|configur\w*"
    r"|profile\w*|best\s+practice|what\s+should|how\s+(can|should|do)\s+i)\b",
    re.IGNORECASE,
)

# WiFi queries that don't have a dedicated fast-path but have clear intent
# (used only to prevent follow-up cross-contamination — these go to the LLM loop)
_OTHER_WIFI_PATTERN = re.compile(
    r"\b(ap\s+(overload|capacity|load)"
    r"|ssid\s+(list|config|audit)"
    r"|wireless\s+(client|deployment|coverage|capac)"
    r")\b",
    re.IGNORECASE,
)


def _resolve_network_from_query(
    query: str, tool_results: list[dict],
) -> tuple[str, str]:
    """Match a user query against actual org network names.

    Returns (network_id, clean_network_name) if a match is found,
    or ("", "") for org-wide queries.
    """
    # Parse the org networks list from tool results
    networks: list[dict] = []
    for tr in tool_results:
        tool_name = tr.get("tool", "")
        method = tr.get("args", {}).get("method", "")
        if tool_name == "getOrganizationNetworks" or method == "getOrganizationNetworks":
            parsed = _parse_wifi_result(tr.get("result"))
            if isinstance(parsed, list):
                networks = parsed
            break

    if not networks:
        return "", ""

    # Skip matching if the query looks org-wide (no specific network mentioned)
    org_wide_indicators = re.compile(
        r"\b(org(anization)?(-?\s*wide)?|all\s+networks?|entire|across\s+the\s+(org|network|organization)|whole\s+(org|network))\b",
        re.IGNORECASE,
    )
    if org_wide_indicators.search(query):
        return "", ""

    query_lower = query.lower().strip()
    best_id = ""
    best_name = ""
    for net in networks:
        if not isinstance(net, dict):
            continue
        name = net.get("name", "")
        name_clean = re.sub(r'\s*-\s*(wireless|appliance|switch|camera|sensor)$', '', name, flags=re.I)
        if name_clean.lower() in query_lower or query_lower in name_clean.lower():
            product_types = net.get("productTypes", [])
            # Prefer wireless networks
            if "wireless" in product_types or not best_id:
                best_id = net.get("id", "")
                best_name = name_clean

    return best_id, best_name


def _build_band_distribution_chart(
    tool_results: list[dict],
    network_id: str = "",
    network_name: str = "",
) -> dict | None:
    """Build a pie chart showing wireless activity distribution by radio band.

    Uses channel utilization data from
    ``getOrganizationWirelessDevicesChannelUtilizationByNetwork``
    to aggregate WiFi utilization per band (2.4, 5, 6 GHz).

    If ``network_id`` is provided, filters to that specific network.
    If ``network_name`` is provided, includes it in the card title.
    """
    band_totals: dict[str, float] = {}
    band_counts: dict[str, int] = {}

    logger.info("_build_band_distribution_chart: scanning %d tool_results", len(tool_results))

    for tr in tool_results:
        args, _params = _safe_args(tr)
        method = args.get("method", "")
        tool_name = tr.get("tool", "")

        # Match both the enrichment path (call_meraki_api with method) and direct tool path
        is_cu_by_network = (
            method == "getOrganizationWirelessDevicesChannelUtilizationByNetwork"
            or tool_name == "getOrganizationWirelessDevicesChannelUtilizationByNetwork"
        )
        if not is_cu_by_network:
            continue

        parsed = _parse_wifi_result(tr.get("result"))
        if parsed is None:
            logger.warning("_build_band_distribution_chart: CU result parse returned None")
            continue

        # Handle paginated {items: [...]} or direct list
        if isinstance(parsed, dict):
            if "items" in parsed:
                parsed = parsed["items"]
            else:
                # Single-item response — wrap in list
                parsed = [parsed]

        if not isinstance(parsed, list):
            logger.warning("_build_band_distribution_chart: parsed CU data is %s, not list", type(parsed).__name__)
            continue

        logger.info("_build_band_distribution_chart: processing %d network entries", len(parsed))

        for entry in parsed:
            if not isinstance(entry, dict):
                continue
            # Filter by network if a specific network was requested
            if network_id:
                entry_net = entry.get("network", {})
                entry_net_id = entry_net.get("id", "") if isinstance(entry_net, dict) else ""
                if entry_net_id != network_id:
                    continue
            by_band = entry.get("byBand", [])
            for band_info in by_band:
                if not isinstance(band_info, dict):
                    continue
                band = str(band_info.get("band", ""))
                # Handle wifi utilization: could be dict {"percentage": N} or a number
                wifi_util = band_info.get("wifi")
                if isinstance(wifi_util, dict):
                    pct = wifi_util.get("percentage", 0) or 0
                elif isinstance(wifi_util, (int, float)):
                    pct = wifi_util
                else:
                    # Fall back to total utilization if wifi key is missing
                    total_util = band_info.get("total")
                    if isinstance(total_util, dict):
                        pct = total_util.get("percentage", 0) or 0
                    elif isinstance(total_util, (int, float)):
                        pct = total_util
                    else:
                        pct = 0
                if band and pct > 0:
                    band_totals[band] = band_totals.get(band, 0) + pct
                    band_counts[band] = band_counts.get(band, 0) + 1

    if not band_totals:
        logger.warning("_build_band_distribution_chart: no band data found in CU results")
        return None

    # Average utilization per band, then present as distribution
    band_config = {
        "2.4": ("2.4 GHz", "#f59e0b"),   # amber
        "5":   ("5 GHz",   "#3b82f6"),    # blue
        "6":   ("6 GHz",   "#10b981"),    # green
    }

    segments: list[dict] = []
    for band_key, (label, color) in band_config.items():
        total = band_totals.get(band_key, 0)
        count = band_counts.get(band_key, 0)
        avg = round(total / count, 1) if count > 0 else 0
        if avg > 0:
            segments.append({"label": label, "value": avg, "color": color})

    if not segments:
        logger.warning("_build_band_distribution_chart: band_totals=%s but no segments with avg>0", band_totals)
        return None

    logger.info("_build_band_distribution_chart: %d bands, segments=%s (network=%s)",
                len(segments), [(s["label"], s["value"]) for s in segments], network_name or "org-wide")

    title = f"Wireless Band Distribution — {network_name}" if network_name else "Wireless Band Distribution"

    return {
        "id": f"card-{uuid.uuid4().hex[:8]}",
        "type": "pie_chart",
        "title": title,
        "source": "meraki",
        "data": {
            "segments": segments,
        },
    }


def _build_org_wifi_health_card(tool_results: list[dict]) -> dict | None:
    """Build a wifi_health dashboard card for org-wide health queries.

    Shows per-network rows (instead of per-AP) with CU and packet loss.
    """
    # Parse CU by network
    networks_cu: list[dict] = []
    for tr in tool_results:
        args, _ = _safe_args(tr)
        if args.get("method") != "getOrganizationWirelessDevicesChannelUtilizationByNetwork":
            continue
        parsed = _parse_wifi_result(tr.get("result"))
        if isinstance(parsed, dict) and "items" in parsed:
            parsed = parsed["items"]
        if not isinstance(parsed, list):
            continue
        for item in parsed:
            if not isinstance(item, dict):
                continue
            net = item.get("network", {})
            name = net.get("name", "") if isinstance(net, dict) else ""
            name = re.sub(r'\s*-\s*(wireless|appliance|switch|camera|sensor)$', '', name, flags=re.I)
            if not name or re.match(r'^[LN]_\d', name):
                name = f"Network ...{name[-4:]}" if name else "Unknown"
            by_band = item.get("byBand", [])
            u24 = u5 = u6 = 0.0
            for bd in by_band:
                if not isinstance(bd, dict):
                    continue
                band = str(bd.get("band", ""))
                wifi = bd.get("wifi", {})
                pct = (wifi.get("percentage", 0) if isinstance(wifi, dict) else 0) or 0
                if "2.4" in band:
                    u24 = pct
                elif band.startswith("5"):
                    u5 = pct
                elif band.startswith("6"):
                    u6 = pct
            net_id = net.get("id", "") if isinstance(net, dict) else ""
            networks_cu.append({"name": name, "id": net_id, "u24": round(u24, 1), "u5": round(u5, 1), "u6": round(u6, 1)})

    if not networks_cu:
        return None

    # Parse client counts + details per network (from parallel getNetworkClients calls)
    client_counts: dict[str, int] = {}
    client_lists: dict[str, list[dict]] = {}
    for tr in tool_results:
        if tr.get("tool") != "getNetworkClients":
            continue
        args = tr.get("args", {})
        net_id = args.get("networkId", "")
        if not net_id:
            continue
        parsed = _parse_wifi_result(tr.get("result"))
        if isinstance(parsed, list):
            client_counts[net_id] = len(parsed)
            # Build client detail list (top 10 by usage for popup)
            clients_raw: list[dict] = []
            for c in parsed:
                if not isinstance(c, dict):
                    continue
                usage_obj = c.get("usage", {})
                total_usage = 0
                if isinstance(usage_obj, dict):
                    total_usage = (usage_obj.get("sent", 0) or 0) + (usage_obj.get("recv", 0) or 0)
                clients_raw.append({
                    "description": c.get("description", "") or c.get("mac", ""),
                    "ip": c.get("ip", "") or "",
                    "mac": c.get("mac", "") or "",
                    "vlan": c.get("vlan"),
                    "ssid": c.get("ssid", "") or "",
                    "os": c.get("os", "") or c.get("manufacturer", "") or "",
                    "usage": total_usage,
                })
            clients_raw.sort(key=lambda x: -x["usage"])
            client_lists[net_id] = clients_raw[:10]

    # Parse packet loss by network
    pl_map: dict[str, float] = {}
    for tr in tool_results:
        args, _ = _safe_args(tr)
        if args.get("method") != "getOrganizationWirelessDevicesPacketLossByNetwork":
            continue
        parsed = _parse_wifi_result(tr.get("result"))
        if isinstance(parsed, dict) and "items" in parsed:
            parsed = parsed["items"]
        if not isinstance(parsed, list):
            continue
        for item in parsed:
            if not isinstance(item, dict):
                continue
            net = item.get("network", {})
            name = net.get("name", "") if isinstance(net, dict) else ""
            name = re.sub(r'\s*-\s*(wireless|appliance|switch|camera|sensor)$', '', name, flags=re.I)
            downstream = item.get("downstream", {})
            loss = (downstream.get("lossPercentage", 0) if isinstance(downstream, dict) else 0) or 0
            if name:
                pl_map[name] = round(loss, 2)

    # Build per-network rows and classify health
    critical_count = warning_count = healthy_count = 0
    access_points: list[dict] = []

    for nd in networks_cu:
        name = nd["name"]
        u24, u5 = nd["u24"], nd["u5"]
        pl = pl_map.get(name, 0)

        if u24 > 60 or u5 > 70 or pl > 3:
            status = "offline"  # red dot = critical
            critical_count += 1
        elif u24 > 50 or u5 > 60 or pl > 1:
            status = "alerting"  # amber dot = warning
            warning_count += 1
        else:
            status = "online"  # green dot = healthy
            healthy_count += 1

        net_id = nd.get("id", "")
        access_points.append({
            "name": name,
            "status": status,
            "clients": client_counts.get(net_id, 0),
            "channelUtil24": u24 if u24 > 0 else None,
            "channelUtil5": u5 if u5 > 0 else None,
            "clientList": client_lists.get(net_id, []),
        })

    # Sort: critical first, then warning, then healthy — by CU descending within each
    access_points.sort(key=lambda a: (
        0 if a["status"] == "offline" else 1 if a["status"] == "alerting" else 2,
        -(a["channelUtil24"] or 0),
    ))

    overall = "critical" if critical_count > 0 else "warning" if warning_count > 0 else "healthy"

    # --- Summary tiles: Row 1 = Networks, Clients, Critical | Row 2 = 2.4, 5, 6 GHz ---
    net_details = []
    for ap in access_points:
        st = "critical" if ap["status"] == "offline" else "warning" if ap["status"] == "alerting" else "healthy"
        cu_parts = []
        if ap["channelUtil24"] is not None:
            cu_parts.append(f"2.4: {ap['channelUtil24']}%")
        if ap["channelUtil5"] is not None:
            cu_parts.append(f"5: {ap['channelUtil5']}%")
        net_details.append({"label": ap["name"], "value": " | ".join(cu_parts) if cu_parts else "No data", "status": st})

    # Row 1: Networks, Total Clients, Critical
    summary: list[dict] = [
        {"label": "Networks", "value": str(len(networks_cu)), "status": "healthy", "details": net_details},
    ]

    total_clients = sum(a["clients"] for a in access_points)
    client_details = sorted(
        [{"label": a["name"], "value": str(a["clients"]),
          "status": "healthy" if a["clients"] > 0 else "warning"}
         for a in access_points if a["clients"] > 0],
        key=lambda d: -int(d["value"]),
    ) if total_clients > 0 else []
    summary.append({"label": "Clients", "value": str(total_clients) if total_clients > 0 else "—", "status": "healthy", "details": client_details})

    issue_count = critical_count + warning_count
    issue_details = [d for d in net_details if d.get("status") in ("critical", "warning")]
    issue_status = "critical" if critical_count > 0 else "warning" if warning_count > 0 else "healthy"
    summary.append({"label": "Issues", "value": str(issue_count), "status": issue_status, "details": issue_details})

    # Row 2: Band averages (2.4, 5, 6 GHz)
    band_configs = [
        ("u24", "2.4 GHz", 60, 50),
        ("u5", "5 GHz", 70, 60),
        ("u6", "6 GHz", 70, 60),
    ]
    for key, label, crit_thresh, warn_thresh in band_configs:
        values = [nd[key] for nd in networks_cu if nd[key] > 0]
        if not values:
            summary.append({"label": label, "value": "—", "status": "healthy", "details": []})
            continue
        avg = round(sum(values) / len(values), 1)
        s = "critical" if avg > crit_thresh else "warning" if avg > warn_thresh else "healthy"
        band_details = sorted(
            [{"label": nd["name"], "value": f"{nd[key]}%",
              "status": "critical" if nd[key] > crit_thresh else "warning" if nd[key] > warn_thresh else "healthy"}
             for nd in networks_cu if nd[key] > 0],
            key=lambda d: -float(d["value"].rstrip("%")),
        )
        summary.append({"label": label, "value": f"{avg}%", "status": s, "details": band_details})

    return {
        "id": f"card-{uuid.uuid4().hex[:8]}",
        "type": "wifi_health",
        "title": "WiFi Health — Organization",
        "source": "meraki",
        "data": {
            "networkName": "Organization",
            "overallStatus": overall,
            "summary": summary,
            "accessPoints": access_points,
        },
    }


def _build_wifi_health_card(tool_results: list[dict]) -> dict | None:
    """Build a wifi_health dashboard card for network-specific WiFi queries.

    Only produces a card when getNetworkDevices results are present
    (indicating the agent queried a specific network, not org-wide).
    """
    # 1. Find network devices (only present for single-network queries)
    network_devices: list[dict] | None = None
    network_id: str = ""
    network_name: str = ""

    for tr in tool_results:
        method = tr.get("args", {}).get("method", "")
        tool_name = tr.get("tool", "")
        if method == "getNetworkDevices" or tool_name == "getNetworkDevices":
            parsed = _parse_wifi_result(tr.get("result"))
            if isinstance(parsed, list) and parsed:
                network_devices = parsed
                # Extract networkId from the tool call args
                args, params = _safe_args(tr)
                network_id = args.get("networkId") or params.get("networkId", "")
            break

    if not network_devices:
        return None

    # 2. Extract AP serials (MR/CW models)
    ap_serials: dict[str, str] = {}  # serial → name
    for dev in network_devices:
        if not isinstance(dev, dict):
            continue
        model = dev.get("model", "")
        prefix = model[:2].upper() if model else ""
        if prefix in ("MR", "CW"):
            serial = dev.get("serial", "")
            name = dev.get("name", "") or serial
            if serial:
                ap_serials[serial] = name

    if not ap_serials:
        return None

    # 3. Resolve network name
    for tr in tool_results:
        method = tr.get("args", {}).get("method", "")
        tool_name = tr.get("tool", "")
        if method == "getOrganizationNetworks" or tool_name == "getOrganizationNetworks":
            parsed = _parse_wifi_result(tr.get("result"))
            if isinstance(parsed, list):
                for net in parsed:
                    if isinstance(net, dict) and net.get("id") == network_id:
                        network_name = net.get("name", "")
                        break
            break

    if not network_name:
        network_name = network_id or "Unknown Network"
    # Clean up network name
    network_name = re.sub(r'\s*-\s*(wireless|appliance|switch|camera|sensor)$', '', network_name, flags=re.I)

    # 4. Cross-reference with channel utilization by device
    util_by_serial: dict[str, dict] = {}  # serial → {util_24, util_5}
    for tr in tool_results:
        method = tr.get("args", {}).get("method", "")
        if method == "getOrganizationWirelessDevicesChannelUtilizationByDevice":
            parsed = _parse_wifi_result(tr.get("result"))
            if isinstance(parsed, dict) and "items" in parsed:
                parsed = parsed["items"]
            if isinstance(parsed, list):
                for item in parsed:
                    if not isinstance(item, dict):
                        continue
                    serial = item.get("serial", "")
                    if serial not in ap_serials:
                        continue
                    by_band = item.get("byBand", [])
                    u24 = 0.0
                    u5 = 0.0
                    for band_data in by_band:
                        if not isinstance(band_data, dict):
                            continue
                        band = str(band_data.get("band", ""))
                        wifi_obj = band_data.get("wifi", {})
                        pct = wifi_obj.get("percentage", 0) if isinstance(wifi_obj, dict) else 0
                        if "2.4" in band:
                            u24 = pct or 0
                        elif band.startswith("5"):
                            u5 = pct or 0
                    util_by_serial[serial] = {"util_24": round(u24, 1), "util_5": round(u5, 1)}

    # 5. Cross-reference with client counts and details per AP
    client_counts: dict[str, int] = {}  # AP name → client count
    clients_by_ap: dict[str, list[dict]] = {}  # AP name → list of client summaries
    for tr in tool_results:
        method = tr.get("args", {}).get("method", "")
        tool_name = tr.get("tool", "")
        if method == "getNetworkClients" or tool_name == "getNetworkClients":
            parsed = _parse_wifi_result(tr.get("result"))
            if isinstance(parsed, list):
                for client in parsed:
                    if isinstance(client, dict):
                        ap_name = client.get("recentDeviceName", "")
                        if ap_name:
                            client_counts[ap_name] = client_counts.get(ap_name, 0) + 1
                            clients_by_ap.setdefault(ap_name, []).append({
                                "description": client.get("description") or client.get("mac", ""),
                                "ip": client.get("ip", ""),
                                "mac": client.get("mac", ""),
                                "vlan": client.get("vlan"),
                                "ssid": client.get("ssidName", ""),
                                "os": client.get("os", ""),
                                "usage": client.get("usage", {}).get("sent", 0) + client.get("usage", {}).get("recv", 0) if isinstance(client.get("usage"), dict) else 0,
                            })

    # 6. Parse connection stats
    conn_success: float | None = None
    for tr in tool_results:
        method = tr.get("args", {}).get("method", "")
        if method == "getNetworkWirelessConnectionStats":
            parsed = _parse_wifi_result(tr.get("result"))
            if isinstance(parsed, dict):
                assoc = parsed.get("assoc", 0) or 0
                auth = parsed.get("auth", 0) or 0
                dhcp = parsed.get("dhcp", 0) or 0
                dns = parsed.get("dns", 0) or 0
                success = parsed.get("success", 0) or 0
                total = assoc + auth + dhcp + dns + success
                if total > 0:
                    conn_success = round(success / total * 100, 1)

    # 7. Parse packet loss
    packet_loss: float | None = None
    for tr in tool_results:
        method = tr.get("args", {}).get("method", "")
        if method == "getOrganizationWirelessDevicesPacketLossByNetwork":
            parsed = _parse_wifi_result(tr.get("result"))
            if isinstance(parsed, dict) and "items" in parsed:
                parsed = parsed["items"]
            if isinstance(parsed, list):
                for item in parsed:
                    if not isinstance(item, dict):
                        continue
                    net = item.get("network", {})
                    item_net_id = net.get("id", "") if isinstance(net, dict) else ""
                    if item_net_id == network_id or not network_id:
                        downstream = item.get("downstream", {})
                        if isinstance(downstream, dict):
                            packet_loss = downstream.get("lossPercentage")
                            if packet_loss is not None:
                                packet_loss = round(packet_loss, 2)
                        break

    # 8. Build summary metrics with drill-down details
    summary = []

    # Avg channel util per band across APs — with per-AP detail breakdown
    for band_key, band_label, crit_t, warn_t in [
        ("util_24", "Ch Util 2.4 GHz", 70, 50),
        ("util_5", "Ch Util 5 GHz", 70, 50),
    ]:
        vals = [v[band_key] for v in util_by_serial.values() if v[band_key] > 0]
        if not vals:
            continue
        avg = round(sum(vals) / len(vals), 1)
        status = "critical" if avg > crit_t else "warning" if avg > warn_t else "healthy"
        details = sorted(
            [{"label": ap_serials.get(s, s), "value": f"{v[band_key]}%",
              "status": "critical" if v[band_key] > crit_t else "warning" if v[band_key] > warn_t else "healthy"}
             for s, v in util_by_serial.items() if v[band_key] > 0],
            key=lambda d: -float(d["value"].rstrip("%")),
        )
        summary.append({"label": band_label, "value": f"{avg}%", "status": status, "details": details})

    if conn_success is not None:
        status = "critical" if conn_success < 90 else "warning" if conn_success < 95 else "healthy"
        summary.append({"label": "Conn Success", "value": f"{conn_success}%", "status": status})
    if packet_loss is not None:
        status = "critical" if packet_loss > 3 else "warning" if packet_loss > 1 else "healthy"
        summary.append({"label": "Packet Loss", "value": f"{packet_loss}%", "status": status})

    total_clients = sum(client_counts.values())
    if total_clients > 0:
        clients_per_ap = round(total_clients / len(ap_serials), 1) if ap_serials else 0
        status = "critical" if clients_per_ap > 50 else "warning" if clients_per_ap > 30 else "healthy"
        cli_details = sorted(
            [{"label": name, "value": f"{count} clients",
              "status": "critical" if count > 50 else "warning" if count > 30 else "healthy"}
             for name, count in client_counts.items()],
            key=lambda d: -int(d["value"].split()[0]),
        )
        summary.append({"label": "Clients/AP", "value": str(clients_per_ap), "status": status, "details": cli_details})

    online_count = sum(1 for d in network_devices if isinstance(d, dict) and (d.get("status") or "online").lower() == "online"
                       and d.get("model", "")[:2].upper() in ("MR", "CW"))
    total_aps = len(ap_serials)
    if total_aps > 0:
        pct = round(online_count / total_aps * 100, 1)
        status = "critical" if pct < 90 else "warning" if pct < 95 else "healthy"
        ap_details = []
        for serial, name in ap_serials.items():
            dev = next((d for d in network_devices if isinstance(d, dict) and d.get("serial") == serial), {})
            st = (dev.get("status") or "online").lower()
            ap_details.append({"label": name, "value": st,
                               "status": "critical" if st == "offline" else "warning" if st == "alerting" else "healthy"})
        ap_details.sort(key=lambda d: (0 if d["status"] == "critical" else 1 if d["status"] == "warning" else 2))
        summary.append({"label": "APs Online", "value": f"{online_count}/{total_aps}", "status": status, "details": ap_details})

    # 9. Build per-AP list
    access_points = []
    for serial, name in ap_serials.items():
        dev = next((d for d in network_devices if isinstance(d, dict) and d.get("serial") == serial), {})
        status_str = (dev.get("status") or "online").lower()
        if status_str not in ("online", "offline", "alerting"):
            status_str = "online"
        util_info = util_by_serial.get(serial, {})
        ap_clients = client_counts.get(name, 0)
        access_points.append({
            "name": name,
            "status": status_str,
            "clients": ap_clients,
            "channelUtil24": util_info.get("util_24") if util_info else None,
            "channelUtil5": util_info.get("util_5") if util_info else None,
            "clientList": clients_by_ap.get(name, []),
        })
    # Sort: offline first, then by client count descending
    access_points.sort(key=lambda a: (0 if a["status"] == "offline" else 1 if a["status"] == "alerting" else 2, -a["clients"]))

    # 10. Compute overall status
    overall = "healthy"
    for m in summary:
        if m["status"] == "critical":
            overall = "critical"
            break
        if m["status"] == "warning":
            overall = "warning"

    return {
        "id": f"card-{uuid.uuid4().hex[:8]}",
        "type": "wifi_health",
        "title": f"WiFi Health — {network_name}",
        "source": "meraki",
        "data": {
            "networkName": network_name,
            "overallStatus": overall,
            "summary": summary,
            "accessPoints": access_points,
        },
    }


def _extract_wifi_charts(tool_results: list[dict], query: str) -> list[dict]:
    """Build up to 2 chart cards from WiFi tool results.

    Priority:
    - Band distribution queries → pie chart (donut ring by band)
    - RSSI/signal queries → RSSI line chart (per-band)
    - Network-specific queries → wifi_health dashboard card
    - Trend queries → line charts (util trend, client count trend)
    - Default → bar charts (util by AP/network, client density per AP)
    """
    prefer_trends = bool(_TREND_PATTERN.search(query))
    is_rssi_query = bool(_RSSI_PATTERN.search(query))
    is_band_dist_query = bool(_BAND_DIST_PATTERN.search(query))
    is_health_query = bool(_HEALTH_PATTERN.search(query))

    # Band distribution → pie chart (highest priority)
    if is_band_dist_query:
        pie_card = _build_band_distribution_chart(tool_results)
        if pie_card:
            return [pie_card]
        logger.info("_extract_wifi_charts: band distribution query but no pie chart data")

    # Collect parsed data by type
    util_by_device: list | None = None
    util_by_network: list | None = None
    util_history: list | None = None
    client_history: list | None = None
    # signal quality history: band → list of data points
    signal_quality_by_band: dict[str, list] = {}
    # client_by_network: networkId → list of client dicts (for density chart)
    client_by_network: dict[str, list] = {}
    # serial → AP name lookup from device lists (getNetworkDevices, getOrganizationDevicesStatuses)
    device_names: dict[str, str] = {}
    # networkId → network name lookup from getOrganizationNetworks
    network_names: dict[str, str] = {}

    for tr in tool_results:
        tool_name = tr.get("tool", "")
        method = tr.get("args", {}).get("method", "")
        parsed = _parse_wifi_result(tr.get("result"))
        if parsed is None:
            logger.debug("_extract_wifi_charts: parse returned None for %s / %s", tool_name, method)
            continue

        # Unwrap paginated {"items": [...]} envelope
        if isinstance(parsed, dict) and "items" in parsed and isinstance(parsed["items"], list):
            parsed = parsed["items"]

        if not isinstance(parsed, list):
            continue

        if method == "getOrganizationWirelessDevicesChannelUtilizationByDevice":
            util_by_device = parsed
        elif method == "getOrganizationWirelessDevicesChannelUtilizationByNetwork":
            util_by_network = parsed
        elif method == "getNetworkWirelessChannelUtilizationHistory":
            util_history = parsed
        elif method == "getNetworkWirelessClientCountHistory":
            client_history = parsed
        elif method == "getNetworkWirelessSignalQualityHistory":
            # Track per-band signal quality history — band may be in args
            args, params = _safe_args(tr)
            band = args.get("band") or params.get("band", "")
            if not band:
                band = "all"
            signal_quality_by_band[band] = parsed
        elif tool_name == "getNetworkClients" or method == "getNetworkClients":
            # Track which networkId each client batch belongs to
            args_d, params_d = _safe_args(tr)
            net_id = args_d.get("networkId") or params_d.get("networkId", "")
            if net_id:
                client_by_network.setdefault(net_id, []).extend(parsed)
            else:
                client_by_network.setdefault("_unknown", []).extend(parsed)

        # Build serial → name lookup from any device list data
        if tool_name in ("getNetworkDevices", "getOrganizationDevicesStatuses") or \
           method in ("getNetworkDevices", "getOrganizationDevicesStatuses"):
            for dev in parsed:
                if isinstance(dev, dict):
                    serial = dev.get("serial", "")
                    name = dev.get("name", "")
                    if serial and name:
                        device_names[serial] = name

        # Build networkId → name map from organization networks
        if tool_name == "getOrganizationNetworks" or method == "getOrganizationNetworks":
            for net in parsed:
                if isinstance(net, dict):
                    net_id = net.get("id", "")
                    net_name = net.get("name", "")
                    if net_id and net_name:
                        network_names[net_id] = net_name

    cards: list[dict] = []

    # RSSI/signal quality queries get a dedicated line chart (highest priority)
    if is_rssi_query:
        if signal_quality_by_band:
            rssi_card = _build_rssi_chart(signal_quality_by_band)
            if rssi_card:
                return [rssi_card]
        # For RSSI queries, do NOT fall through to unrelated chart types
        logger.info("_extract_wifi_charts: RSSI query but no chart data (bands: %s)", list(signal_quality_by_band.keys()))
        return []

    # Health queries → wifi_health dashboard card (only for explicit health/status queries)
    if is_health_query and not is_rssi_query:
        health_card = _build_wifi_health_card(tool_results)
        if health_card:
            logger.info("_extract_wifi_charts: built wifi_health card for %s", health_card["data"]["networkName"])
            return [health_card]
        logger.info("_extract_wifi_charts: health query but no per-network device data for wifi_health card")

    if prefer_trends:
        # Prefer line charts for trend queries
        _try_append(cards, _build_util_trend_card(util_history))
        _try_append(cards, _build_client_trend_card(client_history))
        # Fall back to bar charts if no trend data
        if not cards:
            _try_append(cards, _build_util_bar_card(util_by_device, util_by_network, device_names))
            _try_append(cards, _build_client_density_card(client_by_network, network_names))
    else:
        # Default: bar charts
        _try_append(cards, _build_util_bar_card(util_by_device, util_by_network, device_names))
        _try_append(cards, _build_client_density_card(client_by_network, network_names))
        # Fall back to line charts if no bar chart data
        if not cards:
            _try_append(cards, _build_util_trend_card(util_history))
            _try_append(cards, _build_client_trend_card(client_history))

    # If still have room and signal quality data exists, add RSSI chart
    if signal_quality_by_band and len(cards) < 2:
        _try_append(cards, _build_rssi_chart(signal_quality_by_band))

    logger.info(
        "_extract_wifi_charts: built %d cards (prefer_trends=%s, util_dev=%s, util_net=%s, util_hist=%s, cli_hist=%s, cli_nets=%s)",
        len(cards), prefer_trends,
        len(util_by_device) if util_by_device else 0,
        len(util_by_network) if util_by_network else 0,
        len(util_history) if util_history else 0,
        len(client_history) if client_history else 0,
        len(client_by_network),
    )
    return cards[:2]


def _try_append(cards: list, card: dict | None) -> None:
    """Append card to list if not None and under the 2-card cap."""
    if card is not None and len(cards) < 2:
        cards.append(card)


# -- Bar charts (current-state comparisons) --------------------------------

def _build_util_bar_card(
    by_device: list | None, by_network: list | None,
    device_names: dict[str, str] | None = None,
) -> dict | None:
    """Build channel utilization bar chart.

    Priority:
    - by-network (always has network names — best for org-wide view)
    - by-device only when we can resolve AP names via device_names lookup
    """
    # Prefer by-network: has readable network names, right granularity for org-wide
    if by_network and len(by_network) >= 2:
        return _build_util_bar_from_items(
            by_network, label_key=None, title="Channel Utilization by Network",
            device_names=None,
        )
    # Fall back to by-device if we can resolve AP names
    if by_device and len(by_device) >= 3 and device_names:
        # Only use if we can name at least half the APs
        named = sum(1 for d in by_device if isinstance(d, dict) and d.get("serial") in device_names)
        if named >= len(by_device) // 2:
            return _build_util_bar_from_items(
                by_device, label_key="name", title="Channel Utilization by AP",
                device_names=device_names,
            )
    return None


def _build_util_bar_from_items(
    items: list, label_key: str | None, title: str,
    device_names: dict[str, str] | None = None,
) -> dict | None:
    """Build a grouped bar chart (2.4 GHz / 5 GHz) from channel util items."""
    entries: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue

        # Label: device name (resolved from serial) or network name
        if label_key:
            serial = item.get("serial", "")
            # Try explicit name field, then device_names lookup, then serial
            label = item.get(label_key) or (device_names or {}).get(serial) or serial or "Unknown"
        else:
            net = item.get("network", {})
            label = net.get("name") or net.get("id", "Unknown") if isinstance(net, dict) else "Unknown"

        # Clean up network names: strip product type suffixes
        label = re.sub(r'\s*-\s*(wireless|appliance|switch|camera|sensor)$', '', label, flags=re.I)
        # For raw network IDs (e.g. "L_646829496481..."), show a friendly fallback
        if re.match(r'^[LN]_\d', label):
            label = f"Network ...{label[-4:]}"

        by_band = item.get("byBand", [])
        util_24 = 0.0
        util_5 = 0.0
        for band_data in by_band:
            if not isinstance(band_data, dict):
                continue
            band = str(band_data.get("band", ""))
            wifi_obj = band_data.get("wifi", {})
            pct = wifi_obj.get("percentage", 0) if isinstance(wifi_obj, dict) else 0
            if "2.4" in band:
                util_24 = pct or 0
            elif band.startswith("5"):
                util_5 = pct or 0

        entries.append({
            "label": label,
            "util_24": round(util_24, 1),
            "util_5": round(util_5, 1),
            "total": util_24 + util_5,
        })

    # Drop entries with no utilization data on either band
    entries = [e for e in entries if e["total"] > 0]

    if len(entries) < 2:
        return None

    # Sort by total utilization descending, top 15
    entries.sort(key=lambda e: e["total"], reverse=True)
    entries = entries[:15]

    return {
        "id": f"card-{uuid.uuid4().hex[:8]}",
        "type": "bar_chart",
        "title": title,
        "source": "meraki",
        "data": {
            "labels": [e["label"] for e in entries],
            "datasets": [
                {"label": "2.4 GHz", "data": [e["util_24"] for e in entries], "color": "#f59e0b"},
                {"label": "5 GHz", "data": [e["util_5"] for e in entries], "color": "#3b82f6"},
            ],
        },
    }


def _build_client_density_card(
    client_by_network: dict[str, list] | None,
    network_names: dict[str, str] | None = None,
) -> dict | None:
    """Build client density per network bar chart from client lists grouped by network."""
    if not client_by_network:
        return None

    # Total clients across all networks
    total_clients = sum(len(clients) for clients in client_by_network.values())
    if total_clients < 5:
        return None

    # If we have multiple networks, group by network (org-wide view)
    if len(client_by_network) >= 2 or (len(client_by_network) == 1 and "_unknown" not in client_by_network):
        entries: list[tuple[str, int]] = []
        for net_id, clients in client_by_network.items():
            if net_id == "_unknown":
                continue
            name = (network_names or {}).get(net_id, "")
            if not name:
                # Friendly fallback for raw IDs
                name = f"Network ...{net_id[-4:]}" if re.match(r'^[LN]_\d', net_id) else net_id
            # Strip product type suffixes
            name = re.sub(r'\s*-\s*(wireless|appliance|switch|camera|sensor)$', '', name, flags=re.I)
            entries.append((name, len(clients)))

        if len(entries) >= 2:
            entries.sort(key=lambda x: x[1], reverse=True)
            entries = entries[:15]
            return {
                "id": f"card-{uuid.uuid4().hex[:8]}",
                "type": "bar_chart",
                "title": "Client Density by Network",
                "source": "meraki",
                "data": {
                    "labels": [name for name, _ in entries],
                    "datasets": [
                        {"label": "Clients", "data": [count for _, count in entries], "color": "#8b5cf6"},
                    ],
                },
            }

    # Fallback: single network — group by AP name
    all_clients = [c for clients in client_by_network.values() for c in clients]
    ap_counts: dict[str, int] = {}
    for client in all_clients:
        if not isinstance(client, dict):
            continue
        ap_name = client.get("recentDeviceName") or client.get("recentDeviceMac")
        if not ap_name:
            continue
        ap_counts[ap_name] = ap_counts.get(ap_name, 0) + 1

    if len(ap_counts) < 3:
        return None

    sorted_aps = sorted(ap_counts.items(), key=lambda x: x[1], reverse=True)[:15]

    return {
        "id": f"card-{uuid.uuid4().hex[:8]}",
        "type": "bar_chart",
        "title": "Client Density per AP",
        "source": "meraki",
        "data": {
            "labels": [ap for ap, _ in sorted_aps],
            "datasets": [
                {"label": "Clients", "data": [count for _, count in sorted_aps], "color": "#8b5cf6"},
            ],
        },
    }


# -- Line charts (trends over time) ----------------------------------------

def _build_util_trend_card(util_history: list | None) -> dict | None:
    """Build channel utilization trend line chart from history data."""
    if not util_history or len(util_history) < 3:
        return None

    labels: list[str] = []
    total_data: list[float] = []

    for point in util_history:
        if not isinstance(point, dict):
            continue
        ts = point.get("startTs", "")
        if "T" in ts:
            labels.append(ts.split("T")[1][:5])  # HH:MM
        else:
            labels.append(ts)
        total = point.get("utilizationTotal", 0) or 0
        total_data.append(round(total, 1))

    if len(labels) < 3:
        return None

    return {
        "id": f"card-{uuid.uuid4().hex[:8]}",
        "type": "line_chart",
        "title": "Channel Utilization Trend",
        "source": "meraki",
        "data": {
            "labels": labels,
            "datasets": [
                {"label": "Total Utilization (%)", "data": total_data, "color": "#f59e0b"},
            ],
        },
    }


def _build_client_trend_card(client_history: list | None) -> dict | None:
    """Build client count trend line chart from history data."""
    if not client_history or len(client_history) < 3:
        return None

    labels: list[str] = []
    data: list[int] = []

    for point in client_history:
        if not isinstance(point, dict):
            continue
        ts = point.get("startTs", "")
        if "T" in ts:
            labels.append(ts.split("T")[1][:5])  # HH:MM
        else:
            labels.append(ts)
        count = point.get("clientCount", 0) or 0
        data.append(count)

    if len(labels) < 3:
        return None

    return {
        "id": f"card-{uuid.uuid4().hex[:8]}",
        "type": "line_chart",
        "title": "Wireless Client Count Trend",
        "source": "meraki",
        "data": {
            "labels": labels,
            "datasets": [
                {"label": "Client Count", "data": data, "color": "#8b5cf6"},
            ],
        },
    }


# -- RSSI / Signal Quality chart --------------------------------------------

def _build_rssi_chart(signal_quality_by_band: dict[str, list]) -> dict | None:
    """Build a multi-line RSSI chart from signal quality history data.

    If per-band data is available (keys like "2.4", "5", "6"), draw one line per band.
    If only "all" band data is available, draw a single RSSI line.
    """
    if not signal_quality_by_band:
        return None

    # Band display config: key → (label, color)
    band_config = {
        "2.4": ("2.4 GHz (dBm)", "#f59e0b"),   # amber
        "5": ("5 GHz (dBm)", "#3b82f6"),        # blue
        "6": ("6 GHz (dBm)", "#10b981"),        # green
    }

    datasets: list[dict] = []
    labels: list[str] | None = None

    # Check if we have per-band data
    has_per_band = any(k in band_config for k in signal_quality_by_band)

    if has_per_band:
        # Build one dataset per band
        for band_key, (band_label, color) in band_config.items():
            history = signal_quality_by_band.get(band_key)
            if not history or not isinstance(history, list):
                continue

            band_labels: list[str] = []
            band_data: list[float] = []
            for point in history:
                if not isinstance(point, dict):
                    continue
                ts = point.get("startTs", "")
                if "T" in ts:
                    band_labels.append(ts.split("T")[1][:5])
                else:
                    band_labels.append(ts)
                # Prefer rssi, fall back to snr
                rssi = point.get("rssi") or point.get("snr") or 0
                band_data.append(round(float(rssi), 1) if rssi else 0)

            if band_labels:
                if labels is None or len(band_labels) > len(labels):
                    labels = band_labels
                datasets.append({"label": band_label, "data": band_data, "color": color})
    else:
        # Single "all" band dataset
        history = signal_quality_by_band.get("all", [])
        if not history or not isinstance(history, list):
            return None

        chart_labels: list[str] = []
        chart_data: list[float] = []
        for point in history:
            if not isinstance(point, dict):
                continue
            ts = point.get("startTs", "")
            if "T" in ts:
                chart_labels.append(ts.split("T")[1][:5])
            else:
                chart_labels.append(ts)
            rssi = point.get("rssi") or point.get("snr") or 0
            chart_data.append(round(float(rssi), 1) if rssi else 0)

        if chart_labels:
            labels = chart_labels
            datasets.append({"label": "RSSI (dBm)", "data": chart_data, "color": "#4ade80"})

    if not datasets or labels is None:
        return None

    return {
        "id": f"card-{uuid.uuid4().hex[:8]}",
        "type": "line_chart",
        "title": "RSSI by Band — Last 24 Hours",
        "source": "meraki",
        "data": {
            "labels": labels,
            "datasets": datasets,
        },
    }


# -- Parsing ----------------------------------------------------------------

def _parse_wifi_result(raw: object) -> object | None:
    """Try to parse a tool result into a Python object."""
    if isinstance(raw, (list, dict)):
        return raw
    if isinstance(raw, str):
        text = raw
        # Strip item-count prefix injected by tools.py
        if text.startswith("[Total items"):
            newline_idx = text.find("\n")
            if newline_idx >= 0:
                text = text[newline_idx + 1:]
        try:
            return json.loads(text)
        except (json.JSONDecodeError, ValueError):
            return None
    return None
