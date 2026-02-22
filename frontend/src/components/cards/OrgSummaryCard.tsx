import { useState, useEffect, useRef } from 'react'
import { useChatStore } from '../../store/chatSlice'
import type { OrgSummaryCard } from '../../types/card'

const POLL_INTERVAL = 15_000 // 15 seconds
const ANIMATE_DURATION = 600 // ms

interface Props {
  data: OrgSummaryCard['data']
}

// ---------------------------------------------------------------------------
// AnimatedNumber — smoothly counts from previous to new value
// ---------------------------------------------------------------------------
function AnimatedNumber({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(value)
  const prevRef = useRef(value)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const from = prevRef.current
    const to = value
    prevRef.current = value

    if (from === to) {
      setDisplay(to)
      return
    }

    const start = performance.now()

    const tick = (now: number) => {
      const elapsed = now - start
      const t = Math.min(elapsed / ANIMATE_DURATION, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(from + (to - from) * eased))
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value])

  return <>{display}{suffix}</>
}

// ---------------------------------------------------------------------------
// "Updated Xs ago" helper
// ---------------------------------------------------------------------------
function useTimeAgo(date: Date | null) {
  const [label, setLabel] = useState('')

  useEffect(() => {
    if (!date) { setLabel(''); return }

    const update = () => {
      const sec = Math.round((Date.now() - date.getTime()) / 1000)
      setLabel(sec < 5 ? 'just now' : `${sec}s ago`)
    }

    update()
    const id = setInterval(update, 5_000)
    return () => clearInterval(id)
  }, [date])

  return label
}

