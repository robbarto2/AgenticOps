# AgenticOps Architecture

## Overview

AgenticOps is an AI-powered network operations tool with a canvas-style UI. It uses a multi-agent architecture powered by LangGraph, connects to Meraki and ThousandEyes MCP servers, and renders results as interactive cards on an infinite canvas.

## System Architecture

```
                                    ┌─────────────────────────────────────────┐
                                    │        LangGraph Agent System           │
                                    │                                         │
User ──WebSocket──> FastAPI ──────> │  Orchestrator Agent (Haiku)             │
                                    │    ├── Discovery Agent (Haiku) ───┐     │
                                    │    ├── Wi-Fi Agent (Sonnet) ──────┤     │
                                    │    ├── Troubleshooting (Sonnet) ──┤     │
                                    │    ├── Performance Agent (Haiku) ─┤     │
                                    │    ├── Security Agent (Haiku) ────┤──>  │──> Meraki MCP (stdio)
                                    │    ├── Compliance Agent (Haiku) ──┤     │──> ThousandEyes MCP (HTTP)
                                    │    ├── Topology Agent (Sonnet) ───┤     │
                                    │    ├── Testing Agent (Haiku) ─────┤     │
                                    │    ├── Remediation Agent (Sonnet) ┤     │
                                    │    ├── Vision Agent (Claude Viz) -┤     │
                                    │    └── Canvas Agent (Haiku) ──────┘     │
                                    │                                         │
                                    │  Skills Registry (cached .md files)     │
                                    └─────────────────────────────────────────┘
                                         │
                                    Future: A2A ←→ External Agent Systems
```

## Technology Stack

### Backend
- **Python 3.12+** — runtime
- **FastAPI** — async web framework with WebSocket support
- **Uvicorn** — ASGI server with hot-reload
- **LangGraph** — multi-agent orchestration with StateGraph, conditional edges, plan routing
- **LangChain-Anthropic** — Claude LLM integration (Sonnet for analysis, Haiku for routing)
- **MCP SDK** — client connections to Meraki (stdio subprocess) and ThousandEyes (Streamable HTTP)
- **Pydantic / Pydantic-Settings** — settings management from `.env` and data validation

### Frontend
- **React 19** — UI framework with functional components and hooks
- **TypeScript 5.9** — type-safe development
- **Vite 7** — build tool and dev server; proxies `/api` and `/ws` to backend at localhost:8080
- **@xyflow/react 12** — infinite canvas with draggable, resizable card nodes and edge connections
- **dagre 0.8** — directed acyclic graph layout algorithm for auto-positioning cards in stacked columns
- **Recharts 3** — bar, line, and pie chart visualizations inside card components (supports area fills, multi-dataset, fullscreen, interactive donut rings)
- **Zustand 5** — lightweight state management with 6 stores (chat, canvas, connection, theme, toast, queue)
- **Tailwind CSS v4** — utility-first styling via `@tailwindcss/vite` plugin (no PostCSS config needed)
- **@tailwindcss/typography** — prose styling for markdown content in chat and text report cards
- **react-markdown 10** + **remark-gfm 4** — renders GitHub-flavored markdown in chat messages and reports
- **ESLint 9** + **typescript-eslint** — linting with React hooks and refresh plugins

### LLM Model Tiers

| Tier | Model | Agents | Rationale |
|------|-------|--------|-----------|
| **Analysis** | Claude Sonnet 4 | Troubleshooting, WiFi, Topology, Remediation | Complex multi-step analysis, correlation, optimization recommendations |
| **Routing** | Claude Haiku 4.5 | Orchestrator, Canvas, Discovery, Performance, Compliance, Security, Testing | Fast tool routing and summarization; heavy lifting done programmatically |

## Data Flow

1. User sends a message via WebSocket
2. FastAPI receives the message, creates an `AgentState`, invokes the LangGraph graph
3. **Orchestrator** (Haiku) classifies the query and routes to a specialist agent (or multiple agents for compound queries)
4. **Specialist agent** executes MCP tool calls against Meraki/ThousandEyes via agentic loop (up to 7-10 iterations), collects tool_results
5. **Programmatic enrichment** — after the LLM loop, the agent programmatically fetches critical data that the LLM may not reliably call (network names, channel utilization, WAN statuses, signal quality, ThousandEyes agent locations)
6. **Chart extraction** (WiFi/Performance) — specialist agents build visual cards programmatically from tool_results without LLM involvement
7. **Canvas agent** (Haiku) receives the specialist's output and structures remaining data into card directives
8. Results stream back to the frontend via WebSocket events:
   - `agent_start` — which agent is active
   - `agent_plan` — multi-agent plan with step tracking
   - `tool_call` — MCP tool execution progress (running/complete)
   - `text` — assistant text response
   - `card` — card directive for the canvas
   - `confirmation_request` — remediation proposals requiring user approval
   - `done` — query complete
