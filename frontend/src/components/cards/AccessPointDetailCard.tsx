import { useState, useRef, useCallback } from 'react'
import type { AccessPointDetailCard as AccessPointDetailCardType } from '../../types/card'
import { StatDetailPopover, type DetailType } from './StatDetailPopover'

interface Props {
  data: AccessPointDetailCardType['data']
}

export function AccessPointDetailCard({ data }: Props) {
  const [activeDetail, setActiveDetail] = useState<DetailType | null>(null)
  const anchorRef = useRef<HTMLButtonElement | null>(null)

  const handleStatClick = useCallback((type: DetailType, el: HTMLButtonElement) => {
    anchorRef.current = el
    setActiveDetail((prev) => (prev === type ? null : type))
  }, [])

  const closePopover = useCallback(() => setActiveDetail(null), [])

  // Determine status color
  const getStatusColor = (status?: string) => {
    if (!status) return 'gray'
    const s = status.toLowerCase()
    if (s === 'online' || s === 'active') return 'green'
    if (s === 'offline' || s === 'dormant') return 'red'
    if (s === 'alerting') return 'amber'
    return 'gray'
  }

  const statusColor = getStatusColor(data.status)

  return (
    <div className="space-y-4">
      {/* Status Badge */}
      {data.status && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-500">Status:</span>
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
            statusColor === 'green' ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400' :
            statusColor === 'red' ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400' :
            statusColor === 'amber' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400' :
            'bg-gray-100 dark:bg-gray-500/20 text-gray-700 dark:text-gray-400'
          }`}>
            {data.status.charAt(0).toUpperCase() + data.status.slice(1)}
          </span>
        </div>
      )}

      {/* Device Info Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <span className="text-sm font-medium text-gray-600 dark:text-gray-500">Model</span>
          <p className="text-sm text-gray-800 dark:text-gray-300 mt-1">{data.model}</p>
        </div>
        <div>
          <span className="text-sm font-medium text-gray-600 dark:text-gray-500">Serial</span>
          <p className="text-sm text-gray-700 dark:text-gray-400 font-mono mt-1">{data.serial}</p>
        </div>
      </div>

      {/* Network Info */}
      {(data.lanIp || data.firmware) && (
        <div className="grid grid-cols-2 gap-4">
          {data.lanIp && (
            <div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-500">IP Address</span>
              <p className="text-sm text-gray-800 dark:text-gray-300 font-mono mt-1">{data.lanIp}</p>
            </div>
          )}
          {data.firmware && (
            <div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-500">Firmware</span>
              <p className="text-sm text-gray-800 dark:text-gray-300 mt-1">{data.firmware}</p>
            </div>
          )}
        </div>
      )}

      {/* Tags */}
      {data.tags && data.tags.length > 0 && (
        <div>
          <span className="text-sm font-medium text-gray-600 dark:text-gray-500 block mb-2">Tags</span>
          <div className="flex flex-wrap gap-2">
            {data.tags.map((tag, i) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded-md bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 text-xs font-medium"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {data.notes && (
        <div>
          <span className="text-sm font-medium text-gray-600 dark:text-gray-500 block mb-1">Notes</span>
          <p className="text-sm text-gray-700 dark:text-gray-400 italic">{data.notes}</p>
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-gray-200 dark:border-gray-800" />

      {/* Wireless Stats */}
      <div>
        <span className="text-sm font-medium text-gray-600 dark:text-gray-500 mb-2 block">Wireless Status</span>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={(e) => handleStatClick('clients', e.currentTarget)}
            className="text-center p-3 bg-gray-100 dark:bg-gray-800/50 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700/50 transition-colors"
          >
            <p className="text-2xl font-semibold text-gray-900 dark:text-gray-200">{data.clientCount || 0}</p>
            <p className="text-sm text-gray-600 dark:text-gray-500 mt-1">Clients</p>
          </button>
          <button
            onClick={(e) => handleStatClick('ssids', e.currentTarget)}
            className="text-center p-3 bg-gray-100 dark:bg-gray-800/50 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700/50 transition-colors"
          >
            <p className="text-2xl font-semibold text-gray-900 dark:text-gray-200">{data.ssidCount || 0}</p>
            <p className="text-sm text-gray-600 dark:text-gray-500 mt-1">SSIDs</p>
          </button>
        </div>
      </div>

      {/* Stat detail popover */}
      {activeDetail && anchorRef.current && data.networkId && (
        <StatDetailPopover
          networkId={data.networkId}
          detailType={activeDetail}
          anchorEl={anchorRef.current}
          onClose={closePopover}
        />
      )}

      {/* Channel Utilization */}
      {data.channelUtilization && data.channelUtilization.length > 0 && (
        <>
          <div className="border-t border-gray-200 dark:border-gray-800" />
          <div>
            <span className="text-sm font-medium text-gray-600 dark:text-gray-500 mb-2 block">Channel Utilization</span>
            <div className="grid grid-cols-3 gap-3">
              {data.channelUtilization.map((channel) => {
                // Determine color based on utilization level
                const getUtilColor = (util: number) => {
                  if (util < 30) return 'green'
                  if (util < 60) return 'amber'
                  return 'red'
                }
                const color = getUtilColor(channel.utilization)

                return (
                  <div
                    key={channel.band}
                    className="text-center p-3 bg-gray-100 dark:bg-gray-800/50 rounded"
                  >
                    <p className={`text-2xl font-semibold ${
                      color === 'green' ? 'text-green-600 dark:text-green-400' :
                      color === 'amber' ? 'text-amber-600 dark:text-amber-400' :
                      'text-red-600 dark:text-red-400'
                    }`}>
                      {channel.utilization.toFixed(1)}%
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-500 mt-1">{channel.band} GHz</p>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
