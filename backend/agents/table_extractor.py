"""Utility to extract structured table data from raw MCP tool results."""

from __future__ import annotations

import json
import logging
import os
import uuid

logger = logging.getLogger(__name__)

# Device type filters based on model prefixes
_DEVICE_TYPE_PREFIXES = {
    "switch": ["MS", "C9"],  # Meraki switches and Catalyst switches
    "access_point": ["MR", "CW"],  # Meraki and Catalyst Wireless APs
    "ap": ["MR", "CW"],
    "wireless": ["MR", "CW"],
    "appliance": ["MX"],
    "firewall": ["MX"],
    "camera": ["MV"],
    "sensor": ["MT"],
    "gateway": ["MG"],
}

# Tool names and method names that return organization networks
_NETWORK_TOOL_NAMES = {"getOrganizationNetworks", "getorganizationnetworks"}
_NETWORK_METHOD_NAMES = {"getOrganizationNetworks", "getorganizationnetworks"}

# Tool names and method names that return network devices
_DEVICE_TOOL_NAMES = {"getNetworkDevices", "getnetworkdevices", "getOrganizationDevices", "getorganizationdevices"}
_DEVICE_METHOD_NAMES = {"getNetworkDevices", "getnetworkdevices", "getOrganizationDevices", "getorganizationdevices"}

# Tool names that return device statuses (online/offline/alerting)
_DEVICE_STATUS_TOOL_NAMES = {"getOrganizationDevicesStatuses", "getorganizationdevicesstatuses"}

# Tool names and method names that return network clients
_CLIENT_TOOL_NAMES = {"getNetworkClients", "getnetworkclients"}
_CLIENT_METHOD_NAMES = {"getNetworkClients", "getnetworkclients"}


def _read_cached_file(filepath: str) -> list | None:
    """Read full data from a Meraki MCP cached file."""
    try:
        # Handle relative paths - assume they're relative to Meraki Magic MCP directory
        if not os.path.isabs(filepath):
            # Try relative to project root first
            project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            full_path = os.path.join(project_root, "..", "Meraki Magic MCP", filepath)
            if not os.path.exists(full_path):
                # Try as absolute from current directory
                full_path = os.path.abspath(filepath)
        else:
            full_path = filepath

        if not os.path.exists(full_path):
            logger.warning("_read_cached_file: file not found: %s", full_path)
            return None

        with open(full_path, 'r') as f:
            cached = json.load(f)
            # Cached file structure: {"data": [...], "metadata": {...}}
            data = cached.get("data")
            if isinstance(data, list):
                logger.info("_read_cached_file: loaded %d items from %s", len(data), filepath)
                return data
            else:
                logger.warning("_read_cached_file: 'data' field is not a list in %s", filepath)
                return None
    except Exception as e:
        logger.error("_read_cached_file: failed to read %s: %s", filepath, e)
        return None


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
    seen_network_sets = set()  # Track unique sets of network IDs to prevent duplicates
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
            # Check if response was truncated and full data is cached
            if networks.get("_response_truncated") and networks.get("_full_response_cached"):
                cached_file = networks["_full_response_cached"]
                logger.info("extract_network_table: response was truncated, reading full data from %s", cached_file)
                full_data = _read_cached_file(cached_file)
                if full_data is not None:
                    networks = full_data
                else:
                    # Fall back to preview if we can't read the cached file
                    logger.warning("extract_network_table: failed to read cached file, using preview")
                    networks = networks.get("_preview") or []
            else:
                # Check for sample/data fields in wrapped responses
                sample = networks.get("data") or networks.get("results") or networks.get("_preview") or networks.get("_sample")
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
            # Check for duplicate tables by comparing network IDs
            network_ids = frozenset(row["id"] for row in rows)
            if network_ids in seen_network_sets:
                logger.info("extract_network_table: skipping duplicate table with %d networks (already seen this set)", len(rows))
                continue
            seen_network_sets.add(network_ids)

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


def _should_filter_device(model: str, filter_types: list[str]) -> bool:
    """Check if a device model matches any of the filter types."""
    if not filter_types or not model:
        return True  # No filter or no model - include everything

    model_prefix = model[:2].upper()
    for device_type in filter_types:
        type_key = device_type.lower().replace(" ", "_")
        if type_key in _DEVICE_TYPE_PREFIXES:
            if model_prefix in _DEVICE_TYPE_PREFIXES[type_key]:
                return True
    return False


