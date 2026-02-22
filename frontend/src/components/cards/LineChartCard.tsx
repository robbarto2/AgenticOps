import { useMemo, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
} from 'recharts'
import type { LineChartCard as LineChartCardType } from '../../types/card'
import { useThemeStore } from '../../store/themeSlice'
import { sourceColor } from '../../utils/formatters'

interface Props {
  data: LineChartCardType['data']
  title?: string
  source?: 'meraki' | 'thousandeyes'
}

/** Downsample an array to at most `maxPoints` entries using LTTB-like selection. */
function downsample<T>(arr: T[], maxPoints: number): T[] {
  if (arr.length <= maxPoints) return arr
  const step = (arr.length - 2) / (maxPoints - 2)
  const result: T[] = [arr[0]]
  for (let i = 1; i < maxPoints - 1; i++) {
    result.push(arr[Math.round(i * step)])
  }
  result.push(arr[arr.length - 1])
  return result
}

export function LineChartCard({ data, title, source }: Props) {
  const isDark = useThemeStore((s) => s.mode === 'dark')
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Close fullscreen on Escape
  useEffect(() => {
    if (!isFullscreen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFullscreen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isFullscreen])

  // Downsample to ~120 points for smooth rendering without perf issues
  const sampledData = useMemo(() => {
    const indices = Array.from({ length: data.labels.length }, (_, i) => i)
    const sampled = downsample(indices, 120)
    return sampled.map((idx) => {
      const point: Record<string, string | number> = { name: data.labels[idx] }
      data.datasets.forEach((ds) => {
        point[ds.label] = ds.data[idx] ?? 0
      })
      return point
    })
  }, [data])

  // Detect unit for Y axis
  const yUnit = useMemo(() => {
    const label = data.datasets[0]?.label?.toLowerCase() ?? ''
    if (label.includes('ms') || label.includes('time') || label.includes('latency')) return 'ms'
    if (label.includes('%') || label.includes('loss') || label.includes('avail')) return '%'
    return ''
  }, [data.datasets])

  // Show ~6 evenly-spaced x-axis labels
  const xInterval = Math.max(1, Math.ceil(sampledData.length / 6) - 1)

  // Theme-aware colors
  const gridStroke = isDark ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.2)'
  const tickFill = isDark ? '#94a3b8' : '#64748b'
  const axisStroke = isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.25)'
  const tooltipBg = isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)'
  const tooltipBorder = isDark ? 'rgba(51,65,85,0.6)' : 'rgba(226,232,240,0.8)'
  const tooltipText = isDark ? '#e2e8f0' : '#1e293b'
  const legendColor = isDark ? '#94a3b8' : '#64748b'
  const cursorStroke = isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)'

  const fontSize = isFullscreen ? 14 : 13

  const chart = (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={sampledData} margin={{ top: 16, right: 20, left: 4, bottom: 4 }}>
        <defs>
          {data.datasets.map((ds) => {
            const gradId = `grad-${ds.label.replace(/[^a-zA-Z0-9]/g, '-')}`
            return (
              <linearGradient key={gradId} id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ds.color} stopOpacity={0.20} />
                <stop offset="60%" stopColor={ds.color} stopOpacity={0.06} />
                <stop offset="100%" stopColor={ds.color} stopOpacity={0} />
              </linearGradient>
            )
          })}
        </defs>

        <CartesianGrid
          stroke={gridStroke}
          strokeDasharray="none"
          vertical={false}
        />

        <XAxis
          dataKey="name"
          interval={xInterval}
          tick={{ fill: tickFill, fontSize, fontFamily: 'ui-monospace, monospace' }}
          axisLine={{ stroke: axisStroke }}
          tickLine={false}
          dy={8}
          tickMargin={4}
        />

        <YAxis
          tick={{ fill: tickFill, fontSize, fontFamily: 'ui-monospace, monospace' }}
          axisLine={false}
          tickLine={false}
          width={56}
          tickFormatter={(v: number) => {
            if (v >= 1000) return `${(v / 1000).toFixed(1)}k${yUnit}`
            return `${v}${yUnit}`
          }}
        />

        <Tooltip
          cursor={{ stroke: cursorStroke, strokeWidth: 1 }}
          contentStyle={{
            backgroundColor: tooltipBg,
            border: `1px solid ${tooltipBorder}`,
            borderRadius: '10px',
            fontSize: isFullscreen ? '14px' : '13px',
            color: tooltipText,
            padding: '10px 14px',
            boxShadow: isDark
              ? '0 8px 24px rgba(0,0,0,0.4)'
              : '0 8px 24px rgba(0,0,0,0.08)',
            backdropFilter: 'blur(8px)',
            lineHeight: '1.6',
          }}
          formatter={(value: number, name: string) => {
            const formatted = value >= 1000 ? `${(value / 1000).toFixed(2)}k` : value.toFixed(1)
            return [`${formatted}${yUnit}`, name]
          }}
          labelStyle={{
            fontWeight: 600,
            marginBottom: 6,
            color: tooltipText,
            fontSize: isFullscreen ? '14px' : '13px',
            letterSpacing: '0.02em',
          }}
          labelFormatter={(label: string) => label}
        />

        <Legend
          wrapperStyle={{
            fontSize: isFullscreen ? '14px' : '13px',
            color: legendColor,
            paddingTop: '12px',
          }}
          iconType="plainline"
          iconSize={16}
          formatter={(value: string) => (
            <span style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: isFullscreen ? '14px' : '13px', marginLeft: 2 }}>{value}</span>
          )}
        />

        {data.datasets.map((ds) => {
          const gradId = `grad-${ds.label.replace(/[^a-zA-Z0-9]/g, '-')}`
          return (
            <Area
              key={`area-${ds.label}`}
              type="monotone"
              dataKey={ds.label}
              stroke="none"
              fill={`url(#${gradId})`}
              fillOpacity={1}
              isAnimationActive={false}
              legendType="none"
              tooltipType="none"
            />
          )
        })}

        {data.datasets.map((ds) => (
          <Line
            key={ds.label}
            type="monotone"
            dataKey={ds.label}
            stroke={ds.color}
            strokeWidth={isFullscreen ? 2.5 : 2}
            dot={false}
            activeDot={{
              r: isFullscreen ? 5 : 4,
              fill: ds.color,
              stroke: isDark ? '#0f172a' : '#ffffff',
              strokeWidth: 2,
            }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )

  const content = (
    <div
      className={isFullscreen
        ? 'fixed inset-0 z-[100] flex flex-col bg-white dark:bg-gray-950'
        : 'w-full flex-1 min-h-0 relative'
      }
      style={isFullscreen ? undefined : { minHeight: 220 }}
    >
      {/* Fullscreen header */}
      {isFullscreen && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title || 'Line Chart'}</h3>
            {source && (
              <span
                className="text-xs px-2 py-0.5 rounded font-medium"
                style={{
                  backgroundColor: `${sourceColor(source)}15`,
                  color: sourceColor(source),
                  border: `1px solid ${sourceColor(source)}30`,
                }}
              >
                {source}
              </span>
            )}
          </div>
          <button
            onClick={() => setIsFullscreen(false)}
            className="px-2 py-1 text-xs font-medium rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 transition-colors"
            title="Exit fullscreen"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
            </svg>
          </button>
        </div>
      )}

      {/* Inline fullscreen button (appears on hover) */}
      {!isFullscreen && (
        <button
          onClick={() => setIsFullscreen(true)}
          className="absolute top-1 right-1 z-10 p-1.5 rounded bg-gray-100/80 dark:bg-gray-800/80 hover:bg-blue-500/20 text-gray-400 hover:text-blue-400 border border-transparent hover:border-blue-500/20 transition-all"
          title="Fullscreen"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
        </button>
      )}

      {/* Chart */}
      <div className={isFullscreen ? 'flex-1 p-6 min-h-0' : 'w-full h-full'}>
        {chart}
      </div>
    </div>
  )

  return isFullscreen ? createPortal(content, document.body) : content
}
