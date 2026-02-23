"""Utility for safe StreamWriter usage across LangGraph/LangChain versions."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Callable

from langchain_core.messages import ToolMessage

logger = logging.getLogger(__name__)

# Known ThousandEyes tool names (not caught by prefix/substring heuristics)
_TE_TOOLS = frozenset({
    "list_network_app_synthetics_tests", "get_network_app_synthetics_test",
    "get_network_app_synthetics_metrics", "get_endpoint_agent_metrics",
    "get_path_visualization_results", "get_full_path_visualization",
    "get_anomalies", "list_alerts", "get_alert", "get_bgp_route_test_results",
    "list_cloud_enterprise_agents", "list_endpoint_agents",
    "list_endpoint_agent_tests",
})

# Overall timeout for the agentic loop (seconds).
# Prevents agents from running indefinitely when LLM calls or tool calls
# are slow/hanging.  The forced summary will produce a response from
# whatever data was gathered before the timeout.
AGENT_LOOP_TIMEOUT_SEC = 120

# Prompt injected when forcing a summary after incomplete responses
FORCE_SUMMARY_PROMPT = (
    "Based on all the data you have gathered so far, provide your complete analysis now. "
    "Include: a summary of findings, root cause hypothesis (if applicable), and "
    "recommended actions or next steps. Do NOT say you need to check more things — "
    "synthesize what you already have."
)


def safe_writer(writer: Callable | None) -> Callable:
    """Wrap a LangGraph StreamWriter to handle context loss gracefully.

    LangGraph 1.0.x StreamWriter uses get_config() internally which can
    raise RuntimeError if the contextvar is lost after an async LLM call.
    This wrapper catches that error so the agent loop continues.
    """
    def _write(data: Any) -> None:
        if writer is None:
            return
        try:
            writer(data)
        except RuntimeError as e:
            if "outside of a runnable context" in str(e):
                logger.debug("StreamWriter context lost, skipping event: %s", data.get("type", "unknown"))
            else:
                raise
    return _write


def needs_forced_summary(
    response: Any,
    max_iterations: int,
    agent_name: str,
    log: logging.Logger,
    tool_call_count: int = 0,
) -> bool:
    """Check if an agent response is incomplete and needs a forced summary.

    Returns True when:
    - The response is None (LLM call timed out or loop timed out before any call)
    - The agent exhausted all iterations (response still has tool_calls)
    - The response was truncated by max_tokens limit
    - The response has no meaningful text content
    - The response is too short relative to the work done (tool calls made
      but only a sentence or two of output — likely incomplete)
    """
    # Case 0: no response at all (LLM timed out before producing anything)
    if response is None:
        log.warning("%s agent has no response (LLM timeout or loop timeout), forcing summary", agent_name)
        return True

    # Case 1: exhausted iterations — response still wants to call tools
    if response.tool_calls:
        log.warning("%s agent exhausted %d iterations, forcing final summary", agent_name, max_iterations)
        return True

    # Case 2: output truncated by token limit (text cut off mid-sentence)
    stop_reason = getattr(response, "response_metadata", {}).get("stop_reason")
    if stop_reason == "max_tokens":
        log.warning("%s agent response truncated by max_tokens, forcing final summary", agent_name)
        return True

    # Extract text content for length/quality checks
    text = _extract_response_text(response.content)

    # Case 3: response has no text content at all
    if not text:
        log.warning("%s agent produced empty text response, forcing final summary", agent_name)
        return True

    # Case 4: response is suspiciously short given tool calls were made.
    # A proper analysis after calling tools should be more than a single
    # transitional sentence.  Threshold: if the agent made 2+ tool calls
    # but produced fewer than 200 chars, the response is likely incomplete.
    if tool_call_count >= 2 and len(text) < 200:
        log.warning(
            "%s agent produced short response (%d chars) after %d tool calls, forcing final summary",
            agent_name, len(text), tool_call_count,
        )
        return True

    return False


def _extract_response_text(content: Any) -> str:
    """Extract plain text from an AI message content field."""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
            elif hasattr(block, "text"):
                parts.append(block.text)
        return "\n".join(parts).strip()
    return ""


def detect_tool_source(tool_name: str) -> str:
    """Determine whether a tool belongs to Meraki or ThousandEyes."""
    if tool_name.startswith("te_") or "thousandeyes" in tool_name.lower() or tool_name in _TE_TOOLS:
        return "thousandeyes"
    return "meraki"


async def execute_tools_parallel(
    tool_calls: list[dict],
    tools: list,
    emit: Callable,
    tool_results: list[dict],
    messages: list,
    tool_call_timeout: int = 30,
) -> None:
    """Execute multiple tool calls in parallel using asyncio.gather().

    Mutates *tool_results* and *messages* in-place, appending results and
    ToolMessage entries for each completed call.  Emits ``running`` and
    ``complete`` status events via *emit*.
    """
    tool_map = {t.name: t for t in tools}

    # Emit all "running" events upfront
    for tc in tool_calls:
        source = detect_tool_source(tc["name"])
        emit({"type": "tool_call", "tool": tc["name"], "source": source, "status": "running"})

    async def _exec_tool(tc: dict) -> str:
        tool_obj = tool_map.get(tc["name"])
        if not tool_obj:
            return f"Tool {tc['name']} not found"
        # Validate call_meraki_api args before invoking
        if tc["name"] == "call_meraki_api" and not tc["args"].get("method"):
            return "Error: call_meraki_api requires both 'section' and 'method' parameters. Please provide the specific API method name."
        try:
            return await asyncio.wait_for(tool_obj.ainvoke(tc["args"]), timeout=tool_call_timeout)
        except asyncio.TimeoutError:
            logger.error("Tool call timeout: %s exceeded %ds", tc["name"], tool_call_timeout)
            return f"Error: Tool call timed out after {tool_call_timeout} seconds"

    results = await asyncio.gather(*[_exec_tool(tc) for tc in tool_calls])

    for tc, result in zip(tool_calls, results):
        source = detect_tool_source(tc["name"])
        tool_results.append({"tool": tc["name"], "args": tc["args"], "result": result})
        emit({"type": "tool_call", "tool": tc["name"], "source": source, "status": "complete"})
        messages.append(ToolMessage(content=str(result), tool_call_id=tc["id"]))
