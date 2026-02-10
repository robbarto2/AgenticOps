import { create } from 'zustand'
import type { ChatMessage, ToolCallEvent, TableData } from '../types/chat'

export interface CompletedToolCall extends ToolCallEvent {
  agent: string
}

interface ChatState {
  messages: ChatMessage[]
  activeAgent: string | null
  activeToolCalls: ToolCallEvent[]
  completedToolCalls: CompletedToolCall[]
  isProcessing: boolean
  processingStartedAt: number | null
  pendingPrompt: string | null
  pendingTableData: TableData[]

  addMessage: (message: ChatMessage) => void
  appendToLastAssistant: (text: string) => void
  attachTableData: (tableData: TableData) => void
  setActiveAgent: (agent: string | null) => void
  addToolCall: (toolCall: ToolCallEvent) => void
  updateToolCall: (tool: string, status: 'running' | 'complete') => void
  setProcessing: (processing: boolean) => void
  clearToolCalls: () => void
  setPendingPrompt: (prompt: string | null) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  activeAgent: null,
  activeToolCalls: [],
  completedToolCalls: [],
  isProcessing: false,
  processingStartedAt: null,
  pendingPrompt: null,
  pendingTableData: [],

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  appendToLastAssistant: (text) =>
    set((state) => {
      const messages = [...state.messages]
      const lastIdx = messages.length - 1
      let pendingTableData = state.pendingTableData

      if (lastIdx >= 0 && messages[lastIdx].role === 'assistant') {
        messages[lastIdx] = {
          ...messages[lastIdx],
          content: messages[lastIdx].content + text,
        }
      } else {
        // Creating a new assistant message — attach any pending table data
        const newMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: text,
          timestamp: new Date().toISOString(),
          agentName: state.activeAgent ?? undefined,
        }
        if (pendingTableData.length > 0) {
          newMsg.tableData = [...pendingTableData]
          pendingTableData = []
        }
        messages.push(newMsg)
      }
      return { messages, pendingTableData }
    }),

  attachTableData: (tableData) =>
    set((state) => {
      const messages = [...state.messages]
      const lastIdx = messages.length - 1
      console.log('[chatSlice] attachTableData called, lastMsg role:', lastIdx >= 0 ? messages[lastIdx].role : 'none', 'tableData:', tableData?.table_id)
      if (lastIdx >= 0 && messages[lastIdx].role === 'assistant') {
        const existing = messages[lastIdx].tableData ?? []
        messages[lastIdx] = {
          ...messages[lastIdx],
          tableData: [...existing, tableData],
        }
        console.log('[chatSlice] Attached tableData to message, total tables:', messages[lastIdx].tableData?.length)
        return { messages, pendingTableData: [] }
      }
      // No assistant message yet — queue for later attachment
      console.log('[chatSlice] No assistant message yet, queuing tableData')
      return { pendingTableData: [...state.pendingTableData, tableData] }
    }),

  setActiveAgent: (agent) => set({ activeAgent: agent }),

  addToolCall: (toolCall) =>
    set((state) => ({
      activeToolCalls: [...state.activeToolCalls, toolCall],
    })),

  updateToolCall: (tool, status) =>
    set((state) => ({
      activeToolCalls: state.activeToolCalls.map((tc) =>
        tc.tool === tool ? { ...tc, status } : tc
      ),
    })),

  setProcessing: (processing) =>
    set(processing
      ? { isProcessing: true, processingStartedAt: Date.now() }
      : { isProcessing: false, processingStartedAt: null, completedToolCalls: [] }
    ),

  clearToolCalls: () =>
    set((state) => ({
      completedToolCalls: [
        ...state.completedToolCalls,
        ...state.activeToolCalls.map((tc) => ({
          ...tc,
          status: 'complete' as const,
          agent: state.activeAgent ?? 'unknown',
        })),
      ],
      activeToolCalls: [],
    })),

  setPendingPrompt: (prompt) => set({ pendingPrompt: prompt }),

  clearMessages: () => set({ messages: [], pendingTableData: [] }),
}))
