import { useMemo } from 'react'
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

interface Props {
  data: LineChartCardType['data']
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

export function LineChartCard({ data }: Props) {
  const isDark = useThemeStore((s) => s.mode === 'dark')

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

  return (
    <div className="w-full flex-1 min-h-0" style={{ minHeight: 220 }}>
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
            tick={{ fill: tickFill, fontSize: 13, fontFamily: 'ui-monospace, monospace' }}
            axisLine={{ stroke: axisStroke }}
            tickLine={false}
            dy={8}
            tickMargin={4}
          />

          <YAxis
            tick={{ fill: tickFill, fontSize: 13, fontFamily: 'ui-monospace, monospace' }}
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
              fontSize: '13px',
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
              fontSize: '13px',
              letterSpacing: '0.02em',
            }}
            labelFormatter={(label: string) => label}
          />

          <Legend
            wrapperStyle={{
              fontSize: '13px',
              color: legendColor,
              paddingTop: '12px',
            }}
            iconType="plainline"
            iconSize={16}
            formatter={(value: string) => (
              <span style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: '13px', marginLeft: 2 }}>{value}</span>
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
              strokeWidth={2}
              dot={false}
              activeDot={{
                r: 4,
                fill: ds.color,
                stroke: isDark ? '#0f172a' : '#ffffff',
                strokeWidth: 2,
              }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
