import { useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { statusColor } from '../../utils/formatters'
import type { WifiHealthCard as WifiHealthCardType, WifiAccessPoint, WifiSummaryMetric } from '../../types/card'

interface Props {
  data: WifiHealthCardType['data']
}

function utilColor(val: number | null): string {
  if (val === null) return '#6b7280'
  if (val > 70) return '#ef4444'   // red - critical
  if (val > 50) return '#f59e0b'   // amber - warning
  return '#10b981'                  // green - healthy
}

/** Big colored dot for the table status column */
function StatusIndicator({ status }: { status: string }) {
  const bg =
    status === 'online'   ? 'bg-emerald-500' :
    status === 'offline'  ? 'bg-red-500' :
    status === 'alerting' ? 'bg-amber-500' :
                            'bg-gray-400'
  return (
    <span
      className={`inline-block w-3.5 h-3.5 rounded-full ${bg}`}
      title={status}
    />
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ---------------------------------------------------------------------------
// Metric tile hover popup (for the summary boxes at the top)
// ---------------------------------------------------------------------------
function MetricPopover({
  metric,
  anchorRect,
  onClose,
}: {
  metric: WifiSummaryMetric
  anchorRect: DOMRect
  onClose: () => void
}) {
  const details = metric.details || []
  const top = anchorRect.bottom + 6
  const left = anchorRect.left
  const maxLeft = window.innerWidth - 280
  const adjustedLeft = Math.min(left, Math.max(8, maxLeft))

  return createPortal(
    <>
      <div className="fixed inset-0 z-[98]" onClick={onClose} />
      <div
        className="fixed z-[99] w-[260px] max-h-[300px] overflow-y-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg shadow-2xl"
        style={{ top, left: adjustedLeft }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 rounded-t-lg">
          <span className="text-xs font-semibold text-gray-900 dark:text-gray-200">{metric.label}</span>
          <span className="text-xs font-semibold" style={{ color: statusColor(metric.status) }}>{metric.value}</span>
        </div>

        {details.length === 0 ? (
          <div className="px-3 py-3 text-center text-xs text-gray-400">No detail breakdown available</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {details.map((d, i) => {
              const color = d.status ? statusColor(d.status) : '#9ca3af'
              return (
                <div key={i} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{d.label}</span>
                  </div>
                  <span className="text-xs font-mono flex-shrink-0" style={{ color }}>{d.value}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>,
    document.body,
  )
}

// ---------------------------------------------------------------------------
// Client popover (for per-AP / per-network row hover)
// ---------------------------------------------------------------------------
function ClientPopover({ ap, anchorRect, onClose }: { ap: WifiAccessPoint; anchorRect: DOMRect; onClose: () => void }) {
  const clients = ap.clientList || []

  const top = anchorRect.bottom + 4
  const left = anchorRect.left
  const maxLeft = window.innerWidth - 320
  const adjustedLeft = Math.min(left, maxLeft)

  return createPortal(
    <>
      <div className="fixed inset-0 z-[98]" onClick={onClose} />
      <div
        className="fixed z-[99] w-[300px] max-h-[280px] overflow-y-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg shadow-2xl"
        style={{ top, left: adjustedLeft }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 rounded-t-lg">
          <div className="flex items-center gap-2 min-w-0">
            <StatusIndicator status={ap.status} />
            <span className="text-xs font-semibold text-gray-900 dark:text-gray-200 truncate">{ap.name}</span>
          </div>
          <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">{ap.clients} client{ap.clients !== 1 ? 's' : ''}</span>
        </div>

        {clients.length === 0 ? (
          <div className="px-3 py-3 text-xs text-gray-400">
            <div className="space-y-1">
              {(ap.channelUtil24 !== null || ap.channelUtil5 !== null) && (
                <div className="flex items-center gap-3">
                  {ap.channelUtil24 !== null && (
                    <span>2.4 GHz: <span className="font-mono" style={{ color: utilColor(ap.channelUtil24) }}>{ap.channelUtil24}%</span></span>
                  )}
                  {ap.channelUtil5 !== null && (
                    <span>5 GHz: <span className="font-mono" style={{ color: utilColor(ap.channelUtil5) }}>{ap.channelUtil5}%</span></span>
                  )}
                </div>
              )}
              <div className="text-gray-500">No client data available</div>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {clients.map((client, i) => (
              <div key={i} className="px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/40">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                    {client.description || client.mac}
                  </span>
                  {client.os && (
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{client.os}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  {client.ip && (
                    <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400">{client.ip}</span>
                  )}
                  {client.ssid && (
                    <span className="text-[10px] text-gray-400">{client.ssid}</span>
                  )}
                  {client.usage > 0 && (
                    <span className="text-[10px] text-gray-400 ml-auto">{formatBytes(client.usage)}</span>
                  )}
                </div>
              </div>
            ))}
            {clients.length < ap.clients && (
              <div className="px-3 py-1.5 text-[10px] text-gray-500 text-center">
                Showing top {clients.length} of {ap.clients} clients
              </div>
            )}
          </div>
        )}
      </div>
    </>,
    document.body,
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function WifiHealthCard({ data }: Props) {
  const overallColor = statusColor(data.overallStatus)

  // Row hover popup state
  const [popupAp, setPopupAp] = useState<WifiAccessPoint | null>(null)
  const [popupRect, setPopupRect] = useState<DOMRect | null>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Metric tile popup state
  const [metricPopup, setMetricPopup] = useState<WifiSummaryMetric | null>(null)
  const [metricRect, setMetricRect] = useState<DOMRect | null>(null)

  const handleRowEnter = useCallback((ap: WifiAccessPoint, el: HTMLTableRowElement) => {
    hoverTimerRef.current = setTimeout(() => {
      setPopupRect(el.getBoundingClientRect())
      setPopupAp(ap)
    }, 300)
  }, [])

  const handleRowLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }, [])

  const closePopup = useCallback(() => {
    setPopupAp(null)
    setPopupRect(null)
  }, [])

  const closeMetricPopup = useCallback(() => {
    setMetricPopup(null)
    setMetricRect(null)
  }, [])

  // Detect org-wide card (networks as rows, not APs)
  const isOrgWide = data.networkName === 'Organization'

  return (
    <div className="space-y-3">
      {/* Overall status badge */}
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold rounded-full"
          style={{ backgroundColor: `${overallColor}20`, color: overallColor }}
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: overallColor }} />
          {data.overallStatus.charAt(0).toUpperCase() + data.overallStatus.slice(1)}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{data.networkName}</span>
      </div>

      {/* Summary metric tiles — clickable with hover popup */}
      <div className="grid grid-cols-3 gap-2">
        {data.summary.map((metric, i) => {
          const color = statusColor(metric.status)
          const hasDetails = metric.details && metric.details.length > 0
          return (
            <div
              key={i}
              className={`p-2.5 rounded-lg bg-gray-100/40 dark:bg-gray-800/40 border border-gray-300/30 dark:border-gray-700/30 transition-colors ${hasDetails ? 'cursor-pointer hover:bg-gray-200/50 dark:hover:bg-gray-700/40 hover:border-gray-400/40 dark:hover:border-gray-600/40' : ''}`}
              onClick={hasDetails ? (e) => {
                e.stopPropagation()
                setMetricRect(e.currentTarget.getBoundingClientRect())
                setMetricPopup(metric)
              } : undefined}
            >
              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{metric.label}</p>
              <p className="text-sm font-semibold mt-0.5" style={{ color }}>{metric.value}</p>
            </div>
          )
        })}
      </div>

      {/* Per-AP / per-network table */}
      {data.accessPoints.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700/50 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-800/60">
                <th className="px-2 py-1.5 text-left font-medium text-gray-500 dark:text-gray-400">
                  {isOrgWide ? 'Network' : 'Access Point'}
                </th>
                <th className="px-2 py-1.5 text-center font-medium text-gray-500 dark:text-gray-400">Status</th>
                <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400">Clients</th>
                <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400">2.4 GHz</th>
                <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400">5 GHz</th>
              </tr>
            </thead>
            <tbody>
              {data.accessPoints.map((ap, i) => (
                <tr
                  key={i}
                  className="border-t border-gray-200/50 dark:border-gray-700/30 hover:bg-gray-100/60 dark:hover:bg-gray-700/20 cursor-pointer transition-colors"
                  onMouseEnter={(e) => handleRowEnter(ap, e.currentTarget)}
                  onMouseLeave={handleRowLeave}
                  onClick={(e) => {
                    e.stopPropagation()
                    setPopupRect(e.currentTarget.getBoundingClientRect())
                    setPopupAp(ap)
                  }}
                >
                  <td className="px-2 py-1.5 text-gray-800 dark:text-gray-200 truncate max-w-[160px]">{ap.name}</td>
                  <td className="px-2 py-1.5 text-center">
                    <StatusIndicator status={ap.status} />
                  </td>
                  <td className="px-2 py-1.5 text-right text-gray-700 dark:text-gray-300">{ap.clients}</td>
                  <td className="px-2 py-1.5 text-right font-mono" style={{ color: utilColor(ap.channelUtil24) }}>
                    {ap.channelUtil24 !== null ? `${ap.channelUtil24}%` : '\u2014'}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono" style={{ color: utilColor(ap.channelUtil5) }}>
                    {ap.channelUtil5 !== null ? `${ap.channelUtil5}%` : '\u2014'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Row popup (client details or network CU details) */}
      {popupAp && popupRect && (
        <ClientPopover ap={popupAp} anchorRect={popupRect} onClose={closePopup} />
      )}

      {/* Summary metric tile popup */}
      {metricPopup && metricRect && (
        <MetricPopover metric={metricPopup} anchorRect={metricRect} onClose={closeMetricPopup} />
      )}
    </div>
  )
}
