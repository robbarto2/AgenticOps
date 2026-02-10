export interface WebSocketOutMessage {
  type: 'user_message' | 'stop'
  content?: string
  session_id?: string
}

export interface WebSocketInEvent {
  type: 'agent_start' | 'tool_call' | 'text' | 'card' | 'done' | 'error' | 'cards_ready' | 'table_data'
  data: unknown
}

export interface AgentStartData {
  agent: string
}

export interface ToolCallData {
  tool: string
  source: 'meraki' | 'thousandeyes'
  status: 'running' | 'complete'
}

export interface CardData {
  id: string
  type: string
  title: string
  source: 'meraki' | 'thousandeyes'
  data: Record<string, unknown>
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'
