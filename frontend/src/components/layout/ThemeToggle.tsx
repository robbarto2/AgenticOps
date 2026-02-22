import { useThemeStore, type ThemeMode } from '../../store/themeSlice'

export function ThemeToggle() {
  const { mode, setMode } = useThemeStore()

  const cycleTheme = () => {
    const nextMode: ThemeMode = mode === 'light' ? 'dark' : 'light'
    setMode(nextMode)
  }

  const getSliderPosition = () => {
    return mode === 'light' ? '2px' : '18px'
  }

  const getModeLabel = () => {
    return mode
  }

  return (
    <button
      onClick={cycleTheme}
      className="flex items-center gap-2.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-800/50 border border-gray-400 dark:border-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
      title={`Theme: ${mode}`}
    >
      {/* Icon */}
      <div className="relative w-4 h-4 flex-shrink-0">
        {mode === 'dark' ? (
          <svg
            className="w-4 h-4 text-blue-400 transition-colors"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
            />
          </svg>
        ) : (
          <svg
            className="w-4 h-4 text-amber-400 transition-colors"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
        )}
      </div>

      {/* Toggle switch */}
      <div className="relative w-9 h-5 bg-gray-300 dark:bg-gray-700 rounded-full transition-colors flex-shrink-0">
        <div
          className="absolute top-0.5 w-4 h-4 bg-blue-500 rounded-full transition-all duration-200 ease-in-out"
          style={{
            transform: `translateX(${getSliderPosition()})`,
          }}
        />
      </div>

      {/* Label */}
      <span className="text-xs text-gray-600 dark:text-gray-300 font-medium capitalize min-w-[2.75rem] text-left">
        {getModeLabel()}
      </span>
    </button>
  )
}
