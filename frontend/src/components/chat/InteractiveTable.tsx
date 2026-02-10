import { useState, useCallback } from 'react'
import type { TableData } from '../../types/chat'
import { HoverPopup } from './HoverPopup'

interface Props {
  tableData: TableData
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
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900/50 border-b border-gray-800">
        <svg className="w-3 h-3 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
        </svg>
        <span className="text-[11px] text-gray-500">Click a row for details</span>
      </div>

      <table className="w-full border-collapse text-[0.8125rem]">
        <thead>
          <tr>
            {tableData.columns.map((col) => (
              <th
                key={col}
                className="bg-[#1e293b] px-3 py-2 text-left font-semibold text-gray-300 border-b border-[#334155] whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableData.rows.map((row, idx) => (
            <tr
              key={row.id || `row-${idx}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => handleClick(idx, e.currentTarget)}
              onMouseEnter={() => setHoveredRowIdx(idx)}
              onMouseLeave={() => setHoveredRowIdx(null)}
              className={`border-b border-[#1e293b] cursor-pointer transition-all duration-200 ${
                popupRowIdx === idx
                  ? 'bg-blue-500/10 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.3)]'
                  : hoveredRowIdx === idx
                    ? 'bg-blue-500/5 shadow-[inset_0_0_12px_rgba(59,130,246,0.08)]'
                    : ''
              }`}
            >
              {row.cells.map((cell, i) => (
                <td key={i} className="px-3 py-1.5 text-gray-300">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {popupRow && anchorRect && (
        <HoverPopup
          metadata={popupRow.metadata}
          entityType={tableData.entity_type}
          anchorRect={anchorRect}
          networkName={popupRow.cells[0]}
          onClose={closePopup}
        />
      )}
    </>
  )
}
