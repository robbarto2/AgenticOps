"""Discovery agent - explores inventory, topology, device status, network health."""

from __future__ import annotations

import logging

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage

from agents.state import AgentState
from agents.tools import build_langchain_tools
from config import settings
from skills.loader import load_skills_for_agent

logger = logging.getLogger(__name__)

SYSTEM_PROMPT_TEMPLATE = """You are the AgenticOps Discovery Agent. You explore network inventory, topology, device status, and overall health.

Your approach:
1. Determine what the user wants to discover (devices, networks, health, inventory, topology)
2. Gather comprehensive data using Meraki and ThousandEyes tools
3. Organize results by logical groupings (network, site, device type)
4. Provide health summaries and highlight issues
5. Present data in a clear, structured format

Data to collect based on query:
- Organization overview: org details, network list, license status
- Device inventory: models, serials, firmware, status, network assignment
- Network health: device status distribution, alert counts
- Topology: device connections, uplink info
- ThousandEyes: test inventory, monitored endpoints

Organize output for presentation as cards:
- Use data tables for device/network listings
- Use bar charts for distribution breakdowns
- Use network health cards for status summaries
- Use text reports for narrative overviews

{skills}"""


async def discovery_node(state: AgentState) -> dict:
    """Execute network discovery for the user query."""
    query = state["user_query"]
    skills_text = load_skills_for_agent("discovery")

    llm = ChatAnthropic(
        model=settings.model_name,
        api_key=settings.anthropic_api_key,
        max_tokens=4096,
    )

    tools = build_langchain_tools("discovery")
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

            source = "meraki"
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
