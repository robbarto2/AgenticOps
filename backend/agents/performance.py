"""Performance agent - retrieves and analyzes ThousandEyes test metrics and Meraki uplink performance."""

from __future__ import annotations

import asyncio
import logging
import time
import uuid

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage
from langgraph.types import StreamWriter

from agents.state import AgentState
from agents.stream_util import AGENT_LOOP_TIMEOUT_SEC, FORCE_SUMMARY_PROMPT, needs_forced_summary, safe_writer
from agents.table_extractor import extract_test_table, _parse_result
from agents.tools import build_langchain_tools
from config import settings
from mcp_client.manager import mcp_manager
from prompts import load_prompt
from skills.loader import load_skills_for_agent

logger = logging.getLogger(__name__)

# Timeout for individual tool calls (30 seconds)
TOOL_CALL_TIMEOUT_SEC = 30

SYSTEM_PROMPT_TEMPLATE = load_prompt("performance")


async def performance_node(state: AgentState, writer: StreamWriter) -> dict:
    """Retrieve and analyze performance metrics from ThousandEyes and Meraki."""
    emit = safe_writer(writer)
    query = state["user_query"]
    skills_text = load_skills_for_agent("performance")

    llm = ChatAnthropic(
        model=settings.performance_model_name,
        api_key=settings.anthropic_api_key,
        max_tokens=2048,
        timeout=60,
        max_retries=2,
    )

    tools = build_langchain_tools("performance")
    if tools:
        llm_with_tools = llm.bind_tools(tools)
    else:
        llm_with_tools = llm

    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(skills=skills_text)
    messages = [
        SystemMessage(content=system_prompt),
        *state["messages"],
    ]

    agent_events = list(state.get("agent_events", []))
    tool_results: list[dict] = []
    response = None
    batch_fetch_task: asyncio.Task | None = None  # Runs concurrently with LLM

    # Helper: launch parallel batch-fetch of all 4 metrics
    async def _run_batch_fetch() -> list[tuple[str, dict | None]]:
        from datetime import datetime, timedelta, timezone as tz
        end_dt = datetime.now(tz.utc)
        start_dt = end_dt - timedelta(days=1)
        start_str = start_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        end_str = end_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        metric_ids = ("WEB_AVAILABILITY", "WEB_TTFB", "NET_LATENCY", "NET_LOSS")

        async def _fetch_one(mid: str) -> tuple[str, dict | None]:
            try:
                r = await asyncio.wait_for(
                    mcp_manager.call_tool("get_network_app_synthetics_metrics", {
                        "metric_id": mid,
                        "start_date": start_str,
                        "end_date": end_str,
                        "aggregation_type": "MEAN",
                        "group_by": "TEST",
                    }),
                    timeout=15,
                )
                return mid, r
            except Exception as e:
                logger.warning("Performance agent: %s fetch failed: %s", mid, e)
                return mid, None

        return await asyncio.gather(*[_fetch_one(m) for m in metric_ids])

    # Agentic loop: LLM finds tests/resources, metrics batch-fetched concurrently
    max_iterations = 6
    loop_start = time.time()
    for _ in range(max_iterations):
        if time.time() - loop_start > AGENT_LOOP_TIMEOUT_SEC:
            logger.warning("Performance agent hit %ds loop timeout", AGENT_LOOP_TIMEOUT_SEC)
            break
        try:
            response = await asyncio.wait_for(
                llm_with_tools.ainvoke(messages), timeout=30
            )
        except asyncio.TimeoutError:
            logger.error("Performance agent: LLM call timed out after 30s")
            break
        messages.append(response)

        # Check if the LLM wants to call tools
        if not response.tool_calls:
            break

        for tool_call in response.tool_calls:
            tool_name = tool_call["name"]
            tool_args = tool_call["args"]

            source = "meraki"
            if tool_name.startswith("te_") or "thousandeyes" in tool_name.lower():
                source = "thousandeyes"
            te_tools = {
                "list_network_app_synthetics_tests", "get_network_app_synthetics_test",
                "get_network_app_synthetics_metrics", "get_endpoint_agent_metrics",
                "get_path_visualization_results", "get_full_path_visualization",
                "get_anomalies", "list_alerts", "get_bgp_route_test_results",
                "list_cloud_enterprise_agents", "list_endpoint_agents",
                "list_endpoint_agent_tests",
            }
            if tool_name in te_tools:
                source = "thousandeyes"

            emit({
                "type": "tool_call",
                "tool": tool_name,
                "source": source,
                "status": "running",
            })

            matching_tools = [t for t in tools if t.name == tool_name]
            if matching_tools:
                try:
                    result = await asyncio.wait_for(
                        matching_tools[0].ainvoke(tool_args),
                        timeout=TOOL_CALL_TIMEOUT_SEC
                    )
                except asyncio.TimeoutError:
                    logger.error("Tool call timeout: %s(%s) exceeded %d seconds", tool_name, tool_args, TOOL_CALL_TIMEOUT_SEC)
                    result = f"Error: Tool call timed out after {TOOL_CALL_TIMEOUT_SEC} seconds"
            else:
                result = f"Tool {tool_name} not found"

            tool_results.append({
                "tool": tool_name,
                "args": tool_args,
                "result": result,
            })

            emit({
                "type": "tool_call",
                "tool": tool_name,
                "source": source,
                "status": "complete",
            })

            from langchain_core.messages import ToolMessage
            messages.append(ToolMessage(content=str(result), tool_call_id=tool_call["id"]))

        # Start batch-fetch as soon as we have test results (runs while LLM continues)
        if batch_fetch_task is None and mcp_manager.te_connected:
            has_test_results = any(
                "test" in r.get("tool", "").lower() and "metrics" not in r.get("tool", "").lower()
                for r in tool_results
            )
            if has_test_results:
                logger.info("Performance agent: starting batch-fetch concurrently with LLM")
                emit({"type": "tool_call", "tool": "get_network_app_synthetics_metrics", "source": "thousandeyes", "status": "running"})
                batch_fetch_task = asyncio.create_task(_run_batch_fetch())

    # If the response is incomplete, force a summary
    if needs_forced_summary(response, max_iterations, "Performance", logger, len(tool_results)):
        from langchain_core.messages import AIMessage, HumanMessage
        messages.append(HumanMessage(content=FORCE_SUMMARY_PROMPT))
        try:
            response = await asyncio.wait_for(llm.ainvoke(messages), timeout=30)
        except Exception:
            logger.error("Performance forced summary also failed")
            response = AIMessage(content="I was unable to complete the analysis in time. Please try again with a more specific query.")
        messages.append(response)

    # Advance plan step for multi-agent routing
    plan_step = state.get("plan_step", 0)

    # Collect batch-fetch results (already running in background since the loop)
    if batch_fetch_task is not None:
        try:
            batch_results = await asyncio.wait_for(batch_fetch_task, timeout=20)
            for mid, metrics_result in batch_results:
                if metrics_result is None:
                    continue
                content = metrics_result.get("content", "")
                is_error = "error" in metrics_result or (isinstance(content, str) and content.strip().lower().startswith("error"))
                if not is_error and content:
                    tool_results.append({"tool": "get_network_app_synthetics_metrics", "args": {"metric_id": mid, "_batch": True}, "result": content})
                    logger.info("Performance agent: batch-fetched %s OK", mid)
        except Exception as e:
            logger.warning("Performance agent: batch-fetch collection failed: %s", e)
        emit({"type": "tool_call", "tool": "get_network_app_synthetics_metrics", "source": "thousandeyes", "status": "complete"})

    # Extract interactive tables from ThousandEyes test data if present
    table_data = extract_test_table(tool_results)
    if table_data:
        logger.info("Performance agent: extracted %d interactive tables", len(table_data))

    # Build visual chart cards from metrics data
    logger.info("Performance agent: %d tool_results before chart extraction. Tools: %s",
                len(tool_results),
                [(r.get("tool", "?"), list(r.get("args", {}).keys())) for r in tool_results])
    chart_cards = _extract_performance_charts(tool_results, query)
    if chart_cards:
        logger.info("Performance agent: built %d chart cards", len(chart_cards))

    return {
        "messages": [response],
        "tool_results": tool_results,
        "agent_events": agent_events,
        "table_data": table_data,
        "cards": chart_cards or [],
        "plan_step": plan_step + 1,
    }


