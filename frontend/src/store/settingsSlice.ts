import { create } from 'zustand'

export interface CurrentValues {
  anthropic_api_key: string
  meraki_api_key: string
  meraki_org_id: string
  te_token: string
}

interface SettingsState {
  needsSetup: boolean | null
  isLoading: boolean
  isOpen: boolean
  error: string | null
  currentValues: CurrentValues | null

  checkSetup: () => Promise<void>
  runSetup: (keys: {
    anthropic_api_key: string
    meraki_api_key: string
    meraki_org_id: string
    te_token?: string
  }) => Promise<boolean>
  setOpen: (open: boolean) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  needsSetup: null,
  isLoading: false,
  isOpen: false,
  error: null,
  currentValues: null,

  checkSetup: async () => {
    try {
      const res = await fetch('/api/settings')
      if (!res.ok) return
      const data = await res.json()
      set({
        needsSetup: data.needs_setup,
        currentValues: data.current_values,
      })
      if (data.needs_setup) {
        set({ isOpen: true })
      }
    } catch {
      // Backend not reachable — will retry on reconnect
    }
  },

  runSetup: async (keys) => {
    set({ isLoading: true, error: null })
    try {
      const res = await fetch('/api/settings/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(keys),
      })
      const data = await res.json()
      if (data.success) {
        set({ isLoading: false, isOpen: false, needsSetup: false, error: null })
        return true
      }
      set({ isLoading: false, error: data.message })
      return false
    } catch {
      set({ isLoading: false, error: 'Failed to reach backend.' })
      return false
    }
  },

  setOpen: (open) => set({ isOpen: open }),
}))
