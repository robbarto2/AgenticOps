"""Troubleshooting agent - diagnoses network issues with Meraki + ThousandEyes data."""

from __future__ import annotations

import logging

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from agents.state import AgentState
from agents.tools import build_langchain_tools
from config import settings
from skills.loader import load_skills_for_agent

logger = logging.getLogger(__name__)


SYSTEM_PROMPT_TEMPLATE = """You are the AgenticOps Troubleshooting Agent. You diagnose network issues by gathering and correlating data from Meraki and ThousandEyes.

Your approach:
1. Identify the scope (specific network, device, client, or organization-wide)
2. Gather relevant data using available tools
3. Correlate findings across data sources
4. Identify root causes
5. Provide actionable recommendations

When gathering data, be systematic:
- Start broad (network-level metrics) then narrow down
- Look for patterns in timing and affected devices
- Cross-reference Meraki data with ThousandEyes when available

After analysis, summarize your findings as structured data that includes:
- A text summary of the issue and root cause
- Relevant metrics and data points
- Recommendations for remediation

{skills}"""


async def troubleshooting_node(state: AgentState) -> dict:
    """Execute troubleshooting analysis for the user query."""
    query = state["user_query"]
    skills_text = load_skills_for_agent("troubleshooting")

    llm = ChatAnthropic(
        model=settings.model_name,
        api_key=settings.anthropic_api_key,
        max_tokens=4096,
    )

    tools = build_langchain_tools("troubleshooting")
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

    # Agentic loop: let the LLM call tools iteratively
    max_iterations = 10
    for _ in range(max_iterations):
        response = await llm_with_tools.ainvoke(messages)
        messages.append(response)

        # Check if the LLM wants to call tools
        if not response.tool_calls:
            break

        for tool_call in response.tool_calls:
            tool_name = tool_call["name"]
            tool_args = tool_call["args"]

            agent_events.append({
                "type": "tool_call",
                "tool": tool_name,
                "source": "meraki",
                "status": "running",
            })

            # Find and execute the tool
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
                "source": "meraki",
                "status": "complete",
            })

            # Add tool result back to messages
            from langchain_core.messages import ToolMessage
            messages.append(ToolMessage(content=str(result), tool_call_id=tool_call["id"]))

    # Extract final text response
    final_text = response.content if isinstance(response.content, str) else str(response.content)

    return {
        "messages": [HumanMessage(content=query), response],
        "tool_results": tool_results,
        "agent_events": agent_events,
    }
