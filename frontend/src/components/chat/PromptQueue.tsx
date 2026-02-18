import { useState, useEffect } from 'react'
import { useQueueStore } from '../../store/queueSlice'

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}m ${sec.toString().padStart(2, '0')}s`
}

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(Date.now() - startedAt)

  useEffect(() => {
    setElapsed(Date.now() - startedAt)
    const interval = setInterval(() => {
      setElapsed(Date.now() - startedAt)
    }, 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  return (
    <span className="text-[10px] text-gray-400 font-mono tabular-nums">
      {formatElapsed(elapsed)}
    </span>
  )
}

interface Props {
  onStopProcessing?: () => void
}

export function PromptQueue({ onStopProcessing }: Props) {
  const queue = useQueueStore((s) => s.queue)
  const cancelPrompt = useQueueStore((s) => s.cancelPrompt)
  const [isExpanded, setIsExpanded] = useState(true)

  // Only show pending and processing items (not completed/cancelled/error)
  const activeQueue = queue.filter((p) => p.status === 'pending' || p.status === 'processing')

  // Don't show queue if empty
  if (activeQueue.length === 0) return null

  const pendingCount = activeQueue.filter((p) => p.status === 'pending').length

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20'
      case 'processing':
        return 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20'
      case 'completed':
        return 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/20'
      case 'cancelled':
        return 'bg-gray-50 dark:bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-200 dark:border-gray-500/20'
      case 'error':
        return 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20'
      default:
        return 'bg-gray-50 dark:bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-200 dark:border-gray-500/20'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        )
      case 'processing':
        return (
          <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )
      case 'completed':
        return (
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        )
      case 'cancelled':
        return (
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        )
      case 'error':
        return (
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        )
    }
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
      <div
        className="px-3 py-1.5 flex items-center gap-1.5 border-b border-gray-200 dark:border-gray-800 cursor-pointer hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <svg
          className={`w-3 h-3 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <svg className="w-3 h-3 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
        </svg>
        <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
          Queue
        </span>
        {pendingCount > 0 && (
          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 rounded-full">
            {pendingCount} pending
          </span>
        )}
        <span className="ml-auto text-[10px] text-gray-500 dark:text-gray-400">
          {isExpanded ? 'click to collapse' : 'click to expand'}
        </span>
      </div>

      {isExpanded && (
        <div className="max-h-32 overflow-y-auto">
        {activeQueue.map((item, index) => (
          <div
            key={item.id}
            className="px-3 py-1.5 border-b border-gray-200 dark:border-gray-800 last:border-b-0 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <div className="flex items-start gap-2">
              <div className="flex-shrink-0">
                <span className="flex items-center justify-center w-4 h-4 text-[10px] font-semibold text-gray-600 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 rounded-full">
                  {index + 1}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-900 dark:text-gray-100 line-clamp-1 leading-tight">
                  {item.prompt}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`inline-flex items-center gap-0.5 px-1 py-0.5 text-[10px] font-medium border rounded ${getStatusColor(item.status)}`}>
                    <span className="scale-75">{getStatusIcon(item.status)}</span>
                    {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                  </span>
                  {item.status === 'processing' && item.startedAt && (
                    <ElapsedTimer startedAt={item.startedAt} />
                  )}
                </div>
              </div>
              {(item.status === 'pending' || item.status === 'processing') && (
                <button
                  onClick={() => {
                    if (item.status === 'processing' && onStopProcessing) {
                      onStopProcessing()
                    } else {
                      cancelPrompt(item.id)
                    }
                  }}
                  className="flex-shrink-0 p-0.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-colors"
                  title={item.status === 'processing' ? 'Stop processing' : 'Cancel prompt'}
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
        </div>
      )}
    </div>
  )
}
