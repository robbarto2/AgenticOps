import { useChatStore } from '../../store/chatSlice'
import type { OrgSummaryCard } from '../../types/card'

interface Props {
  data: OrgSummaryCard['data']
}

export function OrgSummaryCard({ data }: Props) {
  const setPendingPrompt = useChatStore((s) => s.setPendingPrompt)

  const getHealthColor = (status: 'healthy' | 'warning' | 'critical') => {
    switch (status) {
      case 'healthy':
        return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30'
      case 'warning':
        return 'text-amber-500 bg-amber-500/10 border-amber-500/30'
      case 'critical':
        return 'text-red-500 bg-red-500/10 border-red-500/30'
    }
  }

  const handleClick = (prompt?: string) => {
    if (prompt) {
      setPendingPrompt(prompt)
    }
  }

  return (
    <div className="space-y-4">
      {/* Organization Name */}
      <div className="text-center pb-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {data.orgName}
        </h3>
      </div>

      {/* Top Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Networks */}
        <button
          onClick={() => handleClick(data.networks.prompt)}
          className={`p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-left transition-all ${
            data.networks.prompt
              ? 'hover:border-blue-500/50 hover:bg-blue-500/5 cursor-pointer'
              : 'cursor-default'
          }`}
          disabled={!data.networks.prompt}
        >
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {data.networks.total}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Networks</div>
        </button>

        {/* Clients */}
        <button
          onClick={() => handleClick(data.clients.prompt)}
          className={`p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-left transition-all ${
            data.clients.prompt
              ? 'hover:border-blue-500/50 hover:bg-blue-500/5 cursor-pointer'
              : 'cursor-default'
          }`}
          disabled={!data.clients.prompt}
        >
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {data.clients.total.toLocaleString()}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Connected Clients</div>
        </button>
      </div>

      {/* Health Score */}
      <button
        onClick={() => handleClick(data.health.prompt)}
        className={`w-full p-4 rounded-lg border ${getHealthColor(data.health.status)} text-left transition-all ${
          data.health.prompt ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'
        }`}
        disabled={!data.health.prompt}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium opacity-80 mb-1">Organization Health</div>
            <div className="text-2xl font-bold">{data.health.score}%</div>
          </div>
          <div className="text-3xl opacity-50">
            {data.health.status === 'healthy' && '✓'}
            {data.health.status === 'warning' && '⚠'}
            {data.health.status === 'critical' && '✕'}
          </div>
        </div>
      </button>

      {/* Devices by Type */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide px-1">
          Devices ({data.devices.total})
        </div>
        <div className="grid grid-cols-2 gap-2">
          {data.devices.byType.map((device) => (
            <button
              key={device.type}
              onClick={() => handleClick(device.prompt)}
              className={`p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-left transition-all ${
                device.prompt
                  ? 'hover:border-blue-500/50 hover:bg-blue-500/5 cursor-pointer'
                  : 'cursor-default'
              }`}
              disabled={!device.prompt}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{device.icon}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                  {device.type}
                </span>
              </div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">
                {device.count}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Alerts */}
      {data.alerts && (
        <button
          onClick={() => handleClick(data.alerts?.prompt)}
          className={`w-full p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-left transition-all ${
            data.alerts.prompt
              ? 'hover:border-blue-500/50 hover:bg-blue-500/5 cursor-pointer'
              : 'cursor-default'
          }`}
          disabled={!data.alerts.prompt}
        >
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Active Alerts
          </div>
          <div className="flex gap-3">
            {data.alerts.critical > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  {data.alerts.critical} Critical
                </span>
              </div>
            )}
            {data.alerts.high > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-orange-500" />
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  {data.alerts.high} High
                </span>
              </div>
            )}
            {data.alerts.medium > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  {data.alerts.medium} Medium
                </span>
              </div>
            )}
            {data.alerts.low > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  {data.alerts.low} Low
                </span>
              </div>
            )}
            {data.alerts.critical + data.alerts.high + data.alerts.medium + data.alerts.low === 0 && (
              <span className="text-xs text-emerald-500">No active alerts</span>
            )}
          </div>
        </button>
      )}

      {/* License Status */}
      {data.license && (
        <button
          onClick={() => handleClick(data.license?.prompt)}
          className={`w-full p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-left transition-all ${
            data.license.prompt
              ? 'hover:border-blue-500/50 hover:bg-blue-500/5 cursor-pointer'
              : 'cursor-default'
          }`}
          disabled={!data.license.prompt}
        >
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            License Status
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700 dark:text-gray-300">{data.license.status}</span>
            {data.license.daysRemaining !== undefined && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {data.license.daysRemaining} days remaining
              </span>
            )}
          </div>
        </button>
      )}

      {/* Firmware Compliance */}
      {data.firmware && (
        <button
          onClick={() => handleClick(data.firmware?.prompt)}
          className={`w-full p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-left transition-all ${
            data.firmware.prompt
              ? 'hover:border-blue-500/50 hover:bg-blue-500/5 cursor-pointer'
              : 'cursor-default'
          }`}
          disabled={!data.firmware.prompt}
        >
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Firmware Compliance
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${data.firmware.compliance}%` }}
              />
            </div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {data.firmware.compliance}%
            </span>
          </div>
        </button>
      )}
    </div>
  )
}
