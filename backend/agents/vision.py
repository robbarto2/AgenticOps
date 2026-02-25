"""Vision agent - image analysis with concurrent org context enrichment.

Runs 6 MCP calls in parallel with the Sonnet LLM call, then performs
programmatic correlation to append rich network context (device table,
network health, WAN status, wireless utilization, org overview).
Zero added latency: enrichment always finishes before Sonnet (~3-5s vs ~5-8s).
"""

from __future__ import annotations

import asyncio
import json
import logging
import re

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, SystemMessage
from langgraph.types import StreamWriter

from agents.state import AgentState
from agents.stream_util import safe_writer
from config import settings
from mcp_client.manager import mcp_manager
from prompts import load_prompt

logger = logging.getLogger(__name__)

# Max devices to include in correlation (keeps processing fast)
_MAX_DEVICES = 200

# Timeout for each enrichment MCP call (seconds) — keep tight so it never
# dominates wall time when running concurrently with the LLM
_ENRICHMENT_TIMEOUT = 8

VISION_SYSTEM_PROMPT = load_prompt("vision")


def _parse_json(raw: object) -> object | None:
    """Parse a tool result string into a Python object.

    Handles the ``[Total items...]`` prefix that tools.py injects on
    paginated responses.
    """
    if isinstance(raw, (list, dict)):
        return raw
    if isinstance(raw, str):
        text = raw
        if text.startswith("[Total items"):
            newline_idx = text.find("\n")
            if newline_idx >= 0:
                text = text[newline_idx + 1:]
        try:
            return json.loads(text)
        except (json.JSONDecodeError, ValueError):
            return None
    return None


# ---------------------------------------------------------------------------
# Enrichment: 6 concurrent MCP calls
# ---------------------------------------------------------------------------

async def _fetch_org_context(emit) -> dict[str, list]:
    """Fetch org context in parallel (6 calls concurrent with LLM).

    Returns a dict with keys: statuses, networks, devices, uplinks, wireless_cu, clients.
    Each is an empty list on failure — callers check individually.
    """
    if not mcp_manager.meraki_connected:
        logger.info("Vision enrichment skipped: Meraki MCP not connected")
        return {"statuses": [], "networks": [], "devices": [], "uplinks": [],
                "wireless_cu": [], "clients": []}

    # Mutable result containers — each fetch appends to its target
    data: dict[str, list] = {
        "statuses": [], "networks": [], "devices": [],
        "uplinks": [], "wireless_cu": [], "clients": [],
    }

    async def _fetch_direct(tool_name: str, args: dict, label: str, key: str) -> None:
        """Fetch a direct MCP tool (not call_meraki_api)."""
        emit({"type": "tool_call", "tool": tool_name, "source": "meraki", "status": "running"})
        try:
            result = await asyncio.wait_for(
                mcp_manager.call_tool(tool_name, args), timeout=_ENRICHMENT_TIMEOUT,
            )
            if result and not result.get("error"):
                parsed = _parse_json(result.get("content", ""))
                if isinstance(parsed, list):
                    data[key].extend(parsed)
                    logger.info("Vision enrichment: fetched %s OK (%d items)", label, len(parsed))
                elif isinstance(parsed, dict):
                    data[key].append(parsed)
                    logger.info("Vision enrichment: fetched %s OK (dict)", label)
        except Exception as e:
            logger.warning("Vision enrichment: %s fetch failed: %s", label, e)
        emit({"type": "tool_call", "tool": tool_name, "source": "meraki", "status": "complete"})

    async def _fetch_api(section: str, method: str, params: dict,
                         label: str, key: str) -> None:
        """Fetch via call_meraki_api wrapper."""
        emit({"type": "tool_call", "tool": method, "source": "meraki", "status": "running"})
        try:
            result = await asyncio.wait_for(
                mcp_manager.call_tool("call_meraki_api", {
                    "section": section,
                    "method": method,
                    "parameters": params,
                }),
                timeout=_ENRICHMENT_TIMEOUT,
            )
            if result:
                content = result.get("content", "")
                is_error = (
                    "error" in result
                    or (isinstance(content, str) and content.strip().lower().startswith("error"))
                    or (isinstance(content, str) and '"errors"' in content[:100])
                )
                if not is_error and content:
                    parsed = _parse_json(content)
                    if isinstance(parsed, list):
                        data[key].extend(parsed)
                        logger.info("Vision enrichment: fetched %s OK (%d items)", label, len(parsed))
                    elif isinstance(parsed, dict):
                        data[key].append(parsed)
                        logger.info("Vision enrichment: fetched %s OK (dict)", label)
        except Exception as e:
            logger.warning("Vision enrichment: %s fetch failed: %s", label, e)
        emit({"type": "tool_call", "tool": method, "source": "meraki", "status": "complete"})

    await asyncio.gather(
        # 1. Device statuses (name, serial, model, networkId, status, lanIp, publicIp)
        _fetch_direct("getOrganizationDevicesStatuses", {}, "device statuses", "statuses"),
        # 2. Networks (id → name mapping)
        _fetch_direct("getOrganizationNetworks", {}, "org networks", "networks"),
        # 3. Device details (firmware, tags, address, notes)
        _fetch_api("organizations", "getOrganizationDevices", {},
                   "device details", "devices"),
        # 4. WAN uplink statuses (per-appliance wan1/wan2 status)
        _fetch_api("appliance", "getOrganizationApplianceUplinkStatuses", {},
                   "uplink statuses", "uplinks"),
        # 5. Wireless channel utilization by network (per-band CU)
        _fetch_api("wireless", "getOrganizationWirelessDevicesChannelUtilizationByNetwork",
                   {"timespan": 86400, "perPage": 1000},
                   "wireless CU", "wireless_cu"),
        # 6. Client overview (org-wide client counts)
        _fetch_api("organizations", "getOrganizationClientsOverview",
                   {"timespan": 86400},
                   "client overview", "clients"),
    )

    return data


