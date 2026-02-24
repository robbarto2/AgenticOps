# CLAUDE.md - AgenticOps

## What is this project?

AgenticOps is an AI-powered network operations tool with a canvas-style UI. It uses a multi-agent LangGraph architecture to query Meraki and ThousandEyes MCP servers, then renders results as interactive cards on an infinite canvas.

## Project structure

```
AgenticOps/
├── .env                          # Secrets - NEVER commit (in .gitignore)
├── ARCHITECTURE.md               # System design document
├── AGENTS.md                     # Agent definitions and graph structure
├── Meraki Magic MCP/             # Existing Meraki MCP server (untouched)
│
├── backend/                      # Python FastAPI backend
│   ├── main.py                   # FastAPI app entry point + lifespan
│   ├── config.py                 # Pydantic settings from .env
│   ├── agents/                   # LangGraph multi-agent system
│   │   ├── graph.py              # StateGraph definition (nodes + edges + plan_router)
│   │   ├── state.py              # AgentState TypedDict
│   │   ├── stream_util.py        # Shared helpers: execute_tools_parallel, safe_writer, timeouts
│   │   ├── table_extractor.py    # Extracts structured tables from tool results (devices, clients, uplinks, SSIDs, tests)
│   │   ├── orchestrator.py       # Routes queries to specialists (supports multi-agent plans)
│   │   ├── troubleshooting.py    # WiFi, WAN, performance, client, app diagnosis
│   │   ├── compliance.py         # Config audit, policy checks, monitoring compliance
│   │   ├── security.py           # Firewall, threat, switch port, wireless security
│   │   ├── discovery.py          # Inventory, health, device/client/SSID listing
│   │   ├── topology.py           # Network topology maps, LLDP/CDP discovery
│   │   ├── testing.py            # On-demand ThousandEyes instant tests
│   │   ├── remediation.py        # Write operations with user confirmation
│   │   ├── performance.py        # ThousandEyes performance metrics and anomaly analysis
│   │   ├── wifi.py               # Wireless health, RF analysis, channel utilization, RSSI charts
│   │   ├── canvas_agent.py       # Structures results into card JSON (Haiku model)
│   │   └── tools.py              # MCP → LangChain tool wrappers
│   ├── mcp_client/
│   │   ├── manager.py            # MCPClientManager (Meraki stdio + TE HTTP), tool allowlists, caching
│   │   └── types.py              # ToolDescriptor dataclass
│   ├── skills/                   # Skill markdown files + loader (module-level cache)
│   │   ├── SKILLS.md             # Registry index
│   │   ├── loader.py             # Loads skills into agent prompts (cached at module level)
│   │   └── *.md                  # Individual skill definitions
│   ├── prompts/                  # Agent system prompts (one .md per agent, includes {skills} placeholder)
│   ├── api/
│   │   ├── websocket.py          # /ws/chat WebSocket endpoint
│   │   ├── rest.py               # /api/health, /api/skills, /api/entity-stats
│   │   ├── devices.py            # /api/device/{serial}/*, /api/test/{test_id}
│   │   └── models.py             # Pydantic request/response models
│   └── state/
│       └── session.py            # In-memory session store
│
└── frontend/                     # React 19 + TypeScript + Vite
    └── src/
        ├── App.tsx               # Root component
        ├── main.tsx              # Entry point
        ├── components/
        │   ├── layout/           # AppLayout, TopBar, HelpMenu (Quick Actions), ThemeToggle, Toast
        │   ├── chat/             # ChatPanel, ChatMessage, ChatInput, AgentIndicator, ConfirmationModal,
        │   │                     # InteractiveTable, PromptQueue, HoverPopup, MarkdownRowPopup,
        │   │                     # DevicePopup, TestPopup, ClientPopup, UplinkPopup, SsidPopup
        │   ├── canvas/           # CanvasPanel (ReactFlow wrapper)
        │   └── cards/            # CardNode, CardHeader, StackNode, UpstreamConnection, StatDetailPopover,
        │                         # DataTableCard, BarChartCard, LineChartCard, AlertSummaryCard,
        │                         # TextReportCard, NetworkHealthCard, NetworkDetailCard, OrgSummaryCard,
        │                         # SwitchDetailCard, AccessPointDetailCard, DeviceDetailCard,
        │                         # TestDetailCard, TopologyCard, WifiHealthCard, SsidDetailCard
        ├── hooks/                # useWebSocket, useChat, useCanvas
        ├── store/                # Zustand: chatSlice, canvasSlice, connectionSlice, themeSlice, toastSlice, queueSlice
        ├── types/                # card.ts, chat.ts, websocket.ts
        └── utils/                # cardPositioning.ts, cardCategories.ts, formatters.ts
```

