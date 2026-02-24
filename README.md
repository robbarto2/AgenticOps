# AgenticOps

AI-powered network operations tool with a canvas-style UI. AgenticOps uses a multi-agent LangGraph architecture to query Cisco Meraki and ThousandEyes via MCP servers, then renders results as interactive cards on an infinite canvas.

```
User ──WebSocket──> FastAPI ──> Orchestrator ──> Specialist Agents ──> MCP Servers
                                                         │
                                                    Canvas Agent
                                                         │
                                              Interactive Card UI
```

## Prerequisites

- **Python 3.12+**
- **Node.js 20+** and npm
- **Git**

## API Keys Required

You will need credentials for three services:

| Key | Service | Where to get it |
|-----|---------|-----------------|
| `ANTHROPIC_API_KEY` | Anthropic (Claude) | [console.anthropic.com](https://console.anthropic.com/) |
| `MERAKI_API_KEY` | Cisco Meraki Dashboard | Meraki Dashboard > My Profile > API access |
| `TE_TOKEN` | Cisco ThousandEyes | ThousandEyes > Account Settings > Users and Roles > OAuth Bearer Token |

The Anthropic key is required. Meraki and ThousandEyes are needed for their respective integrations -- the app won't be able to query network data without them.

## Setup

### 1. Clone the repository

```bash
git clone <repo-url>
cd AgenticOps
```

### 2. Configure environment variables

Copy the sample env file and fill in your API keys:

```bash
cp ".env sample" .env
```

Edit `.env` and set at minimum:

```env
# Required -- Claude powers all the agents
ANTHROPIC_API_KEY=sk-ant-...

# Meraki MCP server paths (adjust to your local paths)
MERAKI_MCP_SCRIPT=./Meraki Magic MCP/meraki-mcp-dynamic.py
MERAKI_MCP_VENV_FASTMCP=./backend/.venv/bin/fastmcp

# Meraki API credentials
MERAKI_API_KEY=your-meraki-api-key
MERAKI_ORG_ID=your-org-id

# ThousandEyes MCP
TE_MCP_URL=https://api.thousandeyes.com/mcp
TE_TOKEN=your-thousandeyes-bearer-token
```

See the `.env sample` file for the full list of optional settings (caching, read-only mode, multi-org profiles, etc.).

### 3. Backend setup

```bash
cd backend

# Create a virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

The `requirements.txt` includes:
- `fastapi` / `uvicorn` -- async web server and WebSocket support
- `langchain-anthropic` / `langgraph` / `langchain-core` -- multi-agent LLM orchestration
- `mcp[cli]` -- Model Context Protocol client SDK
- `python-dotenv` / `pydantic-settings` -- configuration management
- `websockets` -- WebSocket transport

### 4. Frontend setup

```bash
cd frontend

# Install dependencies
npm install
```

### 5. Meraki MCP server

The project expects a Meraki MCP server at the path specified by `MERAKI_MCP_SCRIPT` in your `.env`. This is launched as a stdio subprocess by the backend at startup. Make sure the script path and the `fastmcp` binary path are correct for your setup.

## Running

Start both the backend and frontend in separate terminals:

**Backend** (from the `backend/` directory):

```bash
source .venv/bin/activate
python main.py
```

The backend runs on `http://localhost:8080` with hot-reload enabled.

**Frontend** (from the `frontend/` directory):

```bash
npm run dev
```

The frontend runs on `http://localhost:5173`. Vite proxies `/api` and `/ws` requests to the backend automatically.

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Project Structure

```
AgenticOps/
├── .env                        # API keys and config (never committed)
├── ARCHITECTURE.md             # Detailed system design
├── Meraki Magic MCP/           # Meraki MCP server (stdio subprocess)
│
├── backend/                    # Python FastAPI backend
│   ├── main.py                 # App entry point
│   ├── config.py               # Settings loaded from .env
│   ├── requirements.txt        # Python dependencies
│   ├── agents/                 # LangGraph multi-agent system
│   │   ├── graph.py            # StateGraph definition
│   │   ├── orchestrator.py     # Query classifier and router
│   │   ├── discovery.py        # Network inventory and health
│   │   ├── wifi.py             # Wireless analysis, RF, rogue AP detection
│   │   ├── troubleshooting.py  # Root cause analysis
│   │   ├── performance.py      # ThousandEyes metrics
│   │   ├── topology.py         # Network topology maps
│   │   ├── security.py         # Firewall and threat analysis
│   │   ├── compliance.py       # Config audit and policy checks
│   │   ├── testing.py          # On-demand instant tests
│   │   ├── remediation.py      # Write operations (with confirmation)
│   │   └── canvas_agent.py     # Structures results into card JSON
│   ├── mcp_client/             # MCP server connections
│   ├── skills/                 # Agent skill definitions (.md files)
│   ├── prompts/                # Agent system prompts
│   └── api/                    # REST and WebSocket endpoints
│
└── frontend/                   # React + TypeScript + Vite
    └── src/
        ├── components/
        │   ├── layout/         # App shell, top bar, help menu
        │   ├── chat/           # Chat panel, messages, input
        │   ├── canvas/         # Infinite canvas (ReactFlow)
        │   └── cards/          # Card components (tables, charts, topology, etc.)
        ├── hooks/              # useWebSocket, useChat, useCanvas
        ├── store/              # Zustand state stores
        └── types/              # TypeScript type definitions
```

## Agents

The orchestrator classifies each user query and routes it to one or more specialist agents:

| Agent | Model | Purpose |
|-------|-------|---------|
| Orchestrator | Haiku | Classifies queries and routes to specialists |
| Discovery | Haiku | Network inventory, device/client/SSID listing |
| Wi-Fi | Sonnet | Wireless health, RF analysis, rogue AP detection |
| Troubleshooting | Sonnet | Root cause analysis, diagnostics |
| Performance | Haiku | ThousandEyes metrics and anomaly detection |
| Topology | Sonnet | Network topology maps via LLDP/CDP |
| Security | Haiku | Firewall rules, threat events, wireless audit |
| Compliance | Haiku | Config audit, firmware, monitoring compliance |
| Testing | Haiku | On-demand ThousandEyes instant tests |
| Remediation | Sonnet | Write operations with user confirmation |
| Canvas | Haiku | Transforms results into visual card directives |

## Tech Stack

**Backend**: Python 3.12+, FastAPI, LangGraph, LangChain-Anthropic, MCP SDK, Pydantic

**Frontend**: React 19, TypeScript 5.9, Vite 7, @xyflow/react (infinite canvas), Recharts, Zustand, Tailwind CSS v4

**LLM**: Claude Sonnet (complex analysis) and Claude Haiku (fast routing/summarization)
