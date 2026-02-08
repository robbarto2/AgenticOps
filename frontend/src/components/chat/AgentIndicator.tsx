import { useChatStore } from '../../store/chatSlice'
import { agentDisplayName } from '../../utils/formatters'

export function AgentIndicator() {
  const activeAgent = useChatStore((s) => s.activeAgent)
  const toolCalls = useChatStore((s) => s.activeToolCalls)
  const isProcessing = useChatStore((s) => s.isProcessing)

  if (!isProcessing && !activeAgent) return null

  return (
    <div className="px-4 py-2 border-t border-gray-800 bg-gray-900/50">
      {activeAgent && (
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          <span className="text-xs text-blue-400 font-medium">
            {agentDisplayName(activeAgent)} Agent working...
          </span>
        </div>
      )}

      {toolCalls.length > 0 && (
        <div className="space-y-1 ml-4">
          {toolCalls.map((tc, i) => (
            <div key={`${tc.tool}-${i}`} className="flex items-center gap-2">
              {tc.status === 'running' ? (
                <svg
                  className="w-3 h-3 text-amber-400 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="2"
                    opacity="0.3"
                  />
                  <path
                    d="M12 2a10 10 0 0 1 10 10"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg
                  className="w-3 h-3 text-emerald-400"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    d="M5 13l4 4L19 7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              <span className="text-xs text-gray-400 font-mono truncate">
                {tc.tool}
              </span>
              <span
                className={`text-xs px-1.5 py-0.5 rounded ${
                  tc.source === 'meraki'
                    ? 'bg-blue-500/10 text-blue-400'
                    : 'bg-purple-500/10 text-purple-400'
                }`}
              >
                {tc.source}
              </span>
            </div>
          ))}
        </div>
      )}

      {isProcessing && !activeAgent && (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" />
          <span className="text-xs text-gray-400">Processing...</span>
        </div>
      )}
    </div>
  )
}
