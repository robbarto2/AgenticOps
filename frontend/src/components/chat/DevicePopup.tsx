import { useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCanvasStore } from '../../store/canvasSlice'
import type { NetworkDetailCard, SwitchDetailCard, AccessPointDetailCard, SwitchPort } from '../../types/card'

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

// Helper to determine device type from model prefix
function getDeviceType(model?: string): { type: string; icon: string; color: string } {
  if (!model) return { type: 'Network Device', icon: '📦', color: 'gray' }

  const prefix = model.substring(0, 2).toUpperCase()

  switch (prefix) {
    case 'MS':
      return { type: 'Switch', icon: '🔀', color: 'blue' }
    case 'MR':
    case 'CW':  // Catalyst Wireless access points
      return { type: 'Access Point', icon: '📡', color: 'green' }
    case 'MX':
      return { type: 'Security Appliance', icon: '🛡️', color: 'purple' }
    case 'MV':
      return { type: 'Camera', icon: '📹', color: 'red' }
    case 'MT':
      return { type: 'Sensor', icon: '🌡️', color: 'amber' }
    case 'MG':
      return { type: 'Cellular Gateway', icon: '📶', color: 'indigo' }
    case 'SM':
      return { type: 'Systems Manager', icon: '💻', color: 'teal' }
    default:
      return { type: 'Network Device', icon: '📦', color: 'gray' }
  }
}

