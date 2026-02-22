import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { TableRowMetadata } from '../../types/chat'
import { useCanvasStore } from '../../store/canvasSlice'
import { useChatStore } from '../../store/chatSlice'
import type { NetworkDetailCard } from '../../types/card'

interface ProblemDevice {
  name: string
  model: string
  serial: string
  status: string
}

interface EntityStats {
  deviceCount: number
  clientCount: number
  ssidCount: number
  onlineCount?: number
  offlineCount?: number
  alertingCount?: number
  location?: string | null
  problemDevices?: ProblemDevice[]
}

interface Props {
  metadata: TableRowMetadata
  entityType: string
  anchorRect: DOMRect
  networkName?: string
  onClose: () => void
}

export function HoverPopup({ metadata, entityType, anchorRect, networkName, onClose }: Props) {
  const [stats, setStats] = useState<EntityStats | null>(null)
  const [loading, setLoading] = useState(true)
  const popupRef = useRef<HTMLDivElement>(null)
  const addCard = useCanvasStore((s) => s.addCard)
  const setPendingPrompt = useChatStore((s) => s.setPendingPrompt)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay listener so the opening click doesn't immediately close it
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    if (!metadata.networkId) {
      setStats({ deviceCount: -1, clientCount: -1, ssidCount: -1 })
      setLoading(false)
      return
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    fetch(`/api/entity/${entityType}/${metadata.networkId}/stats`, { signal: controller.signal })
      .then((res) => {
        clearTimeout(timeout)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (!cancelled) {
          setStats(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          // Show fallback with -1 (unavailable) for all stats
          setStats({ deviceCount: -1, clientCount: -1, ssidCount: -1 })
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
      controller.abort()
      clearTimeout(timeout)
    }
  }, [entityType, metadata.networkId])

  const handleAddToCanvas = () => {
    const card: NetworkDetailCard = {
      id: `card-${metadata.networkId}-${Date.now()}`,
      type: 'network_detail',
      title: networkName || metadata.networkId,
      source: 'meraki',
      data: {
        networkId: metadata.networkId,
        timeZone: metadata.timeZone,
        tags: metadata.tags,
        productTypes: metadata.productTypes,
        notes: metadata.notes,
        location: stats?.location ?? undefined,
        stats: {
          deviceCount: Math.max(stats?.deviceCount ?? 0, 0),
          clientCount: Math.max(stats?.clientCount ?? 0, 0),
          ssidCount: Math.max(stats?.ssidCount ?? 0, 0),
          onlineCount: stats?.onlineCount != null && stats.onlineCount >= 0 ? stats.onlineCount : undefined,
          offlineCount: stats?.offlineCount != null && stats.offlineCount >= 0 ? stats.offlineCount : undefined,
          alertingCount: stats?.alertingCount != null && stats.alertingCount >= 0 ? stats.alertingCount : undefined,
        },
        problemDevices: stats?.problemDevices,
      },
    }

    addCard(card)
    onClose()
  }

  // Center popup on screen so it's never cut off
  const popupWidth = 360

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        ref={popupRef}
        className="relative bg-white dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-400 rounded-lg shadow-2xl"
        style={{ width: popupWidth, maxHeight: '80vh', overflow: 'auto' }}
      >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800">
        <p className="text-xs font-semibold text-gray-900 dark:text-gray-200 truncate pr-2">
          {networkName || metadata.networkId}
        </p>
        <button
          onClick={onClose}
          className="flex-shrink-0 p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Static metadata */}
      <div className="px-3 py-2 space-y-2">
        {metadata.notes && (
          <div>
            <span className="text-xs text-gray-500">Notes</span>
            <p className="text-xs text-gray-800 dark:text-gray-300">{metadata.notes}</p>
          </div>
        )}

        <div>
          <span className="text-xs text-gray-500">Network ID</span>
          <p className="text-xs text-gray-600 dark:text-gray-400 font-mono">{metadata.networkId}</p>
        </div>

        {stats?.location && (
          <div>
            <span className="text-xs text-gray-500">Location</span>
            <p className="text-xs text-gray-800 dark:text-gray-300">{stats.location}</p>
          </div>
        )}

        {metadata.timeZone && (
          <div>
            <span className="text-xs text-gray-500">Time Zone</span>
            <p className="text-xs text-gray-800 dark:text-gray-300">{metadata.timeZone}</p>
          </div>
        )}

        {metadata.tags && metadata.tags.length > 0 && (
          <div>
            <span className="text-xs text-gray-500">Tags</span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {metadata.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 text-xs bg-blue-500/10 text-blue-400 rounded border border-blue-500/20"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {metadata.productTypes && metadata.productTypes.length > 0 && (
          <div>
            <span className="text-xs text-gray-500">Product Types</span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {metadata.productTypes.map((pt) => (
                <span
                  key={pt}
                  className="px-1.5 py-0.5 text-xs bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20"
                >
                  {pt}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200 dark:border-gray-800" />

      {/* Live stats */}
      <div className="px-3 py-2">
        {loading ? (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-xs text-gray-500">Loading stats...</span>
          </div>
        ) : stats ? (
          <div className="space-y-2">
            {/* Active / Inactive devices row */}
            <div className="grid grid-cols-2 gap-2">
              <div className="text-center p-2 bg-gray-100 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-600 rounded-lg">
                <p className="text-lg font-semibold text-emerald-400">
                  {stats.onlineCount != null && stats.onlineCount >= 0 ? stats.onlineCount : (stats.deviceCount >= 0 ? stats.deviceCount : '—')}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Active Devices</p>
              </div>
              <div className="text-center p-2 bg-gray-100 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-600 rounded-lg">
                <p className={`text-lg font-semibold ${((stats.offlineCount ?? 0) + (stats.alertingCount ?? 0)) > 0 ? 'text-red-400' : 'text-gray-900 dark:text-gray-200'}`}>
                  {stats.onlineCount != null && stats.onlineCount >= 0 ? (stats.offlineCount ?? 0) + (stats.alertingCount ?? 0) : '—'}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Inactive Devices</p>
              </div>
            </div>

            {/* Clients + SSIDs row */}
            <div className="grid grid-cols-2 gap-2">
              <div className="text-center p-2 bg-gray-100 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-600 rounded-lg">
                <p className={`text-lg font-semibold ${stats.clientCount < 0 ? 'text-gray-500' : 'text-gray-900 dark:text-gray-200'}`}>
                  {stats.clientCount < 0 ? '—' : stats.clientCount}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Clients</p>
              </div>
              <div className="text-center p-2 bg-gray-100 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-600 rounded-lg">
                <p className={`text-lg font-semibold ${stats.ssidCount < 0 ? 'text-gray-500' : 'text-gray-900 dark:text-gray-200'}`}>
                  {stats.ssidCount < 0 ? '—' : stats.ssidCount}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">SSIDs</p>
              </div>
            </div>

            {/* Device Issues */}
            {stats.problemDevices && stats.problemDevices.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <svg className="w-3.5 h-3.5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Device Issues</span>
                </div>
                <div className="space-y-1">
                  {stats.problemDevices.map((d) => {
                    const isAlerting = d.status.toLowerCase() === 'alerting'
                    const statusLabel = isAlerting ? 'alerting' : 'offline'
                    return (
                      <div
                        key={d.serial}
                        onClick={() => {
                          setPendingPrompt(`Troubleshoot device ${d.name} (${d.model}, serial ${d.serial}) which is ${statusLabel}. Check recent events, device status, connectivity, and determine the likely cause and recommended remediation.`)
                          onClose()
                        }}
                        className={`flex items-center gap-2 p-1.5 rounded-md cursor-pointer transition-colors ${isAlerting ? 'bg-amber-500/5 border border-amber-500/30 hover:bg-amber-500/10' : 'bg-red-500/5 border border-red-500/30 hover:bg-red-500/10'}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isAlerting ? 'bg-amber-500' : 'bg-red-500'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-gray-800 dark:text-gray-200 truncate">{d.name}</p>
                          <p className="text-xs text-gray-500">{d.model}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className={`text-xs font-medium ${isAlerting ? 'text-amber-400' : 'text-red-400'}`}>
                            {isAlerting ? 'Alerting' : 'Offline'}
                          </span>
                          <svg className="w-2.5 h-2.5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                          </svg>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200 dark:border-gray-800" />

      {/* Add to canvas action */}
      <div className="px-3 py-2">
        <button
          onClick={handleAddToCanvas}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-md transition-colors cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add to Canvas
        </button>
      </div>
      </div>
    </div>,
    document.body
  )
}
