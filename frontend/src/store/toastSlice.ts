import { create } from 'zustand'

export interface Toast {
  id: string
  message: string
  type: 'info' | 'warning' | 'error' | 'success'
}

interface ToastState {
  toasts: Toast[]
  addToast: (message: string, type?: Toast['type']) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type = 'info') =>
    set((state) => {
      const id = `toast-${Date.now()}-${Math.random()}`
      return {
        toasts: [...state.toasts, { id, message, type }],
      }
    }),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}))
