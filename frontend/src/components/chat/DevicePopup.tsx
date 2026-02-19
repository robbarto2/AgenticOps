import { useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCanvasStore } from '../../store/canvasSlice'
import type { SwitchDetailCard, AccessPointDetailCard, DeviceDetailCard, SwitchPort } from '../../types/card'

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

function getDeviceType(model?: string): { type: string; color: string } {
  if (!model) return { type: 'Network Device', color: 'gray' }
  const prefix = model.substring(0, 2).toUpperCase()
  switch (prefix) {
    case 'MS':
    case 'C9': return { type: 'Switch', color: 'blue' }
    case 'MR':
    case 'CW': return { type: 'Access Point', color: 'green' }
    case 'MX': return { type: 'Security Appliance', color: 'purple' }
    case 'MV': return { type: 'Camera', color: 'red' }
    case 'MT': return { type: 'Sensor', color: 'amber' }
    case 'MG': return { type: 'Cellular Gateway', color: 'indigo' }
    default:   return { type: 'Network Device', color: 'gray' }
  }
}

const TYPE_COLORS: Record<string, string> = {
  blue:   'bg-blue-500/10 text-blue-400 border-blue-500/20',
  green:  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  red:    'bg-red-500/10 text-red-400 border-red-500/20',
  amber:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
  indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  gray:   'bg-gray-500/10 text-gray-400 border-gray-500/20',
}

