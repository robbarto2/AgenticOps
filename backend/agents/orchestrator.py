"""Orchestrator agent - classifies queries and routes to specialist agents."""

from __future__ import annotations

import logging

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from agents.state import AgentState
from config import settings

logger = logging.getLogger(__name__)

ORCHESTRATOR_SYSTEM_PROMPT = """You are the AgenticOps orchestrator. Your job is to classify the user's network operations query and route it to the correct specialist agent.

You must respond with EXACTLY one of these agent names:
- troubleshooting: For WiFi/wireless issues, connectivity problems, latency, performance degradation, client disconnections, slow network, packet loss, WAN issues, uplink problems
- compliance: For configuration audits, SSID settings review, VLAN compliance, switch port checks, policy verification, best practice assessment
- security: For firewall rule review, security posture, threat detection, ACL analysis, content filtering, IDS/IPS, malware, vulnerability assessment
- discovery: For network inventory, device listing, topology, health overview, status checks, "show me everything", organization info, licensing

Respond with ONLY the agent name, nothing else. No explanation, no punctuation."""


async def orchestrator_node(state: AgentState) -> dict:
    """Classify the user query and determine which specialist to route to."""
    query = state["user_query"]

    llm = ChatAnthropic(
        model=settings.model_name,
        api_key=settings.anthropic_api_key,
        max_tokens=50,
    )

    messages = [
        SystemMessage(content=ORCHESTRATOR_SYSTEM_PROMPT),
        HumanMessage(content=query),
    ]

    response = await llm.ainvoke(messages)
    agent_name = response.content.strip().lower()

    # Validate the agent name
    valid_agents = {"troubleshooting", "compliance", "security", "discovery"}
    if agent_name not in valid_agents:
        logger.warning("Orchestrator returned invalid agent '%s', defaulting to discovery", agent_name)
        agent_name = "discovery"

    logger.info("Orchestrator routed query to '%s': %s", agent_name, query[:100])

    return {
        "active_agent": agent_name,
        "agent_events": [{"type": "agent_start", "agent": agent_name}],
    }


def route_to_specialist(state: AgentState) -> str:
    """Conditional edge: route to the specialist chosen by the orchestrator."""
    return state["active_agent"]
