"""Testing agent - runs on-demand ThousandEyes instant tests and analyzes results."""

from __future__ import annotations

import asyncio
import logging
import time

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage
from langgraph.types import StreamWriter

from agents.state import AgentState
from agents.stream_util import AGENT_LOOP_TIMEOUT_SEC, FORCE_SUMMARY_PROMPT, execute_tools_parallel, needs_forced_summary, safe_writer
from agents.tools import build_langchain_tools
from config import settings
from prompts import load_prompt
from skills.loader import load_skills_for_agent

logger = logging.getLogger(__name__)

# Timeout for individual tool calls (30 seconds)
TOOL_CALL_TIMEOUT_SEC = 30

SYSTEM_PROMPT_TEMPLATE = load_prompt("testing")


async def testing_node(state: AgentState, writer: StreamWriter) -> dict:
    """Execute on-demand testing for the user query."""
    emit = safe_writer(writer)
    query = state["user_query"]
    skills_text = load_skills_for_agent("testing")

    llm = ChatAnthropic(
        model=settings.testing_model_name,
        api_key=settings.anthropic_api_key,
        max_tokens=2048,
        timeout=60,
        max_retries=2,
    )

    tools = build_langchain_tools("testing")
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

    # Agentic loop: let the LLM call tools iteratively
    max_iterations = 10
    loop_start = time.time()
    for _ in range(max_iterations):
        if time.time() - loop_start > AGENT_LOOP_TIMEOUT_SEC:
            logger.warning("Testing agent hit %ds loop timeout", AGENT_LOOP_TIMEOUT_SEC)
            break
        try:
            response = await asyncio.wait_for(
                llm_with_tools.ainvoke(messages), timeout=60
            )
        except asyncio.TimeoutError:
            logger.error("Testing agent: LLM call timed out after 60s")
            break
        messages.append(response)

        if not response.tool_calls:
            break

        await execute_tools_parallel(
            response.tool_calls, tools, emit, tool_results, messages, TOOL_CALL_TIMEOUT_SEC
        )

    # If the response is incomplete (exhausted iterations, truncated, or empty),
    # do one more LLM call WITHOUT tools to force a proper summary.
    if needs_forced_summary(response, max_iterations, "Testing", logger, len(tool_results)):
        from langchain_core.messages import AIMessage, HumanMessage
        messages.append(HumanMessage(content=FORCE_SUMMARY_PROMPT))
        try:
            response = await asyncio.wait_for(llm.ainvoke(messages), timeout=60)
        except Exception:
            logger.error("Testing forced summary also failed")
            response = AIMessage(content="I was unable to complete the analysis in time. Please try again with a more specific query.")
        messages.append(response)

    # Advance plan step for multi-agent routing
    plan_step = state.get("plan_step", 0)

    return {
        "messages": [response],
        "tool_results": tool_results,
        "agent_events": agent_events,
        "plan_step": plan_step + 1,
    }
