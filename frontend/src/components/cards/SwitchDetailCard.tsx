import type { SwitchDetailCard as SwitchDetailCardType, SwitchPort } from '../../types/card'

interface Props {
  data: SwitchDetailCardType['data']
}

export function SwitchDetailCard({ data }: Props) {
  const getMerakiUrl = () => {
    if (!data.networkId || !data.serial) return null
    return `https://dashboard.meraki.com/n/${data.networkId}/manage/nodes/${data.serial}/general`
  }

  const getEventLogUrl = () => {
    if (!data.networkId || !data.serial) return null
    return `https://dashboard.meraki.com/n/${data.networkId}/manage/nodes/${data.serial}/events`
  }

  const activePorts = data.ports?.filter(p => p.status === 'active').length || 0
  const totalPorts = data.ports?.length || 0

  return (
    <div className="space-y-4">
      {/* Switch Overview Header */}
      <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">Model</div>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{data.model || 'Unknown'}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">Serial</div>
            <div className="text-sm font-mono font-semibold text-gray-800 dark:text-gray-200">{data.serial || 'N/A'}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">Port Status</div>
            <div className="text-lg font-bold text-green-600 dark:text-green-400">
              {activePorts} <span className="text-sm font-normal text-gray-600 dark:text-gray-400">/ {totalPorts} active</span>
            </div>
          </div>
        </div>
      </div>

      {/* Switch Port Visualization */}
      {data.ports && data.ports.length > 0 && (
        <div>
          <div className="mb-3">
            <span className="text-base font-semibold text-gray-800 dark:text-gray-200">Port Status</span>
          </div>

          {/* Realistic switch front panel */}
          <div className="bg-gradient-to-b from-gray-200 to-gray-300 dark:from-gray-800 dark:to-gray-900 rounded-lg p-4 border-2 border-gray-400 dark:border-gray-700 shadow-inner">
            <div className="grid grid-cols-12 gap-1.5">
              {data.ports.map((port) => {
                const getPortColor = () => {
                  if (!port.enabled || port.status === 'disabled') return 'bg-gray-400 dark:bg-gray-700 border-gray-500 dark:border-gray-600'
                  if (port.status === 'error') return 'bg-red-500 border-red-600 shadow-[0_0_10px_rgba(239,68,68,0.6)]'
                  if (port.status === 'warning') return 'bg-amber-500 border-amber-600 shadow-[0_0_10px_rgba(245,158,11,0.6)]'
                  if (port.status === 'disconnected') return 'bg-gray-500 dark:bg-gray-600 border-gray-600 dark:border-gray-500'
                  return 'bg-green-500 border-green-600 shadow-[0_0_10px_rgba(16,185,129,0.6)]'
                }

                return (
                  <div
                    key={port.portId}
                    className="flex flex-col items-center"
                    title={`Port ${port.portId}: ${port.status}${port.poeActive ? ' • PoE Active' : port.poeEnabled ? ' • PoE Available' : ''}${port.isUplink ? ' • Uplink' : ''}${port.client ? ` • ${port.client}` : ''}`}
                  >
                    {/* Port number */}
                    <div className="text-[10px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                      {port.portId}
                    </div>

                    {/* Port visual */}
                    <div className={`relative w-full h-14 rounded border-2 ${getPortColor()} transition-all`}>
                      {/* RJ45 opening */}
                      <div className="absolute inset-x-1 top-1 bottom-1 bg-black/40 rounded-sm" />

                      {/* Status indicators */}
                      <div className="absolute inset-x-0 bottom-0.5 flex justify-center gap-0.5">
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
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-500 border border-green-600 shadow-sm" />
              <span className="text-gray-700 dark:text-gray-300">Active</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gray-500 border border-gray-600 shadow-sm" />
              <span className="text-gray-700 dark:text-gray-300">Disconnected</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gray-400 border border-gray-500 shadow-sm" />
              <span className="text-gray-700 dark:text-gray-300">Disabled</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full" />
              <span className="text-gray-700 dark:text-gray-300">PoE Active</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
              <span className="text-gray-700 dark:text-gray-300">Uplink</span>
            </div>
          </div>
        </div>
      )}

      {/* Device Details */}
      {(data.firmware || data.lanIp || data.publicIp || data.gateway || data.dns) && (
        <div className="space-y-3">
          <span className="text-base font-semibold text-gray-800 dark:text-gray-200">Device Information</span>

          <div className="grid grid-cols-2 gap-3">
            {data.firmware && (
              <div>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Firmware</span>
                <p className="text-sm text-gray-900 dark:text-gray-100 font-mono mt-1">{data.firmware}</p>
              </div>
            )}

            {data.lanIp && (
              <div>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">LAN IP</span>
                <p className="text-sm text-gray-900 dark:text-gray-100 font-mono mt-1">{data.lanIp}</p>
              </div>
            )}

            {data.publicIp && (
              <div>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Public IP</span>
                <p className="text-sm text-gray-900 dark:text-gray-100 font-mono mt-1">{data.publicIp}</p>
              </div>
            )}

            {data.gateway && (
              <div>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Gateway</span>
                <p className="text-sm text-gray-900 dark:text-gray-100 font-mono mt-1">{data.gateway}</p>
              </div>
            )}

            {data.dns && (
              <div>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">DNS</span>
                <p className="text-sm text-gray-900 dark:text-gray-100 font-mono mt-1">{data.dns}</p>
              </div>
            )}

            {data.uptime && (
              <div>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Uptime</span>
                <p className="text-sm text-gray-900 dark:text-gray-100 font-medium mt-1">{data.uptime}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
        {getEventLogUrl() && (
          <a
            href={getEventLogUrl()!}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 border border-blue-200 dark:border-blue-500/20 rounded-md transition-colors"
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
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            Dashboard
          </a>
        )}
      </div>
    </div>
  )
}