9. Frontend renders text in the chat panel and cards on the canvas

## Frontend Architecture

### Component Hierarchy

```
App.tsx
├── ThemeInitializer
└── AppLayout (resizable split pane)
    ├── ChatPanel (left pane)
    │   ├── AgentIndicator (pipeline visualization with tool call progress)
    │   ├── ChatMessage[] (markdown rendered, with interactive tables)
    │   │   ├── InteractiveTable (clickable rows with entity-specific popups)
    │   │   │   ├── DevicePopup / TestPopup / ClientPopup / UplinkPopup / SsidPopup
    │   │   │   └── HoverPopup (generic fallback)
    │   │   └── MarkdownRowPopup (for markdown table rows)
    │   ├── ConfirmationModal (remediation approval)
    │   ├── PromptQueue (multi-turn conversation queue)
    │   └── ChatInput (with HelpMenu quick actions dropdown)
    │       └── HelpMenu (categorized prompt templates: Discovery, Wi-Fi, Troubleshooting, Security, etc.)
    └── CanvasPanel (right pane — @xyflow/react)
        ├── CardNode[] (custom ReactFlow nodes)
        │   ├── CardHeader (title, source badge, minimize/close)
        │   ├── [Card content component by type]
        │   │   ├── DataTableCard (sortable columns)
        │   │   ├── BarChartCard (grouped bars, fullscreen support)
        │   │   ├── LineChartCard (multi-line with area fills, dBm/ms/% units, fullscreen)
        │   │   ├── PieChartCard (interactive donut ring with hover expansion)
        │   │   ├── AlertSummaryCard (severity-colored alerts)
        │   │   ├── TextReportCard (markdown prose)
        │   │   ├── NetworkHealthCard (metric tiles with status)
        │   │   ├── NetworkDetailCard (network info + WAN alerts)
        │   │   ├── OrgSummaryCard (org-level overview)
        │   │   ├── SwitchDetailCard (switch ports table)
        │   │   ├── AccessPointDetailCard (AP metrics + channel util)
        │   │   ├── DeviceDetailCard (generic device info)
        │   │   ├── TestDetailCard (ThousandEyes test metrics + agents)
        │   │   ├── TopologyCard (interactive SVG with WAN link status colors)
        │   │   ├── WifiHealthCard (summary metrics + per-AP table)
        │   │   └── SsidDetailCard (SSID config + security assessment)
        │   └── StatDetailPopover (hoverable stat details)
        ├── StackNode (category group headers for stacked cards)
        └── UpstreamConnection (visual edge between stacks)
```

### State Management (Zustand)

| Store | File | Manages |
|-------|------|---------|
| **chatSlice** | chatSlice.ts | Messages, agent state, tool calls, pending prompts, streaming text |
| **canvasSlice** | canvasSlice.ts | Card nodes/edges, auto-layout, stacking by category, card dedup by key |
| **connectionSlice** | connectionSlice.ts | WebSocket connection state and reconnection |
| **themeSlice** | themeSlice.ts | Light/dark mode toggle (persisted to localStorage) |
| **toastSlice** | toastSlice.ts | Toast notification queue |
| **queueSlice** | queueSlice.ts | Prompt queue for sequential multi-turn conversations |

### Canvas Auto-Layout & Card Stacking

Cards are automatically positioned on the canvas using dagre graph layout:
1. Each card has a **category** derived from its type (e.g., `switch_detail` → "switch", `wifi_health` → "wifi")
2. Cards in the same category are **stacked** vertically under a **StackNode** header
3. Category columns are ordered: org → network → topology → switch → access_point → ssid → device → test → alert → wifi → chart → table → report
4. Duplicate cards are prevented via **card keys** (e.g., `ssid:{networkId}:{ssidNumber}`, `wifi-health:{networkName}`)

