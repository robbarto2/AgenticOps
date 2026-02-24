import { useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCanvasStore } from '../../store/canvasSlice'
import type { SsidDetailCard } from '../../types/card'

interface SsidMetadata {
  networkId?: string
  networkName?: string
  ssidNumber?: number
  ssidName?: string
  enabled?: boolean
  authMode?: string
  encryptionMode?: string
  bandSelection?: string
  vlanId?: number
  ipAssignmentMode?: string
}

interface Props {
  metadata: SsidMetadata
  ssidName: string
  onClose: () => void
}

export function SsidPopup({ metadata, ssidName, onClose }: Props) {
  const popupRef = useRef<HTMLDivElement>(null)
  const addCard = useCanvasStore((s) => s.addCard)
  const [isDissolving, setIsDissolving] = useState(false)

  const isOpen = metadata.authMode?.toLowerCase() === 'open'
  const isEnabled = metadata.enabled !== false

  const statusPillClass = isEnabled
    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
  const statusDotClass = isEnabled ? 'bg-emerald-400' : 'bg-gray-400'

  const authColor = isOpen
    ? 'bg-red-500/10 text-red-400 border-red-500/20'
    : metadata.authMode?.toLowerCase().includes('psk')
      ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
      : metadata.authMode?.toLowerCase().includes('8021x') || metadata.authMode?.toLowerCase().includes('enterprise')
        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        : 'bg-gray-500/10 text-gray-400 border-gray-500/20'

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose()
    }
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler) }
  }, [onClose])

  const handleAddToCanvas = () => {
    const cardData: SsidDetailCard = {
      id: `card-ssid-${metadata.networkId}-${metadata.ssidNumber}-${Date.now()}`,
      type: 'ssid_detail',
      title: metadata.ssidName || ssidName,
      source: 'meraki',
      data: {
        ssidNumber: metadata.ssidNumber ?? 0,
        ssidName: metadata.ssidName || ssidName,
        networkId: metadata.networkId || '',
        networkName: metadata.networkName,
        enabled: metadata.enabled ?? false,
        authMode: metadata.authMode,
        encryptionMode: metadata.encryptionMode,
        bandSelection: metadata.bandSelection,
        vlanId: metadata.vlanId,
        ipAssignmentMode: metadata.ipAssignmentMode,
      },
    }

    setIsDissolving(true)
    requestAnimationFrame(() => {
      setTimeout(() => {
        addCard(cardData)
        onClose()
      }, 220)
    })
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        ref={popupRef}
        className={`relative bg-white dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-400 rounded-lg shadow-2xl ${isDissolving ? 'animate-popup-dissolve' : ''}`}
        style={{ width: 380, maxHeight: '80vh', overflow: 'auto' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800">
          <p className="text-xs font-semibold text-gray-900 dark:text-gray-200 truncate pr-2">{ssidName}</p>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Metadata */}
        <div className="px-3 py-2 space-y-2">
          {/* Status + Auth badges */}
          <div className="flex flex-wrap gap-1.5">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded border ${statusPillClass}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusDotClass}`} />
              {isEnabled ? 'Enabled' : 'Disabled'}
            </span>
            {metadata.authMode && (
              <span className={`inline-flex items-center px-1.5 py-0.5 text-xs rounded border ${authColor}`}>
                {metadata.authMode}
              </span>
            )}
          </div>

          {/* Security warning */}
          {isOpen && isEnabled && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-red-500/10 border border-red-500/20">
              <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <span className="text-[11px] text-red-300">Open authentication - no encryption</span>
            </div>
          )}

          {metadata.networkName && (
            <div>
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Network</span>
              <p className="text-sm text-gray-900 dark:text-gray-100">{metadata.networkName}</p>
            </div>
          )}

          {metadata.encryptionMode && (
            <div>
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Encryption</span>
              <p className="text-sm text-gray-700 dark:text-gray-300">{metadata.encryptionMode}</p>
            </div>
          )}

          {metadata.bandSelection && (
            <div>
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Band Selection</span>
              <p className="text-sm text-gray-700 dark:text-gray-300">{metadata.bandSelection}</p>
            </div>
          )}

          {metadata.vlanId !== undefined && metadata.vlanId !== null && (
            <div>
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">VLAN</span>
              <p className="text-sm text-gray-700 dark:text-gray-300 font-mono">{metadata.vlanId}</p>
            </div>
          )}

          {metadata.ipAssignmentMode && (
            <div>
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">IP Assignment</span>
              <p className="text-sm text-gray-700 dark:text-gray-300">{metadata.ipAssignmentMode}</p>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 dark:border-gray-800" />

        {/* Actions */}
        <div className="px-3 py-2">
          <button
            onClick={handleAddToCanvas}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 rounded-md transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add to Canvas
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