def _extract_performance_charts(tool_results: list[dict], query: str) -> list[dict]:
    """Build line_chart cards from ThousandEyes metrics data.

    Handles the CSV format returned by ThousandEyes batch metrics API:
    ``{"names": {...}, "csv": "r,n,TEST,v,m\\n..."}``

    Columns: r (round/timestamp), n (agents), TEST (test_id), v (value), m (margin).
    """

    # Mapping from ThousandEyes metric_id → chart grouping info
    # WEB_AVAILABILITY excluded from charts (flat 100% line isn't useful visually)
    _METRIC_CHART_INFO: dict[str, dict] = {
        "NET_LATENCY": {"group": "timing", "label": "Latency (ms)", "color": "#06b6d4"},
        "WEB_TTFB": {"group": "timing", "label": "Response Time (ms)", "color": "#6366f1"},
        "WEB_PAGE_LOAD": {"group": "timing", "label": "Page Load (ms)", "color": "#8b5cf6"},
        "DNS_SERVER_TIME": {"group": "timing", "label": "DNS Time (ms)", "color": "#a855f7"},
        "NET_LOSS": {"group": "health", "label": "Packet Loss (%)", "color": "#ef4444"},
    }

    test_name = ""
    target_test_id = ""

    # Per-metric time-series: {metric_id: {timestamp: value}}
    metric_series: dict[str, dict[str, float]] = {}

    for result in tool_results:
        tool_name = result.get("tool", "")
        args = result.get("args", {})

        # Extract test name and ID from test detail results
        if "test" in tool_name.lower() and "metrics" not in tool_name.lower():
            parsed = _parse_result(result.get("result", ""))
            if isinstance(parsed, dict):
                test_obj = parsed.get("test") or parsed
                if isinstance(test_obj, dict):
                    test_name = test_obj.get("testName", "") or test_obj.get("name", "") or test_name
                    if not target_test_id:
                        tid = test_obj.get("testId") or test_obj.get("id") or ""
                        if tid:
                            target_test_id = str(tid)
            continue

        # Only process metrics results
        if "metrics" not in tool_name.lower():
            continue

        metric_id = args.get("metric_id", "")

        parsed = _parse_result(result.get("result", ""))
        if parsed is None:
            logger.debug("_extract_performance_charts: parse returned None for %s", tool_name)
            continue

        # Log what we found for debugging
        parsed_type = type(parsed).__name__
        parsed_keys = list(parsed.keys())[:10] if isinstance(parsed, dict) else "N/A"
        logger.info("_extract_performance_charts: metrics result from %s | metric_id=%s | type=%s | keys=%s",
                     tool_name, metric_id, parsed_type, parsed_keys)

        # --- CSV format: {"names": {...}, "csv": "header\nrow1\n..."} ---
        # Column layout varies depending on API parameters:
        #   group_by=TEST  →  "r,n,TEST,v,m"  (5 cols, test ID at index 2)
        #   filter by test →  "r,n,v,m"        (4 cols, no TEST column)
        #   other variants →  parse header dynamically
        if isinstance(parsed, dict) and "csv" in parsed:
            csv_str = parsed["csv"]
            lines = csv_str.strip().split("\n")
            if len(lines) <= 1:
                logger.debug("_extract_performance_charts: CSV %s has only header, no data rows", metric_id)
                continue

            # Parse header to find column positions
            header = lines[0].split(",")
            header_lower = [h.strip().lower() for h in header]
            r_idx = header_lower.index("r") if "r" in header_lower else 0
            v_idx = header_lower.index("v") if "v" in header_lower else -1
            test_idx = header_lower.index("test") if "test" in header_lower else -1

            if v_idx < 0:
                logger.warning("_extract_performance_charts: CSV %s header has no 'v' column: %s", metric_id, header)
                continue

            logger.info("_extract_performance_charts: CSV %s header=%s (r=%d, v=%d, test=%d), %d data rows",
                        metric_id, header, r_idx, v_idx, test_idx, len(lines) - 1)

            series_key = metric_id or tool_name
            ts_map: dict[str, float] = {}

            for line in lines[1:]:  # Skip header
                parts = line.split(",")
                if len(parts) <= v_idx:
                    continue

                timestamp = parts[r_idx].strip()
                val_str = parts[v_idx].strip()

                # Filter by test ID if the TEST column exists
                if test_idx >= 0 and len(parts) > test_idx:
                    tid = parts[test_idx].strip()
                    if target_test_id and tid != target_test_id:
                        continue
                    if not target_test_id:
                        target_test_id = tid

                if timestamp and val_str:
                    try:
                        ts_map[timestamp] = float(val_str)
                    except ValueError:
                        pass

            if ts_map:
                metric_series[series_key] = ts_map
                logger.info("_extract_performance_charts: CSV %s → %d data points for test %s",
                            metric_id, len(ts_map), target_test_id)
            else:
                logger.warning("_extract_performance_charts: CSV %s parsed but no data points extracted", metric_id)
            continue

    if not metric_series:
        logger.info("_extract_performance_charts: no time-series data found")
        return []

    # Collect all unique timestamps across all series, sorted
    all_timestamps: set[str] = set()
    for ts_map in metric_series.values():
        all_timestamps.update(ts_map.keys())
    sorted_timestamps = sorted(all_timestamps)

    if not sorted_timestamps:
        return []

    # Format timestamps as HH:MM labels (frontend handles tick spacing)
    from datetime import datetime, timedelta, timezone as tz
    labels: list[str] = []
    all_numeric = all(ts.replace(".", "").isdigit() for ts in sorted_timestamps)
    if all_numeric and sorted_timestamps:
        # Numeric round IDs from ThousandEyes — generate HH:MM labels for 24h window
        end_dt = datetime.now(tz.utc)
        n = len(sorted_timestamps)
        start_dt = end_dt - timedelta(days=1)
        for i in range(n):
            t = start_dt + timedelta(seconds=i * 86400 / n)
            labels.append(t.strftime("%H:%M"))
    else:
        for ts in sorted_timestamps:
            if "T" in ts:
                labels.append(ts.split("T")[1][:5])  # "HH:MM"
            else:
                labels.append(ts)
    display_labels = labels

    title_prefix = test_name or "Test"
    cards: list[dict] = []

    # Group datasets by chart type (timing vs health)
    timing_datasets: list[dict] = []
    health_datasets: list[dict] = []

    for mid, ts_map in metric_series.items():
        chart_info = _METRIC_CHART_INFO.get(mid)
        if not chart_info:
            chart_info = {"group": "timing", "label": mid, "color": "#6366f1"}

        data = [ts_map.get(ts, 0) for ts in sorted_timestamps]
        dataset = {
            "label": chart_info["label"],
            "data": data,
            "color": chart_info["color"],
        }

        if chart_info["group"] == "health":
            health_datasets.append(dataset)
        else:
            timing_datasets.append(dataset)

    # Card 1: Timing metrics (latency, response time, etc.)
    if timing_datasets:
        cards.append({
            "id": f"card-{uuid.uuid4().hex[:8]}",
            "type": "line_chart",
            "title": f"{title_prefix} \u2014 Response Time",
            "source": "thousandeyes",
            "data": {
                "labels": display_labels,
                "datasets": timing_datasets,
            },
        })

    # Card 2: Packet loss
    if health_datasets:
        cards.append({
            "id": f"card-{uuid.uuid4().hex[:8]}",
            "type": "line_chart",
            "title": f"{title_prefix} \u2014 Packet Loss",
            "source": "thousandeyes",
            "data": {
                "labels": display_labels,
                "datasets": health_datasets,
            },
        })

    logger.info(
        "_extract_performance_charts: built %d cards from %d metric series, %d time points (test=%s)",
        len(cards), len(metric_series), len(sorted_timestamps), test_name,
    )
    return cards
