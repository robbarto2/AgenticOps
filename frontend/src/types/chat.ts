export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  agentName?: string
  toolCalls?: ToolCallEvent[]
  tableData?: TableData[]
}

export interface ToolCallEvent {
  tool: string
  source: 'meraki' | 'thousandeyes'
  status: 'running' | 'complete'
}

export interface TableRowMetadata {
  networkId: string
  notes?: string
  tags?: string[]
  timeZone?: string
  productTypes?: string[]
}

export interface TableRow {
  id: string
  cells: string[]
  metadata: TableRowMetadata
}

export interface TableData {
  table_id: string
  entity_type: string
  source: 'meraki' | 'thousandeyes'
  columns: string[]
  rows: TableRow[]
}
