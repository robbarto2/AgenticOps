# AgenticOps Architecture

## Overview

AgenticOps is an AI-powered network operations tool with a canvas-style UI. It uses a multi-agent architecture powered by LangGraph, connects to Meraki and ThousandEyes MCP servers, and renders results as interactive cards on an infinite canvas.

## System Architecture

```
                                    ┌─────────────────────────────────────────┐
                                    │        LangGraph Agent System           │
                                    │                                         │
User ──WebSocket──> FastAPI ──────> │  Orchestrator Agent                     │
                                    │    ├── Troubleshooting Agent ──┐        │
                                    │    ├── Compliance Agent ───────┤        │
                                    │    ├── Security Agent ─────────┤──MCP──>│──> Meraki MCP (stdio)
                                    │    ├── Discovery Agent ────────┤        │──> ThousandEyes MCP (SSE)
                                    │    └── Canvas Agent ───────────┘        │
                                    │                                         │
                                    │  Skills Registry (SKILLS.md)            │
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
4. **Specialist agent** (troubleshooting, compliance, security, or discovery) executes MCP tool calls against Meraki/ThousandEyes, analyzes results
5. **Canvas agent** receives the specialist's output and structures it into card directives (data_table, bar_chart, line_chart, etc.)
6. Results stream back to the frontend via WebSocket events:
   - `agent_start` - which agent is active
   - `tool_call` - MCP tool execution progress
   - `text` - assistant text response
   - `card` - card directive for the canvas
   - `done` - query complete
7. Frontend renders text in the chat panel and cards on the canvas

## MCP Client Integration

### Meraki MCP (stdio transport)
- Spawns the existing `meraki-mcp-dynamic.py` as a subprocess
- Communicates via stdin/stdout using MCP protocol
- Provides ~804 Meraki API tools (auto-discovered from SDK)
- Supports multi-org profiles, caching, response size management

### ThousandEyes MCP (SSE transport)
- Connects to a remote ThousandEyes MCP server via Server-Sent Events
- Authenticated with Bearer token
- Provides test results, path visualization, alert data

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
