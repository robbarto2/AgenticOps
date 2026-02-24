"""REST API endpoints."""

from __future__ import annotations

import asyncio
import json
import logging
import os

from fastapi import APIRouter, HTTPException, Query

from api.models import (
    ChannelUtilization,
    ClientDetail,
    DeviceDetail,
    DeviceUplinkStatus,
    EntityStatsResponse,
    HealthResponse,
    LldpCdpNeighbor,
    OrgHealthResponse,
    ProblemDevice,
    SkillInfo,
    SkillsResponse,
    SsidDetail,
    WanUplinkAlert,
)
from mcp_client.manager import mcp_manager
from skills.loader import list_skills

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Health check: reports MCP connection status and tool counts."""
    tools = mcp_manager.tools
    meraki_count = sum(1 for t in tools if t.source == "meraki")
    te_count = sum(1 for t in tools if t.source == "thousandeyes")

    return HealthResponse(
        status="ok",
        meraki_connected=mcp_manager.meraki_connected,
        meraki_tools=meraki_count,
        thousandeyes_connected=mcp_manager.te_connected,
        thousandeyes_tools=te_count,
        total_tools=len(tools),
    )


@router.get("/skills", response_model=SkillsResponse)
async def get_skills() -> SkillsResponse:
    """List all available skills."""
    skills = list_skills()
    return SkillsResponse(
        skills=[SkillInfo(**s) for s in skills],
        count=len(skills),
    )


@router.get("/org/health", response_model=OrgHealthResponse)
async def org_health() -> OrgHealthResponse:
    """Live org health: device status counts + computed health score.

    Makes a single MCP call (getOrganizationDevicesStatuses) with cache
    bypass so the numbers are always fresh.  Designed for 15-second polling
    from the OrgSummaryCard.
    """
    if not mcp_manager.meraki_connected:
        raise HTTPException(status_code=503, detail="Meraki MCP not connected")

    try:
        import asyncio

        # Fetch device statuses and client overview in parallel
        devices_coro = mcp_manager.call_tool(
            "call_meraki_api",
            {
                "section": "organizations",
                "method": "getOrganizationDevicesStatuses",
                "parameters": {},
            },
            skip_cache=True,
        )
        clients_coro = mcp_manager.call_tool(
            "call_meraki_api",
            {
                "section": "organizations",
                "method": "getOrganizationClientsOverview",
                "parameters": {"timespan": 86400},  # Last 24 hours
            },
            skip_cache=True,
        )

        result, clients_result = await asyncio.gather(
            devices_coro, clients_coro, return_exceptions=True
        )

        # Handle device status result
        if isinstance(result, Exception):
            raise HTTPException(status_code=502, detail=str(result))
        if "error" in result:
            raise HTTPException(status_code=502, detail=result["error"])

        parsed = _parse_json(result.get("content", ""))
        devices = _unwrap_list(parsed)
        if devices is None:
            raise HTTPException(status_code=502, detail="Could not parse device statuses")

        online = offline = alerting = dormant = 0
        for d in devices:
            if not isinstance(d, dict):
                continue
            status = (d.get("status") or "").lower()
            if status == "online":
                online += 1
            elif status == "offline":
                offline += 1
            elif status == "alerting":
                alerting += 1
            elif status == "dormant":
                dormant += 1

        total = online + offline + alerting + dormant
        score = round(online / total * 100) if total > 0 else 0
        if score >= 90:
            health_status = "healthy"
        elif score >= 70:
            health_status = "warning"
        else:
            health_status = "critical"

        # Parse client count
        clients_total = None
        if isinstance(clients_result, dict) and "error" not in clients_result:
            clients_parsed = _parse_json(clients_result.get("content", ""))
            if isinstance(clients_parsed, dict):
                # getOrganizationClientsOverview returns { "counts": { "total": N } } or { "usage": { "overall": { "total": N } } }
                counts = clients_parsed.get("counts", {})
                if isinstance(counts, dict) and "total" in counts:
                    clients_total = counts["total"]
                else:
                    # Try alternative structures
                    usage = clients_parsed.get("usage", {})
                    if isinstance(usage, dict):
                        overall = usage.get("overall", {})
                        if isinstance(overall, dict) and "total" in overall:
                            clients_total = overall["total"]
                    # If the response is just a number at top level
                    if clients_total is None and "total" in clients_parsed:
                        clients_total = clients_parsed["total"]
            elif isinstance(clients_parsed, list):
                # If it returns a list of clients, count them
                clients_total = len(clients_parsed)
            if clients_total is not None:
                logger.info("org_health: client count = %d", clients_total)
        elif isinstance(clients_result, Exception):
            logger.warning("org_health: client count fetch failed: %s", clients_result)

        from datetime import datetime, timezone

        return OrgHealthResponse(
            health_score=score,
            health_status=health_status,
            devices_online=online,
            devices_offline=offline,
            devices_alerting=alerting,
            devices_dormant=dormant,
            devices_total=total,
            clients_total=clients_total,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to fetch org health")
        raise HTTPException(status_code=500, detail="Failed to fetch org health")


@router.get("/entity/{entity_type}/{entity_id}/stats", response_model=EntityStatsResponse)
async def entity_stats(entity_type: str, entity_id: str) -> EntityStatsResponse:
    """Fetch live stats for a network entity via MCP tools."""
    if entity_type != "network":
        raise HTTPException(status_code=400, detail=f"Unsupported entity type: {entity_type}")

    if not mcp_manager.meraki_connected:
        raise HTTPException(status_code=503, detail="Meraki MCP not connected")

    # Fetch all stats in parallel.  The MCP manager's throttle lock
    # serializes the actual API calls ~0.5s apart, but asyncio.gather
    # lets responses overlap so total time ≈ 1.5s + longest single call
    # instead of the sum of all calls.  Results are cached for 1 hour,
    # so repeated popup opens are instant.
    #
    # Return -1 for any stat that failed so the frontend can distinguish
    # "actually zero" from "couldn't fetch".

    async def _fetch_devices() -> tuple[int, str | None]:
        """Fetch devices and return (count, location)."""
        try:
            result = await mcp_manager.call_tool("getNetworkDevices", {"networkId": entity_id})
            if "error" not in result:
                parsed = _parse_json(result.get("content", ""))
                devices = _unwrap_list(parsed)
                if devices is not None:
                    count = len(devices)
                    # Extract location from first device that has an address
                    location = None
                    for d in devices:
                        if isinstance(d, dict):
                            addr = d.get("address") or d.get("lat")
                            if addr and isinstance(addr, str) and addr.strip():
                                location = addr.strip()
                                break
                    return count, location
            logger.warning("Device stats error for %s: %s", entity_id, result.get("error", "parse failed"))
        except Exception:
            logger.warning("Failed to fetch devices for %s", entity_id, exc_info=True)
        return -1, None

    async def _fetch_device_statuses() -> tuple[int, int, int, list[ProblemDevice]]:
        """Fetch org device statuses and filter by network ID."""
        try:
            # Fetch ALL org device statuses (no filter) — this matches
            # the discovery agent's call so it's typically a cache hit.
            # Filtering by networkIds in the API parameters doesn't work
            # reliably through call_meraki_api, so we filter client-side.
            result = await mcp_manager.call_tool(
                "call_meraki_api",
                {
                    "section": "organizations",
                    "method": "getOrganizationDevicesStatuses",
                    "parameters": {},
                },
            )
            if "error" not in result:
                parsed = _parse_json(result.get("content", ""))
                devices = _unwrap_list(parsed)
                if devices is not None:
                    online = offline = alerting = 0
                    problems: list[ProblemDevice] = []
                    for d in devices:
                        if not isinstance(d, dict):
                            continue
                        # Filter to only devices in this network
                        if d.get("networkId") != entity_id:
                            continue
                        status = (d.get("status") or "").lower()
                        if status == "online":
                            online += 1
                        elif status in ("offline", "dormant"):
                            offline += 1
                            problems.append(ProblemDevice(
                                name=d.get("name") or d.get("serial", ""),
                                model=d.get("model", ""),
                                serial=d.get("serial", ""),
                                status=d.get("status", "offline"),
                            ))
                        elif status == "alerting":
                            alerting += 1
                            problems.append(ProblemDevice(
                                name=d.get("name") or d.get("serial", ""),
                                model=d.get("model", ""),
                                serial=d.get("serial", ""),
                                status="alerting",
                            ))
                    return online, offline, alerting, problems
            logger.warning("Device status error for %s: %s", entity_id, result.get("error", "parse failed"))
        except Exception:
            logger.warning("Failed to fetch device statuses for %s", entity_id, exc_info=True)
        return -1, -1, -1, []

    async def _count_clients() -> int:
        try:
            result = await mcp_manager.call_tool("getNetworkClients", {"networkId": entity_id, "timespan": "86400"})
            if "error" not in result:
                parsed = _parse_json(result.get("content", ""))
                clients = _unwrap_list(parsed)
                if clients is not None:
                    return len(clients)
            logger.warning("Client stats error for %s: %s", entity_id, result.get("error", "parse failed"))
        except Exception:
            logger.warning("Failed to fetch clients for %s", entity_id, exc_info=True)
        return -1

    async def _count_ssids() -> int:
        try:
            result = await mcp_manager.call_tool("getNetworkWirelessSsids", {"networkId": entity_id})
            if "error" not in result:
                parsed = _parse_json(result.get("content", ""))
                ssids = _unwrap_list(parsed)
                if ssids is not None:
                    return sum(1 for s in ssids if isinstance(s, dict) and s.get("enabled", False))
            logger.warning("SSID stats error for %s: %s", entity_id, result.get("error", "parse failed"))
        except Exception:
            logger.warning("Failed to fetch SSIDs for %s", entity_id, exc_info=True)
        return -1

    async def _fetch_wan_alerts() -> list[WanUplinkAlert]:
        """Fetch org uplink statuses and return failed/not-connected uplinks for this network."""
        try:
            result = await mcp_manager.call_tool(
                "call_meraki_api",
                {
                    "section": "appliance",
                    "method": "getOrganizationApplianceUplinkStatuses",
                    "parameters": {},
                },
            )
            if "error" not in result:
                parsed = _parse_json(result.get("content", ""))
                items = _unwrap_list(parsed)
                if items is not None:
                    alerts: list[WanUplinkAlert] = []
                    for item in items:
                        if not isinstance(item, dict):
                            continue
                        if item.get("networkId") != entity_id:
                            continue
                        serial = item.get("serial", "")
                        device_name = serial  # fallback
                        uplinks = item.get("uplinks", [])
                        if not isinstance(uplinks, list):
                            continue
                        for ul in uplinks:
                            if not isinstance(ul, dict):
                                continue
                            status = (ul.get("status") or "").lower()
                            if status in ("failed", "not connected"):
                                alerts.append(WanUplinkAlert(
                                    deviceName=device_name,
                                    serial=serial,
                                    interface=ul.get("interface", ""),
                                    status=ul.get("status", ""),
                                ))
                    return alerts
            logger.warning("WAN uplink error for %s: %s", entity_id, result.get("error", "parse failed"))
        except Exception:
            logger.warning("Failed to fetch WAN uplinks for %s", entity_id, exc_info=True)
        return []

    (device_count, location), (online_count, offline_count, alerting_count, problem_devices), client_count, ssid_count, wan_alerts = await asyncio.gather(
        _fetch_devices(),
        _fetch_device_statuses(),
        _count_clients(),
        _count_ssids(),
        _fetch_wan_alerts(),
    )

    return EntityStatsResponse(
        deviceCount=device_count,
        clientCount=client_count,
        ssidCount=ssid_count,
        onlineCount=online_count,
        offlineCount=offline_count,
        alertingCount=alerting_count,
        location=location,
        problemDevices=problem_devices,
        wanAlerts=wan_alerts,
    )


@router.get("/entity/network/{network_id}/devices", response_model=list[DeviceDetail])
async def network_devices(
    network_id: str,
    status: str | None = Query(None, description="Filter: 'active' (online) or 'inactive' (offline/alerting)"),
) -> list[DeviceDetail]:
    """Fetch devices for a network with real status from org-level statuses."""
    if not mcp_manager.meraki_connected:
        raise HTTPException(status_code=503, detail="Meraki MCP not connected")

    try:
        # Fetch device list and org-level statuses in parallel
        dev_result, status_result = await asyncio.gather(
            mcp_manager.call_tool("getNetworkDevices", {"networkId": network_id}),
            mcp_manager.call_tool("call_meraki_api", {
                "section": "organizations",
                "method": "getOrganizationDevicesStatuses",
                "parameters": {},
            }),
        )

        if "error" in dev_result:
            raise HTTPException(status_code=502, detail=dev_result["error"])

        devices = _unwrap_list(_parse_json(dev_result.get("content", "")))
        if not devices:
            return []

        # Build serial → status map from org-level statuses
        status_map: dict[str, str] = {}
        if "error" not in status_result:
            all_statuses = _unwrap_list(_parse_json(status_result.get("content", "")))
            if all_statuses:
                for s in all_statuses:
                    if isinstance(s, dict) and s.get("serial"):
                        status_map[s["serial"]] = s.get("status", "unknown")

        result_devices = []
        for d in devices:
            if not isinstance(d, dict):
                continue
            serial = d.get("serial", "")
            device_status = status_map.get(serial, "unknown")

            # Apply status filter
            if status == "active" and device_status.lower() != "online":
                continue
            if status == "inactive" and device_status.lower() not in ("offline", "alerting", "dormant"):
                continue

            result_devices.append(DeviceDetail(
                name=d.get("name") or serial,
                model=d.get("model", ""),
                serial=serial,
                status=device_status,
            ))

        return result_devices
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to fetch devices for %s", network_id)
        raise HTTPException(status_code=500, detail="Failed to fetch devices")


@router.get("/entity/network/{network_id}/clients", response_model=list[ClientDetail])
async def network_clients(network_id: str) -> list[ClientDetail]:
    """Fetch clients for a network (last 24h)."""
    if not mcp_manager.meraki_connected:
        raise HTTPException(status_code=503, detail="Meraki MCP not connected")

    try:
        result = await mcp_manager.call_tool(
            "getNetworkClients", {"networkId": network_id, "timespan": "86400"}
        )
        if "error" in result:
            raise HTTPException(status_code=502, detail=result["error"])
        parsed = _parse_json(result.get("content", ""))
        if not isinstance(parsed, list):
            return []
        return [
            ClientDetail(
                description=c.get("description") or c.get("mac", ""),
                mac=c.get("mac", ""),
                ip=c.get("ip", ""),
                vlan=str(c.get("vlan", "")),
            )
            for c in parsed
            if isinstance(c, dict)
        ]
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to fetch clients for %s", network_id)
        raise HTTPException(status_code=500, detail="Failed to fetch clients")


@router.get("/entity/network/{network_id}/ssids", response_model=list[SsidDetail])
async def network_ssids(network_id: str) -> list[SsidDetail]:
    """Fetch wireless SSIDs for a network."""
    if not mcp_manager.meraki_connected:
        raise HTTPException(status_code=503, detail="Meraki MCP not connected")

    try:
        result = await mcp_manager.call_tool(
            "getNetworkWirelessSsids", {"networkId": network_id}
        )
        if "error" in result:
            raise HTTPException(status_code=502, detail=result["error"])
        parsed = _parse_json(result.get("content", ""))
        if not isinstance(parsed, list):
            return []
        # Only return enabled SSIDs (ones that are actually broadcasting)
        return [
            SsidDetail(
                name=s.get("name", ""),
                authMode=s.get("authMode", ""),
                enabled=bool(s.get("enabled", False)),
            )
            for s in parsed
            if isinstance(s, dict) and s.get("enabled", False)
        ]
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to fetch SSIDs for %s", network_id)
        raise HTTPException(status_code=500, detail="Failed to fetch SSIDs")


@router.get("/device/{serial}/channel-utilization", response_model=list[ChannelUtilization])
async def device_channel_utilization(serial: str, network_id: str = None) -> list[ChannelUtilization]:
    """Fetch wireless channel utilization for a specific access point."""
    if not mcp_manager.meraki_connected:
        raise HTTPException(status_code=503, detail="Meraki MCP not connected")

    # If no network_id provided, fetch it from the device
    if not network_id:
        try:
            device_result = await mcp_manager.call_tool("getDevice", {"serial": serial})
            if "error" not in device_result:
                device_data = _parse_json(device_result.get("content", ""))
                if isinstance(device_data, dict):
                    network_id = device_data.get("networkId")
        except Exception:
            logger.warning("Failed to fetch networkId for device %s", serial)

    if not network_id:
        raise HTTPException(status_code=400, detail="networkId is required but could not be determined")

    try:
        # Fetch channel utilization for each band (2.4GHz, 5GHz, 6GHz)
        # The Meraki API requires: networkId, deviceSerial, AND band
        utilization_list = []
        bands = ["2.4", "5", "6"]

        for band in bands:
            try:
                result = await mcp_manager.call_tool(
                    "call_meraki_api",
                    {
                        "section": "wireless",
                        "method": "getNetworkWirelessChannelUtilizationHistory",
                        "parameters": {
                            "networkId": network_id,
                            "deviceSerial": serial,
                            "band": band,
                            "timespan": 3600,
                            "resolution": 3600,
                        }
                    }
                )

                logger.info(f"Band {band} result: {result}")

                if "error" in result:
                    logger.info(f"Channel utilization error for band {band}: {result}")
                    continue

                content = result.get("content", "")
                parsed = _parse_json(content)
                logger.info(f"Band {band} parsed: {parsed}")

                if not isinstance(parsed, list) or len(parsed) == 0:
                    continue

                # Calculate average utilization from data points
                # API returns: utilizationTotal, utilization80211, utilizationNon80211
                total_util = 0
                count = 0
                for entry in parsed:
                    if isinstance(entry, dict):
                        # Try different field names the API might use
                        util = (entry.get('utilizationTotal') or
                               entry.get('utilization') or
                               entry.get('utilTotal'))
                        if util is not None:
                            total_util += util
                            count += 1

                if count > 0:
                    avg_util = total_util / count
                    utilization_list.append(
                        ChannelUtilization(band=band, utilization=round(avg_util, 1))
                    )
                    logger.info(f"Band {band}GHz: {avg_util:.1f}% utilization")
                else:
                    logger.info(f"Band {band}GHz: No utilization data available")

            except Exception:
                logger.debug(f"Failed to fetch channel utilization for band {band}", exc_info=True)
                continue

        logger.info(f"Channel utilization for {serial}: {utilization_list}")
        return utilization_list
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to fetch channel utilization for %s", serial)
        raise HTTPException(status_code=500, detail="Failed to fetch channel utilization")


@router.get("/device/{serial}/lldp-cdp", response_model=list[LldpCdpNeighbor])
async def device_lldp_cdp(serial: str) -> list[LldpCdpNeighbor]:
    """Fetch LLDP/CDP neighbor data for a device (upstream switch/port info)."""
    if not mcp_manager.meraki_connected:
        raise HTTPException(status_code=503, detail="Meraki MCP not connected")

    try:
        result = await mcp_manager.call_tool(
            "call_meraki_api",
            {
                "section": "devices",
                "method": "getDeviceLldpCdp",
                "parameters": {"serial": serial},
            },
        )

        if "error" in result:
            logger.warning("LLDP/CDP error for %s: %s", serial, result.get("error"))
            return []

        parsed = _parse_json(result.get("content", ""))
        if not isinstance(parsed, dict):
            return []

        ports_data = parsed.get("ports", {})
        neighbors: list[LldpCdpNeighbor] = []

        for port_name, port_info in ports_data.items():
            if not isinstance(port_info, dict):
                continue

            cdp = port_info.get("cdp") or {}
            lldp = port_info.get("lldp") or {}

            # Extract best available info from CDP and LLDP
            switch_name = lldp.get("systemName") or cdp.get("deviceId") or None
            switch_port = cdp.get("portId") or lldp.get("portId") or None
            switch_ip = cdp.get("address") or lldp.get("managementAddress") or None

            has_cdp = bool(cdp)
            has_lldp = bool(lldp)
            protocol = "both" if (has_cdp and has_lldp) else ("cdp" if has_cdp else "lldp")

            if switch_name or switch_port or switch_ip:
                neighbors.append(
                    LldpCdpNeighbor(
                        sourcePort=port_name,
                        switchName=switch_name,
                        switchPort=switch_port,
                        switchIp=switch_ip,
                        protocol=protocol,
                    )
                )

        logger.info("LLDP/CDP for %s: found %d neighbors", serial, len(neighbors))
        return neighbors
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to fetch LLDP/CDP for %s", serial)
        return []


@router.get("/device/{serial}/uplink-statuses", response_model=list[DeviceUplinkStatus])
async def device_uplink_statuses(serial: str) -> list[DeviceUplinkStatus]:
    """Fetch WAN uplink statuses for an appliance or cellular gateway."""
    if not mcp_manager.meraki_connected:
        raise HTTPException(status_code=503, detail="Meraki MCP not connected")

    try:
        result = await mcp_manager.call_tool(
            "call_meraki_api",
            {
                "section": "appliance",
                "method": "getOrganizationApplianceUplinkStatuses",
                "parameters": {"serials[]": [serial]},
            },
        )

        if "error" in result:
            logger.warning("Uplink statuses error for %s: %s", serial, result.get("error"))
            return []

        parsed = _parse_json(result.get("content", ""))
        items = _unwrap_list(parsed)
        if not items:
            return []

        statuses: list[DeviceUplinkStatus] = []
        for device_entry in items:
            if not isinstance(device_entry, dict):
                continue
            if device_entry.get("serial") != serial:
                continue
            for uplink in device_entry.get("uplinks", []):
                if not isinstance(uplink, dict):
                    continue
                statuses.append(
                    DeviceUplinkStatus(
                        interface=uplink.get("interface", ""),
                        status=uplink.get("status", "unknown"),
                        ip=uplink.get("ip"),
                        gateway=uplink.get("gateway"),
                        publicIp=uplink.get("publicIp"),
                        provider=uplink.get("provider"),
                    )
                )

        logger.info("Uplink statuses for %s: %d uplinks", serial, len(statuses))
        return statuses
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to fetch uplink statuses for %s", serial)
        return []


def _parse_json(content: str | list | dict) -> object | None:
    """Try to parse content as JSON."""
    if isinstance(content, (list, dict)):
        return content
    if isinstance(content, str):
        try:
            return json.loads(content)
        except (json.JSONDecodeError, ValueError):
            return None
    return None


def _unwrap_list(parsed: object) -> list | None:
    """Unwrap a parsed MCP result into a list.

    Handles truncated responses from the MCP server which wrap large results
    in a dict with ``_response_truncated`` / ``_full_response_cached``.
    """
    if isinstance(parsed, list):
        return parsed
    if not isinstance(parsed, dict):
        return None

    # Truncated response — try to read full data from cached file
    if parsed.get("_response_truncated") and parsed.get("_full_response_cached"):
        filepath = parsed["_full_response_cached"]
        if not os.path.isabs(filepath):
            project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            filepath = os.path.join(project_root, "..", "Meraki Magic MCP", filepath)
        try:
            if os.path.exists(filepath):
                with open(filepath, "r") as f:
                    cached = json.load(f)
                data = cached.get("data")
                if isinstance(data, list):
                    logger.info("_unwrap_list: read %d items from cached file", len(data))
                    return data
        except Exception:
            logger.warning("_unwrap_list: failed to read cached file %s", filepath, exc_info=True)
        # Fall back to preview
        preview = parsed.get("_preview")
        if isinstance(preview, list):
            return preview

    # Other dict wrappers
    for key in ("data", "results", "_preview", "_sample"):
        val = parsed.get(key)
        if isinstance(val, list):
            return val

    return None