# ---------------------------------------------------------------------------
# Enrichment context builder
# ---------------------------------------------------------------------------

def _strip_network_suffix(name: str) -> str:
    """Strip product-type suffixes from network names (e.g. '- wireless')."""
    return re.sub(
        r"\s*-\s*(wireless|appliance|switch|camera|sensor)$",
        "", name, flags=re.IGNORECASE,
    )


def _build_network_map(networks: list) -> dict[str, str]:
    """Build network id → clean name lookup."""
    nm: dict[str, str] = {}
    for net in networks:
        if isinstance(net, dict):
            nid = net.get("id", "")
            nname = net.get("name", "")
            if nid and nname:
                nm[nid] = _strip_network_suffix(nname)
    return nm


def _build_device_detail_map(devices: list) -> dict[str, dict]:
    """Build serial → device detail lookup from getOrganizationDevices."""
    dm: dict[str, dict] = {}
    for dev in devices:
        if isinstance(dev, dict):
            serial = dev.get("serial", "")
            if serial:
                dm[serial] = dev
    return dm


def _match_devices(ai_text: str, statuses: list, network_map: dict[str, str],
                   detail_map: dict[str, dict]) -> list[dict]:
    """Find device names mentioned in AI text. Returns matched device dicts."""
    if not ai_text or not statuses:
        return []

    ai_lower = ai_text.lower()
    matches: list[dict] = []
    seen: set[str] = set()

    for dev in statuses[:_MAX_DEVICES]:
        if not isinstance(dev, dict):
            continue
        name = dev.get("name", "")
        serial = dev.get("serial", "")
        if not name or serial in seen:
            continue
        # Match device name in AI text (word-boundary aware for short names)
        if len(name) <= 4:
            if not re.search(rf"\b{re.escape(name)}\b", ai_text, re.IGNORECASE):
                continue
        elif name.lower() not in ai_lower:
            continue
        seen.add(serial)
        net_name = network_map.get(dev.get("networkId", ""), "")
        detail = detail_map.get(serial, {})
        # Extract firmware version — field is "firmware" in getOrganizationDevices
        firmware = detail.get("firmware", "")
        # Clean up firmware string (e.g. "switch-15-21-1" → "15.21.1")
        if firmware:
            firmware = re.sub(r"^(switch|wireless|appliance|camera|sensor)-", "", firmware)
            firmware = firmware.replace("-", ".")
        matches.append({
            "name": name,
            "serial": serial,
            "model": dev.get("model", ""),
            "network": net_name,
            "networkId": dev.get("networkId", ""),
            "status": dev.get("status", "unknown"),
            "lanIp": dev.get("lanIp", ""),
            "publicIp": dev.get("publicIp", ""),
            "firmware": firmware,
        })

    return matches


def _build_device_table(matches: list[dict]) -> str:
    """Build markdown table of matched devices."""
    if not matches:
        return ""
    section = "\n**Matched Devices**\n\n"
    section += "| Device | Serial | Model | Network | Status | Firmware |\n"
    section += "|--------|--------|-------|---------|--------|----------|\n"
    for m in matches:
        fw = m["firmware"] or "—"
        section += (f"| {m['name']} | `{m['serial']}` | {m['model']} "
                    f"| {m['network']} | {m['status']} | {fw} |\n")
    return section


