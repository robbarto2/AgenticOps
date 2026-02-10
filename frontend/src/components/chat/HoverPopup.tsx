import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { TableRowMetadata } from '../../types/chat'
import { useCanvasStore } from '../../store/canvasSlice'
import type { NetworkHealthCard } from '../../types/card'

interface EntityStats {
  deviceCount: number
  clientCount: number
  ssidCount: number
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
  const [error, setError] = useState<string | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const addCard = useCanvasStore((s) => s.addCard)

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
    setError(null)

    if (!metadata.networkId) {
      setLoading(false)
      setError('No network ID')
      return
    }

    fetch(`/api/entity/${entityType}/${metadata.networkId}/stats`)
      .then((res) => {
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
          setError(err.message)
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [entityType, metadata.networkId])

  const handleAddToCanvas = () => {
    const metrics = []

    if (stats) {
      metrics.push(
        { label: 'Devices', value: String(stats.deviceCount), status: 'healthy' as const },
        { label: 'Clients', value: String(stats.clientCount), status: 'healthy' as const },
        { label: 'SSIDs', value: String(stats.ssidCount), status: 'healthy' as const },
      )
    }

    if (metadata.timeZone) {
      metrics.push({ label: 'Time Zone', value: metadata.timeZone, status: 'healthy' as const })
    }

    if (metadata.productTypes && metadata.productTypes.length > 0) {
      metrics.push({
        label: 'Product Types',
        value: metadata.productTypes.join(', '),
        status: 'healthy' as const,
      })
    }

    if (metadata.tags && metadata.tags.length > 0) {
      metrics.push({
        label: 'Tags',
        value: metadata.tags.join(', '),
        status: 'healthy' as const,
        icon: 'globe' as const,
      })
    }

    if (metadata.notes) {
      metrics.push({
        label: 'Notes',
        value: metadata.notes,
        status: 'healthy' as const,
      })
    }

    metrics.push({
      label: 'Network ID',
      value: metadata.networkId,
      status: 'healthy' as const,
      icon: 'server' as const,
    })

    const card: NetworkHealthCard = {
      id: `card-${metadata.networkId}-${Date.now()}`,
      type: 'network_health',
      title: networkName || metadata.networkId,
      source: 'meraki',
      data: { metrics },
    }

    addCard(card)
    onClose()
  }

  // Smart positioning: prefer right of row, flip left if viewport overflow
  const popupWidth = 320
  const popupEstimatedHeight = 340
  const gap = 8
  let left = anchorRect.right + gap
  let top = anchorRect.top

  if (left + popupWidth > window.innerWidth - 16) {
    left = anchorRect.left - popupWidth - gap
  }
  if (left < 16) {
    left = 16
  }

  // Clamp vertically so popup stays within viewport
  if (top + popupEstimatedHeight > window.innerHeight - 16) {
    top = Math.max(16, window.innerHeight - popupEstimatedHeight - 16)
  }

  return createPortal(
    <div
      ref={popupRef}
      className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl"
      style={{ left, top, width: popupWidth, maxHeight: '80vh', overflow: 'auto' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <p className="text-xs font-semibold text-gray-200 truncate pr-2">
          {networkName || metadata.networkId}
        </p>
        <button
          onClick={onClose}
          className="flex-shrink-0 p-0.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors cursor-pointer"
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
            <p className="text-xs text-gray-300">{metadata.notes}</p>
          </div>
        )}

        <div>
          <span className="text-xs text-gray-500">Network ID</span>
          <p className="text-xs text-gray-400 font-mono">{metadata.networkId}</p>
        </div>

        {metadata.timeZone && (
          <div>
            <span className="text-xs text-gray-500">Time Zone</span>
            <p className="text-xs text-gray-300">{metadata.timeZone}</p>
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
      <div className="border-t border-gray-800" />

      {/* Live stats */}
      <div className="px-3 py-2">
        <span className="text-xs text-gray-500">Live Stats</span>
        {loading ? (
          <div className="flex items-center gap-2 mt-1">
            <div className="w-3 h-3 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-xs text-gray-500">Loading stats...</span>
          </div>
        ) : error ? (
          <p className="text-xs text-red-400 mt-1">Failed to load stats</p>
        ) : stats ? (
          <div className="grid grid-cols-3 gap-2 mt-1">
            <div className="text-center p-1.5 bg-gray-800/50 rounded">
              <p className="text-sm font-semibold text-gray-200">{stats.deviceCount}</p>
              <p className="text-xs text-gray-500">Devices</p>
            </div>
            <div className="text-center p-1.5 bg-gray-800/50 rounded">
              <p className="text-sm font-semibold text-gray-200">{stats.clientCount}</p>
              <p className="text-xs text-gray-500">Clients</p>
            </div>
            <div className="text-center p-1.5 bg-gray-800/50 rounded">
              <p className="text-sm font-semibold text-gray-200">{stats.ssidCount}</p>
              <p className="text-xs text-gray-500">SSIDs</p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Divider */}
      <div className="border-t border-gray-800" />

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
    </div>,
    document.body
  )
}
