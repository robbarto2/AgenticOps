import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { LineChartCard as LineChartCardType } from '../../types/card'
import { useThemeStore } from '../../store/themeSlice'

interface Props {
  data: LineChartCardType['data']
}

export function LineChartCard({ data }: Props) {
  const isDark = useThemeStore((s) => s.mode === 'dark')

  const gridStroke = isDark ? '#374151' : '#e5e7eb'
  const tickFill = isDark ? '#9ca3af' : '#6b7280'
  const axisStroke = isDark ? '#4b5563' : '#d1d5db'
  const tooltipBg = isDark ? '#1f2937' : '#ffffff'
  const tooltipBorder = isDark ? '#374151' : '#e5e7eb'
  const tooltipColor = isDark ? '#e5e7eb' : '#1f2937'
  const legendColor = isDark ? '#9ca3af' : '#6b7280'

  const chartData = data.labels.map((label, i) => {
    const point: Record<string, string | number> = { name: label }
    data.datasets.forEach((ds) => {
      point[ds.label] = ds.data[i] ?? 0
    })
    return point
  })

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis
            dataKey="name"
            tick={{ fill: tickFill, fontSize: 10 }}
            axisLine={{ stroke: axisStroke }}
          />
          <YAxis
            tick={{ fill: tickFill, fontSize: 10 }}
            axisLine={{ stroke: axisStroke }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: tooltipBg,
              border: `1px solid ${tooltipBorder}`,
              borderRadius: '6px',
              fontSize: '11px',
              color: tooltipColor,
            }}
          />
          {data.datasets.length > 1 && (
            <Legend
              wrapperStyle={{ fontSize: '10px', color: legendColor }}
            />
          )}
          {data.datasets.map((ds) => (
            <Line
              key={ds.label}
              type="monotone"
              dataKey={ds.label}
              stroke={ds.color}
              strokeWidth={2}
              dot={{ r: 2, fill: ds.color }}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
