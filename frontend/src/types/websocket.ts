export interface WebSocketOutMessage {
  type: 'user_message' | 'stop' | 'confirmation_response'
  content?: string
  session_id?: string
  approved?: boolean
  images?: { dataUrl: string; mimeType: string }[]
}

export interface WebSocketInEvent {
  type: 'agent_start' | 'tool_call' | 'text' | 'card' | 'done' | 'error' | 'cards_ready' | 'table_data' | 'agent_plan' | 'confirmation_request'
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

export interface AgentPlanData {
  plan: string[]
  step: number
}

export interface ConfirmationRequestData {
  description: string
  agent: string
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'
