import { create } from 'zustand'
import type { ImageAttachment } from '../types/chat'

export interface QueuedPrompt {
  id: string
  prompt: string
  images?: ImageAttachment[]
  status: 'pending' | 'processing' | 'completed' | 'cancelled' | 'error'
  addedAt: number
  startedAt?: number
  completedAt?: number
}

interface QueueState {
  queue: QueuedPrompt[]
  currentPromptId: string | null

  addPrompt: (prompt: string, images?: ImageAttachment[]) => string
  removePrompt: (id: string) => void
  cancelPrompt: (id: string) => void
  cancelAllPending: () => void
  setPromptStatus: (id: string, status: QueuedPrompt['status']) => void
  getNextPending: () => QueuedPrompt | null
  clearCompleted: () => void
}

export const useQueueStore = create<QueueState>((set, get) => ({
  queue: [],
  currentPromptId: null,

  addPrompt: (prompt: string, images?: ImageAttachment[]) => {
    const id = `prompt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const newPrompt: QueuedPrompt = {
      id,
      prompt,
      images,
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

  cancelAllPending: () => {
    set((state) => ({
      queue: state.queue.map((p) =>
        p.status === 'pending' ? { ...p, status: 'cancelled' as const, completedAt: Date.now() } : p
      ),
    }))
  },

  setPromptStatus: (id: string, status: QueuedPrompt['status']) => {
    set((state) => {
      const now = Date.now()

      // Update the status with timestamps
      let newQueue = state.queue.map((p) => {
        if (p.id !== id) return p

        const updates: Partial<QueuedPrompt> = { status }

        // Track start time when processing begins
        if (status === 'processing') {
          updates.startedAt = now
        }

        // Track completion time when done
        if (status === 'completed' || status === 'cancelled' || status === 'error') {
          updates.completedAt = now
        }

        return { ...p, ...updates }
      })

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
