import { useState, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { formatTimestamp, agentDisplayName } from '../../utils/formatters'
import type { ChatMessage as ChatMessageType, TableData } from '../../types/chat'
import { InteractiveTable } from './InteractiveTable'
import { MarkdownRowPopup } from './MarkdownRowPopup'

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
  const [popupData, setPopupData] = useState<{ headers: string[]; cells: string[] } | null>(null)
  const proseRef = useRef<HTMLDivElement>(null)

  const handleProseClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Walk up from click target to find a <td> inside a <tbody>
    let el = e.target as HTMLElement | null
    let td: HTMLElement | null = null
    while (el && el !== e.currentTarget) {
      if (el.tagName === 'TD') { td = el; break }
      el = el.parentElement
    }
    if (!td) return

    const tr = td.closest('tbody > tr') as HTMLTableRowElement | null
    if (!tr) return

    const table = tr.closest('table')
    if (!table) return

    const thead = table.querySelector('thead')
    if (!thead) return

    const headers = Array.from(thead.querySelectorAll('th')).map((th) => (th.textContent || '').trim())
    const cells = Array.from(tr.querySelectorAll('td')).map((cell) => (cell.textContent || '').trim())

    if (headers.length > 0 && cells.length > 0) {
      setPopupData({ headers, cells })
    }
  }, [])

  // Strip tables from markdown that will be rendered as InteractiveTable
  const displayContent = hasTableData
    ? stripMatchingTables(message.content, message.tableData!)
    : message.content

  return (
    <div className={`px-4 py-3 ${isUser ? 'bg-gray-100 dark:bg-[#111827]/60' : 'bg-transparent'}`}>
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
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {isUser ? 'You' : 'AgenticOps'}
            </span>
            {message.agentName && (
              <span className="text-xs px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">
                {agentDisplayName(message.agentName)}
              </span>
            )}
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {formatTimestamp(message.timestamp)}
            </span>
          </div>

          {/* Markdown content */}
          <div
            ref={proseRef}
            onClick={handleProseClick}
            className="text-sm text-gray-900 dark:text-gray-100 prose dark:prose-invert prose-sm max-w-none overflow-x-auto"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {displayContent}
            </ReactMarkdown>
          </div>

          {popupData && (
            <MarkdownRowPopup
              headers={popupData.headers}
              cells={popupData.cells}
              onClose={() => setPopupData(null)}
            />
          )}

          {/* Interactive tables — rendered outside prose to avoid style conflicts */}
          {message.tableData?.map((td) => (
            <div key={td.table_id} className="mt-3 overflow-x-auto rounded-lg border border-gray-200 dark:border-[#1e2636]">
              <InteractiveTable tableData={td} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
