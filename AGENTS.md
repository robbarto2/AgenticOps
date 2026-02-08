# AgenticOps Agent Definitions

## Agent Overview

AgenticOps uses a multi-agent architecture where an orchestrator routes user queries to specialist agents. Each specialist has access to specific MCP tools and skills relevant to its domain.

## Agent Graph Structure

```
                    ┌──────────────┐
                    │ Orchestrator │
                    └──────┬───────┘
                           │ (conditional routing)
              ┌────────────┼────────────┬────────────┐
              ▼            ▼            ▼            ▼
     ┌────────────┐ ┌───────────┐ ┌──────────┐ ┌───────────┐
     │Troubleshoot│ │ Compliance│ │ Security │ │ Discovery │
     └─────┬──────┘ └─────┬─────┘ └────┬─────┘ └─────┬─────┘
           │              │             │              │
           └──────────────┴──────┬──────┴──────────────┘
                                 ▼
                          ┌────────────┐
                          │   Canvas   │
                          └──────┬─────┘
                                 ▼
                               END
```

## Agent Definitions

### Orchestrator Agent
- **Role**: Routes user queries to the appropriate specialist agent
- **MCP Tools**: None (delegates to specialists)
- **Skills**: Query classification
- **Routing Logic**:
  - WiFi/wireless/connectivity/performance/latency/slow → Troubleshooting
  - Config/SSID settings/VLAN/switch port/audit → Compliance
  - Firewall/security/threat/ACL/content filtering → Security
  - Inventory/devices/networks/health/status/topology → Discovery
- **System Prompt Guidelines**: Classify intent, never call MCP tools directly, return the specialist name

### Troubleshooting Agent
- **Role**: Diagnoses network issues by correlating data from Meraki and ThousandEyes
- **MCP Tools**:
  - Meraki: devices, clients, events, wireless stats, uplink status
  - ThousandEyes: test results, metrics, path visualization, anomaly detection
- **Skills**: `wireless_troubleshooting`, `wan_performance`, `application_slowness`
- **System Prompt Guidelines**: Gather data systematically, correlate across sources, provide root cause analysis

### Compliance Agent
- **Role**: Evaluates configurations against network requirements and policies
- **MCP Tools**:
  - Meraki: SSIDs, firewall rules, VPN config, switch ports, VLANs
- **Skills**: `config_audit`, `policy_compliance`
- **System Prompt Guidelines**: Check configurations methodically, flag deviations, suggest remediation

### Security Agent
- **Role**: Assesses security posture, analyzes firewall rules, detects threats
- **MCP Tools**:
  - Meraki: firewall rules, security events, content filtering, ACLs
  - ThousandEyes: alerts, outage detection
- **Skills**: `security_posture`, `firewall_review`
- **System Prompt Guidelines**: Evaluate against security best practices, identify vulnerabilities, prioritize by severity

### Discovery Agent
- **Role**: Explores network inventory, topology, device status, overall health
- **MCP Tools**:
  - Meraki: organizations, networks, devices, inventory, licensing
  - ThousandEyes: test inventory, account groups
- **Skills**: `network_inventory`, `health_summary`
- **System Prompt Guidelines**: Provide comprehensive overviews, summarize health status, organize by network/site

### Canvas Agent
- **Role**: Structures data from specialist agents into card directives for the frontend
- **MCP Tools**: None (receives data, outputs card JSON)
- **Skills**: Card formatting, chart type selection
- **System Prompt Guidelines**: Choose the best card type for the data, structure card payloads correctly, set meaningful titles
- **Card Types Available**:
  - `data_table` - For tabular data (device lists, config summaries)
  - `bar_chart` - For categorical comparisons
  - `line_chart` - For time-series data and trends
  - `alert_summary` - For alerts and events with severity levels
  - `text_report` - For analysis narratives and recommendations
  - `network_health` - For metric tiles with status indicators

## State Flow

The `AgentState` TypedDict flows through the graph:

```python
class AgentState(TypedDict):
    messages: Annotated[list, add_messages]  # Chat history
    user_query: str                          # Current user query
    active_agent: str                        # Currently active specialist
    tool_results: list[dict]                 # Collected MCP tool outputs
    cards: list[dict]                        # Card directives for frontend
    agent_events: list[dict]                 # Progress events for streaming
```

## Adding New Agents

1. Create a new file in `backend/agents/` (e.g., `monitoring.py`)
2. Define the agent node function that takes `AgentState` and returns updates
3. Define which MCP tools the agent can access in `tools.py`
4. Create relevant skill files in `backend/skills/`
5. Register the node in `graph.py`:
   - Add the node: `graph.add_node("monitoring", monitoring_node)`
   - Add edge to canvas: `graph.add_edge("monitoring", "canvas")`
   - Update orchestrator routing logic
6. Update `SKILLS.md` with new skills
