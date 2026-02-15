import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'light' | 'dark'

interface ThemeState {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'dark',
      setMode: (mode) => {
        set({ mode })
        // Apply theme immediately when mode changes
        applyTheme(mode)
      },
    }),
    {
      name: 'agenticops-theme',
      onRehydrateStorage: () => (state) => {
        // Apply theme after hydration from localStorage
        if (state) {
          applyTheme(state.mode)
        }
      },
    }
  )
)

// Apply theme to document root
function applyTheme(mode: ThemeMode) {
  const root = document.documentElement
  const body = document.body

  if (mode === 'dark') {
    root.classList.add('dark')
    body.classList.add('dark')
    root.style.colorScheme = 'dark'
  } else {
    root.classList.remove('dark')
    body.classList.remove('dark')
    root.style.colorScheme = 'light'
  }
}
