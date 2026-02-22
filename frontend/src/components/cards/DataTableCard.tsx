import { useState, useMemo, memo } from 'react'
import type { DataTableCard as DataTableCardType } from '../../types/card'

interface Props {
  data: DataTableCardType['data']
}

export const DataTableCard = memo(function DataTableCard({ data }: Props) {
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

  const sortedRows = useMemo(() => {
    const rows = [...data.rows]
    if (sortCol !== null) {
      rows.sort((a, b) => {
        const av = a[sortCol] ?? ''
        const bv = b[sortCol] ?? ''
        const cmp = av.localeCompare(bv, undefined, { numeric: true })
        return sortAsc ? cmp : -cmp
      })
    }
    return rows
  }, [data.rows, sortCol, sortAsc])

  return (
    <div className="overflow-auto max-h-96">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-gray-300/50 dark:border-gray-700/50">
            {data.columns.map((col, i) => (
              <th
                key={i}
                onClick={() => handleSort(i)}
                className="px-3 py-2.5 text-left text-gray-600 dark:text-gray-300 font-semibold cursor-pointer hover:text-gray-900 dark:hover:text-gray-100 transition-colors whitespace-nowrap"
              >
                <span className="flex items-center gap-1.5">
                  {col}
                  {sortCol === i && (
                    <span className="text-blue-500 dark:text-blue-400 text-base">
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
              className="border-b border-gray-200/50 dark:border-gray-800/50 hover:bg-gray-100/30 dark:hover:bg-gray-800/30 transition-colors"
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="px-3 py-2.5 text-gray-700 dark:text-gray-200 whitespace-nowrap"
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
})
