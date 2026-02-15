import { useEffect } from 'react'
import { useThemeStore } from '../store/themeSlice'

/**
 * Initializes theme on app mount and handles theme changes
 */
export function ThemeInitializer() {
  const mode = useThemeStore((s) => s.mode)

  // Apply theme on mount and when mode changes
  useEffect(() => {
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
  }, [mode])

  return null
}
