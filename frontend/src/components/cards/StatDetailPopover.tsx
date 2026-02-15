import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export type DetailType = 'devices' | 'clients' | 'ssids'

interface Props {
  networkId: string
  detailType: DetailType
  anchorEl: HTMLElement
  onClose: () => void
}

interface DeviceRow {
  name: string
  model: string
  serial: string
  status: string
}

interface ClientRow {
  description: string
  mac: string
  ip: string
  vlan: string
}

interface SsidRow {
  name: string
  authMode: string
  enabled: boolean
}

const COLUMNS: Record<DetailType, string[]> = {
  devices: ['Name', 'Model', 'Serial', 'Status'],
  clients: ['Description', 'MAC', 'IP', 'VLAN'],
  ssids: ['Name', 'Auth Mode', 'Enabled'],
}

function renderCells(type: DetailType, row: DeviceRow | ClientRow | SsidRow): string[] {
  switch (type) {
    case 'devices': {
      const r = row as DeviceRow
      return [r.name || '—', r.model || '—', r.serial || '—', r.status || '—']
    }
    case 'clients': {
      const r = row as ClientRow
      return [r.description || '—', r.mac || '—', r.ip || '—', r.vlan?.toString() || '—']
    }
    case 'ssids': {
      const r = row as SsidRow
      return [r.name || '—', r.authMode || '—', r.enabled ? 'Yes' : 'No']
    }
  }
}

export function StatDetailPopover({ networkId, detailType, anchorEl, onClose }: Props) {
  const [data, setData] = useState<(DeviceRow | ClientRow | SsidRow)[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  // Fetch detail data
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/entity/network/${networkId}/${detailType}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((json) => {
        if (!cancelled) {
          setData(json)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [networkId, detailType])

  // Position near anchor element
  const rect = anchorEl.getBoundingClientRect()
  const popoverWidth = 400
  const gap = 8
  let left = rect.right + gap
  let top = rect.top

  if (left + popoverWidth > window.innerWidth - 16) {
    left = rect.left - popoverWidth - gap
  }
  if (left < 16) left = 16
  if (top + 300 > window.innerHeight - 16) {
    top = Math.max(16, window.innerHeight - 300 - 16)
  }

  const columns = COLUMNS[detailType]
  const title = detailType === 'devices' ? 'Devices' : detailType === 'clients' ? 'Clients' : 'SSIDs'

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-[60] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-2xl"
      style={{ left, top, width: popoverWidth, maxHeight: '60vh', overflow: 'auto' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800">
        <p className="text-xs font-semibold text-gray-900 dark:text-gray-200">{title}</p>
        <button
          onClick={onClose}
          className="p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="p-2">
        {loading ? (
          <div className="flex items-center gap-2 p-3">
            <div className="w-3 h-3 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-xs text-gray-500">Loading {detailType}...</span>
          </div>
        ) : error ? (
          <p className="text-xs text-red-400 p-3">Failed to load: {error}</p>
        ) : data && data.length > 0 ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                {columns.map((col) => (
                  <th key={col} className="text-left py-1 px-1.5 text-gray-600 dark:text-gray-500 font-medium">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="border-b border-gray-200/50 dark:border-gray-800/50 last:border-0">
                  {renderCells(detailType, row).map((cell, j) => (
                    <td key={j} className="py-1 px-1.5 text-gray-700 dark:text-gray-300 truncate max-w-[120px]">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-xs text-gray-500 p-3">No {detailType} found</p>
        )}
      </div>
    </div>,
    document.body,
  )
}