## How to run

**Backend** (from `backend/` directory):
```bash
source .venv/bin/activate
python main.py
```
Runs on `http://localhost:8080`. Uvicorn with `--reload` watches for Python file changes. **Port 8080** (not 8000 — that port is used by another application on this machine).

**Frontend** (from `frontend/` directory):
```bash
npm run dev
```
Runs on `http://localhost:5173`. Vite proxies `/api` and `/ws` to the backend.

## Import conventions

All backend imports use **project-root-relative** paths (relative to `backend/`), not Python package paths:
```python
# Correct
from config import settings
from agents.state import AgentState
from mcp_client.manager import mcp_manager
from skills.loader import load_skills_for_agent

# Wrong - do NOT use these
from backend.config import settings
from backend.agents.state import AgentState
```

## Agent graph flow

```
User query → Orchestrator → [conditional routing] → Specialist → Plan Router → [next specialist or canvas] → END
```

Single-agent queries (most common):
```
Orchestrator → Specialist → Canvas → END
```

Multi-agent plans (compound queries):
```
Orchestrator → Specialist₁ → Plan Router → Specialist₂ → Plan Router → Canvas → END
```

### Agents

| Agent | Model | Description |
|-------|-------|-------------|
| **Orchestrator** | Haiku | Classifies query, returns one or more of the specialist agent names |
| **Discovery** | Haiku | Network inventory, device/client/SSID listing, organizational summary |
| **Troubleshooting** | Sonnet | WiFi, WAN, performance, client, app diagnosis |
| **WiFi** | Sonnet | Wireless health, RF analysis, channel utilization, RSSI/SNR, client density |
| **Performance** | Haiku | ThousandEyes metrics, anomaly detection, latency/loss analysis |
| **Security** | Haiku | Firewall rules, threat events, switch port security, wireless audit |
| **Compliance** | Haiku | Config audit, firmware status, monitoring compliance |
| **Topology** | Sonnet | Network topology maps from LLDP/CDP (10 iterations, 90s timeout, parallel tool calls) |
| **Testing** | Haiku | On-demand ThousandEyes instant tests (HTTP, DNS, page load, etc.) |
| **Remediation** | Sonnet | Write operations with mandatory user confirmation |
| **Canvas** | Haiku | Transforms tool_results into card directives (JSON array) |

- **Plan Router**: Pure-logic node (no LLM call) that dispatches to the next agent in the plan sequence

### Programmatic data enrichment

Specialist agents programmatically fetch critical data after the LLM agent loop to avoid relying on the LLM calling the right tools:
- **Discovery/Performance/Troubleshooting**: Fetch `list_cloud_enterprise_agents` for ThousandEyes agent name/location enrichment in test tables (via `ensure_agent_list()` helper)
- **Discovery**: Fetch `get_network_app_synthetics_metrics` (batch) for test performance data; fetch `getOrganizationApplianceUplinkStatuses` for WAN failure data in network tables
- **Topology**: Fetch `getOrganizationApplianceUplinkStatuses` for per-interface WAN link status (failed/active/not connected) on topology maps; parallelize LLDP/CDP calls via `asyncio.gather`
- **WiFi**: Fetch `getOrganizationNetworks` for name resolution; fetch `getOrganizationWirelessDevicesChannelUtilizationByNetwork` and `getOrganizationWirelessDevicesPacketLossByNetwork` (24h timespan); for RSSI queries, pre-fetch per-band `getNetworkWirelessSignalQualityHistory` (2.4, 5, 6 GHz)

