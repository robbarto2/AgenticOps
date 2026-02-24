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
    "router": ["MX"],
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
        # Build a list of candidate paths to try
        candidates: list[str] = []

        if os.path.isabs(filepath):
            candidates.append(filepath)
        else:
            # Try relative to Meraki Magic MCP directory
            project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            candidates.append(os.path.join(project_root, "..", "Meraki Magic MCP", filepath))
            # Try relative to project root
            candidates.append(os.path.join(project_root, "..", filepath))
            # Try as absolute from current directory
            candidates.append(os.path.abspath(filepath))

        full_path = None
        for candidate in candidates:
            if os.path.exists(candidate):
                full_path = candidate
                break

        if not full_path:
            logger.warning("_read_cached_file: file not found (tried %d paths): %s", len(candidates), filepath)
            return None

        with open(full_path, 'r') as f:
            cached = json.load(f)
            # Cached file structure: {"data": [...], "metadata": {...}} or just a list
            if isinstance(cached, list):
                logger.info("_read_cached_file: loaded %d items (raw list) from %s", len(cached), filepath)
                return cached
            data = cached.get("data")
            if isinstance(data, list):
                logger.info("_read_cached_file: loaded %d items from %s", len(data), filepath)
                return data
            else:
                logger.warning("_read_cached_file: 'data' field is not a list in %s (keys: %s)", filepath, list(cached.keys())[:5])
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


def _extract_network_device_counts(tool_results: list[dict]) -> dict[str, dict]:
    """Build a networkId → {total, online, offline, alerting} map from getOrganizationDevicesStatuses."""
    counts: dict[str, dict] = {}

    for result in tool_results:
        tool_name = result.get("tool", "")

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
            if not isinstance(item, dict):
                continue
            net_id = item.get("networkId", "")
            status = (item.get("status") or "").lower()
            if not net_id:
                continue

            if net_id not in counts:
                counts[net_id] = {"total": 0, "online": 0, "offline": 0, "alerting": 0}

            counts[net_id]["total"] += 1
            if status == "online":
                counts[net_id]["online"] += 1
            elif status == "offline" or status == "dormant":
                counts[net_id]["offline"] += 1
            elif status == "alerting":
                counts[net_id]["alerting"] += 1

    if counts:
        logger.info("_extract_network_device_counts: built counts for %d networks", len(counts))

    return counts


def _extract_network_wan_alerts(tool_results: list[dict]) -> dict[str, dict]:
    """Build networkId → {failed: int, not_connected: int} from uplink status data."""
    alerts: dict[str, dict] = {}

    for result in tool_results:
        if not _is_uplink_result(result):
            continue

        raw = result.get("result", "")
        parsed = _parse_result(raw)
        if parsed is None:
            continue

        # Handle wrapped/truncated responses
        if isinstance(parsed, dict):
            if parsed.get("_response_truncated") and parsed.get("_full_response_cached"):
                full_data = _read_cached_file(parsed["_full_response_cached"])
                if full_data is not None:
                    parsed = full_data
                else:
                    parsed = parsed.get("_preview") or []
            else:
                sample = (parsed.get("data") or parsed.get("results")
                          or parsed.get("_preview") or parsed.get("_sample"))
                if isinstance(sample, list):
                    parsed = sample
                else:
                    continue

        if not isinstance(parsed, list):
            continue

        for item in parsed:
            if not isinstance(item, dict):
                continue
            net_id = item.get("networkId", "")
            if not net_id:
                continue
            uplinks = item.get("uplinks", [])
            if not isinstance(uplinks, list):
                continue
            for uplink in uplinks:
                if not isinstance(uplink, dict):
                    continue
                status = (uplink.get("status") or "").lower()
                if status in ("failed", "not connected"):
                    if net_id not in alerts:
                        alerts[net_id] = {"failed": 0, "not_connected": 0}
                    if status == "failed":
                        alerts[net_id]["failed"] += 1
                    else:
                        alerts[net_id]["not_connected"] += 1

    if alerts:
        logger.info("_extract_network_wan_alerts: found WAN alerts in %d networks: %s", len(alerts), alerts)
    return alerts


def _detect_network_health_filter(user_query: str) -> str | None:
    """Detect if user is asking for networks filtered by device health.

    Returns:
        "alerting" - networks with alerting devices
        "offline"  - networks with offline devices
        "problems" - networks with any unhealthy devices (offline or alerting)
        None       - no health filter requested
    """
    if not user_query:
        return None

    q = user_query.lower()

    if any(term in q for term in ["alerting", "alert", "alerts"]):
        return "alerting"
    if any(term in q for term in ["offline", "down", "not online", "disconnected"]):
        return "offline"
    if any(term in q for term in ["problem", "problems", "issue", "issues", "unhealthy"]):
        return "problems"

    return None


