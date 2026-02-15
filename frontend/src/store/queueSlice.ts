import { create } from 'zustand'

export interface QueuedPrompt {
  id: string
  prompt: string
  status: 'pending' | 'processing' | 'completed' | 'cancelled' | 'error'
  addedAt: number
}

interface QueueState {
  queue: QueuedPrompt[]
  currentPromptId: string | null

  addPrompt: (prompt: string) => string
  removePrompt: (id: string) => void
  cancelPrompt: (id: string) => void
  setPromptStatus: (id: string, status: QueuedPrompt['status']) => void
  getNextPending: () => QueuedPrompt | null
  clearCompleted: () => void
}

export const useQueueStore = create<QueueState>((set, get) => ({
  queue: [],
  currentPromptId: null,

  addPrompt: (prompt: string) => {
    const id = `prompt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const newPrompt: QueuedPrompt = {
      id,
      prompt,
      status: 'pending',
      addedAt: Date.now(),
    }
    set((state) => ({
      queue: [...state.queue, newPrompt],
    }))
    return id
  },

  removePrompt: (id: string) => {
    set((state) => ({
      queue: state.queue.filter((p) => p.id !== id),
    }))
  },

  cancelPrompt: (id: string) => {
    set((state) => ({
      queue: state.queue.map((p) =>
        p.id === id ? { ...p, status: 'cancelled' as const } : p
      ),
    }))
  },

  setPromptStatus: (id: string, status: QueuedPrompt['status']) => {
    set((state) => {
      // Update the status
      let newQueue = state.queue.map((p) =>
        p.id === id ? { ...p, status } : p
      )

      // Auto-remove completed, cancelled, and error prompts after a short delay
      if (status === 'completed' || status === 'cancelled' || status === 'error') {
        setTimeout(() => {
          set((state) => ({
            queue: state.queue.filter((p) => p.id !== id),
          }))
        }, 2000) // Remove after 2 seconds
      }

      return {
        queue: newQueue,
        currentPromptId: status === 'processing' ? id : state.currentPromptId,
      }
    })
  },

  getNextPending: () => {
    const state = get()
    return state.queue.find((p) => p.status === 'pending') || null
  },

  clearCompleted: () => {
    set((state) => ({
      queue: state.queue.filter((p) => p.status !== 'completed' && p.status !== 'cancelled'),
    }))
  },
}))
