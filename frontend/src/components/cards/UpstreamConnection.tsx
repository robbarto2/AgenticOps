import { useState, useEffect } from 'react'

interface LldpCdpNeighbor {
  sourcePort: string
  switchName: string | null
  switchPort: string | null
  switchIp: string | null
  protocol: string
}

interface Props {
  serial: string
}

export function UpstreamConnection({ serial }: Props) {
  const [neighbors, setNeighbors] = useState<LldpCdpNeighbor[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    fetch(`/api/device/${serial}/lldp-cdp`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((result) => {
        if (!cancelled) {
          setNeighbors(result || [])
          setLoading(false)
        }
      })
      .catch((err) => {
        console.error('Failed to fetch LLDP/CDP data:', err)
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [serial])

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
          {neighbors.map((n) => (
            <div
              key={n.sourcePort}
              className="bg-blue-50/50 dark:bg-blue-500/5 border border-blue-200 dark:border-blue-500/20 rounded-lg p-3"
            >
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                </svg>
                <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                  {n.switchName || 'Unknown Device'}
                </span>
                <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 rounded font-mono uppercase">
                  {n.protocol}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                {n.switchPort && (
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Port</span>
                    <p className="text-gray-900 dark:text-gray-100 font-mono mt-0.5">{n.switchPort}</p>
                  </div>
                )}
                {n.switchIp && (
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Neighbor IP</span>
                    <p className="text-gray-900 dark:text-gray-100 font-mono mt-0.5">{n.switchIp}</p>
                  </div>
                )}
                <div>
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Local Port</span>
                  <p className="text-gray-900 dark:text-gray-100 font-mono mt-0.5">{n.sourcePort}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 italic">
          No LLDP/CDP neighbors discovered
        </p>
      )}
    </div>
  )
}