def extract_network_table(tool_results: list[dict], user_query: str = "") -> list[dict]:
    """Find getOrganizationNetworks results and build structured table data.

    Returns a list of table_data dicts suitable for sending as WebSocket events.
    """
    tables = []
    seen_network_sets = set()  # Track unique sets of network IDs to prevent duplicates
    logger.info("extract_network_table: scanning %d tool results", len(tool_results))

    # Build per-network device counts from status data
    device_counts = _extract_network_device_counts(tool_results)

    # Build per-network WAN uplink alerts (failed / not connected)
    wan_alerts = _extract_network_wan_alerts(tool_results)

    # Detect health filter from user query
    health_filter = _detect_network_health_filter(user_query)
    if health_filter:
        logger.info("extract_network_table: detected health filter '%s'", health_filter)

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

            # Look up device counts for this network
            net_counts = device_counts.get(network_id, {})
            device_total = net_counts.get("total")
            device_offline = net_counts.get("offline")
            device_alerting = net_counts.get("alerting")
            device_online = net_counts.get("online")

            # Look up WAN uplink alerts for this network
            net_wan = wan_alerts.get(network_id, {})
            wan_failed = net_wan.get("failed", 0)
            wan_not_connected = net_wan.get("not_connected", 0)

            # Build WAN status cell text
            if wan_failed > 0:
                wan_cell = f"{wan_failed} failed"
            elif wan_not_connected > 0:
                wan_cell = f"{wan_not_connected} down"
            else:
                wan_cell = ""

            # Determine row highlight based on device health AND WAN status
            if device_offline and device_offline > 0:
                status_type = "error"
            elif wan_failed > 0:
                status_type = "error"
            elif device_alerting and device_alerting > 0:
                status_type = "warning"
            elif wan_not_connected > 0:
                status_type = "warning"
            else:
                status_type = "normal"

            # Apply health filter — skip networks that don't match
            if health_filter:
                has_offline = bool(device_offline and device_offline > 0)
                has_alerting = bool(device_alerting and device_alerting > 0)
                has_wan_alert = wan_failed > 0 or wan_not_connected > 0

                if health_filter == "alerting" and not (has_alerting or has_wan_alert):
                    continue
                elif health_filter == "offline" and not has_offline:
                    continue
                elif health_filter == "problems" and not (has_offline or has_alerting or has_wan_alert):
                    continue

            rows.append({
                "id": network_id,
                "cells": [
                    name,
                    ", ".join(product_types) if isinstance(product_types, list) else str(product_types),
                    str(device_online) if device_online is not None else "—",
                    str(device_offline) if device_offline is not None else "—",
                    str(device_alerting) if device_alerting is not None else "—",
                    wan_cell,
                    ", ".join(tags) if tags else "",
                ],
                "status_type": status_type,
                "metadata": {
                    "networkId": network_id,
                    "notes": notes or None,
                    "tags": tags if tags else None,
                    "timeZone": time_zone or None,
                    "productTypes": product_types if product_types else None,
                    "deviceTotal": device_total,
                    "onlineCount": device_online,
                    "offlineCount": device_offline,
                    "alertingCount": device_alerting,
                    "wanFailed": wan_failed if wan_failed else None,
                    "wanNotConnected": wan_not_connected if wan_not_connected else None,
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
                "columns": ["Name", "Product Types", "Active", "Offline", "Alerting", "WAN", "Tags"],
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


def _extract_device_info_map(tool_results: list[dict]) -> dict[str, dict]:
    """Build a serial → {status, lanIp} map from getOrganizationDevicesStatuses results.

    Extracts both status and IP address data so they can be used as fallbacks
    when the main device listing response doesn't include these fields
    (common with truncated MCP responses).
    """
    info_map: dict[str, dict] = {}

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
                if not serial:
                    continue
                status = item.get("status", "")
                lan_ip = item.get("lanIp", "") or item.get("ip", "")
                if status or lan_ip:
                    info_map[serial] = {
                        "status": status,
                        "lanIp": lan_ip,
                    }

    if info_map:
        logger.info("_extract_device_info_map: built map with %d device entries", len(info_map))

    return info_map


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
    if any(term in query_lower for term in ["offline", "down", "not online", "disconnected", "inactive", "dormant"]):
        filter_status = ["offline", "dormant"]
        logger.info("extract_device_table: detected filter for offline/dormant/inactive devices")
    elif "online" in query_lower and "not online" not in query_lower:
        filter_status = ["online"]
        logger.info("extract_device_table: detected filter for online devices")
    elif any(term in query_lower for term in ["alerting", "alert", "alerts"]):
        filter_status = ["alerting"]
        logger.info("extract_device_table: detected filter for alerting devices")

    # Build serial → {status, lanIp} map from getOrganizationDevicesStatuses results
    device_info_map = _extract_device_info_map(tool_results)

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

            # Extract status and IP — prefer inline data, fall back to status endpoint map
            device_info = device_info_map.get(serial, {})
            status = dev.get("status", "") or device_info.get("status", "")

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

            lan_ip = dev.get("lanIp", "") or dev.get("ip", "") or device_info.get("lanIp", "")
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


# Tool names and method names that return appliance uplink statuses
_UPLINK_TOOL_NAMES = {"getOrganizationApplianceUplinkStatuses", "getorganizationapplianceuplinkstatuses"}
_UPLINK_METHOD_NAMES = {"getOrganizationApplianceUplinkStatuses", "getorganizationapplianceuplinkstatuses"}


def _is_uplink_result(result: dict) -> bool:
    """Check if a tool result contains appliance uplink status data."""
    tool_name = result.get("tool", "")

    # Direct match
    if tool_name.lower().rstrip() in _UPLINK_TOOL_NAMES:
        return True

    # Generic call_meraki_api tool with uplink method
    if tool_name == "call_meraki_api":
        args = result.get("args", {})
        method = args.get("method", "")
        if method.lower() in _UPLINK_METHOD_NAMES:
            return True

    return False


def _extract_device_name_map(tool_results: list[dict]) -> dict[str, str]:
    """Build a serial → device name map from any device listing results in tool_results."""
    name_map: dict[str, str] = {}

    for result in tool_results:
        if not _is_device_result(result):
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
                name = item.get("name", "")
                if serial and name:
                    name_map[serial] = name

    if name_map:
        logger.info("_extract_device_name_map: built map with %d device names", len(name_map))

    return name_map


def _extract_network_name_map(tool_results: list[dict]) -> dict[str, str]:
    """Build a networkId → network name map from any network listing results in tool_results."""
    name_map: dict[str, str] = {}

    for result in tool_results:
        if not _is_network_result(result):
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
                sample = parsed.get("data") or parsed.get("results") or parsed.get("_preview")
                if isinstance(sample, list):
                    parsed = sample
                else:
                    continue

        if not isinstance(parsed, list):
            continue

        for item in parsed:
            if isinstance(item, dict):
                net_id = item.get("id", "")
                name = item.get("name", "")
                if net_id and name:
                    name_map[net_id] = name

    if name_map:
        logger.info("_extract_network_name_map: built map with %d network names", len(name_map))

    return name_map


def extract_uplink_table(tool_results: list[dict]) -> list[dict]:
    """Find getOrganizationApplianceUplinkStatuses results and build structured table data.

    Each appliance may have multiple uplinks; we flatten to one row per uplink interface.
    Returns a list of table_data dicts suitable for sending as WebSocket events.
    """
    tables = []
    seen_sets: set[frozenset] = set()
    logger.info("extract_uplink_table: scanning %d tool results", len(tool_results))

    # Build helper maps for human-readable names
    device_name_map = _extract_device_name_map(tool_results)
    network_name_map = _extract_network_name_map(tool_results)

    for result in tool_results:
        if not _is_uplink_result(result):
            continue

        logger.info("extract_uplink_table: found uplink result from tool '%s'", result.get("tool", ""))

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

        logger.info("extract_uplink_table: building rows from %d appliance records", len(parsed))

        rows = []
        for item in parsed:
            if not isinstance(item, dict):
                continue

            serial = item.get("serial", "")
            network_id = item.get("networkId", "")
            model = item.get("model", "")
            device_name = device_name_map.get(serial, serial)
            network_name = network_name_map.get(network_id, network_id)

            uplinks = item.get("uplinks", [])
            if not isinstance(uplinks, list):
                continue

            for uplink in uplinks:
                if not isinstance(uplink, dict):
                    continue

                interface = uplink.get("interface", "")
                status = uplink.get("status", "")
                ip = uplink.get("ip") or ""
                gateway = uplink.get("gateway") or ""
                public_ip = uplink.get("publicIp") or ""
                provider = uplink.get("provider") or uplink.get("isp") or ""

                # Determine row status type
                status_lower = status.lower() if status else ""
                if status_lower == "failed":
                    status_type = "error"
                elif status_lower in ("not connected", "connecting"):
                    status_type = "warning"
                else:
                    status_type = "normal"

                row_id = f"{serial}-{interface}"
                rows.append({
                    "id": row_id,
                    "cells": [
                        device_name,
                        network_name,
                        interface,
                        status or "—",
                        ip or "—",
                        public_ip or "—",
                        provider or "—",
                    ],
                    "status_type": status_type,
                    "metadata": {
                        "serial": serial,
                        "deviceName": device_name,
                        "networkId": network_id,
                        "networkName": network_name,
                        "model": model,
                        "interface": interface,
                        "status": status,
                        "ip": ip,
                        "gateway": gateway,
                        "publicIp": public_ip,
                        "provider": provider,
                    },
                })

        if rows:
            row_ids = frozenset(row["id"] for row in rows)
            if row_ids in seen_sets:
                logger.info("extract_uplink_table: skipping duplicate table with %d rows", len(rows))
                continue
            seen_sets.add(row_ids)

            table = {
                "table_id": f"tbl-{uuid.uuid4().hex[:8]}",
                "entity_type": "uplink",
                "source": "meraki",
                "columns": ["Device", "Network", "Interface", "Status", "IP", "Public IP", "Provider"],
                "rows": rows,
            }
            tables.append(table)
            logger.info("extract_uplink_table: built table with %d rows (id=%s)", len(rows), table["table_id"])
        else:
            logger.warning("extract_uplink_table: no valid rows extracted")

    if not tables:
        logger.info("extract_uplink_table: no uplink tables extracted from tool results")

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


def _avg_metric(data_points: list[dict], *keys: str) -> float | None:
    """Compute the average of a metric across data points, trying multiple key names."""
    values = []
    for dp in data_points:
        if not isinstance(dp, dict):
            continue
        for key in keys:
            val = dp.get(key)
            if val is not None:
                try:
                    values.append(float(val))
                except (ValueError, TypeError):
                    pass
                break
    return sum(values) / len(values) if values else None


def _extract_test_metrics_map(tool_results: list[dict]) -> dict[str, dict]:
    """Build a test_id → metrics map from get_network_app_synthetics_metrics results.

    Handles batch results (grouped by TEST, with metric_id in args) as well as
    legacy per-test results.

    Returns dict with keys: avgLatency, packetLoss, availability, hasAlerts
    """
    metrics_map: dict[str, dict] = {}

    # Mapping from ThousandEyes metric_id enum → our internal metric key
    _METRIC_KEY_MAP = {
        "NET_LATENCY": "avgLatency",
        "WEB_TTFB": "avgLatency",
        "WEB_PAGE_LOAD": "avgLatency",
        "DNS_SERVER_TIME": "avgLatency",
        "NET_LOSS": "packetLoss",
        "WEB_AVAILABILITY": "availability",
    }

    for result in tool_results:
        tool_name = result.get("tool", "")
        if "metrics" not in tool_name.lower():
            continue

        raw = result.get("result", "")
        parsed = _parse_result(raw)
        if parsed is None:
            logger.debug("_extract_test_metrics_map: parse failed for '%s'", tool_name)
            continue

        args = result.get("args", {})
        metric_id = args.get("metric_id", "")
        our_key = _METRIC_KEY_MAP.get(metric_id)

        # --- Batch mode: metric_id in args, response grouped by TEST ---
        if metric_id and our_key:
            # ThousandEyes returns CSV format: {"names": {...}, "csv": "r,n,TEST,v,m\n..."}
            if isinstance(parsed, dict) and "csv" in parsed:
                csv_str = parsed["csv"]
                # Parse CSV: columns are r (round), n (agents), TEST (test_id), v (value), m (margin)
                lines = csv_str.strip().split("\n")
                if len(lines) > 1:
                    # Accumulate values per test_id for averaging
                    test_values: dict[str, list[float]] = {}
                    for line in lines[1:]:  # Skip header
                        parts = line.split(",")
                        if len(parts) >= 4:
                            tid = parts[2].strip()
                            val_str = parts[3].strip()
                            if tid and val_str:
                                try:
                                    test_values.setdefault(tid, []).append(float(val_str))
                                except ValueError:
                                    pass
                    # Compute averages and store in metrics_map
                    for tid, vals in test_values.items():
                        if not vals:
                            continue
                        avg_val = sum(vals) / len(vals)
                        if tid not in metrics_map:
                            metrics_map[tid] = {"avgLatency": None, "packetLoss": None, "availability": None, "hasAlerts": False}
                        # Don't overwrite latency if we already have it (WEB_TTFB takes priority)
                        if our_key == "avgLatency" and metrics_map[tid].get("avgLatency") is not None:
                            continue
                        metrics_map[tid][our_key] = avg_val
                    logger.info("_extract_test_metrics_map: CSV batch %s → %d test values", metric_id, len(test_values))
            continue

        # --- Legacy per-test mode: testId in args ---
        test_id = args.get("testId") or args.get("testid") or args.get("test_id")
        if not test_id:
            continue

        avg_latency = None
        packet_loss = None
        availability = None

        metrics_payload = parsed
        if isinstance(parsed, dict):
            metrics_payload = parsed.get("metrics") or parsed.get("data") or parsed.get("results") or parsed

        if isinstance(metrics_payload, list) and metrics_payload:
            avg_latency = _avg_metric(metrics_payload, "avgResponseTime", "responseTime", "avgLatency", "averageLatency", "totalTime", "waitTime")
            packet_loss = _avg_metric(metrics_payload, "loss", "packetLoss", "errorCount")
            availability = _avg_metric(metrics_payload, "availability")
        elif isinstance(metrics_payload, dict):
            avg_latency = metrics_payload.get("avgResponseTime") or metrics_payload.get("responseTime") or metrics_payload.get("avgLatency")
            packet_loss = metrics_payload.get("loss") or metrics_payload.get("packetLoss")
            availability = metrics_payload.get("availability")
            try: avg_latency = float(avg_latency) if avg_latency is not None else None
            except (ValueError, TypeError): avg_latency = None
            try: packet_loss = float(packet_loss) if packet_loss is not None else None
            except (ValueError, TypeError): packet_loss = None
            try: availability = float(availability) if availability is not None else None
            except (ValueError, TypeError): availability = None

        if avg_latency is not None or packet_loss is not None or availability is not None:
            metrics_map[str(test_id)] = {"avgLatency": avg_latency, "packetLoss": packet_loss, "availability": availability, "hasAlerts": False}

    logger.info("_extract_test_metrics_map: extracted metrics for %d tests", len(metrics_map))
    return metrics_map


def _build_agent_lookup(tool_results: list[dict]) -> dict[str, dict]:
    """Build agentId → {agentName, location} map from agent listing tool results."""
    agent_map: dict[str, dict] = {}
    _agent_tool_names = {"list_cloud_enterprise_agents", "list_endpoint_agents"}
    for result in tool_results:
        if result.get("tool", "") not in _agent_tool_names:
            continue
        raw = result.get("result", "")
        parsed = _parse_result(raw)
        if parsed is None:
            continue
        agents = []
        if isinstance(parsed, dict):
            agents = parsed.get("agents") or parsed.get("data") or parsed.get("items") or []
        elif isinstance(parsed, list):
            agents = parsed
        for ag in agents:
            if not isinstance(ag, dict):
                continue
            aid = str(ag.get("agentId", ag.get("id", "")))
            if aid:
                agent_map[aid] = {
                    "agentName": ag.get("agentName") or ag.get("name") or ag.get("agentLabel") or "",
                    "location": ag.get("location") or ag.get("countryId") or ag.get("country") or "",
                }
    if agent_map:
        logger.info("_build_agent_lookup: built lookup with %d agents", len(agent_map))
    return agent_map


def extract_test_table(tool_results: list[dict], *, active_only: bool = False) -> list[dict]:
    """Find ThousandEyes test listing results and build structured table data.

    Args:
        tool_results: List of tool result dicts from the agent loop.
        active_only: If True, only include tests where enabled=True.

    Returns a list of table_data dicts suitable for sending as WebSocket events.
    """
    tables = []
    seen_test_sets = set()  # Track unique sets of test IDs to prevent duplicates
    logger.info("extract_test_table: scanning %d tool results", len(tool_results))

    # Build test_id → metrics map from get_network_app_synthetics_metrics results
    test_metrics_map = _extract_test_metrics_map(tool_results)

    # Build agentId → {name, location} lookup from agent listing results
    agent_lookup = _build_agent_lookup(tool_results)

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

            test_id = test.get("testId") or test.get("testid") or test.get("id", "")
            test_name = test.get("testName") or test.get("name", "")
            test_type = test.get("type", "")
            target = test.get("url") or test.get("server") or test.get("domain") or test.get("target", "")
            enabled = test.get("enabled", True)
            interval = test.get("interval", 0)

            # Skip disabled tests when active_only is requested
            if active_only and not enabled:
                continue

            # Get agents with details
            raw_agents = test.get("agents") or test.get("agentIds") or []
            agent_count = len(raw_agents) if isinstance(raw_agents, list) else 0
            # Build structured agent list for display (name + location)
            agent_details = []
            if isinstance(raw_agents, list) and raw_agents:
                logger.info("extract_test_table: test '%s' raw_agents[0] type=%s value=%s",
                            test_name, type(raw_agents[0]).__name__, str(raw_agents[0])[:200])
                for ag in raw_agents:
                    if isinstance(ag, dict):
                        aid = str(ag.get("agentId", ag.get("id", "")))
                        # Try to get name from the agent object first, then fall back to lookup
                        name = ag.get("agentName") or ag.get("name") or ag.get("agentLabel") or ""
                        location = ag.get("location") or ag.get("countryId") or ag.get("country") or ""
                        if (not name) and aid and aid in agent_lookup:
                            name = agent_lookup[aid].get("agentName", "")
                            location = location or agent_lookup[aid].get("location", "")
                        agent_details.append({
                            "agentId": aid,
                            "agentName": name or f"Agent {aid}",
                            "location": location,
                        })
                    elif isinstance(ag, (int, str)):
                        # Agent is just an ID — look up details from agent listing
                        aid = str(ag)
                        lookup = agent_lookup.get(aid, {})
                        agent_details.append({
                            "agentId": aid,
                            "agentName": lookup.get("agentName") or f"Agent {aid}",
                            "location": lookup.get("location", ""),
                        })

            # Get metrics if available
            metrics = test_metrics_map.get(str(test_id), {})
            avg_latency = metrics.get("avgLatency")
            packet_loss = metrics.get("packetLoss")
            availability = metrics.get("availability")

            # Format metrics for display
            latency_str = f"{avg_latency:.1f}ms" if avg_latency is not None else "—"
            loss_str = f"{packet_loss:.2f}%" if packet_loss is not None else "—"

            # Determine status
            status = "Enabled" if enabled else "Disabled"

            # Set status_type based on performance thresholds
            perf_alert = False
            if avg_latency is not None and avg_latency > 150:
                perf_alert = True
            if packet_loss is not None and packet_loss > 1:
                perf_alert = True

            if perf_alert:
                status_type = "error"  # Red row for poor performance
            elif not enabled:
                status_type = "warning"  # Amber row for disabled tests
            else:
                status_type = "normal"

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
                    latency_str,
                    loss_str,
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
                    "agents": agent_details,
                    "avgLatency": round(avg_latency, 1) if avg_latency is not None else None,
                    "packetLoss": round(packet_loss, 2) if packet_loss is not None else None,
                    "availability": round(availability, 2) if availability is not None else None,
                    "perfAlert": perf_alert,
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
                "columns": ["Test Name", "Type", "Target", "Avg Latency", "Packet Loss", "Agents", "Status"],
                "rows": rows,
            }
            tables.append(table)
            logger.info("extract_test_table: built table with %d rows (id=%s)", len(rows), table["table_id"])
        else:
            logger.warning("extract_test_table: no valid rows extracted from %d tests", len(tests))

    if not tables:
        logger.info("extract_test_table: no test tables extracted from tool results")

    return tables


async def ensure_agent_list(tool_results: list[dict]) -> None:
    """Fetch ThousandEyes agent list if not already in tool_results.

    This is needed to map agent IDs to names/locations in test tables.
    Call this before extract_test_table() to ensure agent details are available.
    """
    import asyncio
    from mcp_client.manager import mcp_manager

    _agent_tools = {"list_cloud_enterprise_agents", "list_endpoint_agents"}
    has_agents = any(r.get("tool", "") in _agent_tools for r in tool_results)
    if has_agents or not mcp_manager.te_connected:
        return

    try:
        result = await asyncio.wait_for(
            mcp_manager.call_tool("list_cloud_enterprise_agents", {}),
            timeout=15,
        )
        content = result.get("content", "")
        if content and "error" not in result:
            tool_results.append({
                "tool": "list_cloud_enterprise_agents",
                "args": {},
                "result": content,
            })
            logger.info("ensure_agent_list: fetched agent list OK (len=%d)", len(content))
    except Exception as e:
        logger.warning("ensure_agent_list: agent list fetch failed: %s", e)


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


# ---------------------------------------------------------------------------
# SSID table builder
# ---------------------------------------------------------------------------

# Tool names and method names that return SSID data
_SSID_TOOL_NAMES = {"getnetworkwirelessssids"}
_SSID_METHOD_NAMES = {"getnetworkwirelessssids"}


def _is_ssid_result(result: dict) -> bool:
    """Check if a tool result contains SSID data."""
    tool_name = result.get("tool", "")

    if tool_name.lower().rstrip() in _SSID_TOOL_NAMES:
        return True

    if tool_name == "call_meraki_api":
        args = result.get("args", {})
        method = args.get("method", "")
        if method.lower() in _SSID_METHOD_NAMES:
            return True

    return False


def extract_ssid_table(tool_results: list[dict]) -> list[dict]:
    """Find getNetworkWirelessSsids results and build structured table data.

    Returns a list of table_data dicts suitable for sending as WebSocket events.
    """
    tables = []
    seen_sets: set[frozenset] = set()
    logger.info("extract_ssid_table: scanning %d tool results", len(tool_results))

    # Build networkId → name lookup
    network_name_map = _extract_network_name_map(tool_results)

    all_rows = []
    for result in tool_results:
        if not _is_ssid_result(result):
            continue

        logger.info("extract_ssid_table: found SSID result from tool '%s'", result.get("tool", ""))

        # Extract networkId from tool args
        args = result.get("args", {})
        network_id = (args.get("networkId") or args.get("network_id")
                       or args.get("parameters", {}).get("networkId", ""))

        raw = result.get("result", "")
        ssids = _parse_result(raw)

        if ssids is None:
            continue

        # Handle wrapped responses
        if isinstance(ssids, dict):
            if ssids.get("_response_truncated") and ssids.get("_full_response_cached"):
                full_data = _read_cached_file(ssids["_full_response_cached"])
                if full_data is not None:
                    ssids = full_data
                else:
                    ssids = ssids.get("_preview") or []
            else:
                sample = ssids.get("data") or ssids.get("results") or ssids.get("_preview")
                if isinstance(sample, list):
                    ssids = sample
                else:
                    continue

        if not isinstance(ssids, list):
            continue

        network_name = network_name_map.get(network_id, "")
        if not network_name and network_id:
            # Friendly fallback for raw IDs
            import re as _re
            if _re.match(r'^[LN]_\d', network_id):
                network_name = f"Network ...{network_id[-4:]}"
            else:
                network_name = network_id
        # Strip product type suffixes
        if network_name:
            import re as _re
            network_name = _re.sub(r'\s*-\s*(wireless|appliance|switch|camera|sensor)$', '', network_name, flags=_re.I)

        for ssid in ssids:
            if not isinstance(ssid, dict):
                continue

            name = ssid.get("name", "")
            number = ssid.get("number", 0)
            enabled = ssid.get("enabled", False)
            auth_mode = ssid.get("authMode", "")
            encryption = ssid.get("encryptionMode", "")
            band = ssid.get("bandSelection", "")
            vlan = ssid.get("defaultVlanId") or ssid.get("vlanId")
            ip_assignment = ssid.get("ipAssignmentMode", "")

            # Skip unconfigured placeholder SSIDs (default "Unconfigured SSID N")
            if name.startswith("Unconfigured SSID"):
                continue

            # Determine row status
            is_open = auth_mode.lower() == "open" if auth_mode else False
            if is_open and enabled:
                status_type = "error"
            elif not enabled:
                status_type = "warning"
            else:
                status_type = "normal"

            row_id = f"{network_id}:{number}" if network_id else f"ssid:{number}"
            all_rows.append({
                "id": row_id,
                "cells": [
                    network_name or "\u2014",
                    name,
                    "Yes" if enabled else "No",
                    auth_mode or "\u2014",
                    band or "\u2014",
                    str(vlan) if vlan is not None else "\u2014",
                ],
                "status_type": status_type,
                "metadata": {
                    "networkId": network_id,
                    "networkName": network_name,
                    "ssidNumber": number,
                    "ssidName": name,
                    "enabled": enabled,
                    "authMode": auth_mode or None,
                    "encryptionMode": encryption or None,
                    "bandSelection": band or None,
                    "vlanId": vlan,
                    "ipAssignmentMode": ip_assignment or None,
                },
            })

    if all_rows:
        row_ids = frozenset(r["id"] for r in all_rows)
        if row_ids not in seen_sets:
            seen_sets.add(row_ids)
            table = {
                "table_id": f"tbl-{uuid.uuid4().hex[:8]}",
                "entity_type": "ssid",
                "source": "meraki",
                "columns": ["Network", "SSID Name", "Enabled", "Auth Mode", "Band", "VLAN"],
                "rows": all_rows,
            }
            tables.append(table)
            logger.info("extract_ssid_table: built table with %d rows (id=%s)", len(all_rows), table["table_id"])
    else:
        logger.info("extract_ssid_table: no SSID tables extracted from tool results")

    return tables


# ---------------------------------------------------------------------------
# Topology card builder
# ---------------------------------------------------------------------------

# Tool/method names for LLDP/CDP neighbor data
_LLDP_CDP_TOOL_NAMES = {"getdevicelldpcdp"}


def _is_lldp_cdp_result(result: dict) -> bool:
    """Check if a tool result contains LLDP/CDP neighbor data."""
    tool_name = result.get("tool", "")

    # Direct match: getDeviceLldpCdp
    if tool_name.lower().rstrip() in _LLDP_CDP_TOOL_NAMES:
        return True

    # call_meraki_api with LLDP/CDP path (e.g. /devices/{serial}/lldpCdp)
    if tool_name == "call_meraki_api":
        args = result.get("args", {})
        path = args.get("path", "")
        if "lldpCdp" in path or "lldpcdp" in path.lower():
            return True

    return False


def _extract_serial_from_lldp_args(result: dict) -> str | None:
    """Extract the device serial from an LLDP/CDP tool call's arguments."""
    args = result.get("args", {})

    # call_meraki_api: path = /devices/{serial}/lldpCdp
    path = args.get("path", "")
    if path:
        parts = path.strip("/").split("/")
        if len(parts) >= 2 and parts[0] == "devices":
            return parts[1]

    # getDeviceLldpCdp direct tool: serial in args
    serial = args.get("serial", "")
    if serial:
        return serial

    return None


def _normalize_mac(mac: str) -> str:
    """Normalize MAC address to uppercase, no separators."""
    return mac.upper().replace(":", "").replace("-", "").replace(".", "")


def _model_to_topology_type(model: str) -> str:
    """Map Meraki model prefix to topology device type string."""
    if not model:
        return "unknown"
    prefix = model[:2].upper()
    mapping = {
        "MX": "mx",
        "MS": "ms",
        "MR": "mr",
        "MV": "mv",
        "MG": "mg",
        "MT": "mt",
        "CW": "mr",  # Catalyst Wireless → AP
        "C9": "ms",  # Catalyst 9K → switch
    }
    return mapping.get(prefix, "unknown")


def _resolve_neighbor(
    port_data: dict,
    serial_set: set[str],
    mac_to_serial: dict[str, str],
    ip_to_serial: dict[str, str],
    name_to_serial: dict[str, str],
) -> str | None:
    """Try to resolve an LLDP/CDP neighbor entry to a known device serial."""

    # --- LLDP data ---
    lldp = port_data.get("lldp") or {}
    if lldp:
        # 1. chassisId (usually the neighbor's MAC)
        chassis_id = lldp.get("chassisId", "")
        if chassis_id:
            normalized = _normalize_mac(chassis_id)
            if normalized in mac_to_serial:
                return mac_to_serial[normalized]

        # 2. managementAddress (IP)
        mgmt_addr = lldp.get("managementAddress", "")
        if mgmt_addr and mgmt_addr in ip_to_serial:
            return ip_to_serial[mgmt_addr]

        # 3. systemName (hostname)
        sys_name = lldp.get("systemName", "")
        if sys_name:
            name_lower = sys_name.lower()
            if name_lower in name_to_serial:
                return name_to_serial[name_lower]

    # --- CDP data ---
    cdp = port_data.get("cdp") or {}
    if cdp:
        # 1. deviceId — may be a serial, hostname, or FQDN
        device_id = cdp.get("deviceId", "")
        if device_id:
            # Try as exact serial
            if device_id in serial_set:
                return device_id
            # Try as hostname (strip FQDN)
            device_id_lower = device_id.lower().split(".")[0]
            if device_id_lower in name_to_serial:
                return name_to_serial[device_id_lower]

        # 2. address (IP)
        addr = cdp.get("address", "")
        if addr and addr in ip_to_serial:
            return ip_to_serial[addr]

    return None


def _extract_all_devices(tool_results: list[dict]) -> list[dict]:
    """Extract the device list from getNetworkDevices results in tool_results."""
    for result in tool_results:
        if not _is_device_result(result):
            continue

        raw = result.get("result", "")
        parsed = _parse_result(raw)
        if parsed is None:
            continue

        # Handle wrapped/truncated responses
        if isinstance(parsed, dict):
            if parsed.get("_response_truncated") and parsed.get("_full_response_cached"):
                full_data = _read_cached_file(parsed["_full_response_cached"])
                if full_data is not None:
                    parsed = full_data
                else:
                    parsed = parsed.get("_preview") or []
            else:
                sample = (
                    parsed.get("data")
                    or parsed.get("results")
                    or parsed.get("_preview")
                    or parsed.get("_sample")
                )
                if isinstance(sample, list):
                    parsed = sample
                else:
                    continue

        if isinstance(parsed, list) and parsed:
            return parsed

    return []


def _extract_topology_network_name(tool_results: list[dict], devices: list[dict]) -> str:
    """Determine the network name from tool results or device data."""
    # Try network name map first
    name_map = _extract_network_name_map(tool_results)
    if name_map and devices:
        # All devices in a topology query share the same networkId
        network_id = None
        for d in devices:
            nid = d.get("networkId", "")
            if nid:
                network_id = nid
                break
        if network_id and network_id in name_map:
            return name_map[network_id]

    # Fallback: check if any device has a networkName field
    for d in devices:
        name = d.get("networkName", "")
        if name:
            return name

    return ""


def extract_topology_card(tool_results: list[dict]) -> dict | None:
    """Parse topology agent tool_results and build a topology card dict.

    Returns a complete card dict ready to send to the frontend, or None
    if there is insufficient data (no devices found).
    """
    # 1. Extract device list
    devices = _extract_all_devices(tool_results)
    if not devices:
        logger.info("extract_topology_card: no devices found in tool results")
        return None

    logger.info("extract_topology_card: found %d devices", len(devices))

    # 2. Build lookup maps for neighbor resolution
    serial_set: set[str] = set()
    mac_to_serial: dict[str, str] = {}
    ip_to_serial: dict[str, str] = {}
    name_to_serial: dict[str, str] = {}

    for d in devices:
        serial = d.get("serial", "")
        if not serial:
            continue
        serial_set.add(serial)
        mac = d.get("mac", "")
        if mac:
            mac_to_serial[_normalize_mac(mac)] = serial
        lan_ip = d.get("lanIp", "")
        if lan_ip:
            ip_to_serial[lan_ip] = serial
        name = d.get("name", "")
        if name:
            name_to_serial[name.lower()] = serial

    # 3. Build status map (from getOrganizationDevicesStatuses if available)
    device_info_map = _extract_device_info_map(tool_results)

    # 4. Build nodes
    nodes: list[dict] = []
    for d in devices:
        serial = d.get("serial", "")
        if not serial:
            continue
        model = d.get("model", "")
        device_type = _model_to_topology_type(model)
        # Prefer status from status map, fall back to device data, then default
        status = (device_info_map.get(serial, {}).get("status") or d.get("status") or "online").lower()
        if status not in ("online", "offline", "dormant"):
            status = "online"
        nodes.append({
            "id": serial,
            "label": d.get("name", "") or serial,
            "deviceType": device_type,
            "status": status,
            "ip": d.get("lanIp", ""),
            "model": model,
            "serial": serial,
        })

    if not nodes:
        logger.info("extract_topology_card: no valid nodes built")
        return None

    # 5. Build links from LLDP/CDP results
    links: list[dict] = []
    seen_links: set[frozenset[str]] = set()

    for result in tool_results:
        if not _is_lldp_cdp_result(result):
            continue

        source_serial = _extract_serial_from_lldp_args(result)
        if not source_serial or source_serial not in serial_set:
            continue

        raw = result.get("result", "")
        parsed = _parse_result(raw)
        if not isinstance(parsed, dict):
            continue

        ports = parsed.get("ports", {})
        if not isinstance(ports, dict):
            continue

        for port_id, port_data in ports.items():
            if not isinstance(port_data, dict):
                continue

            neighbor_serial = _resolve_neighbor(
                port_data, serial_set, mac_to_serial, ip_to_serial, name_to_serial
            )
            if not neighbor_serial or neighbor_serial not in serial_set:
                continue

            # Skip self-links
            if neighbor_serial == source_serial:
                continue

            # Deduplicate bidirectional links (A→B and B→A = one link)
            link_key = frozenset([source_serial, neighbor_serial])
            if link_key in seen_links:
                continue
            seen_links.add(link_key)

            # Extract remote port and speed from LLDP/CDP neighbor data
            lldp_data = port_data.get("lldp") or {}
            cdp_data = port_data.get("cdp") or {}
            remote_port = (
                lldp_data.get("portId", "")
                or cdp_data.get("portId", "")
                or ""
            )

            # Build label showing local → remote port
            if remote_port and remote_port != port_id:
                label = f"{port_id} → {remote_port}"
            else:
                label = port_id

            # Try to extract speed from portDescription or systemCapabilities
            speed = ""
            port_desc = lldp_data.get("portDescription", "")
            if port_desc:
                # portDescription often contains speed, e.g. "GigabitEthernet0/1"
                desc_lower = port_desc.lower()
                if "10-gig" in desc_lower or "tengig" in desc_lower or "10gbase" in desc_lower:
                    speed = "10 Gbps"
                elif "gigabit" in desc_lower or "1gbase" in desc_lower:
                    speed = "1 Gbps"
                elif "fast" in desc_lower or "100base" in desc_lower:
                    speed = "100 Mbps"

            link_entry: dict = {
                "source": source_serial,
                "target": neighbor_serial,
                "linkType": "wired",
                "label": label,
            }
            if speed:
                link_entry["speed"] = speed
            links.append(link_entry)

    logger.info(
        "extract_topology_card: built %d links from LLDP/CDP data", len(links)
    )

    # 6. Fallback star topology if no LLDP/CDP links found
    if not links:
        logger.info("extract_topology_card: no LLDP/CDP links, building fallback star topology")
        mx_nodes = [n for n in nodes if n["deviceType"] == "mx"]
        ms_nodes = [n for n in nodes if n["deviceType"] == "ms"]
        mr_nodes = [n for n in nodes if n["deviceType"] == "mr"]
        other_nodes = [n for n in nodes if n["deviceType"] not in ("mx", "ms", "mr")]

        # MX at center
        if mx_nodes:
            center = mx_nodes[0]["id"]
            for ms in ms_nodes:
                links.append({"source": center, "target": ms["id"], "linkType": "wired"})
            # APs connect to first switch (or MX if no switches)
            ap_parent = ms_nodes[0]["id"] if ms_nodes else center
            for mr in mr_nodes:
                links.append({"source": ap_parent, "target": mr["id"], "linkType": "wired"})
            for other in other_nodes:
                links.append({"source": center, "target": other["id"], "linkType": "wired"})
        elif ms_nodes:
            # No MX: first switch as center
            center = ms_nodes[0]["id"]
            for ms in ms_nodes[1:]:
                links.append({"source": center, "target": ms["id"], "linkType": "wired"})
            for mr in mr_nodes:
                links.append({"source": center, "target": mr["id"], "linkType": "wired"})
            for other in other_nodes:
                links.append({"source": center, "target": other["id"], "linkType": "wired"})

    # 7. Add internet node for MX/gateway devices (with per-interface uplink status)
    mx_serials = [n["id"] for n in nodes if n["deviceType"] == "mx"]
    if mx_serials:
        nodes.append({
            "id": "internet",
            "label": "Internet",
            "deviceType": "internet",
            "status": "online",
        })

        # Build serial → [{interface, status}] map from uplink status data
        uplink_status_map: dict[str, list[dict]] = {}
        for result in tool_results:
            if not _is_uplink_result(result):
                continue
            raw = result.get("result", "")
            parsed = _parse_result(raw)
            if parsed is None:
                continue
            # Handle wrapped/truncated responses
            if isinstance(parsed, dict):
                if parsed.get("_response_truncated") and parsed.get("_full_response_cached"):
                    full_data = _read_cached_file(parsed["_full_response_cached"])
                    if full_data is not None:
                        parsed = full_data
                    else:
                        parsed = parsed.get("_preview") or []
                else:
                    sample = (parsed.get("data") or parsed.get("results")
                              or parsed.get("_preview") or parsed.get("_sample"))
                    if isinstance(sample, list):
                        parsed = sample
                    else:
                        continue
            if not isinstance(parsed, list):
                continue
            for item in parsed:
                if not isinstance(item, dict):
                    continue
                serial = item.get("serial", "")
                if not serial:
                    continue
                uplinks = item.get("uplinks", [])
                if not isinstance(uplinks, list):
                    continue
                for uplink in uplinks:
                    if not isinstance(uplink, dict):
                        continue
                    iface = uplink.get("interface", "")
                    status = uplink.get("status", "")
                    if iface:
                        uplink_status_map.setdefault(serial, []).append({
                            "interface": iface,
                            "status": status,
                        })

        logger.info(
            "extract_topology_card: uplink_status_map has %d serials: %s",
            len(uplink_status_map),
            {s: [(u["interface"], u["status"]) for u in ul] for s, ul in uplink_status_map.items()},
        )

        # Create WAN links — per-interface if uplink data available, generic otherwise
        for mx_serial in mx_serials:
            uplinks = uplink_status_map.get(mx_serial)
            if uplinks:
                for ul in uplinks:
                    links.append({
                        "source": "internet",
                        "target": mx_serial,
                        "linkType": "wan",
                        "label": ul["interface"],
                        "speed": ul["status"],
                        "status": ul["status"].lower() if ul["status"] else "",
                    })
            else:
                # Fallback: generic WAN link when no uplink status data
                links.append({
                    "source": "internet",
                    "target": mx_serial,
                    "linkType": "wan",
                    "label": "WAN",
                })

    # 8. Extract network name
    network_name = _extract_topology_network_name(tool_results, devices)

    # 9. Build card
    card = {
        "id": f"topo-{uuid.uuid4().hex[:8]}",
        "type": "topology",
        "title": f"Network Topology — {network_name}" if network_name else "Network Topology",
        "source": "meraki",
        "data": {
            "nodes": nodes,
            "links": links,
            "networkName": network_name or "",
        },
    }

    logger.info(
        "extract_topology_card: built card with %d nodes, %d links (network=%s)",
        len(nodes), len(links), network_name,
    )
    return card


def _parse_result(raw: object) -> object | None:
    """Try to parse a tool result into a Python object."""
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        text = raw
        # Strip the item-count prefix injected by _inject_item_count in tools.py
        # e.g. "[Total items returned: 32]\n{...}" or "[Total items in 'tests': 5]\n{...}"
        if text.startswith("[Total items"):
            newline_idx = text.find("\n")
            if newline_idx >= 0:
                text = text[newline_idx + 1:]
        try:
            return json.loads(text)
        except (json.JSONDecodeError, ValueError):
            logger.debug("_parse_result: json.loads failed on string of length %d", len(text))
            return None
    return None