### WiFi agent chart extraction

The WiFi agent builds visual cards programmatically from tool_results (no LLM involvement):
1. **RSSI queries** → multi-line chart (one line per radio band: 2.4 GHz amber, 5 GHz blue, 6 GHz green) with Y-axis in dBm
2. **Network-specific queries** → `wifi_health` dashboard card (summary metrics + per-AP table)
3. **Org-wide queries** → bar charts (channel utilization by network, client density)
4. **Trend queries** → line charts (utilization history, client count history)

## MCP connections

| Server | Transport | Config vars |
|--------|-----------|-------------|
| Meraki | stdio (subprocess) | `MERAKI_MCP_SCRIPT`, `MERAKI_MCP_VENV_FASTMCP` |
| ThousandEyes | Streamable HTTP | `TE_MCP_URL=https://api.thousandeyes.com/mcp`, `TE_TOKEN` |

Tool access by agent:
- **Troubleshooting**: Meraki + ThousandEyes (including BGP, events, outages)
- **WiFi**: Meraki only (wireless APIs via `call_meraki_api`; `search_methods`/`get_method_info` excluded to prevent wasted iterations)
- **Compliance**: Meraki + ThousandEyes (monitoring compliance)
- **Security**: Meraki + ThousandEyes (including switch port, wireless audit)
- **Discovery**: Meraki + ThousandEyes (inventory, devices, clients, networks)
- **Topology**: Meraki only (devices, LLDP/CDP, uplinks)
- **Testing**: ThousandEyes only (instant tests, templates, agent discovery)
- **Performance**: Meraki + ThousandEyes (metrics, anomalies, path viz)
- **Remediation**: Meraki only (write operations + API discovery)

## WebSocket protocol

**Client → Server**:
- `user_message` — `{ "type": "user_message", "content": "...", "session_id": "default" }`
- `stop` — `{ "type": "stop" }`
- `confirmation_response` — `{ "type": "confirmation_response", "approved": true|false, "session_id": "default" }`

**Server → Client** (streamed events):
- `agent_start` — `{ "agent": "discovery" }`
- `agent_plan` — `{ "plan": ["discovery", "remediation"], "step": 0 }` (multi-agent plans only)
- `tool_call` — `{ "tool": "getOrganizationNetworks", "source": "meraki", "status": "running"|"complete" }`
- `text` — assistant text response (string)
- `card` — card directive (full card JSON object)
- `confirmation_request` — `{ "description": "...", "agent": "remediation" }` (remediation proposals)
- `error` — `{ "message": "..." }`
- `done` — query complete

## Card types

| Type | Data shape | Component |
|------|-----------|-----------|
| `data_table` | `{ columns: string[], rows: string[][] }` | Sortable table |
| `bar_chart` | `{ labels: string[], datasets: [{label, data, color}] }` | Recharts BarChart |
| `line_chart` | `{ labels: string[], datasets: [{label, data, color}] }` | Recharts LineChart (auto-detects ms/% /dBm units) |
| `alert_summary` | `{ alerts: [{severity, title, description, timestamp?}] }` | Severity-colored list |
| `text_report` | `{ content: string }` | Markdown rendered |
| `network_health` | `{ metrics: [{label, value, status, icon?}] }` | Metric tiles |
| `network_detail` | `{ networkName, networkId, deviceCounts, clientCount, ... }` | Network info with WAN alerts |
| `org_summary` | `{ orgName, networkCount, deviceCounts, ... }` | Organization overview |
| `switch_detail` | `{ deviceName, model, serial, ports: [...] }` | Switch with port details |
| `access_point_detail` | `{ deviceName, model, serial, ssids, channelUtil, ... }` | AP with channel utilization |
| `device_detail` | `{ deviceName, model, serial, status, ... }` | Generic device details |
| `test_detail` | `{ testName, testType, metrics, agents, ... }` | ThousandEyes test details |
| `topology` | `{ nodes: [...], links: [...], networkName }` | Interactive SVG topology (WAN links: red=failed, gray=not connected, purple=active) |
| `wifi_health` | `{ networkName, overallStatus, summary: [{label, value, status}], accessPoints: [...] }` | WiFi health dashboard with AP table |
| `ssid_detail` | `{ ssidName, networkId, authMode, encryptionMode, ... }` | SSID configuration details |
| `pie_chart` | `{ segments: [{label, value, color}] }` | Recharts PieChart (interactive donut ring with hover expansion) |