### Interactive Tables

Chat messages embed structured `TableData` objects rendered by `InteractiveTable`:
- Rows are clickable, opening entity-specific popup modals
- Rows support `status_type` ("error", "warning") with colored left-border accents
- Popups display detailed metadata and offer "Add to Canvas" to create a card
- Entity types: device, client, uplink, test, ssid, network

## MCP Client Integration

### Meraki MCP (stdio transport)
- Spawns the existing `meraki-mcp-dynamic.py` as a subprocess
- Communicates via stdin/stdout using MCP protocol
- Provides ~804 Meraki API tools (auto-discovered from SDK)
- Supports multi-org profiles, caching, response size management
- Per-agent tool allowlists restrict which tools each agent can call

### ThousandEyes MCP (Streamable HTTP transport)
- Connects to a remote ThousandEyes MCP server via Streamable HTTP
- Authenticated with Bearer token
- Provides test results, path visualization, alert data, instant tests, agent listing

### Caching & Rate Limiting
- **MCP result cache**: MD5 key of (tool_name, args), 1-hour TTL
- **Rate limiting**: 100ms minimum interval between calls per source
- **Retry**: Up to 3 retries with 1s delay for rate-limit errors (429)
- **Skills cache**: Module-level cache in loader.py — skill markdown files read from disk once

## Agent System

AgenticOps uses a multi-agent architecture where a central orchestrator classifies user queries and dispatches them to specialist agents. Each specialist has a focused domain, a curated set of MCP tools, and optional programmatic data enrichment and chart extraction.

### Agent Graph Flow

```
User query → Orchestrator → [conditional routing] → Specialist → Plan Router → [next specialist or canvas] → END
```

**Single-agent queries** (most common):
```
Orchestrator → Specialist → Canvas → END
```

**Multi-agent plans** (compound queries, up to 3 agents):
```
Orchestrator → Specialist₁ → Plan Router → Specialist₂ → Plan Router → Canvas → END
```

### Agent Summary

| Agent | Model | Max Iterations | MCP Sources | Programmatic Enrichment | Chart/Card Extraction |
|-------|-------|---------------|-------------|------------------------|----------------------|
| **Orchestrator** | Haiku | 1 (classifier) | None | No | No |
| **Discovery** | Haiku | 6 | Meraki + TE | Yes | Interactive tables |
| **Wi-Fi** | Sonnet | 7 | Meraki | Yes | pie_chart, line_chart, bar_chart, wifi_health |
| **Troubleshooting** | Sonnet | 10 | Meraki + TE | Yes | Interactive tables |
| **Performance** | Haiku | 6 | Meraki + TE | Yes | line_chart |
| **Security** | Haiku | 10 | Meraki + TE | No | No |
| **Compliance** | Haiku | 10 | Meraki + TE | No | No |
| **Topology** | Haiku | 10 | Meraki | Yes | topology card |
| **Testing** | Haiku | 10 | TE only | No | No |
| **Remediation** | Sonnet | 10 | Meraki | No | No |
| **Canvas** | Haiku | 1 (single call) | None | No | Card JSON output |

### Orchestrator Agent

**File**: `agents/orchestrator.py` | **Prompt**: `prompts/orchestrator.md`

Classifies user queries and routes to the appropriate specialist. Uses a two-tier routing strategy:

1. **Fast-path regex matching** — 15+ regex patterns checked in priority order, enabling sub-second routing for common queries without an LLM call. Priority tiers:
   - Performance → Testing → Topology → WiFi → Troubleshooting → Remediation → Discovery → Security → Compliance
2. **LLM classification** (fallback) — Haiku model with 100 max tokens classifies ambiguous queries into agent names. Supports comma-separated multi-agent plans (capped at 3).

Also detects whether the user wants visual cards on the canvas via `_CARD_PATTERNS` regex, and handles follow-up "show as card" requests.

**Output**: Sets `active_agent`, `generate_cards` flag, `agent_plan` (list of agent names), and `plan_step`.

### Discovery Agent

**File**: `agents/discovery.py` | **Prompt**: `prompts/discovery.md`

Handles inventory, listing, and overview queries: networks, devices, clients, SSIDs, uplinks, tests, organizational summary.

