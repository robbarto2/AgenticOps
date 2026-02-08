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

interface Props {
  data: LineChartCardType['data']
}

export function LineChartCard({ data }: Props) {
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
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="name"
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            axisLine={{ stroke: '#4b5563' }}
          />
          <YAxis
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            axisLine={{ stroke: '#4b5563' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '6px',
              fontSize: '11px',
              color: '#e5e7eb',
            }}
          />
          {data.datasets.length > 1 && (
            <Legend
              wrapperStyle={{ fontSize: '10px', color: '#9ca3af' }}
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
