import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { formatTimestamp, agentDisplayName } from '../../utils/formatters'
import type { ChatMessage as ChatMessageType, TableData } from '../../types/chat'
import { InteractiveTable } from './InteractiveTable'

interface Props {
  message: ChatMessageType
}

/**
 * Strip markdown tables whose headers match a TableData entry.
 * This lets us render those tables via InteractiveTable instead.
 */
function stripMatchingTables(content: string, tableData: TableData[]): string {
  // Regex matches a markdown table: header row, separator row, and data rows
  const tableRegex = /^(\|[^\n]+\|\s*\n\|[-:\s|]+\|\s*\n(?:\|[^\n]+\|\s*\n?)*)/gm

  return content.replace(tableRegex, (match) => {
    // Extract header cell texts from the first line
    const firstLine = match.split('\n')[0]
    const headers = firstLine
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)

    // Check if any tableData columns match these headers
    const isMatch = tableData.some(
      (td) =>
        td.columns.length === headers.length &&
        td.columns.every((col, i) => col.toLowerCase() === headers[i]?.toLowerCase())
    )

    return isMatch ? '' : match
  })
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user'
  const hasTableData = message.tableData && message.tableData.length > 0

  // Strip tables from markdown that will be rendered as InteractiveTable
  const displayContent = hasTableData
    ? stripMatchingTables(message.content, message.tableData!)
    : message.content

  return (
    <div className={`px-4 py-3 ${isUser ? 'bg-gray-900/30' : 'bg-transparent'}`}>
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
            isUser
              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
          }`}
        >
          {isUser ? 'U' : 'A'}
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-gray-300">
              {isUser ? 'You' : 'AgenticOps'}
            </span>
            {message.agentName && (
              <span className="text-xs px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">
                {agentDisplayName(message.agentName)}
              </span>
            )}
            <span className="text-xs text-gray-600">
              {formatTimestamp(message.timestamp)}
            </span>
          </div>

          {/* Markdown content */}
          <div className="text-sm text-gray-300 prose prose-invert prose-sm max-w-none overflow-x-auto">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {displayContent}
            </ReactMarkdown>
          </div>

          {/* Interactive tables — rendered outside prose to avoid style conflicts */}
          {message.tableData?.map((td) => (
            <div key={td.table_id} className="mt-3 overflow-x-auto rounded-lg border border-gray-800">
              <InteractiveTable tableData={td} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
