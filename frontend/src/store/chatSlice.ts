import { create } from 'zustand'
import type { ChatMessage, ToolCallEvent } from '../types/chat'

interface ChatState {
  messages: ChatMessage[]
  activeAgent: string | null
  activeToolCalls: ToolCallEvent[]
  isProcessing: boolean

  addMessage: (message: ChatMessage) => void
  appendToLastAssistant: (text: string) => void
  setActiveAgent: (agent: string | null) => void
  addToolCall: (toolCall: ToolCallEvent) => void
  updateToolCall: (tool: string, status: 'running' | 'complete') => void
  setProcessing: (processing: boolean) => void
  clearToolCalls: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  activeAgent: null,
  activeToolCalls: [],
  isProcessing: false,

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  appendToLastAssistant: (text) =>
    set((state) => {
      const messages = [...state.messages]
      const lastIdx = messages.length - 1
      if (lastIdx >= 0 && messages[lastIdx].role === 'assistant') {
        messages[lastIdx] = {
          ...messages[lastIdx],
          content: messages[lastIdx].content + text,
        }
      } else {
        messages.push({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: text,
          timestamp: new Date().toISOString(),
          agentName: state.activeAgent ?? undefined,
        })
      }
      return { messages }
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

  setProcessing: (processing) => set({ isProcessing: processing }),

  clearToolCalls: () => set({ activeToolCalls: [] }),
}))
