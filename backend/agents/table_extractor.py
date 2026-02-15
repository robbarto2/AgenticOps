"""Utility to extract structured table data from raw MCP tool results."""

from __future__ import annotations

import json
import logging
import uuid

logger = logging.getLogger(__name__)

# Tool names and method names that return organization networks
_NETWORK_TOOL_NAMES = {"getOrganizationNetworks", "getorganizationnetworks"}
_NETWORK_METHOD_NAMES = {"getOrganizationNetworks", "getorganizationnetworks"}

# Tool names and method names that return network devices
_DEVICE_TOOL_NAMES = {"getNetworkDevices", "getnetworkdevices", "getOrganizationDevices", "getorganizationdevices"}
_DEVICE_METHOD_NAMES = {"getNetworkDevices", "getnetworkdevices", "getOrganizationDevices", "getorganizationdevices"}


def _is_network_result(result: dict) -> bool:
    """Check if a tool result contains organization network data."""
    tool_name = result.get("tool", "")

    # Direct match: getOrganizationNetworks tool
    if tool_name.lower().rstrip() in _NETWORK_TOOL_NAMES:
        return True

    # Generic call_meraki_api tool with networks method
    if tool_name == "call_meraki_api":
        args = result.get("args", {})
        method = args.get("method", "")
        if method.lower() in _NETWORK_METHOD_NAMES:
            return True

    return False


def extract_network_table(tool_results: list[dict]) -> list[dict]:
    """Find getOrganizationNetworks results and build structured table data.

    Returns a list of table_data dicts suitable for sending as WebSocket events.
    """
    tables = []
    logger.info("extract_network_table: scanning %d tool results", len(tool_results))

    for result in tool_results:
        tool_name = result.get("tool", "")

        if not _is_network_result(result):
            continue

        logger.info("extract_network_table: found network result from tool '%s'", tool_name)

        raw = result.get("result", "")
        networks = _parse_result(raw)

        if networks is None:
            logger.warning("extract_network_table: failed to parse result from '%s' (raw type: %s, length: %s)",
                           tool_name, type(raw).__name__, len(raw) if isinstance(raw, str) else "N/A")
            continue

        # Handle truncated responses — the MCP may wrap large results
        if isinstance(networks, dict):
            # Check for sample/data fields in truncated responses
            # _preview is used by Meraki MCP for truncated large responses
            sample = networks.get("_preview") or networks.get("_sample") or networks.get("data") or networks.get("results")
            if isinstance(sample, list):
                logger.info("extract_network_table: extracted %d networks from wrapped response", len(sample))
                networks = sample
            else:
                logger.warning("extract_network_table: result is a dict, not a list (keys: %s)",
                               list(networks.keys())[:10])
                # Log error details if this looks like an error response
                if "error" in networks or "message" in networks:
                    logger.error("extract_network_table: API error response: %s", networks)
                continue

        if not isinstance(networks, list):
            logger.warning("extract_network_table: parsed result is %s, not a list", type(networks).__name__)
            continue

        logger.info("extract_network_table: building rows from %d networks", len(networks))

        rows = []
        for net in networks:
            if not isinstance(net, dict):
                continue

            network_id = net.get("id", "")
            name = net.get("name", "")
            product_types = net.get("productTypes", [])
            time_zone = net.get("timeZone", "")
            tags = net.get("tags", [])
            notes = net.get("notes", "")

            # Ensure tags is a list
            if isinstance(tags, str):
                tags = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

            rows.append({
                "id": network_id,
                "cells": [
                    name,
                    ", ".join(product_types) if isinstance(product_types, list) else str(product_types),
                    time_zone,
                    ", ".join(tags) if tags else "",
                ],
                "metadata": {
                    "networkId": network_id,
                    "notes": notes or None,
                    "tags": tags if tags else None,
                    "timeZone": time_zone or None,
                    "productTypes": product_types if product_types else None,
                },
            })

        if rows:
            table = {
                "table_id": f"tbl-{uuid.uuid4().hex[:8]}",
                "entity_type": "network",
                "source": "meraki",
                "columns": ["Name", "Product Types", "Time Zone", "Tags"],
                "rows": rows,
            }
            tables.append(table)
            logger.info("extract_network_table: built table with %d rows (id=%s)", len(rows), table["table_id"])
        else:
            logger.warning("extract_network_table: no valid rows extracted from %d networks", len(networks))

    if not tables:
        logger.info("extract_network_table: no network tables extracted from tool results")

    return tables


