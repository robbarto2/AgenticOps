"""Remediation agent - executes write/mutation operations with user confirmation."""

from __future__ import annotations

import asyncio
import logging

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.types import StreamWriter

from agents.state import AgentState
from agents.stream_util import execute_tools_parallel, safe_writer
from agents.tools import build_langchain_tools
from config import settings
from prompts import load_prompt
from skills.loader import load_skills_for_agent

logger = logging.getLogger(__name__)

# Timeout for individual tool calls (60 seconds)
TOOL_CALL_TIMEOUT_SEC = 60

SYSTEM_PROMPT_TEMPLATE = load_prompt("remediation")


async def remediation_node(state: AgentState, writer: StreamWriter) -> dict:
    """Execute remediation with a two-phase confirmation pattern.

    Phase 1 (proposal): Gather context, formulate change plan, present to user.
    Phase 2 (execution): After user confirms, execute the write operations.

    When pending_confirmation is set with approved=True, we're in Phase 2.
    Otherwise we're in Phase 1.
    """
    query = state["user_query"]
    skills_text = load_skills_for_agent("remediation")
    emit = safe_writer(writer)
    pending = state.get("pending_confirmation") or {}

    llm = ChatAnthropic(
        model=settings.model_name,
        api_key=settings.anthropic_api_key,
        max_tokens=4096,
        timeout=120,
        max_retries=1,
    )

    tools = build_langchain_tools("remediation")
    if tools:
        llm_with_tools = llm.bind_tools(tools)
    else:
        llm_with_tools = llm

    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(skills=skills_text)

    # If we have approval, inject confirmation context into messages
    if pending.get("approved"):
        messages = [
            SystemMessage(content=system_prompt),
            *state["messages"],
            HumanMessage(content=(
                "The user has APPROVED the proposed change. "
                "Proceed to execute the write operations now. "
                "After executing, verify the change was applied."
            )),
        ]
        logger.info("Remediation agent: executing approved change")
    else:
        messages = [
            SystemMessage(content=system_prompt),
            *state["messages"],
        ]

    agent_events = list(state.get("agent_events", []))
    tool_results: list[dict] = []

    # Agentic loop
    max_iterations = 10
    for _ in range(max_iterations):
        response = await llm_with_tools.ainvoke(messages)
        messages.append(response)

        if not response.tool_calls:
            break

        await execute_tools_parallel(
            response.tool_calls, tools, emit, tool_results, messages, TOOL_CALL_TIMEOUT_SEC
        )

    # Check if the response is a proposal (Phase 1) that needs confirmation
    response_text = response.content if isinstance(response.content, str) else str(response.content)
    needs_confirmation = (
        not pending.get("approved")
        and _looks_like_proposal(response_text)
    )

    result: dict = {
        "messages": [response],
        "tool_results": tool_results,
        "agent_events": agent_events,
        "plan_step": state.get("plan_step", 0) + 1,
    }

    if needs_confirmation:
        # Stream a confirmation_request event so frontend can show the modal
        emit({
            "type": "confirmation_request",
            "description": response_text,
            "agent": "remediation",
        })
        result["pending_confirmation"] = {
            "requested": True,
            "approved": False,
            "description": response_text,
        }

    return result


def _looks_like_proposal(text: str) -> bool:
    """Heuristic: does the response text look like a change proposal?"""
    proposal_markers = [
        "proposed change",
        "would you like me to proceed",
        "shall i proceed",
        "confirm",
        "approve",
        "current value",
        "new value",
        "before →",
        "after →",
    ]
    text_lower = text.lower()
    return any(marker in text_lower for marker in proposal_markers)
