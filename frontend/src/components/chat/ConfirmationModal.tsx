import { useChatStore } from '../../store/chatSlice'
import { useChat } from '../../hooks/useChat'

export function ConfirmationModal() {
  const pendingConfirmation = useChatStore((s) => s.pendingConfirmation)
  const { sendConfirmation } = useChat()

  if (!pendingConfirmation) return null

  return (
    <div className="mx-4 mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <svg className="w-5 h-5 text-amber-400 flex-shrink-0" viewBox="0 0 24 24" fill="none">
          <path d="M12 9v4m0 4h.01M12 2L2 20h20L12 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-sm font-medium text-amber-400">
          Configuration Change Requires Approval
        </span>
      </div>

      {/* Description - the remediation agent's proposal */}
      <div className="text-xs text-gray-700 dark:text-gray-300 max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
        {pendingConfirmation.description.length > 1000
          ? pendingConfirmation.description.slice(0, 1000) + '...'
          : pendingConfirmation.description
        }
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={() => sendConfirmation(true)}
          className="px-4 py-1.5 rounded-md text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
        >
          Approve
        </button>
        <button
          onClick={() => sendConfirmation(false)}
          className="px-4 py-1.5 rounded-md text-xs font-medium bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
        >
          Deny
        </button>
      </div>
    </div>
  )
}
