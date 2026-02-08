import { sourceColor, agentDisplayName } from '../../utils/formatters'

interface Props {
  title: string
  source: 'meraki' | 'thousandeyes'
  collapsed?: boolean
  onCollapse: () => void
  onClose: () => void
}

export function CardHeader({ title, source, collapsed, onCollapse, onClose }: Props) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/50 bg-gray-800/50 rounded-t-lg">
      <div className="flex items-center gap-2 min-w-0">
        <h3 className="text-xs font-semibold text-gray-200 truncate">{title}</h3>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0"
          style={{
            backgroundColor: `${sourceColor(source)}15`,
            color: sourceColor(source),
            border: `1px solid ${sourceColor(source)}30`,
          }}
        >
          {source}
        </span>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
        <button
          onClick={onCollapse}
          className="p-1 rounded hover:bg-gray-700/50 text-gray-500 hover:text-gray-300 transition-colors"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {collapsed ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
            )}
          </svg>
        </button>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
          title="Close"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
