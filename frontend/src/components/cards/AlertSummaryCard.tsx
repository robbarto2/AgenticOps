import { severityColor } from '../../utils/formatters'
import type { AlertSummaryCard as AlertSummaryCardType } from '../../types/card'

interface Props {
  data: AlertSummaryCardType['data']
}

export function AlertSummaryCard({ data }: Props) {
  return (
    <div className="space-y-1.5 max-h-64 overflow-y-auto">
      {data.alerts.map((alert, i) => (
        <div
          key={i}
          className="flex items-start gap-2 px-2 py-1.5 rounded bg-gray-800/30 border border-gray-700/30"
        >
          <div
            className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
            style={{ backgroundColor: severityColor(alert.severity) }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-200 truncate">
                {alert.title}
              </span>
              <span
                className="text-[10px] px-1 py-0.5 rounded font-medium flex-shrink-0 uppercase"
                style={{
                  backgroundColor: `${severityColor(alert.severity)}15`,
                  color: severityColor(alert.severity),
                }}
              >
                {alert.severity}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">
              {alert.description}
            </p>
            {alert.timestamp && (
              <span className="text-[10px] text-gray-600 mt-0.5 block">
                {alert.timestamp}
              </span>
            )}
          </div>
        </div>
      ))}

      {data.alerts.length === 0 && (
        <p className="text-xs text-gray-500 text-center py-4">No alerts</p>
      )}
    </div>
  )
}
