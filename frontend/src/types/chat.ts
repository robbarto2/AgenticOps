export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  agentName?: string
  toolCalls?: ToolCallEvent[]
}

export interface ToolCallEvent {
  tool: string
  source: 'meraki' | 'thousandeyes'
  status: 'running' | 'complete'
}