Every card has: `id`, `type`, `title`, `source` ("meraki" or "thousandeyes"), and a `data` object matching its type.

### Card categories & stacking

Cards are grouped into categories for auto-layout stacking on the canvas:

| Category | Label | Color | Card types |
|----------|-------|-------|------------|
| org | Organization | `#eab308` | org_summary |
| network | Networks | `#10b981` | network_health, network_detail |
| topology | Topologies | `#8b5cf6` | topology |
| switch | Switches | `#3b82f6` | switch_detail |
| access_point | Wireless APs | `#06b6d4` | access_point_detail |
| ssid | SSIDs | `#a855f7` | ssid_detail |
| device | Devices | `#f97316` | device_detail |
| test | Tests | `#ec4899` | test_detail |
| alert | Alerts | `#ef4444` | alert_summary |
| wifi | Wi-Fi Analysis | `#38bdf8` | wifi_health, pie_chart (wifi-titled), bar_chart (wifi-titled), line_chart (wifi-titled) |
| chart | Charts | `#14b8a6` | bar_chart, line_chart, pie_chart |
| table | Tables | `#6366f1` | data_table |
| report | Reports | `#94a3b8` | text_report |

### Interactive tables

Chat messages can include interactive tables (`TableData`) with entity-specific popups:

| Entity type | Popup component | Canvas card on "Add" |
|------------|----------------|---------------------|
| `device` | DevicePopup | device_detail / switch_detail / access_point_detail |
| `client` | ClientPopup | — |
| `uplink` | UplinkPopup | — |
| `test` | TestPopup | test_detail |
| `ssid` | SsidPopup | ssid_detail |
| `network` | HoverPopup | network_detail |

Rows support `status_type` ("error", "warning", "normal") with colored left-border accents (red/amber).

## Skills system

Skills are markdown files in `backend/skills/` that guide agent behavior. Each skill has:
- **Trigger**: Keywords that activate it
- **Steps**: Ordered MCP tool calls
- **Analysis**: Thresholds and patterns to check
- **Presentation**: Which card types to output

Skills are cached at module level after first load (no repeated disk I/O).

Skill-to-agent mapping (in `skills/loader.py`):
- troubleshooting → `wireless_troubleshooting.md`, `wan_performance.md`, `client_troubleshooting.md`, `application_performance.md`, `performance_degradation_analysis.md`
- compliance → `config_audit.md`, `monitoring_compliance.md`
- security → `security_posture.md`, `switch_port_security.md`, `wireless_security.md`
- discovery → `network_inventory.md`, `organizational_summary.md`
- topology → `network_topology.md`
- testing → `instant_testing.md`, `connectivity_validation.md`, `template_deployment.md`
- remediation → `switch_port_remediation.md`, `ssid_remediation.md`, `firewall_remediation.md`
- performance → `performance_monitoring.md`, `application_performance.md`
- wifi → `wifi_health_assessment.md`, `rf_analysis.md`, `wifi_client_analysis.md`

## Adding a new agent

1. Create `backend/agents/<name>.py` with an async node function taking `AgentState` and `StreamWriter`
2. Add tool allowlist in `mcp_client/manager.py` → `_<NAME>_TOOLS` set and register in `_AGENT_TOOL_ALLOWLIST`
3. Create system prompt in `backend/prompts/<name>.md` (must include `{skills}` placeholder)
4. Create skill files in `backend/skills/` and register in `loader.py` → `AGENT_SKILLS`
5. Register in `backend/agents/graph.py`:
   - Import the node function
   - `graph_builder.add_node("<name>", <name>_node)`
   - Add to `_SPECIALISTS` list
   - Add to orchestrator's and plan_router's conditional edges maps
