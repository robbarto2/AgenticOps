"""Orchestrator agent - classifies queries and routes to specialist agents."""

from __future__ import annotations

import logging
import re

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from agents.state import AgentState
from config import settings
from prompts import load_prompt

logger = logging.getLogger(__name__)

ORCHESTRATOR_SYSTEM_PROMPT = load_prompt("orchestrator")

# Patterns that indicate the user wants visual cards on the canvas
_CARD_PATTERNS = re.compile(
    r"\b("
    r"card|cards|canvas|chart|graph|plot|visuali[zs]e|diagram|dashboard"
    r"|show\s+(me\s+)?(a\s+)?(table|chart|graph|plot|card|visual)"
    r"|display\s+(as|in|on)\s+(a\s+)?(card|chart|table|canvas)"
    r"|put\s+(this|that|it)\s+(in|on|as)\s+(a\s+)?(card|canvas)"
    r"|add\s+(to|on)\s+(the\s+)?canvas"
    r")\b",
    re.IGNORECASE,
)

# Patterns that indicate "show previous results as cards" (follow-up)
_CARD_FOLLOWUP_PATTERNS = re.compile(
    r"\b("
    r"show\s+(this|that|it|these|those)\s+(in|on|as)\s+(a\s+)?(card|canvas|chart)"
    r"|put\s+(this|that|it|these|those)\s+(in|on|as)\s+(a\s+)?(card|canvas)"
    r"|make\s+(a\s+)?card"
    r"|add\s+(this|that|it)\s+to\s+(the\s+)?canvas"
    r"|yes.*(card|canvas|chart|visual)"
    r"|card\s*(please|pls)?"
    r")\b",
    re.IGNORECASE,
)

# Fast-path regex patterns to skip the LLM call entirely for obvious queries
_FAST_ROUTES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\b(list|show|get|what).*(network|site)s?\b", re.IGNORECASE), "discovery"),
    (re.compile(r"\b(inventory|device|topology|health|overview|status|organization)\b", re.IGNORECASE), "discovery"),
    (re.compile(r"\b(wifi|wireless|latency|slow|disconnect|packet.?loss|performance|wan|uplink|connectivity)\b", re.IGNORECASE), "troubleshooting"),
    (re.compile(r"\b(firewall|security|threat|acl|ids|ips|malware|vulnerab)\b", re.IGNORECASE), "security"),
    (re.compile(r"\b(compliance|audit|policy|best.?practice|config.*(check|review|audit))\b", re.IGNORECASE), "compliance"),
]


def _fast_route(query: str) -> str | None:
    """Try to classify the query with regex alone. Returns None if uncertain."""
    for pattern, agent in _FAST_ROUTES:
        if pattern.search(query):
            return agent
    return None


def _wants_cards(query: str) -> bool:
    """Check if the user's query explicitly or strongly implies card generation."""
    return bool(_CARD_PATTERNS.search(query))


def _is_card_followup(query: str) -> bool:
    """Check if this is a follow-up request to show previous results as cards."""
    return bool(_CARD_FOLLOWUP_PATTERNS.search(query))


async def orchestrator_node(state: AgentState) -> dict:
    """Classify the user query and determine which specialist to route to."""
    query = state["user_query"]

    # Check if this is a follow-up request to show previous results as cards
    if _is_card_followup(query):
        logger.info("Orchestrator detected card follow-up request: %s", query[:100])
        return {
            "active_agent": "canvas",
            "generate_cards": True,
            "agent_events": [{"type": "agent_start", "agent": "canvas"}],
        }

    # Determine if user wants cards
    generate_cards = _wants_cards(query)

    # Fast-path: try regex classification first to avoid an LLM round-trip
    agent_name = _fast_route(query)

    if agent_name:
        logger.info("Orchestrator fast-routed to '%s' (regex): %s", agent_name, query[:100])
    else:
        # Fall back to LLM classification using the fast Haiku model
        llm = ChatAnthropic(
            model=settings.orchestrator_model_name,
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

    logger.info(
        "Orchestrator routed query to '%s' (cards=%s): %s",
        agent_name, generate_cards, query[:100],
    )

    return {
        "active_agent": agent_name,
        "generate_cards": generate_cards,
        "agent_events": [{"type": "agent_start", "agent": agent_name}],
    }


def route_to_specialist(state: AgentState) -> str:
    """Conditional edge: route to the specialist chosen by the orchestrator."""
    return state["active_agent"]
