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
      metadata.status && `Status: ${metadata.status}`,
    ].filter(Boolean).join(', ')

    const statusContext = metadata.status?.toLowerCase() === 'offline'
      ? 'This client is currently OFFLINE.'
      : metadata.status?.toLowerCase() === 'online'
      ? 'This client is currently online.'
      : ''

    const prompt = `Troubleshoot client "${clientName}" (${details}). ${statusContext} Find this client in Meraki, check their connection history and events (especially disassociation/deauth/DHCP events for this MAC), check the AP or switch they connect to, analyze SSID configuration, and provide a root cause diagnosis with specific remediation steps.`

    addPrompt(prompt)
    onClose()
  }

  const popupWidth = 380

  const statusPillClass =
    metadata.status?.toLowerCase() === 'online'   ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
    metadata.status?.toLowerCase() === 'offline'  ? 'bg-red-500/10 text-red-400 border-red-500/20' :
    metadata.status?.toLowerCase() === 'alerting' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
    'bg-gray-500/10 text-gray-400 border-gray-500/20'

  const statusDotClass =
    metadata.status?.toLowerCase() === 'online'   ? 'bg-emerald-400' :
    metadata.status?.toLowerCase() === 'offline'  ? 'bg-red-400' :
    metadata.status?.toLowerCase() === 'alerting' ? 'bg-amber-400' :
    'bg-gray-400'

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        ref={popupRef}
        className="relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-2xl"
        style={{ width: popupWidth, maxHeight: '80vh', overflow: 'auto' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800">
          <p className="text-xs font-semibold text-gray-900 dark:text-gray-200 truncate pr-2">{clientName}</p>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Metadata */}
        <div className="px-3 py-2 space-y-2">
          {/* Type + Status */}
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center px-1.5 py-0.5 text-xs rounded border bg-purple-500/10 text-purple-400 border-purple-500/20">
              Network Client
            </span>
            {metadata.status && (
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded border ${statusPillClass}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusDotClass}`} />
                {metadata.status}
              </span>
            )}
          </div>

          <div>
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">MAC Address</span>
            <p className="text-sm text-gray-700 dark:text-gray-300 font-mono">{metadata.mac}</p>
          </div>

          {metadata.ip && (
            <div>
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">IP Address</span>
              <p className="text-sm text-gray-700 dark:text-gray-300 font-mono">{metadata.ip}</p>
            </div>
          )}

          {metadata.vlan && metadata.vlan !== '-' && (
            <div>
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">VLAN</span>
              <p className="text-sm text-gray-900 dark:text-gray-100">{metadata.vlan}</p>
            </div>
          )}

          {metadata.ssid && metadata.ssid !== '-' && (
            <div>
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">SSID</span>
              <p className="text-sm text-gray-900 dark:text-gray-100">{metadata.ssid}</p>
            </div>
          )}

          {metadata.manufacturer && metadata.manufacturer !== '-' && (
            <div>
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Manufacturer</span>
              <p className="text-sm text-gray-900 dark:text-gray-100">{metadata.manufacturer}</p>
            </div>
          )}

          {metadata.networkName && (
            <div>
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Network</span>
              <p className="text-sm text-gray-900 dark:text-gray-100">{metadata.networkName}</p>
            </div>
          )}

          {metadata.lastSeen && (
            <div>
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Last Seen</span>
              <p className="text-sm text-gray-900 dark:text-gray-100">{new Date(metadata.lastSeen).toLocaleString()}</p>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 dark:border-gray-800" />

        {/* Actions */}
        <div className="px-3 py-2">
          <button
            onClick={handleTroubleshoot}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-md transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
            </svg>
            Troubleshoot Client
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
