import { useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQueueStore } from '../../store/queueSlice'

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
  networkId?: string
  networkName?: string
}

interface Props {
  metadata: ClientMetadata
  clientName: string
  onClose: () => void
}

export function ClientPopup({ metadata, clientName, onClose }: Props) {
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

  const handleTroubleshoot = () => {
    // Build troubleshooting prompt with client details
    const details = [
      `MAC: ${metadata.mac}`,
      metadata.ip && `IP: ${metadata.ip}`,
      metadata.ssid && metadata.ssid !== '-' && `SSID: ${metadata.ssid}`,
      metadata.vlan && metadata.vlan !== '-' && `VLAN: ${metadata.vlan}`,
      metadata.networkName && `Network: ${metadata.networkName}`,
    ].filter(Boolean).join(', ')

    const prompt = `Diagnose connectivity and performance issues for client "${clientName}" with ${details}. Troubleshoot: connection quality (RSSI, signal strength), latency, throughput, packet loss, authentication issues, DHCP/DNS problems. Find recent network events affecting this client. If ThousandEyes endpoint agent data exists for this client's IP, include path quality and ISP metrics. Provide root cause analysis and remediation steps.`

    addPrompt(prompt)
    onClose()
  }

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
            {metadata.status && (
              <div className="col-span-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</span>
                <div className="mt-1">
                  {(() => {
                    const s = metadata.status.toLowerCase()
                    let dotClass: string
                    let pillClass: string
                    if (s === 'online') {
                      dotClass = 'bg-emerald-500'
                      pillClass = 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 ring-emerald-500/40'
                    } else if (s === 'alerting') {
                      dotClass = 'bg-amber-500'
                      pillClass = 'bg-amber-500/20 text-amber-600 dark:text-amber-400 ring-amber-500/40'
                    } else if (s === 'offline') {
                      dotClass = 'bg-red-500'
                      pillClass = 'bg-red-500/20 text-red-600 dark:text-red-400 ring-red-500/40'
                    } else {
                      dotClass = 'bg-gray-400'
                      pillClass = 'bg-gray-500/20 text-gray-600 dark:text-gray-400 ring-gray-500/40'
                    }
                    return (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ring-1 ring-inset ${pillClass}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                        {metadata.status}
                      </span>
                    )
                  })()}
                </div>
              </div>
            )}

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

        {/* Action buttons */}
        <div className="px-4 py-3 bg-gray-50/50 dark:bg-gray-800/20 border-t border-gray-200 dark:border-gray-800">
          <div className="flex gap-2">
            <button
              onClick={handleTroubleshoot}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 rounded-lg transition-all shadow-sm hover:shadow cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
              </svg>
              Troubleshoot
            </button>
            <button
              onClick={onClose}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border-2 border-gray-200 dark:border-gray-700 rounded-lg transition-all shadow-sm hover:shadow cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