def _extract_network_map(tool_results: list[dict]) -> dict[str, str]:
    """Build a map of network names (lowercase) to networkIds from getOrganizationNetworks results."""
    network_map = {}

    for result in tool_results:
        if not _is_network_result(result):
            continue

        raw = result.get("result", "")
        networks = _parse_result(raw)

        if networks is None:
            continue

        # Handle truncated responses
        if isinstance(networks, dict):
            if networks.get("_response_truncated") and networks.get("_full_response_cached"):
                cached_file = networks["_full_response_cached"]
                full_data = _read_cached_file(cached_file)
                if full_data is not None:
                    networks = full_data
                else:
                    networks = networks.get("_preview") or []
            else:
                sample = networks.get("data") or networks.get("results") or networks.get("_preview")
                if isinstance(sample, list):
                    networks = sample
                else:
                    continue

        if not isinstance(networks, list):
            continue

        for net in networks:
            if isinstance(net, dict):
                name = net.get("name", "").lower()
                network_id = net.get("id", "")
                if name and network_id:
                    network_map[name] = network_id
                    logger.debug("_extract_network_map: mapped '%s' -> %s", name, network_id)

    logger.info("_extract_network_map: built map with %d networks", len(network_map))
    return network_map


def _detect_network_filter(user_query: str, network_map: dict[str, str]) -> str | None:
    """Detect if user is asking for devices in a specific network."""
    if not network_map:
        return None

    query_lower = user_query.lower()

    # Look for network names in the query
    for network_name, network_id in network_map.items():
        if network_name in query_lower:
            logger.info("_detect_network_filter: detected network filter '%s' (id=%s)", network_name, network_id)
            return network_id

    return None


def _extract_device_status_map(tool_results: list[dict]) -> dict[str, str]:
    """Build a serial → status map from getOrganizationDevicesStatuses results."""
    status_map: dict[str, str] = {}

    for result in tool_results:
        tool_name = result.get("tool", "")

        # Check for direct tool match or call_meraki_api with status method
        is_status_tool = tool_name.lower().rstrip() in _DEVICE_STATUS_TOOL_NAMES
        if not is_status_tool and tool_name == "call_meraki_api":
            args = result.get("args", {})
            method = args.get("method", "")
            is_status_tool = method.lower() in _DEVICE_STATUS_TOOL_NAMES

        if not is_status_tool:
            continue

        raw = result.get("result", "")
        parsed = _parse_result(raw)
        if parsed is None:
            continue

        # Handle wrapped responses
        if isinstance(parsed, dict):
            if parsed.get("_response_truncated") and parsed.get("_full_response_cached"):
                full_data = _read_cached_file(parsed["_full_response_cached"])
                if full_data is not None:
                    parsed = full_data
                else:
                    parsed = parsed.get("_preview") or []
            else:
                sample = parsed.get("data") or parsed.get("results") or parsed.get("_preview") or parsed.get("_sample")
                if isinstance(sample, list):
                    parsed = sample
                else:
                    continue

        if not isinstance(parsed, list):
            continue

        for item in parsed:
            if isinstance(item, dict):
                serial = item.get("serial", "")
                status = item.get("status", "")
                if serial and status:
                    status_map[serial] = status

    if status_map:
        logger.info("_extract_device_status_map: built map with %d device statuses", len(status_map))

    return status_map


