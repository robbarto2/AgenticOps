"""LangGraph graph definition - nodes, edges, and state flow."""

from __future__ import annotations

from langgraph.graph import END, StateGraph

from agents.canvas_agent import canvas_node
from agents.compliance import compliance_node
from agents.discovery import discovery_node
from agents.orchestrator import orchestrator_node, route_to_specialist
from agents.security import security_node
from agents.state import AgentState
from agents.troubleshooting import troubleshooting_node

# Build the multi-agent graph
graph_builder = StateGraph(AgentState)

# Add nodes
graph_builder.add_node("orchestrator", orchestrator_node)
graph_builder.add_node("troubleshooting", troubleshooting_node)
graph_builder.add_node("compliance", compliance_node)
graph_builder.add_node("security", security_node)
graph_builder.add_node("discovery", discovery_node)
graph_builder.add_node("canvas", canvas_node)

# Entry point
graph_builder.set_entry_point("orchestrator")

# Orchestrator routes to specialist via conditional edge
graph_builder.add_conditional_edges(
    "orchestrator",
    route_to_specialist,
    {
        "troubleshooting": "troubleshooting",
        "compliance": "compliance",
        "security": "security",
        "discovery": "discovery",
    },
)

# All specialists route to canvas agent, then END
for agent_name in ["troubleshooting", "compliance", "security", "discovery"]:
    graph_builder.add_edge(agent_name, "canvas")

graph_builder.add_edge("canvas", END)

# Compile the graph
agent_graph = graph_builder.compile()
