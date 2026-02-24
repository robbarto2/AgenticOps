import type { SsidDetailCard as SsidDetailCardType } from '../../types/card'

interface Props {
  data: SsidDetailCardType['data']
}

function authBadge(authMode?: string): { label: string; color: string; bg: string } {
  if (!authMode) return { label: 'Unknown', color: '#6b7280', bg: 'bg-gray-500/10' }
  const mode = authMode.toLowerCase()
  if (mode.includes('8021x') || mode.includes('802.1x') || mode.includes('wpa2-enterprise') || mode.includes('wpa3')) {
    return { label: '802.1X Enterprise', color: '#10b981', bg: 'bg-emerald-500/10' }
  }
  if (mode === 'open') {
    return { label: 'Open (No Auth)', color: '#ef4444', bg: 'bg-red-500/10' }
  }
  if (mode.includes('psk')) {
    return { label: 'PSK', color: '#3b82f6', bg: 'bg-blue-500/10' }
  }
  return { label: authMode, color: '#6b7280', bg: 'bg-gray-500/10' }
}

function formatBandwidth(bps?: number): string {
  if (!bps || bps === 0) return 'Unlimited'
  if (bps >= 1000) return `${(bps / 1000).toFixed(1)} Mbps`
  return `${bps} Kbps`
}

export function SsidDetailCard({ data }: Props) {
  const auth = authBadge(data.authMode)
  const isOpen = data.authMode?.toLowerCase() === 'open'

  return (
    <div className="space-y-3">
      {/* Status + Security row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold rounded-full ${
            data.enabled
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-gray-500/15 text-gray-400'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${data.enabled ? 'bg-emerald-400' : 'bg-gray-400'}`} />
          {data.enabled ? 'Enabled' : 'Disabled'}
        </span>
        <span
          className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${auth.bg}`}
          style={{ color: auth.color }}
        >
          {auth.label}
        </span>
      </div>

      {/* Security warning for open auth */}
      {isOpen && data.enabled && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <svg className="w-4 h-4 text-red-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <span className="text-xs text-red-300">Open authentication - no encryption</span>
        </div>
      )}

      {/* Detail grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">SSID Name</span>
          <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">{data.ssidName}</p>
        </div>
        {data.networkName && (
          <div>
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Network</span>
            <p className="text-sm text-gray-900 dark:text-gray-100">{data.networkName}</p>
          </div>
        )}
        {data.encryptionMode && (
          <div>
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Encryption</span>
            <p className="text-sm text-gray-700 dark:text-gray-300">{data.encryptionMode}</p>
          </div>
        )}
        {data.bandSelection && (
          <div>
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Band</span>
            <p className="text-sm text-gray-700 dark:text-gray-300">{data.bandSelection}</p>
          </div>
        )}
        {data.vlanId !== undefined && (
          <div>
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">VLAN</span>
            <p className="text-sm text-gray-700 dark:text-gray-300 font-mono">{data.vlanId}</p>
          </div>
        )}
        {data.ipAssignmentMode && (
          <div>
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">IP Assignment</span>
            <p className="text-sm text-gray-700 dark:text-gray-300">{data.ipAssignmentMode}</p>
          </div>
        )}
      </div>

      {/* Bandwidth limits */}
      {(data.perClientBandwidthLimitUp || data.perClientBandwidthLimitDown) && (
        <div className="border-t border-gray-200 dark:border-gray-700/50 pt-2">
          <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Bandwidth Limits</span>
          <div className="flex gap-4 mt-1">
            <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
              <svg className="w-3 h-3 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
              </svg>
              Up: {formatBandwidth(data.perClientBandwidthLimitUp)}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
              <svg className="w-3 h-3 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />
              </svg>
              Down: {formatBandwidth(data.perClientBandwidthLimitDown)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
