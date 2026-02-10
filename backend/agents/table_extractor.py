"""Utility to extract structured table data from raw MCP tool results."""

from __future__ import annotations

import json
import logging
import uuid

logger = logging.getLogger(__name__)

# Tool names and method names that return organization networks
_NETWORK_TOOL_NAMES = {"getOrganizationNetworks", "getorganizationnetworks"}
_NETWORK_METHOD_NAMES = {"getOrganizationNetworks", "getorganizationnetworks"}


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
            sample = networks.get("_sample") or networks.get("data") or networks.get("results")
            if isinstance(sample, list):
                logger.info("extract_network_table: extracted %d networks from wrapped response", len(sample))
                networks = sample
            else:
                logger.warning("extract_network_table: result is a dict, not a list (keys: %s)",
                               list(networks.keys())[:10])
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
            logger.debug("extract_network_table: json.loads failed on string of length %d", len(raw))
            return None
    return None