def _build_network_health(matches: list[dict], statuses: list,
                          network_map: dict[str, str],
                          uplinks: list, wireless_cu: list) -> str:
    """Build per-network health sections for matched networks."""
    if not matches:
        return ""

    # Collect unique network IDs from matched devices
    matched_net_ids: set[str] = set()
    for m in matches:
        nid = m.get("networkId", "")
        if nid:
            matched_net_ids.add(nid)

    if not matched_net_ids:
        return ""

    # Build per-network device counts from all statuses
    net_device_counts: dict[str, dict[str, int]] = {}
    for dev in statuses[:_MAX_DEVICES]:
        if not isinstance(dev, dict):
            continue
        nid = dev.get("networkId", "")
        if nid not in matched_net_ids:
            continue
        status = (dev.get("status") or "unknown").lower()
        if nid not in net_device_counts:
            net_device_counts[nid] = {"online": 0, "offline": 0, "alerting": 0, "dormant": 0}
        if status in net_device_counts[nid]:
            net_device_counts[nid][status] += 1

    # Build per-network uplink info
    net_uplinks: dict[str, list[dict]] = {}
    for uplink_entry in uplinks:
        if not isinstance(uplink_entry, dict):
            continue
        nid = uplink_entry.get("networkId", "")
        if nid not in matched_net_ids:
            continue
        for iface in uplink_entry.get("uplinks", []):
            if not isinstance(iface, dict):
                continue
            net_uplinks.setdefault(nid, []).append({
                "interface": iface.get("interface", ""),
                "status": iface.get("status", ""),
                "ip": iface.get("ip", ""),
            })

    # Build per-network wireless CU
    # wireless_cu is list of per-network objects with byBand data
    net_cu: dict[str, dict[str, float]] = {}
    cu_items = wireless_cu
    # Handle paginated response with "items" wrapper
    if len(cu_items) == 1 and isinstance(cu_items[0], dict) and "items" in cu_items[0]:
        cu_items = cu_items[0]["items"]
    for entry in cu_items:
        if not isinstance(entry, dict):
            continue
        nid = entry.get("network", {}).get("id", "") if isinstance(entry.get("network"), dict) else ""
        if not nid or nid not in matched_net_ids:
            continue
        by_band = entry.get("byBand", {})
        if not isinstance(by_band, dict):
            continue
        band_avgs: dict[str, float] = {}
        for band_name, band_data in by_band.items():
            if isinstance(band_data, dict):
                total = band_data.get("total", {})
                if isinstance(total, dict):
                    pct = total.get("percentage")
                    if pct is not None:
                        band_avgs[band_name] = round(float(pct), 1)
        if band_avgs:
            net_cu[nid] = band_avgs

    # Render sections
    sections: list[str] = []
    for nid in sorted(matched_net_ids):
        net_name = network_map.get(nid, nid)
        parts: list[str] = []

        # Device counts
        counts = net_device_counts.get(nid, {})
        if counts:
            online = counts.get("online", 0)
            offline = counts.get("offline", 0)
            alerting = counts.get("alerting", 0)
            total = online + offline + alerting + counts.get("dormant", 0)
            parts.append(f"Devices: {online} online"
                         + (f", {alerting} alerting" if alerting else "")
                         + (f", {offline} offline" if offline else "")
                         + f" ({total} total)")

        # WAN uplinks
        ifaces = net_uplinks.get(nid, [])
        if ifaces:
            wan_parts = []
            for iface in ifaces:
                ip_str = f" ({iface['ip']})" if iface.get("ip") else ""
                wan_parts.append(f"{iface['interface']} {iface['status']}{ip_str}")
            parts.append("WAN: " + ", ".join(wan_parts))

        # Wireless CU
        bands = net_cu.get(nid, {})
        if bands:
            cu_parts = [f"{band} {pct}%" for band, pct in sorted(bands.items())]
            parts.append("Wireless CU: " + ", ".join(cu_parts))

        if parts:
            section = f"\n**Network: {net_name}**\n"
            for p in parts:
                section += f"- {p}\n"
            sections.append(section)

    return "".join(sections)


def _build_org_overview(statuses: list, networks: list, clients: list) -> str:
    """Build org-wide health snapshot."""
    if not statuses and not networks:
        return ""

    parts: list[str] = []

    # Device counts by status
    if statuses:
        online = offline = alerting = dormant = 0
        for dev in statuses:
            if not isinstance(dev, dict):
                continue
            status = (dev.get("status") or "").lower()
            if status == "online":
                online += 1
            elif status == "offline":
                offline += 1
            elif status == "alerting":
                alerting += 1
            elif status == "dormant":
                dormant += 1
        total = online + offline + alerting + dormant
        status_parts = [f"{total} devices"]
        detail_parts = []
        if online:
            detail_parts.append(f"{online} online")
        if alerting:
            detail_parts.append(f"{alerting} alerting")
        if offline:
            detail_parts.append(f"{offline} offline")
        if dormant:
            detail_parts.append(f"{dormant} dormant")
        if detail_parts:
            status_parts.append("(" + ", ".join(detail_parts) + ")")
        parts.append(" ".join(status_parts))

    # Network count
    if networks:
        parts.append(f"{len(networks)} networks")

    # Client count
    if clients:
        for c in clients:
            if isinstance(c, dict):
                counts = c.get("counts", {})
                if isinstance(counts, dict) and "total" in counts:
                    parts.append(f"{counts['total']} clients (24h)")
                    break
                usage = c.get("usage", {})
                if isinstance(usage, dict):
                    overall = usage.get("overall", {})
                    if isinstance(overall, dict) and "total" in overall:
                        parts.append(f"{overall['total']} clients (24h)")
                        break

    if not parts:
        return ""

    section = "\n**Organization Overview**\n"
    for p in parts:
        section += f"- {p}\n"
    return section