// ---------------------------------------------------------------------------
// OrgSummaryCard
// ---------------------------------------------------------------------------
export function OrgSummaryCard({ data }: Props) {
  const setPendingPrompt = useChatStore((s) => s.setPendingPrompt)

  // Live state — initialized from props, overwritten by polling
  const [liveHealth, setLiveHealth] = useState<{ score: number; status: 'healthy' | 'warning' | 'critical' }>({
    score: data.health.score,
    status: data.health.status,
  })
  const [liveDevicesTotal, setLiveDevicesTotal] = useState(data.devices.total)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const timeAgo = useTimeAgo(lastUpdated)

  // Polling with Page Visibility pause
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null
    let cancelled = false

    const poll = async () => {
      try {
        const res = await fetch('/api/org/health')
        if (!res.ok || cancelled) return
        const d = await res.json()
        setLiveHealth({ score: d.health_score, status: d.health_status as 'healthy' | 'warning' | 'critical' })
        setLiveDevicesTotal(d.devices_total)
        setLastUpdated(new Date())
      } catch {
        // silently keep last good data
      }
    }

    const startPolling = () => {
      if (intervalId) return
      poll() // immediate first fetch
      intervalId = setInterval(poll, POLL_INTERVAL)
    }

    const stopPolling = () => {
      if (intervalId) { clearInterval(intervalId); intervalId = null }
    }

    const onVisibility = () => {
      if (document.hidden) {
        stopPolling()
      } else {
        startPolling()
      }
    }

    startPolling()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      stopPolling()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const getHealthColor = (status: 'healthy' | 'warning' | 'critical') => {
    switch (status) {
      case 'healthy':
        return 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
      case 'warning':
        return 'text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/30'
      case 'critical':
        return 'text-red-700 dark:text-red-300 bg-red-500/10 border-red-500/30'
    }
  }

  const handleClick = (prompt?: string) => {
    if (prompt) {
      setPendingPrompt(prompt)
    }
  }

  return (
    <div className="space-y-4">
      {/* Organization Name */}
      <div className="text-center pb-3 border-b border-gray-200 dark:border-gray-600">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {data.orgName}
        </h3>
      </div>

      {/* Top Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Networks */}
        <button
          onClick={() => handleClick(data.networks.prompt)}
          className={`p-4 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 text-left transition-all ${
            data.networks.prompt
              ? 'hover:border-blue-500/50 hover:bg-blue-500/5 cursor-pointer'
              : 'cursor-default'
          }`}
          disabled={!data.networks.prompt}
        >
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {data.networks.total}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-300 mt-1">Networks</div>
        </button>

        {/* Clients */}
        <button
          onClick={() => handleClick(data.clients.prompt)}
          className={`p-4 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 text-left transition-all ${
            data.clients.prompt
              ? 'hover:border-blue-500/50 hover:bg-blue-500/5 cursor-pointer'
              : 'cursor-default'
          }`}
          disabled={!data.clients.prompt}
        >
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {data.clients.total.toLocaleString()}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-300 mt-1">Connected Clients</div>
        </button>
      </div>

      {/* Health Score — LIVE */}
      <button
        onClick={() => handleClick(data.health.prompt)}
        className={`w-full p-4 rounded-lg border ${getHealthColor(liveHealth.status)} text-left transition-all ${
          data.health.prompt ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'
        }`}
        disabled={!data.health.prompt}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-800 dark:text-gray-100">Organization Health</span>
              {timeAgo && (
                <span className="text-[10px] font-normal text-gray-500 dark:text-gray-400">Updated {timeAgo}</span>
              )}
            </div>
            <div className="text-2xl font-bold mt-1">
              <AnimatedNumber value={liveHealth.score} suffix="%" />
            </div>
          </div>
          <div className="text-3xl opacity-70">
            {liveHealth.status === 'healthy' && '\u2713'}
            {liveHealth.status === 'warning' && '\u26A0'}
            {liveHealth.status === 'critical' && '\u2715'}
          </div>
        </div>
      </button>

      {/* Devices by Type — header shows LIVE total */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wide px-1">
          Devices (<AnimatedNumber value={liveDevicesTotal} />)
        </div>
        <div className="grid grid-cols-2 gap-2">
          {data.devices.byType.map((device) => (
            <button
              key={device.type}
              onClick={() => handleClick(device.prompt)}
              className={`p-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 text-left transition-all ${
                device.prompt
                  ? 'hover:border-blue-500/50 hover:bg-blue-500/5 cursor-pointer'
                  : 'cursor-default'
              }`}
              disabled={!device.prompt}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{device.icon}</span>
                <span className="text-xs text-gray-500 dark:text-gray-300 font-medium">
                  {device.type}
                </span>
              </div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">
                {device.count}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Alerts */}
      {data.alerts && (
        <button
          onClick={() => handleClick(data.alerts?.prompt)}
          className={`w-full p-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 text-left transition-all ${
            data.alerts.prompt
              ? 'hover:border-blue-500/50 hover:bg-blue-500/5 cursor-pointer'
              : 'cursor-default'
          }`}
          disabled={!data.alerts.prompt}
        >
          <div className="text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wide mb-2">
            Active Alerts
          </div>
          <div className="flex gap-3">
            {data.alerts.critical > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  {data.alerts.critical} Critical
                </span>
              </div>
            )}
            {data.alerts.high > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-orange-500" />
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  {data.alerts.high} High
                </span>
              </div>
            )}
            {data.alerts.medium > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  {data.alerts.medium} Medium
                </span>
              </div>
            )}
            {data.alerts.low > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  {data.alerts.low} Low
                </span>
              </div>
            )}
            {data.alerts.critical + data.alerts.high + data.alerts.medium + data.alerts.low === 0 && (
              <span className="text-xs text-emerald-500">No active alerts</span>
            )}
          </div>
        </button>
      )}

      {/* License Status */}
      {data.license && (
        <button
          onClick={() => handleClick(data.license?.prompt)}
          className={`w-full p-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 text-left transition-all ${
            data.license.prompt
              ? 'hover:border-blue-500/50 hover:bg-blue-500/5 cursor-pointer'
              : 'cursor-default'
          }`}
          disabled={!data.license.prompt}
        >
          <div className="text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wide mb-1">
            License Status
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700 dark:text-gray-300">{data.license.status}</span>
            {data.license.daysRemaining !== undefined && (
              <span className="text-xs text-gray-500 dark:text-gray-300">
                {data.license.daysRemaining} days remaining
              </span>
            )}
          </div>
        </button>
      )}

      {/* Firmware Compliance */}
      {data.firmware && (
        <button
          onClick={() => handleClick(data.firmware?.prompt)}
          className={`w-full p-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 text-left transition-all ${
            data.firmware.prompt
              ? 'hover:border-blue-500/50 hover:bg-blue-500/5 cursor-pointer'
              : 'cursor-default'
          }`}
          disabled={!data.firmware.prompt}
        >
          <div className="text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wide mb-1">
            Firmware Compliance
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${data.firmware.compliance}%` }}
              />
            </div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {data.firmware.compliance}%
            </span>
          </div>
        </button>
      )}
    </div>
  )
}
