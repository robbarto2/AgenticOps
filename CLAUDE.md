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
│   │   ├── orchestrator.py       # Routes queries to specialists (supports multi-agent plans)
│   │   ├── troubleshooting.py    # WiFi, WAN, performance, client, app diagnosis
│   │   ├── compliance.py         # Config audit, policy checks, monitoring compliance
│   │   ├── security.py           # Firewall, threat, switch port, wireless security
│   │   ├── discovery.py          # Inventory, health, topology
│   │   ├── testing.py            # On-demand ThousandEyes instant tests
│   │   ├── remediation.py        # Write operations with user confirmation
│   │   ├── canvas_agent.py       # Structures results into card JSON (Haiku model)
│   │   └── tools.py              # MCP → LangChain tool wrappers
│   ├── mcp_client/
│   │   ├── manager.py            # MCPClientManager (Meraki stdio + TE HTTP)
│   │   └── types.py              # ToolDescriptor dataclass
│   ├── skills/                   # Skill markdown files + loader
│   │   ├── SKILLS.md             # Registry index
│   │   ├── loader.py             # Loads skills into agent prompts
│   │   └── *.md                  # Individual skill definitions
│   ├── api/
│   │   ├── websocket.py          # /ws/chat WebSocket endpoint
│   │   ├── rest.py               # /api/health, /api/skills
│   │   └── models.py             # Pydantic request/response models
│   └── state/
│       └── session.py            # In-memory session store
│
└── frontend/                     # React + TypeScript + Vite
    └── src/
        ├── App.tsx               # Root component
        ├── components/
        │   ├── layout/           # AppLayout (split pane), TopBar
        │   ├── chat/             # ChatPanel, ChatMessage, ChatInput, AgentIndicator, ConfirmationModal
        │   ├── canvas/           # CanvasPanel (ReactFlow wrapper)
        │   └── cards/            # CardNode + 6 card type components
        ├── hooks/                # useWebSocket, useChat, useCanvas
        ├── store/                # Zustand: chatSlice, canvasSlice, connectionSlice
        ├── types/                # card.ts, chat.ts, websocket.ts
        └── utils/                # cardPositioning.ts, formatters.ts
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

- **Orchestrator**: Classifies query, returns one or more of: `troubleshooting`, `compliance`, `security`, `discovery`, `testing`, `remediation`
- **Plan Router**: Pure-logic node (no LLM call) that dispatches to the next agent in the plan sequence
- **Specialist agents**: Call MCP tools via agentic loop (up to 10 iterations), collect tool_results, increment plan_step
- **Testing agent**: Runs on-demand ThousandEyes instant tests (HTTP, DNS, page load, etc.)
- **Remediation agent**: Executes write operations with mandatory user confirmation before changes
- **Canvas agent**: Transforms tool_results into card directives (JSON array of card objects, uses Haiku model)

## MCP connections

| Server | Transport | Config vars |
|--------|-----------|-------------|
| Meraki | stdio (subprocess) | `MERAKI_MCP_SCRIPT`, `MERAKI_MCP_VENV_FASTMCP` |
| ThousandEyes | Streamable HTTP | `TE_MCP_URL=https://api.thousandeyes.com/mcp`, `TE_TOKEN` |

Tool access by agent:
- **Troubleshooting**: Meraki + ThousandEyes (including BGP, events, outages)
- **Compliance**: Meraki + ThousandEyes (monitoring compliance)
- **Security**: Meraki + ThousandEyes (including switch port, wireless audit)
- **Discovery**: Meraki + ThousandEyes
- **Testing**: ThousandEyes only (instant tests, templates, agent discovery)
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
| `line_chart` | `{ labels: string[], datasets: [{label, data, color}] }` | Recharts LineChart |
| `alert_summary` | `{ alerts: [{severity, title, description, timestamp?}] }` | Severity-colored list |
| `text_report` | `{ content: string }` | Markdown rendered |
| `network_health` | `{ metrics: [{label, value, status, icon?}] }` | Metric tiles |

Every card has: `id`, `type`, `title`, `source` ("meraki" or "thousandeyes"), and a `data` object matching its type.

## Skills system

Skills are markdown files in `backend/skills/` that guide agent behavior. Each skill has:
- **Trigger**: Keywords that activate it
- **Steps**: Ordered MCP tool calls
- **Analysis**: Thresholds and patterns to check
- **Presentation**: Which card types to output

Skill-to-agent mapping (in `skills/loader.py`):
- troubleshooting → `wireless_troubleshooting.md`, `wan_performance.md`, `client_troubleshooting.md`, `application_performance.md`
- compliance → `config_audit.md`, `monitoring_compliance.md`
- security → `security_posture.md`, `switch_port_security.md`, `wireless_security.md`
- discovery → `network_inventory.md`
- testing → `instant_testing.md`, `connectivity_validation.md`, `template_deployment.md`
- remediation → `switch_port_remediation.md`, `ssid_remediation.md`, `firewall_remediation.md`

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
3. Add the case to `CardNode.tsx` → `renderContent()` switch
4. Update canvas agent prompt in `backend/agents/canvas_agent.py` with the new type spec

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

- **Backend**: Python 3.12+, FastAPI, LangGraph, LangChain-Anthropic, MCP SDK
- **Frontend**: React 19, TypeScript, Vite, @xyflow/react, Recharts, Zustand, Tailwind CSS v4
- **LLM**: Claude (specialist agents use `model_name`, orchestrator uses `orchestrator_model_name` (Haiku), canvas uses `canvas_model_name` (Haiku) — all configured in `config.py`)
- **Theme**: Dark (bg-gray-950, border-gray-800 palette)

## Key conventions

- Dark theme everywhere — use gray-900/950 backgrounds, gray-700/800 borders
- Card accent colors: blue `#3b82f6`, green `#10b981`, amber `#f59e0b`, red `#ef4444`, purple `#8b5cf6`
- Source badges: blue for Meraki, purple for ThousandEyes
- Severity scale: critical (red) → high (orange) → medium (amber) → low (blue) → info (gray)
- Status scale: healthy (green) → warning (amber) → critical (red)
