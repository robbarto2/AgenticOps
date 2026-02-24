import { useState, useCallback } from 'react'
import { PieChart, Pie, Cell, Sector, ResponsiveContainer } from 'recharts'
import type { PieChartCard as PieChartCardType } from '../../types/card'
import { useThemeStore } from '../../store/themeSlice'

interface Props {
  data: PieChartCardType['data']
}

/* Custom active shape: expands on hover with an inner glow ring and center label */
function renderActiveShape(props: any) {
  const {
    cx, cy, innerRadius, outerRadius, startAngle, endAngle,
    fill, payload, percent,
  } = props

  return (
    <g>
      {/* Expanded outer ring */}
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius - 2}
        outerRadius={outerRadius + 10}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      {/* Inner glow */}
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius - 6}
        outerRadius={innerRadius - 2}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.25}
      />
      {/* Center label */}
      <text x={cx} y={cy - 10} textAnchor="middle" fill={fill} fontSize={15} fontWeight={600}>
        {payload.label}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="#9ca3af" fontSize={12}>
        {`${(percent * 100).toFixed(1)}%`}
      </text>
    </g>
  )
}

export function PieChartCard({ data }: Props) {
  const isDark = useThemeStore((s) => s.isDark)
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined)

  const onPieEnter = useCallback((_: any, index: number) => {
    setActiveIndex(index)
  }, [])

  const onPieLeave = useCallback(() => {
    setActiveIndex(undefined)
  }, [])

  const segments = data.segments.filter((s) => s.value > 0)
  const total = segments.reduce((sum, s) => sum + s.value, 0)

  if (segments.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-400">
        No data available
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2 h-full">
      <div className="flex-1 w-full min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={segments}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius="52%"
              outerRadius="78%"
              paddingAngle={3}
              activeIndex={activeIndex}
              activeShape={renderActiveShape}
              onMouseEnter={onPieEnter}
              onMouseLeave={onPieLeave}
              animationBegin={0}
              animationDuration={500}
            >
              {segments.map((segment, i) => (
                <Cell
                  key={i}
                  fill={segment.color}
                  stroke={isDark ? '#030712' : '#ffffff'}
                  strokeWidth={2}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Interactive legend */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pb-1">
        {segments.map((segment, i) => (
          <div
            key={i}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all cursor-default ${
              activeIndex === i
                ? 'bg-gray-100 dark:bg-gray-800 scale-105'
                : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
            }`}
            onMouseEnter={() => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(undefined)}
          >
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: segment.color }}
            />
            <span className="text-xs text-gray-600 dark:text-gray-300">{segment.label}</span>
            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
              {total > 0 ? `${((segment.value / total) * 100).toFixed(0)}%` : '0%'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