- **Model**: Haiku (fast) | **Iterations**: 6 | **Timeout**: 90s
- **Tools**: 19 (Meraki + ThousandEyes — organizations, networks, devices, clients, SSIDs, status, events, tests, agents)
- **Skills**: network_inventory.md, organizational_summary.md
- **Programmatic enrichment** (parallel):
  - `getOrganizationDevicesStatuses` for device listing if LLM missed it
  - `getOrganizationApplianceUplinkStatuses` for WAN alerts in network tables
  - `list_cloud_enterprise_agents` for ThousandEyes agent name/location enrichment
  - Batch-fetches 4 TE metrics (WEB_AVAILABILITY, WEB_TTFB, NET_LATENCY, NET_LOSS) for test listings
  - Uplink queries: parallelizes fetches of statuses, appliance devices, and networks via `asyncio.gather()`
- **Interactive tables** (programmatic, not LLM-generated):
  - `extract_network_table()` — networks with device counts, health, WAN alerts
  - `extract_device_table()` — devices with serial, model, status, IP
  - `extract_client_table()` — clients with device, SSID, IP, usage
  - `extract_test_table()` — tests with agent location, metrics
  - `extract_ssid_table()` — SSIDs with auth mode, band, VLAN
  - `extract_uplink_table()` — WAN uplink status (failed/active/not connected)

### Wi-Fi Agent

**File**: `agents/wifi.py` | **Prompt**: `prompts/wifi.md`

Specialized wireless analysis: RF health, channel utilization, client capacity, band distribution, RSSI trends, signal quality.

- **Model**: Sonnet (complex RF analysis requires strong reasoning) | **Iterations**: 7 | **Timeout**: 90s
- **Tools**: 9 Meraki tools (`call_meraki_api` for wireless methods; `search_methods`/`get_method_info` intentionally excluded to prevent wasted LLM iterations)
- **Skills**: wifi_health_assessment.md, rf_analysis.md, wifi_client_analysis.md
- **Programmatic enrichment** (post-loop, parallel via `asyncio.gather`):
  - `getOrganizationNetworks` — always fetched for network name resolution
  - `getOrganizationWirelessDevicesChannelUtilizationByNetwork` (24h timespan, perPage=1000)
  - `getOrganizationWirelessDevicesPacketLossByNetwork` (24h timespan)
  - Per-band `getNetworkWirelessSignalQualityHistory` for RSSI queries — fetches all 3 bands (2.4, 5, 6 GHz) regardless of what the LLM called, since the MCP cache prevents duplicate API calls
- **Chart extraction** (`_extract_wifi_charts()` — pure Python, no LLM, priority order):
  1. Band distribution queries → **pie_chart** (donut ring: 2.4/5/6 GHz utilization distribution)
  2. RSSI/signal queries → **line_chart** (per-band RSSI over 24 hours)
  3. Network-specific queries → **wifi_health** card (summary metrics + per-AP table with hover client popups)
  4. Trend queries → **line_chart** (utilization or client count over time)
  5. Default → **bar_chart** (CU by network + client density by network)
- **Defensive parsing**: `_safe_args()` helper handles LLM producing malformed `parameters` (string instead of dict)

### Troubleshooting Agent

**File**: `agents/troubleshooting.py` | **Prompt**: `prompts/troubleshooting.md`

Root cause analysis, forensic investigation, connectivity diagnostics, performance issue diagnosis, event analysis.

- **Model**: Sonnet (complex multi-step analysis) | **Iterations**: 10 | **Timeout**: 90s
- **Tools**: 27 (Meraki + ThousandEyes — networks, devices, clients, events, SSIDs, tests, metrics, anomalies, alerts, path visualization, BGP, outages)
- **Skills**: wireless_troubleshooting.md, wan_performance.md, client_troubleshooting.md, application_performance.md, performance_degradation_analysis.md
- **Programmatic enrichment**:
  - Batch-fetches ThousandEyes metrics (WEB_AVAILABILITY, WEB_TTFB, NET_LATENCY, NET_LOSS) if LLM identified tests but missed metrics
  - `list_cloud_enterprise_agents` for test table agent name/location enrichment
- **Interactive tables**: `extract_test_table()` for test performance data

### Performance Agent

**File**: `agents/performance.py` | **Prompt**: `prompts/performance.md`

Test performance metrics, latency/availability/loss trends, response time visualization. The LLM identifies relevant tests, then metrics are batch-fetched programmatically.

