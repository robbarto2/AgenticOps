import { severityColor } from '../../utils/formatters'
import type { AlertSummaryCard as AlertSummaryCardType } from '../../types/card'

interface Props {
  data: AlertSummaryCardType['data']
}

export function AlertSummaryCard({ data }: Props) {
  return (
    <div className="space-y-2.5 max-h-96 overflow-y-auto">
      {data.alerts.map((alert, i) => (
        <div
          key={i}
          className="flex items-start gap-3 px-3 py-2.5 rounded bg-gray-100/30 dark:bg-gray-800/30 border border-gray-300/30 dark:border-gray-700/30"
        >
          <div
            className="w-3 h-3 rounded-full mt-1.5 flex-shrink-0"
            style={{ backgroundColor: severityColor(alert.severity) }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {alert.title}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded font-medium flex-shrink-0 uppercase"
                style={{
                  backgroundColor: `${severityColor(alert.severity)}15`,
                  color: severityColor(alert.severity),
                }}
              >
                {alert.severity}
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
              {alert.description}
            </p>
            {alert.timestamp && (
              <span className="text-xs text-gray-400 dark:text-gray-500 mt-1 block">
                {alert.timestamp}
              </span>
            )}
          </div>
        </div>
      ))}

      {data.alerts.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No alerts</p>
      )}
    </div>
  )
}
