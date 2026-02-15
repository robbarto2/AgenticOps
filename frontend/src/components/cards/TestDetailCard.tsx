import type { TestDetailCard as TestDetailCardType } from '../../types/card'

interface Props {
  card: TestDetailCardType
}

export function TestDetailCard({ card }: Props) {
  const { data } = card

  // Format interval (in seconds)
  const formatInterval = (seconds: number) => {
    if (seconds >= 3600) return `${seconds / 3600} hour${seconds / 3600 > 1 ? 's' : ''}`
    if (seconds >= 60) return `${seconds / 60} minute${seconds / 60 > 1 ? 's' : ''}`
    return `${seconds} second${seconds > 1 ? 's' : ''}`
  }

  const getThousandEyesUrl = () => {
    return `https://app.thousandeyes.com/view/tests/?testId=${data.testId}`
  }

  return (
    <div className="h-full flex flex-col">
      {/* Test Type & Status */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Test Type</span>
          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
            data.enabled
              ? 'bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/20'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700'
          }`}>
            {data.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <p className="text-sm text-gray-900 dark:text-gray-200 font-medium mt-1">{data.testType}</p>
      </div>

      {/* Target */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800">
        <span className="text-xs text-gray-600 dark:text-gray-500">Target</span>
        <p className="text-xs text-gray-800 dark:text-gray-300 font-mono break-all mt-0.5">{data.target}</p>
      </div>

      {/* Test Configuration */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">Configuration</span>
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-600 dark:text-gray-500">Interval</span>
            <span className="text-xs text-gray-800 dark:text-gray-300">Every {formatInterval(data.interval)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-600 dark:text-gray-500">Test Locations</span>
            <span className="text-xs text-gray-800 dark:text-gray-300">{data.agents.length} agent{data.agents.length !== 1 ? 's' : ''}</span>
          </div>
          {data.alertRules && data.alertRules.length > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600 dark:text-gray-500">Alert Rules</span>
              <span className="text-xs text-gray-800 dark:text-gray-300">{data.alertRules.length} configured</span>
            </div>
          )}
        </div>
      </div>

      {/* Test Agents */}
      {data.agents.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800">
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">Test Agents</span>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {data.agents.slice(0, 10).map((agent) => (
              <div key={agent.agentId} className="flex items-center justify-between text-xs">
                <span className="text-gray-800 dark:text-gray-300 truncate">{agent.agentName}</span>
                {agent.location && (
                  <span className="text-gray-600 dark:text-gray-500 text-[10px] ml-2">{agent.location}</span>
                )}
              </div>
            ))}
            {data.agents.length > 10 && (
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                +{data.agents.length - 10} more
              </p>
            )}
          </div>
        </div>
      )}

      {/* Metrics (if available) */}
      {data.metrics && (
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800">
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">Performance (24h)</span>
          <div className="grid grid-cols-2 gap-2">
            {data.metrics.availability !== undefined && (
              <div className="bg-gray-100 dark:bg-gray-800/50 rounded p-2">
                <p className="text-[10px] text-gray-600 dark:text-gray-500">Availability</p>
                <p className={`text-sm font-semibold ${
                  data.metrics.availability >= 99
                    ? 'text-green-600 dark:text-green-400'
                    : data.metrics.availability >= 95
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {data.metrics.availability.toFixed(2)}%
                </p>
              </div>
            )}

            {data.metrics.avgResponseTime !== undefined && (
              <div className="bg-gray-100 dark:bg-gray-800/50 rounded p-2">
                <p className="text-[10px] text-gray-600 dark:text-gray-500">Avg Response</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-200">
                  {data.metrics.avgResponseTime.toFixed(0)} ms
                </p>
              </div>
            )}

            {data.metrics.maxLoss !== undefined && data.metrics.maxLoss > 0 && (
              <div className="bg-gray-100 dark:bg-gray-800/50 rounded p-2">
                <p className="text-[10px] text-gray-600 dark:text-gray-500">Max Loss</p>
                <p className={`text-sm font-semibold ${
                  data.metrics.maxLoss > 5
                    ? 'text-red-600 dark:text-red-400'
                    : data.metrics.maxLoss > 1
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-green-600 dark:text-green-400'
                }`}>
                  {data.metrics.maxLoss.toFixed(1)}%
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Description */}
      {data.description && (
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800">
          <span className="text-xs text-gray-600 dark:text-gray-500">Description</span>
          <p className="text-xs text-gray-800 dark:text-gray-300 mt-0.5">{data.description}</p>
        </div>
      )}

      {/* Test ID */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800">
        <span className="text-xs text-gray-600 dark:text-gray-500">Test ID</span>
        <p className="text-xs text-gray-600 dark:text-gray-400 font-mono mt-0.5">{data.testId}</p>
      </div>

      {/* Actions */}
      <div className="px-3 py-2 mt-auto">
        <a
          href={getThousandEyesUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
          View in ThousandEyes
        </a>
      </div>
    </div>
  )
}
