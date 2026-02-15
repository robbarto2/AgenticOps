import { useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface ClientMetadata {
  description?: string
  mac: string
  ip?: string
  vlan?: string
  ssid?: string
  manufacturer?: string
  status?: string
  firstSeen?: string
  lastSeen?: string
}

interface Props {
  metadata: ClientMetadata
  clientName: string
  onClose: () => void
}

export function ClientPopup({ metadata, clientName, onClose }: Props) {
  const popupRef = useRef<HTMLDivElement>(null)

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

  const popupWidth = 380

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/25" />
      <div
        ref={popupRef}
        className="relative bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-lg shadow-2xl"
        style={{ width: popupWidth, maxHeight: '70vh', overflow: 'auto' }}
      >
        {/* Header with Status */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-start gap-2.5 flex-1 min-w-0">
              <div className="text-2xl mt-0.5 p-1.5 rounded-lg bg-purple-50 dark:bg-purple-500/10">
                👤
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 truncate">
                  {clientName}
                </h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20">
                    Network Client
                  </span>
                  {metadata.status && (
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                      metadata.status.toLowerCase() === 'online'
                        ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/20'
                        : 'bg-gray-50 dark:bg-gray-500/10 text-gray-700 dark:text-gray-400 border border-gray-200 dark:border-gray-500/20'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        metadata.status.toLowerCase() === 'online'
                          ? 'bg-green-500 dark:bg-green-400'
                          : 'bg-gray-500 dark:bg-gray-400'
                      }`} />
                      {metadata.status}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Client details */}
        <div className="px-4 py-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            <div>
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">MAC Address</span>
              <p className="text-sm text-gray-900 dark:text-gray-100 font-mono mt-0.5">{metadata.mac}</p>
            </div>

            {metadata.ip && (
              <div>
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">IP Address</span>
                <p className="text-sm text-gray-900 dark:text-gray-100 font-mono mt-0.5">{metadata.ip}</p>
              </div>
            )}

            {metadata.vlan && metadata.vlan !== '-' && (
              <div>
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">VLAN</span>
                <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">{metadata.vlan}</p>
              </div>
            )}

            {metadata.ssid && metadata.ssid !== '-' && (
              <div>
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">SSID</span>
                <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">{metadata.ssid}</p>
              </div>
            )}

            {metadata.manufacturer && metadata.manufacturer !== '-' && (
              <div className="col-span-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Manufacturer</span>
                <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">{metadata.manufacturer}</p>
              </div>
            )}

            {metadata.lastSeen && (
              <div className="col-span-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Last Seen</span>
                <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">{new Date(metadata.lastSeen).toLocaleString()}</p>
              </div>
            )}
          </div>
        </div>

        {/* Close button */}
        <div className="px-4 py-3 bg-gray-50/50 dark:bg-gray-800/20 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={onClose}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border-2 border-gray-200 dark:border-gray-700 rounded-lg transition-all shadow-sm hover:shadow cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