export function DevicePopup({ metadata, deviceName, onClose }: Props) {
  const popupRef = useRef<HTMLDivElement>(null)
  const addCard = useCanvasStore((s) => s.addCard)
  const [ports, setPorts] = useState<SwitchPort[]>([])
  const [loading, setLoading] = useState(false)

  const isSwitch = metadata.model?.startsWith('MS') || metadata.model?.startsWith('C9')
  const isAccessPoint = metadata.model?.startsWith('MR') || metadata.model?.startsWith('CW')
  const deviceInfo = getDeviceType(metadata.model)
  const typePillClass = TYPE_COLORS[deviceInfo.color] ?? TYPE_COLORS.gray

  const statusPillClass =
    metadata.status?.toLowerCase() === 'online'  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
    metadata.status?.toLowerCase() === 'offline' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
    metadata.status?.toLowerCase() === 'alerting'? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
    'bg-gray-500/10 text-gray-400 border-gray-500/20'

  const statusDotClass =
    metadata.status?.toLowerCase() === 'online'  ? 'bg-emerald-400' :
    metadata.status?.toLowerCase() === 'offline' ? 'bg-red-400' :
    metadata.status?.toLowerCase() === 'alerting'? 'bg-amber-400' :
    'bg-gray-400'

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose()
    }
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler) }
  }, [onClose])

  // Fetch switch ports
  useEffect(() => {
    if (!isSwitch || !metadata.serial) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/device/${metadata.serial}/switch-ports`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(d => { if (!cancelled) { setPorts(d.ports || []); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [isSwitch, metadata.serial])

  const handleAddToCanvas = async () => {
    if (isSwitch) {
      addCard({
        id: `card-switch-${metadata.serial}-${Date.now()}`,
        type: 'switch_detail', title: deviceName, source: 'meraki',
        data: { serial: metadata.serial, model: metadata.model || '', lanIp: metadata.lanIp, firmware: metadata.firmware, networkId: metadata.networkId, ports },
      } as SwitchDetailCard)
    } else if (isAccessPoint && metadata.networkId) {
      let clientCount = 0, ssidCount = 0, channelUtilization = undefined
      try {
        const [cr, sr, chr] = await Promise.all([
          fetch(`/api/entity/network/${metadata.networkId}/clients`),
          fetch(`/api/entity/network/${metadata.networkId}/ssids`),
          fetch(`/api/device/${metadata.serial}/channel-utilization?network_id=${metadata.networkId}`),
        ])
        if (cr.ok)  clientCount = (await cr.json()).length || 0
        if (sr.ok)  ssidCount   = (await sr.json()).length || 0
        if (chr.ok) channelUtilization = await chr.json()
      } catch {}
      addCard({
        id: `card-ap-${metadata.serial}-${Date.now()}`,
        type: 'access_point_detail', title: deviceName, source: 'meraki',
        data: { serial: metadata.serial, model: metadata.model || '', lanIp: metadata.lanIp, firmware: metadata.firmware, networkId: metadata.networkId, clientCount, ssidCount, status: metadata.status, tags: metadata.tags, notes: metadata.notes, channelUtilization },
      } as AccessPointDetailCard)
    } else {
      addCard({
        id: `card-device-${metadata.serial}-${Date.now()}`,
        type: 'device_detail', title: deviceName, source: 'meraki',
        data: { serial: metadata.serial, model: metadata.model || '', deviceType: deviceInfo.type, lanIp: metadata.lanIp, firmware: metadata.firmware, networkId: metadata.networkId, status: metadata.status, tags: metadata.tags, notes: metadata.notes },
      } as DeviceDetailCard)
    }
    onClose()
  }

  const merakiUrl = metadata.networkId && metadata.serial
    ? `https://dashboard.meraki.com/n/${metadata.networkId}/manage/nodes/${metadata.serial}/general` : null
  const eventsUrl = metadata.networkId && metadata.serial
    ? `https://dashboard.meraki.com/n/${metadata.networkId}/manage/nodes/${metadata.serial}/events` : null

  const popupWidth = isSwitch && ports.length > 0 ? 460 : 380

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
            <span className={`inline-flex items-center px-1.5 py-0.5 text-xs rounded border ${typePillClass}`}>
              {deviceInfo.type}
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
              <p className="text-xs text-gray-800 dark:text-gray-300">
                {metadata.model}{isSwitch && ports.length > 0 ? ` • ${ports.length} ports` : ''}
              </p>
            </div>
          )}

          <div>
            <span className="text-xs text-gray-500">Serial</span>
            <p className="text-xs text-gray-600 dark:text-gray-400 font-mono">{metadata.serial}</p>
          </div>

          {metadata.lanIp && (
            <div>
              <span className="text-xs text-gray-500">IP Address</span>
              <p className="text-xs text-gray-800 dark:text-gray-300 font-mono">{metadata.lanIp}</p>
            </div>
          )}

          {metadata.firmware && (
            <div>
              <span className="text-xs text-gray-500">Firmware</span>
              <p className="text-xs text-gray-600 dark:text-gray-400 font-mono">{metadata.firmware}</p>
            </div>
          )}

          {metadata.notes && (
            <div>
              <span className="text-xs text-gray-500">Notes</span>
              <p className="text-xs text-gray-800 dark:text-gray-300">{metadata.notes}</p>
            </div>
          )}

          {metadata.tags && metadata.tags.length > 0 && (
            <div>
              <span className="text-xs text-gray-500">Tags</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {metadata.tags.map((tag) => (
                  <span key={tag} className="px-1.5 py-0.5 text-xs bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Switch port stats */}
        {isSwitch && ports.length > 0 && (
          <>
            <div className="border-t border-gray-200 dark:border-gray-800" />
            <div className="px-3 py-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-2 bg-gray-100 dark:bg-gray-800/40 rounded-lg">
                  <p className="text-lg font-semibold text-emerald-400">{ports.filter(p => p.status === 'active').length}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Active</p>
                </div>
                <div className="text-center p-2 bg-gray-100 dark:bg-gray-800/40 rounded-lg">
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-200">{ports.filter(p => p.status === 'disconnected').length}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Disconnected</p>
                </div>
                <div className="text-center p-2 bg-gray-100 dark:bg-gray-800/40 rounded-lg">
                  <p className="text-lg font-semibold text-amber-400">{ports.filter(p => p.poeActive).length}</p>
                  <p className="text-xs text-gray-500 mt-0.5">PoE Active</p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Switch port visualization */}
        {isSwitch && ports.length > 0 && (
          <>
            <div className="border-t border-gray-200 dark:border-gray-800" />
            <div className="px-3 py-2">
              <span className="text-xs text-gray-500">Port Configuration</span>
              <div className="mt-1.5 bg-gradient-to-b from-gray-200 to-gray-300 dark:from-gray-800 dark:to-gray-900 rounded-xl p-4 border-2 border-gray-400 dark:border-gray-700 shadow-lg">
                <div className="grid grid-cols-12 gap-1.5">
                  {ports.map((port) => {
                    const portColor =
                      !port.enabled || port.status === 'disabled' ? 'bg-gray-400 dark:bg-gray-700 border-gray-500 dark:border-gray-600' :
                      port.status === 'error'   ? 'bg-red-500 border-red-600 shadow-[0_0_8px_rgba(239,68,68,0.5)]' :
                      port.status === 'warning' ? 'bg-amber-500 border-amber-600 shadow-[0_0_8px_rgba(245,158,11,0.5)]' :
                      port.status === 'disconnected' ? 'bg-gray-500 dark:bg-gray-600 border-gray-600 dark:border-gray-500' :
                      'bg-green-500 border-green-600 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                    return (
                      <div key={port.portId} className="flex flex-col items-center"
                        title={`Port ${port.portId}: ${port.status}${port.poeActive ? ' • PoE Active' : port.poeEnabled ? ' • PoE Available' : ''}${port.isUplink ? ' • Uplink' : ''}`}
                      >
                        <div className="text-[10px] font-bold text-gray-700 dark:text-gray-300 mb-0.5">{port.portId}</div>
                        <div className={`relative w-full h-14 rounded border-2 ${portColor} transition-all hover:scale-105`}>
                          <div className="absolute inset-x-0.5 top-1 bottom-1 bg-black/30 rounded-sm" />
                          <div className="absolute inset-x-0 bottom-0 flex justify-center gap-0.5 pb-0.5">
                            {port.isUplink && <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" title="Uplink" />}
                            {port.poeActive && <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" title="PoE Active" />}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                {[
                  { color: 'bg-green-500 border-green-600', label: 'Active' },
                  { color: 'bg-gray-500 border-gray-600', label: 'Disconnected' },
                  { color: 'bg-gray-400 border-gray-500', label: 'Disabled' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className={`w-3 h-3 rounded border ${color}`} />
                    <span className="text-gray-500 dark:text-gray-400">{label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full" />
                  <span className="text-gray-500 dark:text-gray-400">PoE</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                  <span className="text-gray-500 dark:text-gray-400">Uplink</span>
                </div>
              </div>
            </div>
          </>
        )}

        {isSwitch && loading && (
          <>
            <div className="border-t border-gray-200 dark:border-gray-800" />
            <div className="px-3 py-4 flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              <span className="text-xs text-gray-500">Loading port configuration...</span>
            </div>
          </>
        )}

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

          {(eventsUrl || merakiUrl) && (
            <div className="flex gap-1.5">
              {eventsUrl && (
                <a href={eventsUrl} target="_blank" rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-800/60 hover:bg-gray-200 dark:hover:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md transition-colors"
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                  </svg>
                  Events
                </a>
              )}
              {merakiUrl && (
                <a href={merakiUrl} target="_blank" rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-800/60 hover:bg-gray-200 dark:hover:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md transition-colors"
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                  Dashboard
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
