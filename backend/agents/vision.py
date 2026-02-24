"""Vision agent - image analysis with concurrent org device context enrichment."""

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


async def _fetch_org_context(emit) -> tuple[list, list]:
    """Fetch device statuses and networks in parallel (2 calls, not 3).

    ``getOrganizationDevicesStatuses`` returns name, serial, model,
    networkId AND status — so we skip the separate ``getOrganizationDevices``
    call entirely.

    Returns (statuses, networks).  Each is an empty list on failure.
    """
    if not mcp_manager.meraki_connected:
        logger.info("Vision enrichment skipped: Meraki MCP not connected")
        return [], []

    statuses_result: list = []
    networks_result: list = []

    async def _fetch(tool_name: str, args: dict, label: str, target: list) -> None:
        emit({"type": "tool_call", "tool": tool_name, "source": "meraki", "status": "running"})
        try:
            result = await asyncio.wait_for(
                mcp_manager.call_tool(tool_name, args), timeout=_ENRICHMENT_TIMEOUT,
            )
            if result and not result.get("error"):
                parsed = _parse_json(result.get("content", ""))
                if isinstance(parsed, list):
                    target.extend(parsed)
                    logger.info("Vision enrichment: fetched %s OK (%d items)", label, len(parsed))
        except Exception as e:
            logger.warning("Vision enrichment: %s fetch failed: %s", label, e)
        emit({"type": "tool_call", "tool": tool_name, "source": "meraki", "status": "complete"})

    await asyncio.gather(
        _fetch("getOrganizationDevicesStatuses", {}, "device statuses", statuses_result),
        _fetch("getOrganizationNetworks", {}, "org networks", networks_result),
    )

    return statuses_result, networks_result


def _correlate_devices(
    ai_text: str, statuses: list, networks: list,
) -> str:
    """Find device names mentioned in the AI response and return a correlation table.

    Runs in <1ms — pure string matching, no LLM call.
    """
    if not ai_text or not statuses:
        return ""

    # Build network name lookup
    network_map: dict[str, str] = {}
    for net in networks:
        if isinstance(net, dict):
            net_id = net.get("id", "")
            net_name = net.get("name", "")
            if net_id and net_name:
                network_map[net_id] = net_name

    # Match device names against the AI response text
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
        # Strip product-type suffixes from network names
        if net_name:
            net_name = re.sub(
                r"\s*-\s*(wireless|appliance|switch|camera|sensor)$",
                "", net_name, flags=re.IGNORECASE,
            )
        matches.append({
            "name": name,
            "serial": serial,
            "model": dev.get("model", ""),
            "network": net_name,
            "status": dev.get("status", "unknown"),
        })

    if not matches:
        return ""

    section = "\n\n---\n**Device Inventory Match**\n\n"
    section += "| Device | Serial | Model | Network | Status |\n"
    section += "|--------|--------|-------|---------|--------|\n"
    for m in matches:
        section += f"| {m['name']} | `{m['serial']}` | {m['model']} | {m['network']} | {m['status']} |\n"
    return section


async def vision_node(state: AgentState, writer: StreamWriter) -> dict:
    """Analyze images with Claude vision + concurrent org device enrichment.

    Performance: enrichment and LLM run in parallel via asyncio.gather,
    so total time = max(enrichment, LLM) instead of enrichment + LLM.
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
    (statuses, networks), response = await asyncio.gather(
        _fetch_org_context(emit),
        llm.ainvoke(llm_messages),
    )

    emit({"type": "tool_call", "tool": "image_analysis", "source": "meraki", "status": "complete"})

    # Programmatic device correlation — instant, no second LLM call
    if statuses and isinstance(response.content, str):
        correlation = _correlate_devices(response.content, statuses, networks)
        if correlation:
            response = AIMessage(
                content=response.content + correlation,
                id=response.id,
                response_metadata=getattr(response, "response_metadata", {}),
            )
            logger.info("Vision agent: appended device correlation (%d devices matched)", correlation.count("`"))

    logger.info("Vision agent completed analysis for query: %s", query[:100])

    return {
        "messages": [response],
        "tool_results": [],
        "agent_events": [],
        "table_data": [],
        "plan_step": plan_step + 1,
    }
