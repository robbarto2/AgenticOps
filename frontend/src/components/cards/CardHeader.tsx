import { sourceColor, detectDeviceType } from '../../utils/formatters'
import type { DeviceIconType } from '../../utils/formatters'

interface Props {
  title: string
  source: 'meraki' | 'thousandeyes'
  collapsed?: boolean
  onCollapse: () => void
  onClose: () => void
}

const deviceIconColor: Record<DeviceIconType, string> = {
  wifi: '#10b981',
  switch: '#3b82f6',
  appliance: '#f59e0b',
  sensor: '#8b5cf6',
  camera: '#ec4899',
  gateway: '#06b6d4',
}

function DeviceIcon({ icon }: { icon: DeviceIconType }) {
  const color = deviceIconColor[icon]
  switch (icon) {
    case 'wifi':
      return (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z" />
        </svg>
      )
    case 'switch':
      return (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-13.5-3a3 3 0 0 1 0-6h13.5a3 3 0 1 1 0 6m-13.5 0h13.5M6.75 9h.008v.008H6.75V9Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM6.75 17.25h.008v.008H6.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
        </svg>
      )
    case 'appliance':
      return (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
        </svg>
      )
    case 'sensor':
      return (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
        </svg>
      )
    case 'camera':
      return (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
      )
    case 'gateway':
      return (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
        </svg>
      )
  }
}

export function CardHeader({ title, source, collapsed, onCollapse, onClose }: Props) {
  const device = detectDeviceType(title)

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-300/50 dark:border-gray-700/50 bg-gray-100/50 dark:bg-gray-800/50 rounded-t-lg">
      <div className="flex items-center gap-2.5 min-w-0">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{title}</h3>
        <span
          className="text-xs px-2 py-0.5 rounded font-medium flex-shrink-0"
          style={{
            backgroundColor: `${sourceColor(source)}15`,
            color: sourceColor(source),
            border: `1px solid ${sourceColor(source)}30`,
          }}
        >
          {source}
        </span>
        {device.icon && device.label && (
          <span
            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium flex-shrink-0"
            style={{
              backgroundColor: `${deviceIconColor[device.icon]}15`,
              color: deviceIconColor[device.icon],
              border: `1px solid ${deviceIconColor[device.icon]}30`,
            }}
          >
            <DeviceIcon icon={device.icon} />
            {device.label}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
        <button
          onClick={onCollapse}
          className="p-1.5 rounded hover:bg-gray-300/50 dark:hover:bg-gray-700/50 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {collapsed ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
            )}
          </svg>
        </button>
        <button
          onClick={onClose}
          className="p-1.5 rounded hover:bg-red-500/20 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          title="Close"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