6. Update orchestrator system prompt in `prompts/orchestrator.md` to route to the new agent
7. Add fast-route regex patterns in `orchestrator.py` → `_FAST_ROUTES`
8. Add display name in `frontend/src/utils/formatters.ts` → `agentDisplayName`
9. Add description in `frontend/src/components/chat/AgentIndicator.tsx` → `AGENT_DESCRIPTIONS`
10. Ensure the node increments `plan_step` before returning (for multi-agent plan support)

## Adding a new card type

1. Add the type to `frontend/src/types/card.ts` (interface + add to `AnyCard` union)
2. Create `frontend/src/components/cards/<Name>Card.tsx`
3. Add the case to `CardNode.tsx` → `renderContent()` switch and `cardAccentColor()`
4. Add category in `frontend/src/utils/cardCategories.ts` → `getCardCategory()`
5. Add dedup key in `frontend/src/store/canvasSlice.ts` → `getCardKey()`
6. Add default height in `canvasSlice.ts` card height defaults
7. Update canvas agent prompt in `backend/agents/canvas_agent.py` with the new type spec

## Environment variables

Required in `.env` (never committed):
```
ANTHROPIC_API_KEY=           # Claude API key for LangGraph agents
MERAKI_MCP_SCRIPT=           # Path to meraki-mcp-dynamic.py
MERAKI_MCP_VENV_FASTMCP=     # Path to Meraki MCP venv's fastmcp binary
TE_MCP_URL=https://api.thousandeyes.com/mcp
TE_TOKEN=                    # ThousandEyes API/OAuth bearer token
```

Meraki-specific vars (passed through to MCP subprocess): `MERAKI_API_KEY`, `MERAKI_ORG_ID`, `MERAKI_ACTIVE_PROFILE`, plus multi-profile `MERAKI_PROFILE_*` vars.

## Tech stack

### Backend
- **Python 3.12+**, FastAPI, Uvicorn
- **LangGraph** — multi-agent orchestration with StateGraph
- **LangChain-Anthropic** — Claude LLM integration
- **MCP SDK** — client connections to Meraki (stdio) and ThousandEyes (Streamable HTTP)
- **Pydantic / Pydantic-Settings** — config and data validation

### Frontend
- **React 19** + **TypeScript 5.9** — UI framework
- **Vite 7** — build tool and dev server (proxies `/api` and `/ws` to backend)
- **@xyflow/react 12** — infinite canvas with draggable card nodes and auto-layout
- **dagre** — directed graph layout algorithm for auto-positioning cards
- **Recharts 3** — bar and line chart visualizations within cards
- **Zustand 5** — lightweight state management (6 stores: chat, canvas, connection, theme, toast, queue)
- **Tailwind CSS v4** — utility-first styling with `@tailwindcss/vite` plugin
- **react-markdown** + **remark-gfm** — renders markdown in chat messages and text report cards
- **@tailwindcss/typography** — prose styling for markdown content

### LLM models
- **Claude Sonnet** (`claude-sonnet-4-20250514`) — troubleshooting, WiFi, topology, remediation (complex analysis)
- **Claude Haiku** (`claude-haiku-4-5-20251001`) — orchestrator, canvas, discovery, performance, compliance, security, testing (fast routing/summarization)

### Theme
- Dark primary (bg-gray-950, border-gray-800 palette)
- Light mode supported via ThemeToggle

## Key conventions

- Dark theme everywhere — use gray-900/950 backgrounds, gray-700/800 borders
- Card accent colors: blue `#3b82f6`, green `#10b981`, amber `#f59e0b`, red `#ef4444`, purple `#8b5cf6`
- Source badges: blue for Meraki, purple for ThousandEyes
- Severity scale: critical (red) → high (orange) → medium (amber) → low (blue) → info (gray)
- Status scale: healthy (green) → warning (amber) → critical (red)
