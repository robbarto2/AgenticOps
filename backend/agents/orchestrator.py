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
    r"card|cards|canvas|chart|graph|plot|visuali[zs]e|diagram|dashboard|topology"
    r"|show\s+(me\s+)?(a\s+)?(table|chart|graph|plot|card|visual|topology)"
    r"|display\s+(as|in|on)\s+(a\s+)?(card|chart|table|canvas)"
    r"|put\s+(this|that|it)\s+(in|on|as)\s+(a\s+)?(card|canvas)"
    r"|add\s+(to|on)\s+(the\s+)?canvas"
    r"|org(anizational)?\s+summary|org(anization)?\s+overview|executive\s+summary"
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

# Short affirmative responses (used when the previous assistant message offered cards)
_AFFIRMATIVE_RE = re.compile(
    r"^\s*(yes|yeah|yep|yup|sure|ok|okay|please|go\s*ahead|do\s*it|go\s*for\s*it"
    r"|absolutely|definitely|that\s*would\s*be\s*great|sounds\s*good|please\s*do"
    r"|yes\s*please|sure\s*thing|of\s*course)\s*[.!]?\s*$",
    re.IGNORECASE,
)

# Fast-path regex patterns to skip the LLM call entirely for obvious queries
# Short follow-up patterns that need LLM context for correct routing.
# E.g., "now show me in the San Fran network" after a band-dist query should
# go to WiFi, not Discovery.  Without context, the regex matches "show...network"
# and routes to discovery.
_FOLLOWUP_PATTERN = re.compile(
    r"^("
    r"now\s+show\s+me\b"           # "now show me X" — strong follow-up signal
    r"|show\s+me\s+(for|in)\b"     # "show me for/in X"
    r"|show\s+(it|this|that)\b"    # "show it/this/that for X"
    r"|same\s+(for|in|thing)"
    r"|what\s+about"
    r"|how\s+about"
    r"|and\s+(for|in)\s+"
    r"|also\s+(show|check|run|do)"
    r"|do\s+(the\s+)?same"
    r"|run\s+(it|that|this)"
    r"|check\s+(that|this)"
    r"|repeat\s+(for|that|this)"
    r")",
    re.IGNORECASE,
)


def _is_likely_followup(query: str, has_history: bool) -> bool:
    """Detect short follow-up queries that need LLM conversation context."""
    if not has_history:
        return False
    if len(query.split()) > 12:
        return False  # Longer queries have enough keywords for fast-route
    return bool(_FOLLOWUP_PATTERN.search(query))


