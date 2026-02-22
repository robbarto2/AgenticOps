# AgenticOps Architecture

## Overview

AgenticOps is an AI-powered network operations tool with a canvas-style UI. It uses a multi-agent architecture powered by LangGraph, connects to Meraki and ThousandEyes MCP servers, and renders results as interactive cards on an infinite canvas.

## System Architecture

```
                                    ┌─────────────────────────────────────────┐
                                    │        LangGraph Agent System           │
                                    │                                         │
User ──WebSocket──> FastAPI ──────> │  Orchestrator Agent                     │
                                    │    ├── Troubleshooting Agent ───┐       │
                                    │    ├── Compliance Agent ────────┤       │
                                    │    ├── Security Agent ──────────┤       │
                                    │    ├── Discovery Agent ─────────┤──MCP─>│──> Meraki MCP (stdio)
                                    │    ├── Topology Agent ──────────┤       │──> ThousandEyes MCP (SSE)
                                    │    ├── Testing Agent ───────────┤       │
                                    │    ├── Remediation Agent ───────┤       │
                                    |    ├── Performance Agent ───────┤       |
                                    │    └── Canvas Agent ────────────┘       │
                                    │                                         │
                                    │  Skills Registry (SKILLS.md files)      │
                                    └─────────────────────────────────────────┘
                                         │
                                    Future: A2A ←→ External Agent Systems
```

## Technology Stack

### Backend
- **FastAPI** - Async web framework with WebSocket support
- **LangGraph** - Multi-agent orchestration with state graphs
- **LangChain + Anthropic** - Claude as the LLM backbone for all agents
- **MCP SDK** - Client connections to Meraki (stdio) and ThousandEyes (SSE)
- **Pydantic** - Settings management and data validation

### Frontend
- **React + TypeScript** - UI framework
- **@xyflow/react** - Infinite canvas with custom nodes (cards)
- **Recharts** - Charts (bar, line) within cards
- **Zustand** - Lightweight state management
- **Tailwind CSS** - Dark theme styling

## Data Flow

1. User sends a message via WebSocket
2. FastAPI receives the message, creates an `AgentState`, invokes the LangGraph graph
3. **Orchestrator** classifies the query and routes to a specialist agent
4. **Specialist agent** (troubleshooting, compliance, security, discovery, topology, testing, or remediation) executes MCP tool calls against Meraki/ThousandEyes, analyzes results
5. **Canvas agent** receives the specialist's output and structures it into card directives (data_table, bar_chart, line_chart, topology, etc.)
6. Results stream back to the frontend via WebSocket events:
   - `agent_start` - which agent is active
   - `tool_call` - MCP tool execution progress
   - `text` - assistant text response
   - `card` - card directive for the canvas
   - `done` - query complete
7. Frontend renders text in the chat panel and cards on the canvas
   - Markdown tables in chat are clickable — clicking a row opens a `MarkdownRowPopup` showing the row data with Investigate/Troubleshoot actions
   - Interactive tables (structured `TableData`) use entity-specific popups (DevicePopup, ClientPopup, UplinkPopup, TestPopup)
   - Popups fetch live data from REST API endpoints (e.g., `/api/test/{id}`, `/api/device/{serial}/switch-ports`, `/api/entity-stats/{type}/{id}`) for detailed information
   - Network listing tables include WAN uplink failure status per network
   - Test popups and cards show ThousandEyes agent names and locations (not just counts)

## MCP Client Integration

### Meraki MCP (stdio transport)
- Spawns the existing `meraki-mcp-dynamic.py` as a subprocess
- Communicates via stdin/stdout using MCP protocol
- Provides ~804 Meraki API tools (auto-discovered from SDK)
- Supports multi-org profiles, caching, response size management

### ThousandEyes MCP (Streamable HTTP transport)
- Connects to a remote ThousandEyes MCP server via Streamable HTTP
- Authenticated with Bearer token
- Provides test results, path visualization, alert data, instant tests, agent listing

## Specialist Agent Details

### Topology Agent (Unique Configuration)
The topology agent has specialized configuration due to the complexity of topology generation:
- **Iterations**: 10 (vs 6 for other agents) to handle sequential LLDP/CDP calls per device
- **Timeout**: 90 seconds (vs 60s) as LLDP/CDP queries can be slow
- **Parallel Execution**: Tool calls within a single LLM response are parallelized via `asyncio.gather` for significantly faster topology generation
- **Message Management**: No message trimming to preserve tool call/result pairing
- **Tool Sequence**: Network lookup → Get devices → LLDP/CDP per device (parallel) → Build topology
- **Programmatic WAN Uplink Fetch**: After the agent loop, automatically fetches `getOrganizationApplianceUplinkStatuses` to get per-interface WAN link status (active/failed/not connected)
- **Output**: Brief text summary + Canvas agent generates interactive topology card with per-interface WAN links color-coded by status (red=failed, gray=not connected, purple=active)

### Programmatic Data Enrichment
After the LLM agent loop, specialist agents programmatically fetch data that the LLM may not reliably call on its own:
- **Discovery/Performance/Troubleshooting agents** call `list_cloud_enterprise_agents` to get ThousandEyes agent names and locations for test table enrichment (via shared `ensure_agent_list()` helper in `table_extractor.py`)
- **Discovery agent** batch-fetches `get_network_app_synthetics_metrics` for test performance data; fetches `getOrganizationApplianceUplinkStatuses` for WAN failure data in network listing tables
- **Topology agent** fetches `getOrganizationApplianceUplinkStatuses` for WAN link status on topology maps
- This pattern ensures critical data is always available regardless of LLM behavior

## WebSocket Protocol

### Client → Server
```json
{ "type": "user_message", "content": "Show me all networks" }
```

### Server → Client
```json
{ "type": "agent_start", "data": { "agent": "discovery" } }
{ "type": "tool_call", "data": { "tool": "getOrganizationNetworks", "source": "meraki", "status": "running" } }
{ "type": "tool_call", "data": { "tool": "getOrganizationNetworks", "source": "meraki", "status": "complete" } }
{ "type": "text", "data": "Here are the networks in your organization:" }
{ "type": "card", "data": { "id": "card-1", "type": "data_table", "title": "Networks", ... } }
{ "type": "done" }
```

## Session Management

Sessions are stored in-memory keyed by session ID. Each session tracks:
- Chat message history
- Active cards on the canvas
- LangGraph checkpoint for conversation continuity

## Future: A2A Integration

The architecture is designed for future Agent-to-Agent (A2A) protocol support, enabling external agent systems to interact with AgenticOps agents as peers. The orchestrator can be extended to route queries to external A2A endpoints.
