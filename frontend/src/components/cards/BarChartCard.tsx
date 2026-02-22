import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { BarChartCard as BarChartCardType } from '../../types/card'
import { useThemeStore } from '../../store/themeSlice'
import { sourceColor } from '../../utils/formatters'

interface Props {
  data: BarChartCardType['data']
  title?: string
  source?: 'meraki' | 'thousandeyes'
}

export function BarChartCard({ data, title, source }: Props) {
  const isDark = useThemeStore((s) => s.mode === 'dark')
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Close fullscreen on Escape
  useEffect(() => {
    if (!isFullscreen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFullscreen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isFullscreen])

  const gridStroke = isDark ? '#374151' : '#e5e7eb'
  const tickFill = isDark ? '#9ca3af' : '#6b7280'
  const axisStroke = isDark ? '#4b5563' : '#d1d5db'
  const tooltipBg = isDark ? '#1f2937' : '#ffffff'
  const tooltipBorder = isDark ? '#374151' : '#e5e7eb'
  const tooltipColor = isDark ? '#e5e7eb' : '#1f2937'
  const legendColor = isDark ? '#9ca3af' : '#6b7280'

  // Transform data for Recharts
  const chartData = data.labels.map((label, i) => {
    const point: Record<string, string | number> = { name: label }
    data.datasets.forEach((ds) => {
      point[ds.label] = ds.data[i] ?? 0
    })
    return point
  })

  const chart = (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
        <XAxis
          dataKey="name"
          tick={{ fill: tickFill, fontSize: isFullscreen ? 12 : 10 }}
          axisLine={{ stroke: axisStroke }}
        />
        <YAxis
          tick={{ fill: tickFill, fontSize: isFullscreen ? 12 : 10 }}
          axisLine={{ stroke: axisStroke }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: tooltipBg,
            border: `1px solid ${tooltipBorder}`,
            borderRadius: '6px',
            fontSize: isFullscreen ? '13px' : '11px',
            color: tooltipColor,
          }}
        />
        {data.datasets.length > 1 && (
          <Legend
            wrapperStyle={{ fontSize: isFullscreen ? '12px' : '10px', color: legendColor }}
          />
        )}
        {data.datasets.map((ds) => (
          <Bar
            key={ds.label}
            dataKey={ds.label}
            fill={ds.color}
            radius={[2, 2, 0, 0]}
          />
        ))}
      </BarChart>
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
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title || 'Bar Chart'}</h3>
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
