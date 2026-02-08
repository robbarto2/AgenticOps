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
│   │   ├── graph.py              # StateGraph definition (nodes + edges)
│   │   ├── state.py              # AgentState TypedDict
│   │   ├── orchestrator.py       # Routes queries to specialists
│   │   ├── troubleshooting.py    # WiFi, WAN, performance diagnosis
│   │   ├── compliance.py         # Config audit, policy checks
│   │   ├── security.py           # Firewall, threat assessment
│   │   ├── discovery.py          # Inventory, health, topology
│   │   ├── canvas_agent.py       # Structures results into card JSON
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
        │   ├── chat/             # ChatPanel, ChatMessage, ChatInput, AgentIndicator
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
Runs on `http://localhost:8000`. Uvicorn with `--reload` watches for Python file changes.

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
User query → Orchestrator → [conditional routing] → Specialist → Canvas → END
```

- **Orchestrator**: Classifies query, returns one of: `troubleshooting`, `compliance`, `security`, `discovery`
- **Specialist agents**: Call MCP tools via agentic loop (up to 10 iterations), collect tool_results
- **Canvas agent**: Transforms tool_results into card directives (JSON array of card objects)

## MCP connections

| Server | Transport | Config vars |
|--------|-----------|-------------|
| Meraki | stdio (subprocess) | `MERAKI_MCP_SCRIPT`, `MERAKI_MCP_VENV_FASTMCP` |
| ThousandEyes | Streamable HTTP | `TE_MCP_URL=https://api.thousandeyes.com/mcp`, `TE_TOKEN` |

Tool access by agent:
- **Troubleshooting**: Meraki + ThousandEyes
- **Compliance**: Meraki only
- **Security**: Meraki + ThousandEyes
- **Discovery**: Meraki + ThousandEyes

## WebSocket protocol

**Client → Server**: `{ "type": "user_message", "content": "...", "session_id": "default" }`

**Server → Client** (streamed events):
- `agent_start` — `{ "agent": "discovery" }`
- `tool_call` — `{ "tool": "getOrganizationNetworks", "source": "meraki", "status": "running"|"complete" }`
- `text` — assistant text response (string)
- `card` — card directive (full card JSON object)
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
- troubleshooting → `wireless_troubleshooting.md`, `wan_performance.md`
- compliance → `config_audit.md`
- security → `security_posture.md`
- discovery → `network_inventory.md`

## Adding a new agent

1. Create `backend/agents/<name>.py` with an async node function taking `AgentState`
2. Add MCP tool access in `mcp_client/manager.py` → `get_tools_for_agent()`
3. Create skill files in `backend/skills/` and register in `loader.py` → `AGENT_SKILLS`
4. Register in `backend/agents/graph.py`:
   - `graph_builder.add_node("<name>", <name>_node)`
   - `graph_builder.add_edge("<name>", "canvas")`
   - Add to the orchestrator's conditional edges map
5. Update orchestrator system prompt in `orchestrator.py` to route to the new agent

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
- **LLM**: Claude (model configured in `config.py` as `model_name`)
- **Theme**: Dark (bg-gray-950, border-gray-800 palette)

## Key conventions

- Dark theme everywhere — use gray-900/950 backgrounds, gray-700/800 borders
- Card accent colors: blue `#3b82f6`, green `#10b981`, amber `#f59e0b`, red `#ef4444`, purple `#8b5cf6`
- Source badges: blue for Meraki, purple for ThousandEyes
- Severity scale: critical (red) → high (orange) → medium (amber) → low (blue) → info (gray)
- Status scale: healthy (green) → warning (amber) → critical (red)
