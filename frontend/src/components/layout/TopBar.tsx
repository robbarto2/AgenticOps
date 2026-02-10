import { useConnectionStore } from '../../store/connectionSlice'
import { useChatStore } from '../../store/chatSlice'
import { agentDisplayName } from '../../utils/formatters'
import { HelpMenu } from './HelpMenu'

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
    <div className="flex items-center justify-between px-4 py-2 bg-gray-900/80 border-b border-gray-800 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-white tracking-tight">
          AgenticOps
        </h1>
        <span className="text-xs text-gray-500 font-mono">v0.1</span>
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

        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
          <span className="text-xs text-gray-400 capitalize">{status}</span>
        </div>
      </div>
    </div>
  )
}
