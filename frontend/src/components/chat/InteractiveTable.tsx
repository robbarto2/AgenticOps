import { useState, useCallback, memo } from 'react'
import type { TableData } from '../../types/chat'
import { HoverPopup } from './HoverPopup'
import { DevicePopup } from './DevicePopup'
import { TestPopup } from './TestPopup'
import { ClientPopup } from './ClientPopup'
import { UplinkPopup } from './UplinkPopup'

interface Props {
  tableData: TableData
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase().trim()
  let dotClass: string
  let pillClass: string

  if (s === 'online' || s === 'enabled' || s === 'active') {
    dotClass = 'bg-emerald-500'
    pillClass = 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 ring-emerald-500/40'
  } else if (s === 'ready') {
    dotClass = 'bg-blue-500'
    pillClass = 'bg-blue-500/20 text-blue-600 dark:text-blue-400 ring-blue-500/40'
  } else if (s === 'alerting') {
    dotClass = 'bg-amber-500'
    pillClass = 'bg-amber-500/20 text-amber-600 dark:text-amber-400 ring-amber-500/40'
  } else if (s === 'offline' || s === 'failed') {
    dotClass = 'bg-red-500'
    pillClass = 'bg-red-500/20 text-red-600 dark:text-red-400 ring-red-500/40'
  } else if (s === 'dormant' || s === 'disabled' || s === 'not connected') {
    dotClass = 'bg-gray-400'
    pillClass = 'bg-gray-500/20 text-gray-600 dark:text-gray-400 ring-gray-500/40'
  } else {
    dotClass = 'bg-gray-400'
    pillClass = 'bg-gray-500/20 text-gray-600 dark:text-gray-400 ring-gray-500/40'
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset whitespace-nowrap ${pillClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass}`} />
      {status}
    </span>
  )
}

export const InteractiveTable = memo(function InteractiveTable({ tableData }: Props) {
  const [hoveredRowIdx, setHoveredRowIdx] = useState<number | null>(null)
  const [popupRowIdx, setPopupRowIdx] = useState<number | null>(null)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)

  const handleClick = useCallback((idx: number, el: HTMLTableRowElement) => {
    if (popupRowIdx === idx) {
      setPopupRowIdx(null)
      setAnchorRect(null)
    } else {
      setAnchorRect(el.getBoundingClientRect())
      setPopupRowIdx(idx)
    }
  }, [popupRowIdx])

  const closePopup = useCallback(() => {
    setPopupRowIdx(null)
    setAnchorRect(null)
  }, [])

  const popupRow = popupRowIdx !== null ? tableData.rows[popupRowIdx] : undefined

  // Check if there are any error/warning rows to show legend
  const hasErrorRows = tableData.rows.some(r => r.status_type === 'error')
  const hasWarningRows = tableData.rows.some(r => r.status_type === 'warning')

  return (
    <>
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-[#0e1219] border-b border-gray-200 dark:border-[#1e2636]">
        <svg className="w-3 h-3 text-blue-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
        </svg>
        <span className="text-[11px] text-gray-500 dark:text-gray-400">Click a row for details</span>

        {(hasErrorRows || hasWarningRows) && (
          <div className="flex items-center gap-3 ml-auto">
            {hasWarningRows && (
              <span className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                <span className="w-3 h-[3px] rounded-full bg-amber-500 dark:bg-amber-400/80" />
                Alerting
              </span>
            )}
            {hasErrorRows && (
              <span className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                <span className="w-3 h-[3px] rounded-full bg-red-500 dark:bg-red-400/80" />
                {tableData.entity_type === 'test' ? 'Poor Performance' : 'Offline'}
              </span>
            )}
          </div>
        )}
      </div>

      <table className="w-full border-collapse text-[0.8125rem]">
        <thead>
          <tr>
            {tableData.columns.map((col) => {
              const colLower = col.toLowerCase()
              const dotColor =
                colLower === 'active' ? 'bg-emerald-500' :
                colLower === 'offline' || colLower === 'failed' ? 'bg-red-500' :
                colLower === 'alerting' ? 'bg-amber-500' :
                colLower === 'not connected' ? 'bg-gray-400' :
                null
              return (
                <th
                  key={col}
                  className="bg-gray-100 dark:bg-[#141c2b] px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-[#1e2636] whitespace-nowrap"
                >
                  {dotColor ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                      {col}
                    </span>
                  ) : col}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {tableData.rows.map((row, idx) => {
            const statusType = row.status_type || 'normal'
            const isError = statusType === 'error'
            const isWarning = statusType === 'warning'
            const getRowBackground = () => {
              const borderAccent = isError
                ? 'border-l-[3px] border-l-red-500 dark:border-l-red-400'
                : isWarning
                  ? 'border-l-[3px] border-l-amber-500 dark:border-l-amber-400'
                  : ''

              if (popupRowIdx === idx) {
                return `bg-blue-500/10 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.3)] ${borderAccent}`
              }
              if (hoveredRowIdx === idx) {
                return `bg-gray-100/80 dark:bg-gray-700/30 ${borderAccent}`
              }
              if (isError) {
                return 'bg-red-100 dark:bg-red-500/15 border-l-[3px] border-l-red-500 dark:border-l-red-400'
              }
              if (isWarning) {
                return 'bg-amber-50 dark:bg-amber-900/15 border-l-[3px] border-l-amber-500 dark:border-l-amber-400'
              }
              return ''
            }

            return (
              <tr
                key={row.id || `row-${idx}`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => handleClick(idx, e.currentTarget)}
                onMouseEnter={() => setHoveredRowIdx(idx)}
                onMouseLeave={() => setHoveredRowIdx(null)}
                className={`border-b border-gray-200 dark:border-[#1e2636] cursor-pointer transition-all duration-200 ${getRowBackground()}`}
              >
                {row.cells.map((cell, i) => {
                  const col = tableData.columns[i]
                  const isWanAlert = col === 'WAN' && cell && (cell.includes('failed') || cell.includes('down'))
                  const wanClass = isWanAlert
                    ? cell.includes('failed') ? 'text-red-500 font-semibold' : 'text-amber-500 font-medium'
                    : ''
                  return (
                    <td key={i} className={`px-3 py-1.5 text-gray-700 dark:text-gray-300 ${wanClass}`}>
                      {col === 'Status' ? <StatusBadge status={cell} /> : cell}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>

      {popupRow && (
        tableData.entity_type === 'device' ? (
          <DevicePopup
            metadata={popupRow.metadata as any}
            deviceName={popupRow.cells[0]}
            onClose={closePopup}
          />
        ) : tableData.entity_type === 'test' ? (
          <TestPopup
            metadata={popupRow.metadata as any}
            testName={popupRow.cells[0]}
            onClose={closePopup}
          />
        ) : tableData.entity_type === 'client' ? (
          <ClientPopup
            metadata={popupRow.metadata as any}
            clientName={popupRow.cells[0]}
            onClose={closePopup}
          />
        ) : tableData.entity_type === 'uplink' ? (
          <UplinkPopup
            metadata={popupRow.metadata as any}
            deviceName={popupRow.cells[0]}
            onClose={closePopup}
          />
        ) : anchorRect ? (
          <HoverPopup
            metadata={popupRow.metadata}
            entityType={tableData.entity_type}
            anchorRect={anchorRect}
            networkName={popupRow.cells[0]}
            onClose={closePopup}
          />
        ) : null
      )}
    </>
  )
})