_FAST_ROUTES: list[tuple[re.Pattern, str]] = [
    # Performance agent — test results, metrics, monitoring data (must match before testing and discovery)
    (re.compile(r"\b(test\s+results?|test\s+metrics?|test\s+performance|test\s+data|monitoring\s+(results?|data|metrics)|how\s+(are|is)\s+(my\s+)?tests?\s+(doing|performing)|show\s+(me\s+)?(the\s+)?(results?|metrics?|performance|data)\s+(of|for|from)\s+(my\s+|the\s+)?(te\s+|thousandeyes\s+)?tests?|availability\s+(report|trend|data)|response\s+time\s+(trend|data|history)|latency\s+(trend|data|report)|what('s| is)\s+(the\s+)?(latency|availability|response\s+time|packet\s+loss|performance))\b", re.IGNORECASE), "performance"),
    # Testing agent — must match before troubleshooting (both mention "connectivity")
    (re.compile(r"\b(run\s+(a\s+)?test|instant\s+test|page\s+load\s+test|dns\s+test|http\s+test|test\s+connectivity|deploy\s+template|rerun\s+test)\b", re.IGNORECASE), "testing"),
    # Topology agent — network topology/map queries (must come before discovery)
    (re.compile(r"\b(topology|network\s+(map|diagram|layout)|show\s+(me\s+)?(the\s+)?(connections?|topology)|device\s+connections?|how\s+(are\s+)?devices?\s+connected)\b", re.IGNORECASE), "topology"),
    # WiFi agent — wireless-specific analysis (must come before troubleshooting to catch WiFi keywords)
    # NOTE: standalone "wifi"/"wi-fi" removed — too broad, catches discovery queries like "show all wifi clients"
    (re.compile(r"\b(wireless\s+(?:health|analysis|optimization|assessment|capacity|performance|check)|rf\s+(?:health|analysis|environment|profile)|channel\s+utiliz\w*|rogue\s+(?:aps?|detection|scan|check|wireless)|unauthorized\s+aps?|unknown\s+aps?|air\s+marshal|band\s+(?:steer\w*|distribution|breakdown|usage)|client\s+density|ap\s+(?:overload|density|capacity)|wifi\s+(?:health|analysis|check|performance|optimization|capacity)|wi-fi\s+(?:health|analysis|check|performance|optimization|capacity)|distribution.{0,20}band|2\.4\s*g?hz?\s*(?:vs\.?|and)\s*5\s*g?hz|rssi|signal\s+(?:quality|strength|metrics?)|snr)\b", re.IGNORECASE), "wifi"),
    # Troubleshooting agent — root cause analysis / forensic queries
    (re.compile(r"\b(root\s+cause|rca|forensic|isolation|where\s+is\s+the\s+(problem|issue)|what('s| is)\s+causing)\b", re.IGNORECASE), "troubleshooting"),
    # Troubleshooting agent — must come early to catch explicit troubleshooting requests
    (re.compile(r"\b(troubleshoot|diagnose|debug|investigate|trace|traceroute|path\s+visuali[zs]ation)\b", re.IGNORECASE), "troubleshooting"),
    # Remediation agent — write/change operations
    (re.compile(r"\b(fix|change|update|set|modify|disable|enable|configure|remediate|close|block|add\s+(a\s+)?rule)\b.*\b(port|ssid|vlan|firewall|rule|network|config)\b", re.IGNORECASE), "remediation"),
    (re.compile(r"\b(port|ssid|vlan|firewall|rule)\b.*\b(fix|change|update|set|modify|disable|enable|configure|remediate|close|block)\b", re.IGNORECASE), "remediation"),
    # Discovery agent — uplink/WAN status queries (before generic discovery to avoid "status" matching troubleshooting)
    (re.compile(r"\b(uplinks?|wan\s+status|wan\s+uplinks?)\b", re.IGNORECASE), "discovery"),
    # Discovery agent — listing/inventory queries
    (re.compile(r"\b(what|which)\b.*(track(ing)?|monitor(ing)?|watch(ing)?)\b.*\b(thousandeyes|te)\b", re.IGNORECASE), "discovery"),
    (re.compile(r"\b(list|show|get|what|display).*(network|site|device|ap|access\s+point|switch|appliance|camera|sensor|client|ssid|application|app|test)s?\b(?!.*\b(result|metric|perform|latency|loss|avail))", re.IGNORECASE), "discovery"),
    (re.compile(r"\b(inventory|health|overview|status|organization)\b", re.IGNORECASE), "discovery"),
    # Troubleshooting agent — problem indicators (checked after explicit troubleshooting keywords)
    (re.compile(r"\b(slow|issue|problem|not\s+working|can'?t|won'?t|fail|error|down|offline|disconnect|latency|packet.?loss|degraded|poor)\b", re.IGNORECASE), "troubleshooting"),
    # Security and compliance
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


def _is_card_followup(query: str, has_previous_results: bool = False) -> bool:
    """Check if this is a follow-up request to show previous results as cards."""
    if _CARD_FOLLOWUP_PATTERNS.search(query):
        return True
    # NOTE: We intentionally do NOT match short affirmatives ("yes", "ok")
    # as card follow-ups.  The user may be answering a follow-up question
    # offered by the agent (e.g. "Would you like me to investigate further?").
    # Explicit requests like "show that as a card" are handled by
    # _CARD_FOLLOWUP_PATTERNS above.
    return False


async def orchestrator_node(state: AgentState) -> dict:
    """Classify the user query and determine which specialist to route to."""
    query = state["user_query"]

    # Image queries: route to vision agent for direct LLM analysis (no MCP tools)
    if state.get("has_images", False):
        logger.info("Orchestrator routing to vision (images attached): %s", query[:100])
        return {
            "active_agent": "vision",
            "generate_cards": False,
            "agent_plan": ["vision"],
            "plan_step": 0,
            "agent_events": [{"type": "agent_start", "agent": "vision"}],
        }

    # Check if this is a follow-up request to show previous results as cards
    has_previous = bool(state.get("tool_results"))
    if _is_card_followup(query, has_previous_results=has_previous):
        logger.info("Orchestrator detected card follow-up request: %s", query[:100])
        return {
            "active_agent": "canvas",
            "generate_cards": True,
            "agent_events": [{"type": "agent_start", "agent": "canvas"}],
        }

    # Determine if user wants cards
    generate_cards = _wants_cards(query)

    # Short follow-ups ("now show me for X", "same for Toronto") lack domain
    # keywords and need LLM routing with conversation context.
    has_history = any(
        hasattr(m, "type") and m.type == "ai" and m.content
        for m in state.get("messages", [])
    )
    if _is_likely_followup(query, has_history):
        logger.info("Orchestrator: follow-up detected, skipping fast-route for LLM context: %s", query[:100])
        agent_name = None  # defer to LLM
    else:
        # Fast-path: try regex classification first to avoid an LLM round-trip
        agent_name = _fast_route(query)

    if agent_name:
        logger.info("Orchestrator fast-routed to '%s' (regex): %s", agent_name, query[:100])
        # Performance queries should always generate cards (charts/metrics)
        if agent_name == "performance":
            generate_cards = True
    else:
        # Fall back to LLM classification using the fast Haiku model
        llm = ChatAnthropic(
            model=settings.orchestrator_model_name,
            api_key=settings.anthropic_api_key,
            max_tokens=100,
            timeout=30,       # Orchestrator should be fast (Haiku, small output)
            max_retries=1,
        )

        # Include recent conversation context so the LLM can interpret
        # follow-up messages like "yes", "do that", etc.
        messages = [SystemMessage(content=ORCHESTRATOR_SYSTEM_PROMPT)]
        for msg in state.get("messages", []):
            # Skip the current query — we add it below
            if hasattr(msg, "type") and msg.type == "human" and msg.content == query:
                continue
            messages.append(msg)
        messages.append(HumanMessage(content=query))

        response = await llm.ainvoke(messages)
        raw = response.content.strip().lower()

        # Parse multi-agent plan (comma-separated) or single agent
        parts = [p.strip() for p in raw.split(",") if p.strip()]
        valid_agents = {"troubleshooting", "compliance", "security", "discovery", "testing", "remediation", "topology", "performance", "wifi"}
        parts = [p for p in parts if p in valid_agents]

        if not parts:
            logger.warning("Orchestrator returned invalid response '%s', defaulting to discovery", raw)
            parts = ["discovery"]

        agent_name = parts[0]

        # Performance queries should always generate cards (charts/metrics)
        if agent_name == "performance":
            generate_cards = True

        # If multi-agent plan detected, store it
        if len(parts) > 1:
            agent_plan = parts[:3]  # Cap at 3 agents max
            logger.info("Orchestrator planned multi-agent sequence: %s", agent_plan)
            return {
                "active_agent": agent_plan[0],
                "generate_cards": generate_cards,
                "agent_plan": agent_plan,
                "plan_step": 0,
                "agent_events": [{"type": "agent_start", "agent": agent_plan[0]}],
            }

    logger.info(
        "Orchestrator routed query to '%s' (cards=%s): %s",
        agent_name, generate_cards, query[:100],
    )

    return {
        "active_agent": agent_name,
        "generate_cards": generate_cards,
        "agent_plan": [agent_name],
        "plan_step": 0,
        "agent_events": [{"type": "agent_start", "agent": agent_name}],
    }


def route_to_specialist(state: AgentState) -> str:
    """Conditional edge: route to the specialist chosen by the orchestrator."""
    return state["active_agent"]
