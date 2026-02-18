import type { DeviceDetailCard as DeviceDetailCardType } from '../../types/card'
import { UpstreamConnection } from './UpstreamConnection'

interface Props {
  data: DeviceDetailCardType['data']
}

// Accent color based on device type
function accentForDeviceType(deviceType: string): { bg: string; text: string; border: string; gradient: string } {
  switch (deviceType) {
    case 'Camera':
      return { bg: 'bg-red-50 dark:bg-red-500/10', text: 'text-red-700 dark:text-red-400', border: 'border-red-200 dark:border-red-500/20', gradient: 'from-red-50 to-red-100 dark:from-red-950/30 dark:to-red-900/20' }
    case 'Sensor':
      return { bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-500/20', gradient: 'from-amber-50 to-amber-100 dark:from-amber-950/30 dark:to-amber-900/20' }
    case 'Security Appliance':
      return { bg: 'bg-purple-50 dark:bg-purple-500/10', text: 'text-purple-700 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-500/20', gradient: 'from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/20' }
    case 'Cellular Gateway':
      return { bg: 'bg-indigo-50 dark:bg-indigo-500/10', text: 'text-indigo-700 dark:text-indigo-400', border: 'border-indigo-200 dark:border-indigo-500/20', gradient: 'from-indigo-50 to-indigo-100 dark:from-indigo-950/30 dark:to-indigo-900/20' }
    default:
      return { bg: 'bg-gray-50 dark:bg-gray-500/10', text: 'text-gray-700 dark:text-gray-400', border: 'border-gray-200 dark:border-gray-500/20', gradient: 'from-gray-50 to-gray-100 dark:from-gray-950/30 dark:to-gray-900/20' }
  }
}

function iconForDeviceType(deviceType: string): string {
  switch (deviceType) {
    case 'Camera': return '\uD83D\uDCF9'
    case 'Sensor': return '\uD83C\uDF21\uFE0F'
    case 'Security Appliance': return '\uD83D\uDEE1\uFE0F'
    case 'Cellular Gateway': return '\uD83D\uDCF6'
    default: return '\uD83D\uDCE6'
  }
}

export function DeviceDetailCard({ data }: Props) {
  const accent = accentForDeviceType(data.deviceType)

  const getMerakiUrl = () => {
    if (!data.networkId || !data.serial) return null
    return `https://dashboard.meraki.com/n/${data.networkId}/manage/nodes/${data.serial}/general`
  }

  const getEventLogUrl = () => {
    if (!data.networkId || !data.serial) return null
    return `https://dashboard.meraki.com/n/${data.networkId}/manage/nodes/${data.serial}/events`
  }

  return (
    <div className="space-y-4">
      {/* Device Overview Header */}
      <div className={`bg-gradient-to-br ${accent.gradient} rounded-lg p-4 border ${accent.border}`}>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className={`text-xs font-medium ${accent.text} uppercase tracking-wide mb-1`}>Model</div>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{data.model || 'Unknown'}</div>
          </div>
          <div>
            <div className={`text-xs font-medium ${accent.text} uppercase tracking-wide mb-1`}>Serial</div>
            <div className="text-sm font-mono font-semibold text-gray-800 dark:text-gray-200">{data.serial || 'N/A'}</div>
          </div>
          <div>
            <div className={`text-xs font-medium ${accent.text} uppercase tracking-wide mb-1`}>Type</div>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {iconForDeviceType(data.deviceType)} {data.deviceType}
            </div>
          </div>
        </div>
      </div>

      {/* Upstream Connection (LLDP/CDP) */}
      <UpstreamConnection serial={data.serial} />

      {/* Device Details */}
      {(data.firmware || data.lanIp || data.status) && (
        <div className="space-y-3">
          <span className="text-base font-semibold text-gray-800 dark:text-gray-200">Device Information</span>

          <div className="grid grid-cols-2 gap-3">
            {data.lanIp && (
              <div>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">LAN IP</span>
                <p className="text-sm text-gray-900 dark:text-gray-100 font-mono mt-1">{data.lanIp}</p>
              </div>
            )}

            {data.status && (
              <div>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Status</span>
                <div className="mt-1">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${
                    data.status.toLowerCase() === 'online'
                      ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/20'
                      : data.status.toLowerCase() === 'offline'
                      ? 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20'
                      : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      data.status.toLowerCase() === 'online' ? 'bg-green-500' :
                      data.status.toLowerCase() === 'offline' ? 'bg-red-500' : 'bg-amber-500'
                    }`} />
                    {data.status}
                  </span>
                </div>
              </div>
            )}

            {data.firmware && (
              <div className="col-span-2">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Firmware</span>
                <p className="text-sm text-gray-900 dark:text-gray-100 font-mono mt-1">{data.firmware}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notes */}
      {data.notes && (
        <div className="p-2 bg-blue-50/50 dark:bg-blue-500/5 border border-blue-200 dark:border-blue-500/20 rounded">
          <span className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">Notes</span>
          <p className="text-xs text-gray-800 dark:text-gray-300 mt-1 leading-relaxed">{data.notes}</p>
        </div>
      )}

      {/* Tags */}
      {data.tags && data.tags.length > 0 && (
        <div>
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Tags</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {data.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-xs font-medium bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 rounded border border-blue-200 dark:border-blue-500/20"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
        {getEventLogUrl() && (
          <a
            href={getEventLogUrl()!}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium ${accent.text} ${accent.bg} hover:opacity-80 border ${accent.border} rounded-md transition-colors`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
            </svg>
            Event Log
          </a>
        )}
        {getMerakiUrl() && (
          <a
            href={getMerakiUrl()!}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            Dashboard
          </a>
        )}
      </div>
    </div>
  )
}
