import { useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQueueStore } from '../../store/queueSlice'

interface Props {
  headers: string[]
  cells: string[]
  onClose: () => void
}

const WARNING_PATTERNS = /critical|warning|⚠️|alerting|failed|offline|❌/i

export function MarkdownRowPopup({ headers, cells, onClose }: Props) {
  const popupRef = useRef<HTMLDivElement>(null)
  const addPrompt = useQueueStore((s) => s.addPrompt)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  const firstCell = cells[0] || 'Unknown'
  const showTroubleshoot = cells.some((c) => WARNING_PATTERNS.test(c))

  const handleInvestigate = () => {
    addPrompt(`Tell me more about ${firstCell}. Show detailed status, key metrics, and any issues.`)
    onClose()
  }

  const handleTroubleshoot = () => {
    addPrompt(`Troubleshoot ${firstCell}. Investigate the issues, check device status and recent events, and recommend remediation steps.`)
    onClose()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        ref={popupRef}
        className="relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-2xl"
        style={{ width: 380, maxHeight: '80vh', overflow: 'auto' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800">
          <p className="text-xs font-semibold text-gray-900 dark:text-gray-200 truncate pr-2">{firstCell}</p>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Fields */}
        <div className="px-3 py-2 space-y-2">
          {headers.map((header, i) => (
            <div key={i}>
              <span className="text-xs text-gray-500">{header}</span>
              <p className="text-xs text-gray-800 dark:text-gray-300">{cells[i] || '—'}</p>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 dark:border-gray-800" />

        {/* Actions */}
        <div className="px-3 py-2 flex flex-col gap-1.5">
          <button
            onClick={handleInvestigate}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-md transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            Investigate
          </button>
          {showTroubleshoot && (
            <button
              onClick={handleTroubleshoot}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-md transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
              </svg>
              Troubleshoot
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
