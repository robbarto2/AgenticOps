"""Device-specific API endpoints for fetching detailed device information."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException

from mcp_client.manager import mcp_manager

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/api/device/{serial}/switch-ports")
async def get_switch_ports(serial: str) -> dict[str, Any]:
    """Get switch port statuses for a device."""
    try:
        # Try to get port statuses using the Meraki API
        result = await mcp_manager.call_tool(
            "call_meraki_api",
            {
                "method": "getDeviceSwitchPortsStatuses",
                "serial": serial,
            }
        )

        if "error" in result:
            logger.warning("Failed to fetch switch ports for %s: %s", serial, result["error"])
            return {"ports": [], "error": result["error"]}

        # Parse the content
        import json
        content = result.get("content", "")
        try:
            ports_data = json.loads(content)
        except (json.JSONDecodeError, ValueError):
            logger.warning("Failed to parse switch ports response for %s", serial)
            return {"ports": []}

        # Transform into our format
        ports = []
        if isinstance(ports_data, list):
            for port_info in ports_data:
                if not isinstance(port_info, dict):
                    continue

                port_id = port_info.get("portId", "")
                enabled = port_info.get("enabled", True)
                status_str = port_info.get("status", "")

                # Map Meraki status to our status types
                if not enabled:
                    status = "disabled"
                elif status_str in ["Connected", "Active"]:
                    status = "active"
                elif status_str in ["Disconnected", "Not connected"]:
                    status = "disconnected"
                else:
                    status = "disconnected"

                ports.append({
                    "portId": port_id,
                    "enabled": enabled,
                    "status": status,
                    "poeEnabled": port_info.get("powerUsageInWh") is not None,
                    "poeActive": port_info.get("powerUsageInWh", 0) > 0,
                    "isUplink": port_info.get("isUplink", False),
                    "speedMbps": port_info.get("speed"),
                    "duplexMode": port_info.get("duplex"),
                    "vlan": port_info.get("vlan"),
                    "client": port_info.get("clientCount", 0) if port_info.get("clientCount", 0) > 0 else None,
                })

        return {"ports": ports}

    except Exception as e:
        logger.exception("Error fetching switch ports for %s", serial)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/device/{serial}/status")
async def get_device_status(serial: str) -> dict[str, Any]:
    """Get detailed device status information."""
    try:
        # Get device details
        device_result = await mcp_manager.call_tool(
            "call_meraki_api",
            {
                "method": "getDevice",
                "serial": serial,
            }
        )

        if "error" in device_result:
            logger.warning("Failed to fetch device for %s: %s", serial, device_result["error"])
            return {"error": device_result["error"]}

        # Get device status (uptime, etc.)
        status_result = await mcp_manager.call_tool(
            "call_meraki_api",
            {
                "method": "getOrganizationDevicesStatuses",
                "serials[]": serial,
            }
        )

        import json

        # Parse device info
        device_info = {}
        try:
            device_data = json.loads(device_result.get("content", "{}"))
            device_info = device_data if isinstance(device_data, dict) else {}
        except (json.JSONDecodeError, ValueError):
            pass

        # Parse status info
        status_info = {}
        try:
            status_data = json.loads(status_result.get("content", "[]"))
            if isinstance(status_data, list) and len(status_data) > 0:
                status_info = status_data[0]
        except (json.JSONDecodeError, ValueError):
            pass

        # Combine the data
        response = {
            "serial": serial,
            "model": device_info.get("model"),
            "lanIp": device_info.get("lanIp"),
            "publicIp": status_info.get("publicIp"),
            "gateway": status_info.get("gateway"),
            "dns": status_info.get("primaryDns"),
            "firmware": device_info.get("firmware"),
            "networkId": device_info.get("networkId"),
        }

        # Add status-specific fields
        if status_info:
            # Calculate uptime
            uptime_sec = status_info.get("lastReportedAt")
            if uptime_sec:
                # Convert to human readable
                response["lastBoot"] = status_info.get("lastReportedAt")

            response["status"] = status_info.get("status", "unknown")

        return response

    except Exception as e:
        logger.exception("Error fetching device status for %s", serial)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/test/{test_id}")
async def get_test_details(test_id: str) -> dict[str, Any]:
    """Get detailed ThousandEyes test information."""
    try:
        # Get test details
        test_result = await mcp_manager.call_tool(
            "get_network_app_synthetics_test",
            {"testId": test_id}
        )

        if "error" in test_result:
            logger.warning("Failed to fetch test %s: %s", test_id, test_result["error"])
            return {"error": test_result["error"]}

        # Try to get recent metrics
        metrics_result = await mcp_manager.call_tool(
            "get_network_app_synthetics_metrics",
            {"testId": test_id, "window": "1d"}
        )

        import json

        # Parse test info
        test_info = {}
        try:
            test_data = json.loads(test_result.get("content", "{}"))
            # API might return test in a wrapper or directly
            if isinstance(test_data, dict):
                test_info = test_data.get("test") or test_data
        except (json.JSONDecodeError, ValueError):
            logger.warning("Failed to parse test details for %s", test_id)
            pass

        # Parse metrics
        metrics_info = {}
        try:
            metrics_data = json.loads(metrics_result.get("content", "{}"))
            if isinstance(metrics_data, dict):
                metrics_info = metrics_data
        except (json.JSONDecodeError, ValueError):
            pass

        # Build response
        response = {
            "testId": test_id,
            "testName": test_info.get("testName") or test_info.get("name", ""),
            "testType": test_info.get("type", ""),
            "target": test_info.get("url") or test_info.get("server") or test_info.get("domain") or test_info.get("target", ""),
            "enabled": test_info.get("enabled", True),
            "interval": test_info.get("interval", 0),
            "agents": test_info.get("agents", []),
            "alertRules": test_info.get("alertRules", []),
            "description": test_info.get("description", ""),
        }

        # Add metrics if available
        if metrics_info:
            response["metrics"] = metrics_info

        return response

    except Exception as e:
        logger.exception("Error fetching test details for %s", test_id)
        raise HTTPException(status_code=500, detail=str(e))