export function DevicePopup({ metadata, deviceName, onClose }: Props) {
  const popupRef = useRef<HTMLDivElement>(null)
  const addCard = useCanvasStore((s) => s.addCard)
  const [ports, setPorts] = useState<SwitchPort[]>([])
  const [loading, setLoading] = useState(false)

  const isSwitch = metadata.model?.startsWith('MS')
  const isAccessPoint = metadata.model?.startsWith('MR') || metadata.model?.startsWith('CW')
  const deviceInfo = getDeviceType(metadata.model)

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

  const handleAddToCanvas = async () => {
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
    } else if (isAccessPoint && metadata.networkId) {
      // Fetch client, SSID counts, and channel utilization for the AP
      let clientCount = 0
      let ssidCount = 0
      let channelUtilization = undefined

      try {
        const [clientsRes, ssidsRes, channelRes] = await Promise.all([
          fetch(`/api/entity/network/${metadata.networkId}/clients`),
          fetch(`/api/entity/network/${metadata.networkId}/ssids`),
          fetch(`/api/device/${metadata.serial}/channel-utilization?network_id=${metadata.networkId}`)
        ])

        if (clientsRes.ok) {
          const clients = await clientsRes.json()
          clientCount = clients.length || 0
        }

        if (ssidsRes.ok) {
          const ssids = await ssidsRes.json()
          ssidCount = ssids.length || 0
        }

        if (channelRes.ok) {
          channelUtilization = await channelRes.json()
        }
      } catch (err) {
        console.error('Failed to fetch AP stats:', err)
      }

      const apCard: AccessPointDetailCard = {
        id: `card-ap-${metadata.serial}-${Date.now()}`,
        type: 'access_point_detail',
        title: deviceName,
        source: 'meraki',
        data: {
          serial: metadata.serial,
          model: metadata.model || '',
          lanIp: metadata.lanIp,
          firmware: metadata.firmware,
          networkId: metadata.networkId,
          clientCount,
          ssidCount,
          status: metadata.status,
          tags: metadata.tags,
          notes: metadata.notes,
          channelUtilization,
        },
      }
      addCard(apCard)
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

  const popupWidth = isSwitch && ports.length > 0 ? 460 : 380

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
              <div className={`text-2xl mt-0.5 p-1.5 rounded-lg ${
                deviceInfo.color === 'blue' ? 'bg-blue-50 dark:bg-blue-500/10' :
                deviceInfo.color === 'green' ? 'bg-green-50 dark:bg-green-500/10' :
                deviceInfo.color === 'purple' ? 'bg-purple-50 dark:bg-purple-500/10' :
                deviceInfo.color === 'red' ? 'bg-red-50 dark:bg-red-500/10' :
                deviceInfo.color === 'amber' ? 'bg-amber-50 dark:bg-amber-500/10' :
                deviceInfo.color === 'indigo' ? 'bg-indigo-50 dark:bg-indigo-500/10' :
                deviceInfo.color === 'teal' ? 'bg-teal-50 dark:bg-teal-500/10' :
                'bg-gray-50 dark:bg-gray-500/10'
              }`}>
                {deviceInfo.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 truncate">
                  {deviceName}
                </h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium ${
                    deviceInfo.color === 'blue' ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20' :
                    deviceInfo.color === 'green' ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/20' :
                    deviceInfo.color === 'purple' ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20' :
                    deviceInfo.color === 'red' ? 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20' :
                    deviceInfo.color === 'amber' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20' :
                    deviceInfo.color === 'indigo' ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20' :
                    deviceInfo.color === 'teal' ? 'bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-500/20' :
                    'bg-gray-50 dark:bg-gray-500/10 text-gray-700 dark:text-gray-400 border border-gray-200 dark:border-gray-500/20'
                  }`}>
                    {deviceInfo.type}
                  </span>
                  {metadata.status && (
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                      metadata.status.toLowerCase() === 'online'
                        ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/20'
                        : metadata.status.toLowerCase() === 'offline'
                        ? 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20'
                        : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        metadata.status.toLowerCase() === 'online'
                          ? 'bg-green-500 dark:bg-green-400'
                          : metadata.status.toLowerCase() === 'offline'
                          ? 'bg-red-500 dark:bg-red-400'
                          : 'bg-amber-500 dark:bg-amber-400'
                      }`} />
                      {metadata.status}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {metadata.model || 'Unknown Model'}
                  {isSwitch && ports.length > 0 && ` • ${ports.length} ports`}
                </p>
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

        {/* Quick Stats for Switches */}
        {isSwitch && ports.length > 0 && (
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {ports.filter(p => p.status === 'active').length}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Active</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                  {ports.filter(p => p.status === 'disconnected').length}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Disconnected</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {ports.filter(p => p.poeActive).length}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">PoE Active</div>
              </div>
            </div>
          </div>
        )}

        {/* Switch Port Visualization */}
        {isSwitch && ports.length > 0 && (
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-800/20">
            <div className="mb-3">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Port Configuration</span>
            </div>

            {/* Switch front panel visualization */}
            <div className="bg-gradient-to-b from-gray-200 to-gray-300 dark:from-gray-800 dark:to-gray-900 rounded-xl p-4 border-2 border-gray-400 dark:border-gray-700 shadow-lg">
              <div className="grid grid-cols-12 gap-1.5">
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
                      <div className="text-[10px] font-bold text-gray-700 dark:text-gray-300 mb-0.5">
                        {port.portId}
                      </div>

                      {/* Port representation */}
                      <div className={`relative w-full h-14 rounded border-2 ${getPortColor()} transition-all hover:scale-105`}>
                        {/* Port opening */}
                        <div className="absolute inset-x-0.5 top-1 bottom-1 bg-black/30 rounded-sm" />

                        {/* Status indicators */}
                        <div className="absolute inset-x-0 bottom-0 flex justify-center gap-0.5 pb-0.5">
                          {port.isUplink && (
                            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" title="Uplink" />
                          )}
                          {port.poeActive && (
                            <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" title="PoE Active" />
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded bg-green-500 border border-green-600 shadow-sm" />
                <span className="text-gray-700 dark:text-gray-300 font-medium">Active</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded bg-gray-500 border border-gray-600 shadow-sm" />
                <span className="text-gray-700 dark:text-gray-300 font-medium">Disconnected</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded bg-gray-400 border border-gray-500 shadow-sm" />
                <span className="text-gray-700 dark:text-gray-300 font-medium">Disabled</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full" />
                <span className="text-gray-700 dark:text-gray-300 font-medium">PoE</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                <span className="text-gray-700 dark:text-gray-300 font-medium">Uplink</span>
              </div>
            </div>
          </div>
        )}

        {isSwitch && loading && (
          <div className="px-5 py-8 border-b border-gray-200 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-800/20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-3 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Loading port configuration...</span>
            </div>
          </div>
        )}

        {/* Device metadata */}
        <div className="px-4 py-3">
          {metadata.notes && (
            <div className="mb-3 p-2 bg-blue-50/50 dark:bg-blue-500/5 border border-blue-200 dark:border-blue-500/20 rounded">
              <span className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">Notes</span>
              <p className="text-xs text-gray-800 dark:text-gray-300 mt-1 leading-relaxed">{metadata.notes}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            <div>
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Serial Number</span>
              <p className="text-sm text-gray-900 dark:text-gray-100 font-mono mt-0.5">{metadata.serial}</p>
            </div>

            {metadata.lanIp && (
              <div>
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">IP Address</span>
                <p className="text-sm text-gray-900 dark:text-gray-100 font-mono mt-0.5">{metadata.lanIp}</p>
              </div>
            )}

            {metadata.firmware && (
              <div className="col-span-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Firmware Version</span>
                <p className="text-sm text-gray-900 dark:text-gray-100 font-mono mt-0.5">{metadata.firmware}</p>
              </div>
            )}
          </div>

          {metadata.tags && metadata.tags.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tags</span>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {metadata.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 text-xs font-medium bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 rounded border border-blue-200 dark:border-blue-500/20"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="px-4 py-3 bg-gray-50/50 dark:bg-gray-800/20 border-t border-gray-200 dark:border-gray-800 space-y-2">
          <button
            onClick={handleAddToCanvas}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-all shadow-md hover:shadow-lg cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add to Canvas
          </button>

          <div className="grid grid-cols-2 gap-2">
            {getEventLogUrl() && (
              <a
                href={getEventLogUrl()!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1 px-2 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border-2 border-gray-200 dark:border-gray-700 rounded-lg transition-all shadow-sm hover:shadow"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
                Events
              </a>
            )}
            {getMerakiUrl() && (
              <a
                href={getMerakiUrl()!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1 px-2 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border-2 border-gray-200 dark:border-gray-700 rounded-lg transition-all shadow-sm hover:shadow"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
