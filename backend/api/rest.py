"""REST API endpoints."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, HTTPException

from api.models import (
    ChannelUtilization,
    ClientDetail,
    DeviceDetail,
    EntityStatsResponse,
    HealthResponse,
    LldpCdpNeighbor,
    SkillInfo,
    SkillsResponse,
    SsidDetail,
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


@router.get("/entity/{entity_type}/{entity_id}/stats", response_model=EntityStatsResponse)
async def entity_stats(entity_type: str, entity_id: str) -> EntityStatsResponse:
    """Fetch live stats for a network entity via MCP tools."""
    if entity_type != "network":
        raise HTTPException(status_code=400, detail=f"Unsupported entity type: {entity_type}")

    if not mcp_manager.meraki_connected:
        raise HTTPException(status_code=503, detail="Meraki MCP not connected")

    device_count = 0
    client_count = 0
    ssid_count = 0

    # Fetch device count
    try:
        result = await mcp_manager.call_tool("getNetworkDevices", {"networkId": entity_id})
        if "error" not in result:
            content = result.get("content", "")
            parsed = _parse_json(content)
            if isinstance(parsed, list):
                device_count = len(parsed)
    except Exception:
        logger.warning("Failed to fetch devices for %s", entity_id)

    # Fetch client count
    try:
        result = await mcp_manager.call_tool("getNetworkClients", {"networkId": entity_id, "timespan": "86400"})
        if "error" not in result:
            content = result.get("content", "")
            parsed = _parse_json(content)
            if isinstance(parsed, list):
                client_count = len(parsed)
    except Exception:
        logger.warning("Failed to fetch clients for %s", entity_id)

    # Fetch SSID count
    try:
        result = await mcp_manager.call_tool("getNetworkWirelessSsids", {"networkId": entity_id})
        if "error" not in result:
            content = result.get("content", "")
            parsed = _parse_json(content)
            if isinstance(parsed, list):
                # Only count enabled SSIDs
                ssid_count = sum(1 for s in parsed if isinstance(s, dict) and s.get("enabled", False))
    except Exception:
        logger.warning("Failed to fetch SSIDs for %s", entity_id)

    return EntityStatsResponse(
        deviceCount=device_count,
        clientCount=client_count,
        ssidCount=ssid_count,
    )


@router.get("/entity/network/{network_id}/devices", response_model=list[DeviceDetail])
async def network_devices(network_id: str) -> list[DeviceDetail]:
    """Fetch devices for a network."""
    if not mcp_manager.meraki_connected:
        raise HTTPException(status_code=503, detail="Meraki MCP not connected")

    try:
        result = await mcp_manager.call_tool("getNetworkDevices", {"networkId": network_id})
        if "error" in result:
            raise HTTPException(status_code=502, detail=result["error"])
        parsed = _parse_json(result.get("content", ""))
        if not isinstance(parsed, list):
            return []
        return [
            DeviceDetail(
                name=d.get("name") or d.get("serial", ""),
                model=d.get("model", ""),
                serial=d.get("serial", ""),
                status=d.get("status", "unknown"),
            )
            for d in parsed
            if isinstance(d, dict)
        ]
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