def _build_enrichment_context(ai_text: str, org_data: dict[str, list]) -> str:
    """Produce enrichment markdown sections from org data + AI text correlation.

    Returns empty string if no relevant data matches (non-network images).
    """
    statuses = org_data.get("statuses", [])
    networks = org_data.get("networks", [])
    devices = org_data.get("devices", [])
    uplinks = org_data.get("uplinks", [])
    wireless_cu = org_data.get("wireless_cu", [])
    clients = org_data.get("clients", [])

    network_map = _build_network_map(networks)
    detail_map = _build_device_detail_map(devices)

    # Match devices mentioned in AI text
    matches = _match_devices(ai_text, statuses, network_map, detail_map)

    # Build sections — each returns empty string if no data
    device_table = _build_device_table(matches)
    network_health = _build_network_health(
        matches, statuses, network_map, uplinks, wireless_cu,
    )
    org_overview = _build_org_overview(statuses, networks, clients)

    # If we have matched devices, show device table + network health + org overview.
    # If no matches but we have org data, show only org overview (image may be
    # network-related even if no specific devices were named).
    if device_table:
        sections = "\n\n---\n**Live Network Context**\n" + device_table + network_health + org_overview
    elif org_overview and _looks_network_related(ai_text):
        sections = "\n\n---\n**Live Network Context**\n" + org_overview
    else:
        sections = ""

    return sections


def _looks_network_related(ai_text: str) -> bool:
    """Heuristic: does the AI response mention network-related terms?"""
    keywords = (
        "network", "device", "switch", "router", "firewall", "appliance",
        "access point", "AP", "SSID", "wireless", "dashboard", "meraki",
        "topology", "uplink", "WAN", "LAN", "VLAN", "subnet", "DHCP",
        "DNS", "latency", "throughput", "bandwidth", "packet loss",
    )
    text_lower = ai_text.lower()
    return any(kw.lower() in text_lower for kw in keywords)


# ---------------------------------------------------------------------------
# Vision node
# ---------------------------------------------------------------------------

async def vision_node(state: AgentState, writer: StreamWriter) -> dict:
    """Analyze images with Claude vision + concurrent org context enrichment.

    Performance: 6 enrichment MCP calls and the LLM run in parallel via
    asyncio.gather, so total time = max(enrichment, LLM) ≈ 5-8s.
    Programmatic correlation after both complete adds <1ms.
    """
    emit = safe_writer(writer)
    query = state["user_query"]
    messages = state.get("messages", [])
    plan_step = state.get("plan_step", 0)

    emit({"type": "tool_call", "tool": "image_analysis", "source": "meraki", "status": "running"})

    llm = ChatAnthropic(
        model=settings.model_name,  # Sonnet — vision-capable
        api_key=settings.anthropic_api_key,
        max_tokens=4096,
        timeout=60,
        max_retries=1,
    )

    llm_messages = [SystemMessage(content=VISION_SYSTEM_PROMPT)] + list(messages)

    # Run enrichment and LLM concurrently — enrichment never blocks the LLM
    org_data, response = await asyncio.gather(
        _fetch_org_context(emit),
        llm.ainvoke(llm_messages),
    )

    emit({"type": "tool_call", "tool": "image_analysis", "source": "meraki", "status": "complete"})

    # Programmatic context enrichment — instant, no second LLM call
    if isinstance(response.content, str):
        enrichment = _build_enrichment_context(response.content, org_data)
        if enrichment:
            response = AIMessage(
                content=response.content + enrichment,
                id=response.id,
                response_metadata=getattr(response, "response_metadata", {}),
            )
            logger.info("Vision agent: appended enrichment context (%d chars)", len(enrichment))

    logger.info("Vision agent completed analysis for query: %s", query[:100])

    return {
        "messages": [response],
        "tool_results": [],
        "agent_events": [],
        "table_data": [],
        "plan_step": plan_step + 1,
    }
