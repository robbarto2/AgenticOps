export interface ImageAttachment {
  id: string
  dataUrl: string   // "data:image/png;base64,..."
  fileName: string
  mimeType: string  // "image/png" | "image/jpeg" | "image/gif" | "image/webp"
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  agentName?: string
  toolCalls?: ToolCallEvent[]
  tableData?: TableData[]
  images?: ImageAttachment[]
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
  deviceTotal?: number
  onlineCount?: number
  offlineCount?: number
  alertingCount?: number
}

export interface TableRow {
  id: string
  cells: string[]
  metadata: TableRowMetadata | any
  status_type?: 'normal' | 'warning' | 'error'
}

export interface TableData {
  table_id: string
  entity_type: string
  source: 'meraki' | 'thousandeyes'
  columns: string[]
  rows: TableRow[]
}