def _is_device_result(result: dict) -> bool:
    """Check if a tool result contains device data."""
    tool_name = result.get("tool", "")

    # Direct match: device listing tools
    if tool_name.lower().rstrip() in _DEVICE_TOOL_NAMES:
        return True

    # Generic call_meraki_api tool with device method
    if tool_name == "call_meraki_api":
        args = result.get("args", {})
        method = args.get("method", "")
        if method.lower() in _DEVICE_METHOD_NAMES:
            return True

    return False


def extract_device_table(tool_results: list[dict]) -> list[dict]:
    """Find device listing results and build structured table data.

    Returns a list of table_data dicts suitable for sending as WebSocket events.
    """
    tables = []
    logger.info("extract_device_table: scanning %d tool results", len(tool_results))

    for result in tool_results:
        tool_name = result.get("tool", "")

        if not _is_device_result(result):
            continue

        logger.info("extract_device_table: found device result from tool '%s'", tool_name)

        raw = result.get("result", "")
        devices = _parse_result(raw)

        if devices is None:
            logger.warning("extract_device_table: failed to parse result from '%s'", tool_name)
            continue

        # Handle truncated responses
        if isinstance(devices, dict):
            # _preview is used by Meraki MCP for truncated large responses
            sample = devices.get("_preview") or devices.get("_sample") or devices.get("data") or devices.get("results")
            if isinstance(sample, list):
                logger.info("extract_device_table: extracted %d devices from wrapped response", len(sample))
                devices = sample
            else:
                logger.warning("extract_device_table: result is a dict, not a list (keys: %s)",
                               list(devices.keys())[:10])
                # Log error details if this looks like an error response
                if "error" in devices or "message" in devices:
                    logger.error("extract_device_table: API error response: %s", devices)
                continue

        if not isinstance(devices, list):
            logger.warning("extract_device_table: parsed result is %s, not a list", type(devices).__name__)
            continue

        logger.info("extract_device_table: building rows from %d devices", len(devices))

        rows = []
        for dev in devices:
            if not isinstance(dev, dict):
                continue

            serial = dev.get("serial", "")
            name = dev.get("name", "") or serial
            model = dev.get("model", "")
            lan_ip = dev.get("lanIp", "") or dev.get("ip", "")
            status = dev.get("status", "")
            firmware = dev.get("firmware", "")
            tags = dev.get("tags", [])
            notes = dev.get("notes", "")
            network_id = dev.get("networkId", "")

            # Determine status type for coloring
            status_type = "normal"
            if status and status.lower() in ["offline", "alerting", "dormant"]:
                status_type = "error"
            elif firmware and "outdated" in firmware.lower():
                status_type = "warning"

            # Ensure tags is a list
            if isinstance(tags, str):
                tags = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

            rows.append({
                "id": serial,
                "cells": [
                    name,
                    model,
                    serial,
                    lan_ip or "—",
                    status or "Unknown",
                ],
                "status_type": status_type,
                "metadata": {
                    "serial": serial,
                    "deviceName": name,
                    "model": model,
                    "lanIp": lan_ip,
                    "status": status,
                    "firmware": firmware or None,
                    "tags": tags if tags else None,
                    "notes": notes or None,
                    "networkId": network_id or None,
                },
            })

        if rows:
            table = {
                "table_id": f"tbl-{uuid.uuid4().hex[:8]}",
                "entity_type": "device",
                "source": "meraki",
                "columns": ["Name", "Model", "Serial", "IP Address", "Status"],
                "rows": rows,
            }
            tables.append(table)
            logger.info("extract_device_table: built table with %d rows (id=%s)", len(rows), table["table_id"])
        else:
            logger.warning("extract_device_table: no valid rows extracted from %d devices", len(devices))

    if not tables:
        logger.info("extract_device_table: no device tables extracted from tool results")

    return tables


