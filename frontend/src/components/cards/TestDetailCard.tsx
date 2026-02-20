import type { TestDetailCard as TestDetailCardType } from '../../types/card'
import { useQueueStore } from '../../store/queueSlice'

interface Props {
  card: TestDetailCardType
}

export function TestDetailCard({ card }: Props) {
  const { data } = card

  const handleViewResults = () => {
    useQueueStore.getState().addPrompt(
      `Show me the test results and performance metrics for "${data.testName}" (test ID: ${data.testId})`
    )
  }

  // Format interval (in seconds)
  const formatInterval = (seconds: number) => {
    if (seconds >= 3600) return `${seconds / 3600}h`
    if (seconds >= 60) return `${seconds / 60}m`
    return `${seconds}s`
  }

  const getThousandEyesUrl = () => {
    return `https://app.thousandeyes.com/view/tests/?testId=${data.testId}`
  }

  const hasMetrics = data.avgLatency != null || data.packetLoss != null || data.availability != null
  const agentCount = data.agentCount ?? data.agents.length

  return (
    <div className="h-full flex flex-col">
      {/* Performance Metrics — shown first */}
      {hasMetrics && (
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Performance (24h avg)</span>
            {data.perfAlert && (
              <span className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-red-500/10 text-red-400 border border-red-500/20">
                Degraded
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <div className="text-center p-1.5 bg-gray-100 dark:bg-gray-800/40 rounded">
              <p className={`text-sm font-semibold ${
                data.avgLatency == null ? 'text-gray-400' :
                data.avgLatency <= 150 ? 'text-emerald-400' :
                data.avgLatency <= 500 ? 'text-amber-400' : 'text-red-400'
              }`}>{data.avgLatency != null ? `${data.avgLatency.toFixed(0)}ms` : '—'}</p>
              <p className="text-[9px] text-gray-500 mt-0.5">Latency</p>
              {data.avgLatency != null && (
                <p className="text-[8px] text-gray-500">
                  {data.avgLatency <= 150 ? 'Good' : data.avgLatency <= 500 ? 'Elevated' : 'High'}
                </p>
              )}
            </div>
            <div className="text-center p-1.5 bg-gray-100 dark:bg-gray-800/40 rounded">
              <p className={`text-sm font-semibold ${
                data.packetLoss == null ? 'text-gray-400' :
                data.packetLoss <= 1 ? 'text-emerald-400' :
                data.packetLoss <= 5 ? 'text-amber-400' : 'text-red-400'
              }`}>{data.packetLoss != null ? `${data.packetLoss.toFixed(2)}%` : '—'}</p>
              <p className="text-[9px] text-gray-500 mt-0.5">Packet Loss</p>
              {data.packetLoss != null && (
                <p className="text-[8px] text-gray-500">
                  {data.packetLoss <= 1 ? 'Good' : data.packetLoss <= 5 ? 'Elevated' : 'High'}
                </p>
              )}
            </div>
            <div className="text-center p-1.5 bg-gray-100 dark:bg-gray-800/40 rounded">
              <p className={`text-sm font-semibold ${
                data.availability == null ? 'text-gray-400' :
                data.availability >= 99 ? 'text-emerald-400' :
                data.availability >= 95 ? 'text-amber-400' : 'text-red-400'
              }`}>{data.availability != null ? `${data.availability.toFixed(1)}%` : '—'}</p>
              <p className="text-[9px] text-gray-500 mt-0.5">Availability</p>
              {data.availability != null && (
                <p className="text-[8px] text-gray-500">
                  {data.availability >= 99 ? 'Good' : data.availability >= 95 ? 'Degraded' : 'Poor'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Test Configuration */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <div>
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Test Type</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-xs text-gray-900 dark:text-gray-200">{data.testType}</p>
              <span className={`px-1 py-0.5 text-[9px] font-medium rounded ${
                data.enabled
                  ? 'bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/20'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-700'
              }`}>
                {data.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
          <div>
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Interval</span>
            <p className="text-xs text-gray-900 dark:text-gray-200 mt-0.5">Every {formatInterval(data.interval)}</p>
          </div>
        </div>
      </div>

      {/* Target */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800">
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Target</span>
        <p className="text-xs text-gray-700 dark:text-gray-300 font-mono break-all mt-0.5">{data.target}</p>
      </div>

      {/* Agents & Test ID */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800">
        <div className="grid grid-cols-2 gap-x-3">
          <div>
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Agents</span>
            <p className="text-xs text-gray-900 dark:text-gray-200 mt-0.5">{agentCount} location{agentCount !== 1 ? 's' : ''}</p>
          </div>
          <div>
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Test ID</span>
            <p className="text-xs text-gray-700 dark:text-gray-300 font-mono mt-0.5">{data.testId}</p>
          </div>
        </div>
      </div>

      {/* Description */}
      {data.description && (
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800">
          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Description</span>
          <p className="text-xs text-gray-800 dark:text-gray-300 mt-0.5">{data.description}</p>
        </div>
      )}

      {/* Alert Rules */}
      {data.alertRules && data.alertRules.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800">
          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Alert Rules</span>
          <p className="text-xs text-gray-900 dark:text-gray-200 mt-0.5">
            {data.alertRules.length} rule{data.alertRules.length !== 1 ? 's' : ''} configured
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="px-3 py-2 mt-auto space-y-1.5">
        <button
          onClick={handleViewResults}
          className="nodrag nopan w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 rounded-md transition-colors cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
          </svg>
          View Test Results
        </button>
        <a
          href={getThousandEyesUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="nodrag nopan w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md transition-colors"
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
