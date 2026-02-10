"""REST API endpoints."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, HTTPException

from api.models import EntityStatsResponse, HealthResponse, SkillInfo, SkillsResponse
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
