import { useState } from 'react'
import type { DataTableCard as DataTableCardType } from '../../types/card'

interface Props {
  data: DataTableCardType['data']
}

export function DataTableCard({ data }: Props) {
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortAsc, setSortAsc] = useState(true)

  const handleSort = (colIdx: number) => {
    if (sortCol === colIdx) {
      setSortAsc(!sortAsc)
    } else {
      setSortCol(colIdx)
      setSortAsc(true)
    }
  }

  const sortedRows = [...data.rows]
  if (sortCol !== null) {
    sortedRows.sort((a, b) => {
      const av = a[sortCol] ?? ''
      const bv = b[sortCol] ?? ''
      const cmp = av.localeCompare(bv, undefined, { numeric: true })
      return sortAsc ? cmp : -cmp
    })
  }

  return (
    <div className="overflow-auto max-h-64">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-700/50">
            {data.columns.map((col, i) => (
              <th
                key={i}
                onClick={() => handleSort(i)}
                className="px-2 py-1.5 text-left text-gray-400 font-medium cursor-pointer hover:text-gray-200 transition-colors whitespace-nowrap"
              >
                <span className="flex items-center gap-1">
                  {col}
                  {sortCol === i && (
                    <span className="text-blue-400">
                      {sortAsc ? '\u2191' : '\u2193'}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, ri) => (
            <tr
              key={ri}
              className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="px-2 py-1.5 text-gray-300 whitespace-nowrap"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
