import { useConnectionStore } from '../../store/connectionSlice'
import { useChatStore } from '../../store/chatSlice'
import { useSettingsStore } from '../../store/settingsSlice'
import { agentDisplayName } from '../../utils/formatters'
import { HelpMenu } from './HelpMenu'
import { ThemeToggle } from './ThemeToggle'

export function TopBar() {
  const status = useConnectionStore((s) => s.status)
  const activeAgent = useChatStore((s) => s.activeAgent)

  const statusColors: Record<string, string> = {
    connected: 'bg-emerald-500',
    connecting: 'bg-amber-500',
    disconnected: 'bg-gray-500',
    error: 'bg-red-500',
  }

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gray-50/90 dark:bg-[#0c1019]/90 border-b border-gray-200 dark:border-[#1e2636] backdrop-blur-sm transition-colors">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">
          AgenticOps
        </h1>
        <span className="text-xs text-gray-500 dark:text-gray-500 font-mono">v0.1</span>
      </div>

      <div className="flex items-center gap-4">
        {activeAgent && (
          <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <span className="text-xs text-blue-400 font-medium">
              {agentDisplayName(activeAgent)} Agent
            </span>
          </div>
        )}

        <HelpMenu />

        <button
          onClick={() => useSettingsStore.getState().setOpen(true)}
          className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-white/5 transition-colors"
          title="Settings"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>

        <ThemeToggle />

        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
          <span className="text-xs text-gray-600 dark:text-gray-400 capitalize">{status}</span>
        </div>
      </div>
    </div>
  )
}
