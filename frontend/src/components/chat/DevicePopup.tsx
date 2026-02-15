import { useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCanvasStore } from '../../store/canvasSlice'
import type { NetworkDetailCard, SwitchDetailCard, SwitchPort } from '../../types/card'

interface DeviceMetadata {
  serial: string
  deviceName?: string
  model?: string
  lanIp?: string
  status?: string
  firmware?: string
  tags?: string[]
  notes?: string
  networkId?: string
}

interface Props {
  metadata: DeviceMetadata
  deviceName: string
  onClose: () => void
}

export function DevicePopup({ metadata, deviceName, onClose }: Props) {
  const popupRef = useRef<HTMLDivElement>(null)
  const addCard = useCanvasStore((s) => s.addCard)
  const [ports, setPorts] = useState<SwitchPort[]>([])
  const [loading, setLoading] = useState(false)

  const isSwitch = metadata.model?.startsWith('MS')

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

  // Fetch switch ports if this is a switch
  useEffect(() => {
    if (!isSwitch || !metadata.serial) return

    let cancelled = false
    setLoading(true)

    fetch(`/api/device/${metadata.serial}/switch-ports`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (!cancelled) {
          setPorts(data.ports || [])
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to fetch switch ports:', err)
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [isSwitch, metadata.serial])

  const handleAddToCanvas = () => {
    if (isSwitch) {
      const switchCard: SwitchDetailCard = {
        id: `card-switch-${metadata.serial}-${Date.now()}`,
        type: 'switch_detail',
        title: deviceName,
        source: 'meraki',
        data: {
          serial: metadata.serial,
          model: metadata.model || '',
          lanIp: metadata.lanIp,
          firmware: metadata.firmware,
          networkId: metadata.networkId,
          ports,
        },
      }
      addCard(switchCard)
    } else {
      const card: NetworkDetailCard = {
        id: `card-device-${metadata.serial}-${Date.now()}`,
        type: 'network_detail',
        title: deviceName,
        source: 'meraki',
        data: {
          networkId: metadata.networkId || metadata.serial,
          timeZone: null,
          tags: metadata.tags || null,
          productTypes: metadata.model ? [metadata.model] : null,
          notes: metadata.notes || null,
          stats: {
            deviceCount: 1,
            clientCount: 0,
            ssidCount: 0,
          },
        },
      }
      addCard(card)
    }
    onClose()
  }

  const getMerakiUrl = () => {
    if (!metadata.networkId || !metadata.serial) return null
    return `https://dashboard.meraki.com/n/${metadata.networkId}/manage/nodes/${metadata.serial}/general`
  }

  const getEventLogUrl = () => {
    if (!metadata.networkId || !metadata.serial) return null
    return `https://dashboard.meraki.com/n/${metadata.networkId}/manage/nodes/${metadata.serial}/events`
  }

  const popupWidth = isSwitch && ports.length > 0 ? 580 : 480

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        ref={popupRef}
        className="relative bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-lg shadow-2xl"
        style={{ width: popupWidth, maxHeight: '85vh', overflow: 'auto' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <p className="text-base font-semibold text-gray-900 dark:text-gray-200 truncate pr-2">
            {deviceName}
          </p>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Device Type & Port Count */}
        {isSwitch && (
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {metadata.model || 'Network Switch'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {ports.length > 0 ? `${ports.length}-Port Gigabit Switch` : loading ? 'Loading port info...' : 'Switch'}
                </div>
              </div>
              {ports.length > 0 && (
                <div className="text-right">
                  <div className="text-lg font-bold text-green-600 dark:text-green-400">
                    {ports.filter(p => p.status === 'active').length}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    active ports
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Switch Port Visualization */}
        {isSwitch && ports.length > 0 && (
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <div className="mb-3">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Port Status</span>
            </div>

            {/* Switch front panel visualization */}
            <div className="bg-gradient-to-b from-gray-200 to-gray-300 dark:from-gray-800 dark:to-gray-900 rounded-lg p-3 border-2 border-gray-400 dark:border-gray-700">
              <div className="grid grid-cols-12 gap-1">
                {ports.map((port) => {
                  const getPortColor = () => {
                    if (!port.enabled || port.status === 'disabled') return 'bg-gray-400 dark:bg-gray-700 border-gray-500 dark:border-gray-600'
                    if (port.status === 'error') return 'bg-red-500 border-red-600 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                    if (port.status === 'warning') return 'bg-amber-500 border-amber-600 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                    if (port.status === 'disconnected') return 'bg-gray-500 dark:bg-gray-600 border-gray-600 dark:border-gray-500'
                    return 'bg-green-500 border-green-600 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                  }

                  return (
                    <div
                      key={port.portId}
                      className="flex flex-col items-center"
                      title={`Port ${port.portId}: ${port.status}${port.poeActive ? ' • PoE Active' : port.poeEnabled ? ' • PoE Available' : ''}${port.isUplink ? ' • Uplink' : ''}`}
                    >
                      {/* Port number label */}
                      <div className="text-[9px] font-semibold text-gray-700 dark:text-gray-300 mb-0.5">
                        {port.portId}
                      </div>

                      {/* Port representation */}
                      <div className={`relative w-full h-12 rounded border-2 ${getPortColor()} transition-all`}>
                        {/* Port opening */}
                        <div className="absolute inset-x-0.5 top-1 bottom-1 bg-black/30 rounded-sm" />

                        {/* Status indicators */}
                        <div className="absolute inset-x-0 bottom-0 flex justify-center gap-0.5 pb-0.5">
                          {port.isUplink && (
                            <div className="w-1 h-1 bg-blue-400 rounded-full" title="Uplink" />
                          )}
                          {port.poeActive && (
                            <div className="w-1 h-1 bg-yellow-400 rounded-full animate-pulse" title="PoE Active" />
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Legend */}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-green-500 border border-green-600" />
                <span className="text-gray-600 dark:text-gray-400">Active</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-gray-500 border border-gray-600" />
                <span className="text-gray-600 dark:text-gray-400">Disconnected</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-gray-400 border border-gray-500" />
                <span className="text-gray-600 dark:text-gray-400">Disabled</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1 h-1 bg-yellow-400 rounded-full" />
                <span className="text-gray-600 dark:text-gray-400">PoE</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1 h-1 bg-blue-400 rounded-full" />
                <span className="text-gray-600 dark:text-gray-400">Uplink</span>
              </div>
            </div>
          </div>
        )}

        {isSwitch && loading && (
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              <span className="text-sm text-gray-500">Loading switch ports...</span>
            </div>
          </div>
        )}

        {/* Device metadata */}
        <div className="px-4 py-3 space-y-2.5">
          {metadata.notes && (
            <div>
              <span className="text-sm font-medium text-gray-500">Notes</span>
              <p className="text-sm text-gray-800 dark:text-gray-300 mt-0.5">{metadata.notes}</p>
            </div>
          )}

          <div>
            <span className="text-sm font-medium text-gray-500">Serial</span>
            <p className="text-sm text-gray-600 dark:text-gray-400 font-mono mt-0.5">{metadata.serial}</p>
          </div>

          {metadata.model && (
            <div>
              <span className="text-sm font-medium text-gray-500">Model</span>
              <p className="text-sm text-gray-800 dark:text-gray-300 mt-0.5">{metadata.model}</p>
            </div>
          )}

          {metadata.lanIp && (
            <div>
              <span className="text-sm font-medium text-gray-500">IP Address</span>
              <p className="text-sm text-gray-800 dark:text-gray-300 font-mono mt-0.5">{metadata.lanIp}</p>
            </div>
          )}

          {metadata.status && (
            <div>
              <span className="text-sm font-medium text-gray-500">Status</span>
              <p className={`text-sm font-medium mt-0.5 ${
                metadata.status.toLowerCase() === 'online'
                  ? 'text-green-600 dark:text-green-400'
                  : metadata.status.toLowerCase() === 'offline'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}>
                {metadata.status}
              </p>
            </div>
          )}

          {metadata.firmware && (
            <div>
              <span className="text-sm font-medium text-gray-500">Firmware</span>
              <p className="text-sm text-gray-800 dark:text-gray-300 mt-0.5">{metadata.firmware}</p>
            </div>
          )}

          {metadata.tags && metadata.tags.length > 0 && (
            <div>
              <span className="text-sm font-medium text-gray-500">Tags</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {metadata.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 text-sm bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded border border-blue-200 dark:border-blue-500/20"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {metadata.networkId && (
            <div>
              <span className="text-sm font-medium text-gray-500">Network ID</span>
              <p className="text-sm text-gray-600 dark:text-gray-400 font-mono mt-0.5">{metadata.networkId}</p>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 dark:border-gray-800" />

        {/* Action buttons */}
        <div className="px-4 py-3 space-y-2.5">
          <button
            onClick={handleAddToCanvas}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 border border-blue-200 dark:border-blue-500/20 rounded-md transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add to Canvas
          </button>

          <div className="flex gap-2">
            {getEventLogUrl() && (
              <a
                href={getEventLogUrl()!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
                Event Log
              </a>
            )}
            {getMerakiUrl() && (
              <a
                href={getMerakiUrl()!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Dashboard
              </a>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
