import { useState, useCallback } from 'react'
import type { TableData } from '../../types/chat'
import { HoverPopup } from './HoverPopup'
import { DevicePopup } from './DevicePopup'
import { TestPopup } from './TestPopup'
import { ClientPopup } from './ClientPopup'

interface Props {
  tableData: TableData
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase().trim()
  let dotClass: string
  let pillClass: string

  if (s === 'online' || s === 'enabled') {
    dotClass = 'bg-emerald-500'
    pillClass = 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 ring-emerald-500/40'
  } else if (s === 'alerting') {
    dotClass = 'bg-amber-500'
    pillClass = 'bg-amber-500/20 text-amber-600 dark:text-amber-400 ring-amber-500/40'
  } else if (s === 'offline') {
    dotClass = 'bg-red-500'
    pillClass = 'bg-red-500/20 text-red-600 dark:text-red-400 ring-red-500/40'
  } else if (s === 'dormant' || s === 'disabled') {
    dotClass = 'bg-gray-400'
    pillClass = 'bg-gray-500/20 text-gray-600 dark:text-gray-400 ring-gray-500/40'
  } else {
    dotClass = 'bg-gray-400'
    pillClass = 'bg-gray-500/20 text-gray-600 dark:text-gray-400 ring-gray-500/40'
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${pillClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
      {status}
    </span>
  )
}

export function InteractiveTable({ tableData }: Props) {
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

  return (
    <>
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-[#0e1219] border-b border-gray-200 dark:border-[#1e2636]">
        <svg className="w-3 h-3 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
        </svg>
        <span className="text-[11px] text-gray-500 dark:text-gray-400">Click a row for details</span>
      </div>

      <table className="w-full border-collapse text-[0.8125rem]">
        <thead>
          <tr>
            {tableData.columns.map((col) => (
              <th
                key={col}
                className="bg-gray-100 dark:bg-[#141c2b] px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-[#1e2636] whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableData.rows.map((row, idx) => {
            const statusType = row.status_type || 'normal'
            const getRowBackground = () => {
              if (popupRowIdx === idx) {
                return 'bg-blue-500/10 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.3)]'
              }
              if (hoveredRowIdx === idx) {
                if (statusType === 'error') {
                  return 'bg-red-500/15 shadow-[inset_0_0_12px_rgba(239,68,68,0.12)]'
                } else if (statusType === 'warning') {
                  return 'bg-amber-500/15 shadow-[inset_0_0_12px_rgba(245,158,11,0.12)]'
                }
                return 'bg-blue-500/5 shadow-[inset_0_0_12px_rgba(59,130,246,0.08)]'
              }
              if (statusType === 'error') {
                return 'bg-red-500/5'
              } else if (statusType === 'warning') {
                return 'bg-amber-500/5'
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
                {row.cells.map((cell, i) => (
                  <td key={i} className="px-3 py-1.5 text-gray-700 dark:text-gray-300">
                    {tableData.columns[i] === 'Status' ? <StatusBadge status={cell} /> : cell}
                  </td>
                ))}
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
}