def extract_device_table(tool_results: list[dict], user_query: str = "") -> list[dict]:
    """Find device listing results and build structured table data.

    Returns a list of table_data dicts suitable for sending as WebSocket events.
    """
    tables = []
    seen_device_sets = set()  # Track unique sets of device IDs to prevent duplicates
    logger.info("extract_device_table: scanning %d tool results", len(tool_results))

    # Detect if user is asking for specific device types
    filter_types = []
    query_lower = user_query.lower()
    for device_type in _DEVICE_TYPE_PREFIXES.keys():
        if device_type in query_lower or device_type.replace("_", " ") in query_lower:
            filter_types.append(device_type)
            logger.info("extract_device_table: detected filter for device type '%s'", device_type)

    # Detect if user is asking for devices in a specific network
    network_map = _extract_network_map(tool_results)
    filter_network_id = _detect_network_filter(user_query, network_map)

    # Detect if user is asking for devices with specific status
    filter_status = None
    if any(term in query_lower for term in ["offline", "down", "not online", "disconnected"]):
        filter_status = ["offline", "dormant"]
        logger.info("extract_device_table: detected filter for offline/dormant devices")
    elif "online" in query_lower and "not online" not in query_lower:
        filter_status = ["online"]
        logger.info("extract_device_table: detected filter for online devices")
    elif "alerting" in query_lower:
        filter_status = ["alerting"]
        logger.info("extract_device_table: detected filter for alerting devices")

    # Build serial → status map from getOrganizationDevicesStatuses results
    device_status_map = _extract_device_status_map(tool_results)

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
            # Check if response was truncated and full data is cached
            if devices.get("_response_truncated") and devices.get("_full_response_cached"):
                cached_file = devices["_full_response_cached"]
                logger.info("extract_device_table: response was truncated, reading full data from %s", cached_file)
                full_data = _read_cached_file(cached_file)
                if full_data is not None:
                    devices = full_data
                else:
                    # Fall back to preview if we can't read the cached file
                    logger.warning("extract_device_table: failed to read cached file, using preview")
                    devices = devices.get("_preview") or []
            else:
                # Check for sample/data fields in wrapped responses
                sample = devices.get("data") or devices.get("results") or devices.get("_preview") or devices.get("_sample")
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
        filtered_count = 0
        network_filtered_count = 0
        status_filtered_count = 0
        for dev in devices:
            if not isinstance(dev, dict):
                continue

            serial = dev.get("serial", "")
            name = dev.get("name", "") or serial
            model = dev.get("model", "")
            network_id = dev.get("networkId", "")

            # Extract status — prefer inline status, fall back to status map
            status = dev.get("status", "") or device_status_map.get(serial, "")

            # Apply device type filter if specified
            if filter_types and not _should_filter_device(model, filter_types):
                filtered_count += 1
                continue

            # Apply network filter if specified
            if filter_network_id and network_id != filter_network_id:
                network_filtered_count += 1
                continue

            # Apply status filter if specified
            if filter_status and status.lower() not in filter_status:
                status_filtered_count += 1
                continue

            lan_ip = dev.get("lanIp", "") or dev.get("ip", "")
            firmware = dev.get("firmware", "")
            tags = dev.get("tags", [])
            notes = dev.get("notes", "")

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
                    status or "—",
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
            # Check for duplicate tables by comparing device IDs
            device_ids = frozenset(row["id"] for row in rows)
            if device_ids in seen_device_sets:
                logger.info("extract_device_table: skipping duplicate table with %d devices (already seen this set)", len(rows))
                continue
            seen_device_sets.add(device_ids)

            if filtered_count > 0:
                logger.info("extract_device_table: filtered out %d devices (not matching requested types)", filtered_count)
            if network_filtered_count > 0:
                logger.info("extract_device_table: filtered out %d devices (not in target network)", network_filtered_count)
            if status_filtered_count > 0:
                logger.info("extract_device_table: filtered out %d devices (not matching requested status)", status_filtered_count)
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
    seen_test_sets = set()  # Track unique sets of test IDs to prevent duplicates
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
            # Check for duplicate tables by comparing test IDs
            test_ids = frozenset(row["id"] for row in rows)
            if test_ids in seen_test_sets:
                logger.info("extract_test_table: skipping duplicate table with %d tests (already seen this set)", len(rows))
                continue
            seen_test_sets.add(test_ids)

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


def _is_client_result(result: dict) -> bool:
    """Check if a tool result contains client data."""
    tool_name = result.get("tool", "")

    # Direct match: client listing tools
    if tool_name.lower().rstrip() in _CLIENT_TOOL_NAMES:
        return True

    # Generic call_meraki_api tool with client method
    if tool_name == "call_meraki_api":
        tool_args = result.get("tool_args", {})
        method = tool_args.get("method", "")
        if method.lower().rstrip() in _CLIENT_METHOD_NAMES:
            return True

    return False


