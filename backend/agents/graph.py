"""LangGraph graph definition - nodes, edges, and state flow."""

from __future__ import annotations

from langgraph.graph import END, StateGraph

from agents.canvas_agent import canvas_node
from agents.compliance import compliance_node
from agents.discovery import discovery_node
from agents.orchestrator import orchestrator_node, route_to_specialist
from agents.remediation import remediation_node
from agents.security import security_node
from agents.state import AgentState
from agents.testing import testing_node
from agents.troubleshooting import troubleshooting_node


def _route_after_specialist(state: AgentState) -> str:
    """Route to the next agent in the plan, or to canvas/end."""
    plan = state.get("agent_plan") or []
    step = state.get("plan_step", 0)

    # If there are more agents in the plan, go to plan_router
    if step < len(plan):
        return "plan_router"

    # Plan complete — route to canvas if cards were requested, otherwise end
    if state.get("generate_cards", False):
        return "canvas"
    return "__end__"


def plan_router(state: AgentState) -> str:
    """Pure-logic node: route to the next specialist in the agent_plan.

    This is used as a conditional edge function, not a state-modifying node.
    Each specialist increments plan_step before returning, so this always
    reads the current step and dispatches to the right agent.
    """
    plan = state.get("agent_plan") or []
    step = state.get("plan_step", 0)

    if step < len(plan):
        next_agent = plan[step]
        return next_agent

    # Fallback: plan exhausted
    if state.get("generate_cards", False):
        return "canvas"
    return "__end__"


def _plan_router_node(state: AgentState) -> dict:
    """Lightweight pass-through node that emits an agent_start event for the next agent."""
    plan = state.get("agent_plan") or []
    step = state.get("plan_step", 0)

    if step < len(plan):
        next_agent = plan[step]
        return {
            "active_agent": next_agent,
            "agent_events": state.get("agent_events", []) + [
                {"type": "agent_start", "agent": next_agent},
            ],
        }
    return {}


# All specialist agent names
_SPECIALISTS = [
    "troubleshooting", "compliance", "security", "discovery",
    "testing", "remediation",
]

# Build the multi-agent graph
graph_builder = StateGraph(AgentState)

# Add nodes
graph_builder.add_node("orchestrator", orchestrator_node)
graph_builder.add_node("plan_router", _plan_router_node)
graph_builder.add_node("troubleshooting", troubleshooting_node)
graph_builder.add_node("compliance", compliance_node)
graph_builder.add_node("security", security_node)
graph_builder.add_node("discovery", discovery_node)
graph_builder.add_node("testing", testing_node)
graph_builder.add_node("remediation", remediation_node)
graph_builder.add_node("canvas", canvas_node)

# Entry point
graph_builder.set_entry_point("orchestrator")

# Orchestrator routes to the first specialist (or directly to canvas for follow-ups)
graph_builder.add_conditional_edges(
    "orchestrator",
    route_to_specialist,
    {
        "troubleshooting": "troubleshooting",
        "compliance": "compliance",
        "security": "security",
        "discovery": "discovery",
        "testing": "testing",
        "remediation": "remediation",
        "canvas": "canvas",
    },
)

# Specialists route to plan_router (for multi-agent), canvas, or END
for agent_name in _SPECIALISTS:
    graph_builder.add_conditional_edges(
        agent_name,
        _route_after_specialist,
        {"plan_router": "plan_router", "canvas": "canvas", "__end__": END},
    )

# Plan router dispatches to the next specialist in the plan
graph_builder.add_conditional_edges(
    "plan_router",
    plan_router,
    {
        "troubleshooting": "troubleshooting",
        "compliance": "compliance",
        "security": "security",
        "discovery": "discovery",
        "testing": "testing",
        "remediation": "remediation",
        "canvas": "canvas",
        "__end__": END,
    },
)

graph_builder.add_edge("canvas", END)

# Compile the graph
agent_graph = graph_builder.compile()