# Tool names for ThousandEyes tests
_TEST_TOOL_NAMES = {
    "list_network_app_synthetics_tests",
    "list_endpoint_agent_tests",
}


def _is_test_result(result: dict) -> bool:
    """Check if a tool result contains ThousandEyes test data."""
    tool_name = result.get("tool", "")
    return tool_name in _TEST_TOOL_NAMES


def extract_test_table(tool_results: list[dict]) -> list[dict]:
    """Find ThousandEyes test listing results and build structured table data.

    Returns a list of table_data dicts suitable for sending as WebSocket events.
    """
    tables = []
    logger.info("extract_test_table: scanning %d tool results", len(tool_results))

    for result in tool_results:
        tool_name = result.get("tool", "")

        if not _is_test_result(result):
            continue

        logger.info("extract_test_table: found test result from tool '%s'", tool_name)

        raw = result.get("result", "")
        parsed = _parse_result(raw)

        if parsed is None:
            logger.warning("extract_test_table: failed to parse result from '%s'", tool_name)
            continue

        # ThousandEyes API returns tests in a wrapper object
        tests = []
        if isinstance(parsed, dict):
            # Common wrapper fields: tests, data, items
            tests = parsed.get("tests") or parsed.get("data") or parsed.get("items") or []
        elif isinstance(parsed, list):
            tests = parsed

        if not isinstance(tests, list):
            logger.warning("extract_test_table: parsed result is %s, not a list", type(tests).__name__)
            continue

        logger.info("extract_test_table: building rows from %d tests", len(tests))

        rows = []
        for test in tests:
            if not isinstance(test, dict):
                continue

            test_id = test.get("testId") or test.get("id", "")
            test_name = test.get("testName") or test.get("name", "")
            test_type = test.get("type", "")
            target = test.get("url") or test.get("server") or test.get("domain") or test.get("target", "")
            enabled = test.get("enabled", True)
            interval = test.get("interval", 0)

            # Get agent count
            agents = test.get("agents") or test.get("agentIds") or []
            agent_count = len(agents) if isinstance(agents, list) else 0

            # Determine status
            status = "Enabled" if enabled else "Disabled"
            status_type = "normal" if enabled else "warning"

            # Format interval (in seconds)
            if interval >= 3600:
                interval_str = f"{interval // 3600}h"
            elif interval >= 60:
                interval_str = f"{interval // 60}m"
            else:
                interval_str = f"{interval}s"

            rows.append({
                "id": str(test_id),
                "cells": [
                    test_name,
                    test_type,
                    target,
                    interval_str,
                    str(agent_count),
                    status,
                ],
                "status_type": status_type,
                "metadata": {
                    "testId": str(test_id),
                    "testName": test_name,
                    "testType": test_type,
                    "target": target,
                    "enabled": enabled,
                    "interval": interval,
                    "agentCount": agent_count,
                },
            })

        if rows:
            table = {
                "table_id": f"tbl-{uuid.uuid4().hex[:8]}",
                "entity_type": "test",
                "source": "thousandeyes",
                "columns": ["Test Name", "Type", "Target", "Interval", "Agents", "Status"],
                "rows": rows,
            }
            tables.append(table)
            logger.info("extract_test_table: built table with %d rows (id=%s)", len(rows), table["table_id"])
        else:
            logger.warning("extract_test_table: no valid rows extracted from %d tests", len(tests))

    if not tables:
        logger.info("extract_test_table: no test tables extracted from tool results")

    return tables


def _parse_result(raw: object) -> object | None:
    """Try to parse a tool result into a Python object."""
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            logger.debug("_parse_result: json.loads failed on string of length %d", len(raw))
            return None
    return None
