import { useState, useRef, useCallback, useEffect } from 'react'
import type { NetworkDetailCard as NetworkDetailCardType } from '../../types/card'
import { StatDetailPopover, type DetailType } from './StatDetailPopover'

interface Props {
  data: NetworkDetailCardType['data']
}

export function NetworkDetailCard({ data }: Props) {
  const [activeDetail, setActiveDetail] = useState<DetailType | null>(null)
  const anchorRef = useRef<HTMLButtonElement | null>(null)
  const [liveStats, setLiveStats] = useState(data.stats)

  // Check if this network has wireless products (MR or CW)
  const hasWireless = data.productTypes?.some(pt =>
    pt.toUpperCase().startsWith('MR') || pt.toUpperCase().startsWith('CW') || pt.toLowerCase().includes('wireless')
  ) ?? false

  // Fetch live stats on mount
  useEffect(() => {
    let cancelled = false

    fetch(`/api/entity/network/${data.networkId}/stats`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((stats) => {
        if (!cancelled) {
          setLiveStats(stats)
        }
      })
      .catch((err) => {
        console.error('Failed to fetch live stats:', err)
      })

    return () => {
      cancelled = true
    }
  }, [data.networkId])

  const handleStatClick = useCallback((type: DetailType, el: HTMLButtonElement) => {
    anchorRef.current = el
    setActiveDetail((prev) => (prev === type ? null : type))
  }, [])

  const closePopover = useCallback(() => setActiveDetail(null), [])

  return (
    <div className="space-y-2.5">
      {/* Notes */}
      {data.notes && (
        <div>
          <span className="text-sm font-medium text-gray-600 dark:text-gray-500">Notes</span>
          <p className="text-sm text-gray-800 dark:text-gray-300 mt-1">{data.notes}</p>
        </div>
      )}

      {/* Network ID */}
      <div>
        <span className="text-sm font-medium text-gray-600 dark:text-gray-500">Network ID</span>
        <p className="text-sm text-gray-700 dark:text-gray-400 font-mono mt-0.5">{data.networkId}</p>
      </div>

      {/* Time Zone */}
      {data.timeZone && (
        <div>
          <span className="text-sm font-medium text-gray-600 dark:text-gray-500">Time Zone</span>
          <p className="text-sm text-gray-800 dark:text-gray-300 mt-0.5">{data.timeZone}</p>
        </div>
      )}

      {/* Tags */}
      {data.tags && data.tags.length > 0 && (
        <div>
          <span className="text-sm font-medium text-gray-600 dark:text-gray-500">Tags</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {data.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-xs bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded border border-blue-200 dark:border-blue-500/20"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Product Types */}
      {data.productTypes && data.productTypes.length > 0 && (
        <div>
          <span className="text-sm font-medium text-gray-600 dark:text-gray-500">Product Types</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {data.productTypes.map((pt) => (
              <span
                key={pt}
                className="px-2 py-0.5 text-xs bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded border border-emerald-200 dark:border-emerald-500/20"
              >
                {pt}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-gray-200 dark:border-gray-800 my-2.5" />

      {/* Live Stats */}
      <div>
        <span className="text-sm font-medium text-gray-600 dark:text-gray-500 mb-2 block">Live Stats</span>
        <div className={`grid gap-3 ${hasWireless ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <button
            onClick={(e) => handleStatClick('devices', e.currentTarget)}
            className="text-center p-3 bg-gray-100 dark:bg-gray-800/50 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700/50 transition-colors"
          >
            <p className="text-2xl font-semibold text-gray-900 dark:text-gray-200">{liveStats.deviceCount}</p>
            <p className="text-sm text-gray-600 dark:text-gray-500 mt-1">Devices</p>
          </button>
          <button
            onClick={(e) => handleStatClick('clients', e.currentTarget)}
            className="text-center p-3 bg-gray-100 dark:bg-gray-800/50 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700/50 transition-colors"
          >
            <p className="text-2xl font-semibold text-gray-900 dark:text-gray-200">{liveStats.clientCount}</p>
            <p className="text-sm text-gray-600 dark:text-gray-500 mt-1">Clients</p>
          </button>
          {hasWireless && (
            <button
              onClick={(e) => handleStatClick('ssids', e.currentTarget)}
              className="text-center p-3 bg-gray-100 dark:bg-gray-800/50 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700/50 transition-colors"
            >
              <p className="text-2xl font-semibold text-gray-900 dark:text-gray-200">{liveStats.ssidCount}</p>
              <p className="text-sm text-gray-600 dark:text-gray-500 mt-1">SSIDs</p>
            </button>
          )}
        </div>
      </div>

      {/* Stat detail popover */}
      {activeDetail && anchorRef.current && (
        <StatDetailPopover
          networkId={data.networkId}
          detailType={activeDetail}
          anchorEl={anchorRef.current}
          onClose={closePopover}
        />
      )}
    </div>
  )
}
