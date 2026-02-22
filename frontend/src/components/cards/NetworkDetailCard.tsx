import { useState, useRef, useCallback, useEffect } from 'react'
import type { NetworkDetailCard as NetworkDetailCardType, NetworkProblemDevice, WanUplinkAlert } from '../../types/card'
import { StatDetailPopover, type DetailType } from './StatDetailPopover'
import { useChatStore } from '../../store/chatSlice'

interface Props {
  data: NetworkDetailCardType['data']
}

export function NetworkDetailCard({ data }: Props) {
  const setPendingPrompt = useChatStore((s) => s.setPendingPrompt)
  const [activeDetail, setActiveDetail] = useState<DetailType | null>(null)
  const anchorRef = useRef<HTMLButtonElement | null>(null)
  const [liveStats, setLiveStats] = useState(data.stats)
  const [liveLocation, setLiveLocation] = useState(data.location)
  const [problemDevices, setProblemDevices] = useState<NetworkProblemDevice[]>(data.problemDevices ?? [])
  const [wanAlerts, setWanAlerts] = useState<WanUplinkAlert[]>(data.wanAlerts ?? [])

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
      .then((s) => {
        if (cancelled) return
        setLiveStats({
          deviceCount: s.deviceCount ?? data.stats.deviceCount,
          clientCount: s.clientCount ?? data.stats.clientCount,
          ssidCount: s.ssidCount ?? data.stats.ssidCount,
          onlineCount: s.onlineCount >= 0 ? s.onlineCount : data.stats.onlineCount,
          offlineCount: s.offlineCount >= 0 ? s.offlineCount : data.stats.offlineCount,
          alertingCount: s.alertingCount >= 0 ? s.alertingCount : data.stats.alertingCount,
        })
        if (s.location) setLiveLocation(s.location)
        if (s.problemDevices?.length) setProblemDevices(s.problemDevices)
        if (s.wanAlerts?.length) setWanAlerts(s.wanAlerts)
      })
      .catch((err) => {
        console.error('Failed to fetch live stats:', err)
      })

    return () => { cancelled = true }
  }, [data.networkId])

  const [deviceStatusFilter, setDeviceStatusFilter] = useState<'active' | 'inactive' | undefined>()

  const handleStatClick = useCallback((type: DetailType, el: HTMLButtonElement, filter?: 'active' | 'inactive') => {
    anchorRef.current = el
    setDeviceStatusFilter(filter)
    setActiveDetail((prev) => (prev === type && deviceStatusFilter === filter ? null : type))
  }, [deviceStatusFilter])

  const closePopover = useCallback(() => setActiveDetail(null), [])

  const deviceCount = liveStats.deviceCount
  const onlineCount = liveStats.onlineCount ?? 0
  const offlineCount = liveStats.offlineCount ?? 0
  const alertingCount = liveStats.alertingCount ?? 0
  const hasBreakdown = onlineCount > 0 || offlineCount > 0 || alertingCount > 0
  const allOnline = hasBreakdown && offlineCount === 0 && alertingCount === 0 && wanAlerts.length === 0
  const offlineDevices = problemDevices.filter(d => d.status.toLowerCase() === 'offline' || d.status.toLowerCase() === 'dormant')
  const alertingDevices = problemDevices.filter(d => d.status.toLowerCase() === 'alerting')
  const failedWan = wanAlerts.filter(a => a.status.toLowerCase() === 'failed')
  const downWan = wanAlerts.filter(a => a.status.toLowerCase() === 'not connected')

  return (
    <div className="space-y-3">
      {/* Info section — compact rows */}
      <div className="space-y-1.5">
        {liveLocation && (
          <div className="flex items-start gap-2">
            <svg className="w-3.5 h-3.5 mt-0.5 text-gray-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
            </svg>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-tight">{liveLocation}</p>
          </div>
        )}

        {data.timeZone && (
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
            </svg>
            <p className="text-sm text-gray-500 dark:text-gray-400">{data.timeZone}</p>
          </div>
        )}

        <p className="text-xs text-gray-600 font-mono pl-5.5 select-all" style={{ paddingLeft: '1.375rem' }}>{data.networkId}</p>
      </div>

      {/* Notes */}
      {data.notes && (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">{data.notes}</p>
      )}

      {/* Badges: product types + tags */}
      {((data.productTypes && data.productTypes.length > 0) || (data.tags && data.tags.length > 0)) && (
        <div className="flex flex-wrap gap-1.5">
          {data.productTypes?.map((pt) => (
            <span
              key={pt}
              className="px-2 py-0.5 text-xs bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20"
            >
              {pt}
            </span>
          ))}
          {data.tags?.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs bg-blue-500/10 text-blue-400 rounded border border-blue-500/20"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-gray-200 dark:border-gray-800" />

      {/* Active / Inactive devices row */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={(e) => handleStatClick('devices', e.currentTarget, 'active')}
          className="text-center p-2.5 bg-gray-100 dark:bg-gray-800/40 rounded-lg cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700/50 transition-colors"
        >
          <p className="text-xl font-semibold text-emerald-600 dark:text-emerald-400">{onlineCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">Active Devices</p>
        </button>
        <button
          onClick={(e) => handleStatClick('devices', e.currentTarget, 'inactive')}
          className="text-center p-2.5 bg-gray-100 dark:bg-gray-800/40 rounded-lg cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700/50 transition-colors"
        >
          <p className={`text-xl font-semibold ${(offlineCount + alertingCount) > 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'}`}>
            {offlineCount + alertingCount}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Inactive Devices</p>
        </button>
      </div>

      {/* Clients + SSIDs row */}
      <div className={`grid gap-2.5 ${hasWireless ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <button
          onClick={(e) => handleStatClick('clients', e.currentTarget)}
          className="text-center p-2.5 bg-gray-100 dark:bg-gray-800/40 rounded-lg cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700/50 transition-colors"
        >
          <p className="text-xl font-semibold text-gray-800 dark:text-gray-200">{liveStats.clientCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">Clients</p>
        </button>
        {hasWireless && (
          <button
            onClick={(e) => handleStatClick('ssids', e.currentTarget)}
            className="text-center p-2.5 bg-gray-100 dark:bg-gray-800/40 rounded-lg cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700/50 transition-colors"
          >
            <p className="text-xl font-semibold text-gray-800 dark:text-gray-200">{liveStats.ssidCount}</p>
            <p className="text-xs text-gray-500 mt-0.5">SSIDs</p>
          </button>
        )}
      </div>

      {/* Device Issues section */}
      {problemDevices.length > 0 && (
        <>
          <div className="border-t border-gray-200 dark:border-gray-800" />
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Device Issues</span>
            </div>
            <div className="space-y-1.5">
              {offlineDevices.map((d) => (
                <div
                  key={d.serial}
                  onClick={() => setPendingPrompt(`Troubleshoot device ${d.name} (${d.model}, serial ${d.serial}) which is offline. Check recent events, uplink status, and determine the likely cause and recommended remediation.`)}
                  className="flex items-center gap-2 p-2 bg-red-500/5 border border-red-500/15 rounded-md cursor-pointer hover:bg-red-500/10 transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{d.name}</p>
                    <p className="text-xs text-gray-500">{d.model} &middot; {d.serial}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs text-red-400 font-medium">Offline</span>
                    <svg className="w-3 h-3 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </div>
              ))}
              {alertingDevices.map((d) => (
                <div
                  key={d.serial}
                  onClick={() => setPendingPrompt(`Troubleshoot device ${d.name} (${d.model}, serial ${d.serial}) which is alerting. Check recent events, device status, connectivity, and determine the likely cause and recommended remediation.`)}
                  className="flex items-center gap-2 p-2 bg-amber-500/5 border border-amber-500/15 rounded-md cursor-pointer hover:bg-amber-500/10 transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{d.name}</p>
                    <p className="text-xs text-gray-500">{d.model} &middot; {d.serial}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs text-amber-400 font-medium">Alerting</span>
                    <svg className="w-3 h-3 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* WAN Uplink Alerts */}
      {wanAlerts.length > 0 && (
        <>
          <div className="border-t border-gray-200 dark:border-gray-800" />
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <svg className="w-4 h-4 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">WAN Uplink Issues</span>
            </div>
            <div className="space-y-1.5">
              {failedWan.map((a, i) => (
                <div
                  key={`wan-f-${i}`}
                  onClick={() => setPendingPrompt(`Troubleshoot the failed WAN uplink ${a.interface} on device ${a.serial}. Check uplink status, recent events, and determine the cause.`)}
                  className="flex items-center gap-2 p-2 bg-red-500/5 border border-red-500/15 rounded-md cursor-pointer hover:bg-red-500/10 transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{a.interface}</p>
                    <p className="text-xs text-gray-500">{a.serial}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs text-red-400 font-medium">Failed</span>
                    <svg className="w-3 h-3 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </div>
              ))}
              {downWan.map((a, i) => (
                <div
                  key={`wan-d-${i}`}
                  onClick={() => setPendingPrompt(`Check the WAN uplink ${a.interface} on device ${a.serial} which is not connected. Show uplink status details.`)}
                  className="flex items-center gap-2 p-2 bg-amber-500/5 border border-amber-500/15 rounded-md cursor-pointer hover:bg-amber-500/10 transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{a.interface}</p>
                    <p className="text-xs text-gray-500">{a.serial}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs text-amber-400 font-medium">Not Connected</span>
                    <svg className="w-3 h-3 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* All clear indicator when no issues */}
      {hasBreakdown && allOnline && (
        <>
          <div className="border-t border-gray-200 dark:border-gray-800" />
          <div className="flex items-center gap-2 p-2 bg-emerald-500/5 border border-emerald-500/15 rounded-md">
            <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <span className="text-sm text-emerald-600 dark:text-emerald-400">All devices online</span>
          </div>
        </>
      )}

      {/* Stat detail popover */}
      {activeDetail && anchorRef.current && (
        <StatDetailPopover
          networkId={data.networkId}
          detailType={activeDetail}
          statusFilter={activeDetail === 'devices' ? deviceStatusFilter : undefined}
          anchorEl={anchorRef.current}
          onClose={closePopover}
        />
      )}
    </div>
  )
}