def extract_client_table(tool_results: list[dict]) -> list[dict]:
    """Find getNetworkClients results and build structured table data.

    Returns a list of table_data dicts suitable for sending as WebSocket events.
    """
    tables = []
    seen_client_sets = set()  # Track unique sets of client MACs to prevent duplicates
    logger.info("extract_client_table: scanning %d tool results", len(tool_results))

    for result in tool_results:
        tool_name = result.get("tool", "")

        if not _is_client_result(result):
            continue

        logger.info("extract_client_table: found client result from tool '%s'", tool_name)

        # Extract networkId from tool args if available
        network_id = None
        args = result.get("args", {})
        if isinstance(args, dict):
            network_id = args.get("networkId") or args.get("network_id")

        raw = result.get("result", "")
        clients = _parse_result(raw)

        if clients is None:
            logger.warning("extract_client_table: failed to parse result from '%s' (raw type: %s, length: %s)",
                          tool_name, type(raw).__name__, len(str(raw)))
            continue

        # Handle wrapped responses
        if isinstance(clients, dict):
            # Check for truncated response with cached file
            if clients.get("_response_truncated") and clients.get("_full_response_cached"):
                cached_file = clients["_full_response_cached"]
                full_data = _read_cached_file(cached_file)
                if full_data is not None:
                    clients = full_data
                else:
                    # Use preview data if available
                    clients = clients.get("_preview") or []
            else:
                # Try common wrapper fields
                sample = clients.get("data") or clients.get("results") or clients.get("_preview")
                if isinstance(sample, list):
                    clients = sample
                else:
                    continue

        if not isinstance(clients, list):
            logger.warning("extract_client_table: parsed result is %s, not a list", type(clients).__name__)
            continue

        logger.info("extract_client_table: building rows from %d clients", len(clients))

        rows = []
        for client in clients:
            if not isinstance(client, dict):
                continue

            # Extract client fields
            description = client.get("description") or client.get("hostname") or client.get("dhcpHostname") or ""
            mac = client.get("mac", "")
            ip = client.get("ip") or client.get("ip6", "")
            vlan = str(client.get("vlan", ""))
            manufacturer = client.get("manufacturer", "")

            # Use first seen or last seen
            first_seen = client.get("firstSeen", "")
            last_seen = client.get("lastSeen", "")

            # Status
            status = client.get("status", "Online")

            # SSID for wireless clients
            ssid = client.get("ssid", "")

            # Determine status type for row coloring
            status_type = "normal"
            if status and status.lower() in ["offline"]:
                status_type = "error"

            # Determine connection type from SSID presence
            connection = "Wireless" if ssid else "Wired"

            rows.append({
                "id": mac,  # Use MAC as unique ID
                "cells": [
                    description or mac,  # Description/Hostname
                    mac,  # MAC Address
                    ip,  # IP Address
                    connection,  # Connection type
                    status or "Online",  # Status
                    manufacturer or "-",  # Manufacturer
                ],
                "status_type": status_type,
                "metadata": {
                    "description": description,
                    "mac": mac,
                    "ip": ip,
                    "vlan": vlan,
                    "ssid": ssid,
                    "manufacturer": manufacturer,
                    "status": status,
                    "firstSeen": first_seen,
                    "lastSeen": last_seen,
                    "networkId": network_id,
                },
            })

        if rows:
            # Check for duplicate tables by comparing client MACs
            client_macs = frozenset(row["id"] for row in rows)
            if client_macs in seen_client_sets:
                logger.info("extract_client_table: skipping duplicate table with %d clients (already seen this set)", len(rows))
                continue
            seen_client_sets.add(client_macs)

            table = {
                "table_id": f"tbl-{uuid.uuid4().hex[:8]}",
                "entity_type": "client",
                "source": "meraki",
                "columns": ["Description", "MAC Address", "IP Address", "Connection", "Status", "Manufacturer"],
                "rows": rows,
            }
            tables.append(table)
            logger.info("extract_client_table: built table with %d rows (id=%s)", len(rows), table["table_id"])
        else:
            logger.warning("extract_client_table: no valid rows extracted from %d clients", len(clients))

    if not tables:
        logger.info("extract_client_table: no client tables extracted from tool results")

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