- **Model**: Haiku (lightweight — heavy lifting is programmatic) | **Iterations**: 6 | **Timeout**: 90s
- **Tools**: 10 (ThousandEyes + limited Meraki — test discovery, metrics, agents, uplinks)
- **Skills**: performance_monitoring.md, application_performance.md
- **Programmatic enrichment** (concurrent with LLM loop):
  - Background `asyncio.create_task()` starts batch-fetching 4 metrics as soon as test results are detected
  - `list_cloud_enterprise_agents` for test table enrichment
- **Chart extraction** (`_extract_performance_charts()` — pure Python):
  - Parses CSV-format metrics from ThousandEyes batch API
  - Card 1: Timing line chart (NET_LATENCY, WEB_TTFB — cyan/indigo/purple/pink)
  - Card 2: Health line chart (NET_LOSS — red)
  - Formats timestamps as HH:MM labels
- **Interactive tables**: `extract_test_table()` for test performance data

### Security Agent

**File**: `agents/security.py` | **Prompt**: `prompts/security.md`

Security posture assessment, firewall analysis, threat detection, switch port security audit, wireless security review.

- **Model**: Haiku (fast) | **Iterations**: 10 | **Timeout**: 90s
- **Tools**: 11 (Meraki + ThousandEyes — networks, devices, clients, SSIDs, switch ports, events, alerts, anomalies, outages)
- **Skills**: security_posture.md, switch_port_security.md, wireless_security.md

### Compliance Agent

**File**: `agents/compliance.py` | **Prompt**: `prompts/compliance.md`

Configuration audits, policy compliance checks, monitoring compliance assessment, best practice validation.

- **Model**: Haiku (fast) | **Iterations**: 10 | **Timeout**: 90s
- **Tools**: 10 (Meraki + ThousandEyes — networks, devices, SSIDs, switch ports, tests, alerts)
- **Skills**: config_audit.md, monitoring_compliance.md

### Topology Agent

**File**: `agents/topology.py` | **Prompt**: `prompts/topology.md`

Network topology discovery via LLDP/CDP, device interconnection mapping, network diagram generation.

- **Model**: Haiku (fast) | **Iterations**: 10 (many parallel LLDP/CDP calls) | **Timeout**: 90s
- **Tools**: 7 Meraki tools (networks, devices, uplinks, LLDP/CDP via call_meraki_api)
- **Skills**: network_topology.md
- **Programmatic enrichment**: `getOrganizationApplianceUplinkStatuses` for per-interface WAN link status
- **Parallel execution**: Tool calls within a single LLM response parallelized via `execute_tools_parallel()` with asyncio timeout
- **Card extraction**: `extract_topology_card()` builds topology card from raw LLDP/CDP data
  - Nodes: devices with serial, model, status, IP, deviceType (inferred from model prefix: MX→mx, MS→ms, MR→mr, etc.)
  - Links: LLDP/CDP connections with link type, speed, status
  - WAN link colors: red (failed), gray (not connected), purple (active)

### Testing Agent

**File**: `agents/testing.py` | **Prompt**: `prompts/testing.md`

On-demand ThousandEyes instant tests (HTTP, DNS, page load, web transaction, API, agent-to-agent), test template deployment, test re-execution.

- **Model**: Haiku (fast) | **Iterations**: 10 | **Timeout**: 90s
- **Tools**: 11 ThousandEyes tools (instant tests, templates, agent discovery)
- **Skills**: instant_testing.md, connectivity_validation.md, template_deployment.md

### Remediation Agent

**File**: `agents/remediation.py` | **Prompt**: `prompts/remediation.md`

Write operations with mandatory user confirmation: switch port config, SSID changes, firewall rules, network configuration.

- **Model**: Sonnet (safety-critical write operations require strong reasoning) | **Iterations**: 10 | **Tool call timeout**: 60s (longer for write ops)
- **Tools**: 8 Meraki tools (updateDeviceSwitchPort, call_meraki_api, API discovery for ID resolution)
- **Skills**: switch_port_remediation.md, ssid_remediation.md, firewall_remediation.md
- **Two-phase confirmation flow**:
  1. **Proposal phase**: LLM formulates change plan, detects proposal markers ("proposed change", "would you like me to proceed", etc.)
  2. Frontend shows `ConfirmationModal` with change description
  3. **Execution phase**: After user approval, LLM executes write operations with verification

