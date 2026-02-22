import { useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCanvasStore } from '../../store/canvasSlice'
import { useQueueStore } from '../../store/queueSlice'
import type { DeviceDetailCard } from '../../types/card'

interface UplinkMetadata {
  serial: string
  deviceName?: string
  networkId?: string
  networkName?: string
  model?: string
  interface: string
  status?: string
  ip?: string
  gateway?: string
  publicIp?: string
  provider?: string
}

interface Props {
  metadata: UplinkMetadata
  deviceName: string
  onClose: () => void
}

export function UplinkPopup({ metadata, deviceName, onClose }: Props) {
  const popupRef = useRef<HTMLDivElement>(null)
  const addPrompt = useQueueStore((s) => s.addPrompt)
  const addCard = useCanvasStore((s) => s.addCard)
  const [isDissolving, setIsDissolving] = useState(false)

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

  const statusLower = metadata.status?.toLowerCase() || ''
  const isFailed = statusLower === 'failed'
  const isNotConnected = statusLower === 'not connected'
  const showTroubleshoot = isFailed || isNotConnected

  const handleTroubleshoot = () => {
    const name = metadata.deviceName || metadata.serial
    const prompt = `Troubleshoot WAN uplink ${metadata.interface} on device ${name} (serial ${metadata.serial}) which is currently "${metadata.status}". Check uplink loss and latency, recent device events, and determine the likely cause and recommended remediation.`
    addPrompt(prompt)
    onClose()
  }

  const handleAddToCanvas = () => {
    const modelPrefix = (metadata.model || '').substring(0, 2).toUpperCase()
    const deviceType =
      modelPrefix === 'MX' ? 'Security Appliance' :
      modelPrefix === 'MG' ? 'Cellular Gateway' :
      'Network Device'

    const cardData: DeviceDetailCard = {
      id: `card-device-${metadata.serial}-${Date.now()}`,
      type: 'device_detail',
      title: metadata.deviceName || deviceName,
      source: 'meraki',
      data: {
        serial: metadata.serial,
        model: metadata.model || '',
        deviceType,
        lanIp: metadata.ip,
        networkId: metadata.networkId,
        status: metadata.status,
      },
    }

    setIsDissolving(true)
    requestAnimationFrame(() => {
      setTimeout(() => {
        addCard(cardData)
        onClose()
      }, 220)
    })
  }

  const merakiUrl = metadata.networkId && metadata.serial
    ? `https://dashboard.meraki.com/n/${metadata.networkId}/manage/nodes/${metadata.serial}/general` : null

  const statusPillClass =
    statusLower === 'active'         ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
    statusLower === 'ready'          ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
    statusLower === 'failed'         ? 'bg-red-500/10 text-red-400 border-red-500/20' :
    statusLower === 'not connected'  ? 'bg-gray-500/10 text-gray-400 border-gray-500/20' :
    'bg-gray-500/10 text-gray-400 border-gray-500/20'

  const statusDotClass =
    statusLower === 'active'         ? 'bg-emerald-400' :
    statusLower === 'ready'          ? 'bg-blue-400' :
    statusLower === 'failed'         ? 'bg-red-400' :
    'bg-gray-400'

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        ref={popupRef}
        className={`relative bg-white dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-400 rounded-lg shadow-2xl ${isDissolving ? 'animate-popup-dissolve' : ''}`}
        style={{ width: 380, maxHeight: '80vh', overflow: 'auto' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800">
          <p className="text-xs font-semibold text-gray-900 dark:text-gray-200 truncate pr-2">{deviceName}</p>
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
          {/* Type + Status badges */}
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center px-1.5 py-0.5 text-xs rounded border bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
              WAN Uplink
            </span>
            {metadata.status && (
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded border ${statusPillClass}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusDotClass}`} />
                {metadata.status}
              </span>
            )}
          </div>

          {metadata.model && (
            <div>
              <span className="text-xs text-gray-500">Model</span>
              <p className="text-xs text-gray-800 dark:text-gray-300">{metadata.model}</p>
            </div>
          )}

          <div>
            <span className="text-xs text-gray-500">Serial</span>
            <p className="text-xs text-gray-600 dark:text-gray-400 font-mono">{metadata.serial}</p>
          </div>

          <div>
            <span className="text-xs text-gray-500">Interface</span>
            <p className="text-xs text-gray-800 dark:text-gray-300">{metadata.interface}</p>
          </div>

          {metadata.ip && metadata.ip !== '—' && (
            <div>
              <span className="text-xs text-gray-500">IP Address</span>
              <p className="text-xs text-gray-800 dark:text-gray-300 font-mono">{metadata.ip}</p>
            </div>
          )}

          {metadata.gateway && (
            <div>
              <span className="text-xs text-gray-500">Gateway</span>
              <p className="text-xs text-gray-800 dark:text-gray-300 font-mono">{metadata.gateway}</p>
            </div>
          )}

          {metadata.publicIp && metadata.publicIp !== '—' && (
            <div>
              <span className="text-xs text-gray-500">Public IP</span>
              <p className="text-xs text-gray-800 dark:text-gray-300 font-mono">{metadata.publicIp}</p>
            </div>
          )}

          {metadata.provider && metadata.provider !== '—' && (
            <div>
              <span className="text-xs text-gray-500">Provider / ISP</span>
              <p className="text-xs text-gray-800 dark:text-gray-300">{metadata.provider}</p>
            </div>
          )}

          {metadata.networkName && (
            <div>
              <span className="text-xs text-gray-500">Network</span>
              <p className="text-xs text-gray-800 dark:text-gray-300">{metadata.networkName}</p>
            </div>
          )}

          {metadata.networkId && (
            <div>
              <span className="text-xs text-gray-500">Network ID</span>
              <p className="text-xs text-gray-600 dark:text-gray-400 font-mono">{metadata.networkId}</p>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 dark:border-gray-800" />

        {/* Actions */}
        <div className="px-3 py-2 space-y-1.5">
          <button
            onClick={handleAddToCanvas}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-md transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add to Canvas
          </button>

          {showTroubleshoot && (
            <button
              onClick={handleTroubleshoot}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-md transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
              </svg>
              Troubleshoot Uplink
            </button>
          )}

          {merakiUrl && (
            <a href={merakiUrl} target="_blank" rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-800/60 hover:bg-gray-200 dark:hover:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md transition-colors"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              Open in Meraki Dashboard
            </a>
          )}

          {!showTroubleshoot && !merakiUrl && (
            <p className="text-center text-xs text-gray-500 py-0.5">Uplink is healthy</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
