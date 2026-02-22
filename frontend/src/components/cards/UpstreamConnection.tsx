import { useState, useEffect } from 'react'

interface LldpCdpNeighbor {
  sourcePort: string
  switchName: string | null
  switchPort: string | null
  switchIp: string | null
  protocol: string
}

interface UplinkStatus {
  interface: string
  status: string
  ip: string | null
  gateway: string | null
  publicIp: string | null
  provider: string | null
}

export interface FailedUplink {
  interface: string
  status: string
  deviceName?: string
  serial: string
}

interface Props {
  serial: string
  deviceType?: string
  deviceName?: string
  onFailedUplinks?: (uplinks: FailedUplink[]) => void
}

const APPLIANCE_TYPES = ['Security Appliance', 'Cellular Gateway']

function statusBadge(status: string) {
  const s = status.toLowerCase()
  if (s === 'active')
    return { dot: 'bg-emerald-400', pill: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' }
  if (s === 'ready')
    return { dot: 'bg-blue-400', pill: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' }
  if (s === 'failed')
    return { dot: 'bg-red-400', pill: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' }
  // not connected or unknown
  return { dot: 'bg-gray-400', pill: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20' }
}

export function UpstreamConnection({ serial, deviceType, deviceName, onFailedUplinks }: Props) {
  const [neighbors, setNeighbors] = useState<LldpCdpNeighbor[]>([])
  const [uplinkMap, setUplinkMap] = useState<Map<string, UplinkStatus>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const isAppliance = deviceType && APPLIANCE_TYPES.includes(deviceType)

    // Fetch LLDP/CDP neighbors
    const neighborsPromise = fetch(`/api/device/${serial}/lldp-cdp`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .catch((err) => {
        console.error('Failed to fetch LLDP/CDP data:', err)
        return []
      })

    // Fetch uplink statuses (only for appliances / cellular gateways)
    const uplinksPromise = isAppliance
      ? fetch(`/api/device/${serial}/uplink-statuses`)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return res.json() as Promise<UplinkStatus[]>
          })
          .catch((err) => {
            console.error('Failed to fetch uplink statuses:', err)
            return [] as UplinkStatus[]
          })
      : Promise.resolve([] as UplinkStatus[])

    Promise.all([neighborsPromise, uplinksPromise]).then(([nbrs, uplinks]) => {
      if (cancelled) return

      setNeighbors(nbrs || [])

      // Build interface name → uplink status lookup
      const map = new Map<string, UplinkStatus>()
      for (const u of uplinks) {
        map.set(u.interface, u)
      }
      setUplinkMap(map)

      // Notify parent of failed/not-connected uplinks
      if (onFailedUplinks) {
        const failed = uplinks
          .filter((u) => {
            const s = u.status.toLowerCase()
            return s === 'failed' || s === 'not connected'
          })
          .map((u) => ({
            interface: u.interface,
            status: u.status,
            deviceName,
            serial,
          }))
        onFailedUplinks(failed)
      }

      setLoading(false)
    })

    return () => { cancelled = true }
  }, [serial, deviceType, deviceName, onFailedUplinks])

  // Match a neighbor's sourcePort to a WAN interface uplink status
  const getUplinkForPort = (sourcePort: string): UplinkStatus | undefined => {
    // Direct match (e.g. "wan1" === "wan1")
    if (uplinkMap.has(sourcePort)) return uplinkMap.get(sourcePort)
    // Try case-insensitive
    const lower = sourcePort.toLowerCase()
    for (const [key, val] of uplinkMap) {
      if (key.toLowerCase() === lower) return val
    }
    return undefined
  }

  return (
    <div>
      <span className="text-base font-semibold text-gray-800 dark:text-gray-200">Upstream Connection</span>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <div className="w-4 h-4 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
          Discovering neighbors...
        </div>
      ) : neighbors.length > 0 ? (
        <div className="mt-3 space-y-3">
          {neighbors.map((n) => {
            const uplink = getUplinkForPort(n.sourcePort)
            const isFailed = uplink && (uplink.status.toLowerCase() === 'failed' || uplink.status.toLowerCase() === 'not connected')

            return (
              <div
                key={n.sourcePort}
                className={`rounded-lg p-3 border ${
                  isFailed
                    ? 'bg-red-50/50 dark:bg-red-500/5 border-red-300 dark:border-red-500/30'
                    : 'bg-blue-50/50 dark:bg-blue-500/5 border-blue-200 dark:border-blue-500/20'
                }`}
              >
                {/* Local side */}
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-gray-900 dark:text-gray-100 font-mono font-semibold">{n.sourcePort}</span>
                  {uplink && (
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded border ${statusBadge(uplink.status).pill}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusBadge(uplink.status).dot}`} />
                      {uplink.status}
                    </span>
                  )}
                </div>

                {/* Arrow connector */}
                <div className="flex items-center gap-2 my-1.5">
                  <div className={`flex-1 border-t border-dashed ${isFailed ? 'border-red-300 dark:border-red-500/40' : 'border-blue-300 dark:border-blue-500/30'}`} />
                  <svg className={`w-3.5 h-3.5 flex-shrink-0 ${isFailed ? 'text-red-400' : 'text-blue-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                  <div className={`flex-1 border-t border-dashed ${isFailed ? 'border-red-300 dark:border-red-500/40' : 'border-blue-300 dark:border-blue-500/30'}`} />
                </div>

                {/* Remote side */}
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Remote Device</span>
                    <p className={`font-semibold mt-0.5 ${isFailed ? 'text-red-700 dark:text-red-400' : 'text-blue-700 dark:text-blue-400'}`}>
                      {n.switchName || 'Unknown'}
                    </p>
                  </div>
                  {n.switchPort && (
                    <div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Remote Port</span>
                      <p className="text-gray-900 dark:text-gray-100 font-mono mt-0.5">{n.switchPort}</p>
                    </div>
                  )}
                  {n.switchIp && (
                    <div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Remote IP</span>
                      <p className="text-gray-900 dark:text-gray-100 font-mono mt-0.5">{n.switchIp}</p>
                    </div>
                  )}
                </div>

                {/* Protocol badge */}
                <div className="mt-2">
                  <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 rounded font-mono uppercase">
                    {n.protocol.toLowerCase() === 'both' ? 'LLDP + CDP' : n.protocol}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 italic">
          No LLDP/CDP neighbors discovered
        </p>
      )}
    </div>
  )
}