### Canvas Agent

**File**: `agents/canvas_agent.py` | **Prompt**: `prompts/canvas.md`

Structures specialist tool results into card directives (JSON array) for frontend visualization. Single LLM call, no tool access.

- **Model**: Haiku (fast card generation) | **Single call** (no agentic loop) | **Timeout**: 20s
- **Input**: User query, specialist's text response, tool results (2000-char preview per tool)
- **Output**: JSON array of card objects matching the frontend card type schemas
- **Guidelines**: Only creates cards when explicitly requested or clearly implied; prefers data_table over text_report for entity details; enforces topology card type for map queries

### MCP Tool Access by Agent

| Agent | # Tools | Meraki | ThousandEyes | Notes |
|-------|---------|--------|-------------|-------|
| **Discovery** | 19 | Yes | Yes | Broadest access for inventory queries |
| **Troubleshooting** | 27 | Yes | Yes | Most tools — full diagnostic access |
| **Wi-Fi** | 9 | Yes | No | Wireless-only; no schema exploration tools |
| **Performance** | 10 | Yes | Yes | TE metrics + Meraki uplinks |
| **Security** | 11 | Yes | Yes | Firewall, threats, switch ports |
| **Compliance** | 10 | Yes | Yes | Config audit, monitoring compliance |
| **Topology** | 7 | Yes | No | Devices, LLDP/CDP, uplinks |
| **Testing** | 11 | No | Yes | TE instant tests, templates, agents |
| **Remediation** | 8 | Yes | No | Write operations + API discovery |

### Design Patterns

**Programmatic Data Enrichment** — Agents fetch critical data after the LLM loop to avoid relying on the LLM calling the right tools. Enrichment calls run in parallel via `asyncio.gather()`. The MCP result cache (MD5 key, 1-hour TTL) prevents duplicate API calls even when the LLM already called the same endpoint.

**Chart Extraction** — WiFi and Performance agents build visual cards programmatically from raw tool_results (no LLM involvement). This ensures accurate data visualization without hallucinated values. Charts are injected directly into the agent response, bypassing the Canvas agent.

**Interactive Tables** — Discovery, Troubleshooting, and Performance agents extract structured `TableData` objects from tool results. These render as clickable tables in chat with entity-specific popup modals (DevicePopup, TestPopup, ClientPopup, UplinkPopup, SsidPopup). Programmatic summaries replace verbose LLM prose for listing queries.

**Parallel Tool Execution** — Agents use `execute_tools_parallel()` to run independent MCP tool calls concurrently within a single LLM response. This significantly reduces latency for agents like Topology (multiple LLDP/CDP calls) and Discovery (multi-network lookups).

**Multi-Agent Plans** — The Orchestrator can route compound queries to multiple specialists sequentially. Each specialist increments `plan_step` before returning. The Plan Router (pure-logic node, no LLM) dispatches to the next agent. Example: "List all switches then fix port 5" → Discovery → Remediation.

## WebSocket Protocol

### Client → Server
```json
{ "type": "user_message", "content": "Show me all networks" }
{ "type": "stop" }
{ "type": "confirmation_response", "approved": true, "session_id": "default" }
```

### Server → Client
```json
{ "type": "agent_start", "data": { "agent": "discovery" } }
{ "type": "agent_plan", "data": { "plan": ["discovery", "remediation"], "step": 0 } }
{ "type": "tool_call", "data": { "tool": "getOrganizationNetworks", "source": "meraki", "status": "running" } }
{ "type": "tool_call", "data": { "tool": "getOrganizationNetworks", "source": "meraki", "status": "complete" } }
{ "type": "text", "data": "Here are the networks in your organization:" }
{ "type": "card", "data": { "id": "card-1", "type": "data_table", "title": "Networks", ... } }
{ "type": "confirmation_request", "data": { "description": "Update VLAN on port 5", "agent": "remediation" } }
{ "type": "done" }
```

## Session Management

Sessions are stored in-memory keyed by session ID. Each session tracks:
- Chat message history
- Active cards on the canvas
- Last tool results and assistant text (for follow-up queries)
- LangGraph checkpoint for conversation continuity

## Future: A2A Integration

The architecture is designed for future Agent-to-Agent (A2A) protocol support, enabling external agent systems to interact with AgenticOps agents as peers. The orchestrator can be extended to route queries to external A2A endpoints.
