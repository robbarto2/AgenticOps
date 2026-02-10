"""Security agent - assesses security posture, firewall analysis, threat detection."""

from __future__ import annotations

import logging

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage

from agents.state import AgentState
from agents.tools import build_langchain_tools
from config import settings
from prompts import load_prompt
from skills.loader import load_skills_for_agent

logger = logging.getLogger(__name__)

SYSTEM_PROMPT_TEMPLATE = load_prompt("security")


async def security_node(state: AgentState) -> dict:
    """Execute security assessment for the user query."""
    query = state["user_query"]
    skills_text = load_skills_for_agent("security")

    llm = ChatAnthropic(
        model=settings.model_name,
        api_key=settings.anthropic_api_key,
        max_tokens=4096,
    )

    tools = build_langchain_tools("security")
    if tools:
        llm_with_tools = llm.bind_tools(tools)
    else:
        llm_with_tools = llm

    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(skills=skills_text)
    messages = [
        SystemMessage(content=system_prompt),
        *state["messages"],
        HumanMessage(content=query),
    ]

    agent_events = list(state.get("agent_events", []))
    tool_results = list(state.get("tool_results", []))

    max_iterations = 10
    for _ in range(max_iterations):
        response = await llm_with_tools.ainvoke(messages)
        messages.append(response)

        if not response.tool_calls:
            break

        for tool_call in response.tool_calls:
            tool_name = tool_call["name"]
            tool_args = tool_call["args"]

            source = "meraki"  # Default; detect ThousandEyes tools
            if tool_name.startswith("te_") or "thousandeyes" in tool_name.lower():
                source = "thousandeyes"

            agent_events.append({
                "type": "tool_call",
                "tool": tool_name,
                "source": source,
                "status": "running",
            })

            matching_tools = [t for t in tools if t.name == tool_name]
            if matching_tools:
                result = await matching_tools[0].ainvoke(tool_args)
            else:
                result = f"Tool {tool_name} not found"

            tool_results.append({
                "tool": tool_name,
                "args": tool_args,
                "result": result,
            })

            agent_events.append({
                "type": "tool_call",
                "tool": tool_name,
                "source": source,
                "status": "complete",
            })

            messages.append(ToolMessage(content=str(result), tool_call_id=tool_call["id"]))

    return {
        "messages": [HumanMessage(content=query), response],
        "tool_results": tool_results,
        "agent_events": agent_events,
    }
