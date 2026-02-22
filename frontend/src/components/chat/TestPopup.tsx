import { useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCanvasStore } from '../../store/canvasSlice'
import { useQueueStore } from '../../store/queueSlice'
import type { TestDetailCard, TestAgent, TestAlertRule } from '../../types/card'

interface TestMetadata {
  testId: string
  testName: string
  testType: string
  target: string
  enabled: boolean
  interval: number
  agentCount: number
  avgLatency: number | null
  packetLoss: number | null
  availability: number | null
  perfAlert: boolean
}

interface Props {
  metadata: TestMetadata
  testName: string
  onClose: () => void
}

function PopupAgentLocations({ agents, agentCount }: { agents?: TestAgent[]; agentCount: number }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const hasAgentDetails = agents && agents.length > 0

  return (
    <div className="relative">
      <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Agents</span>
      {hasAgentDetails ? (
        <p
          className="text-sm text-blue-500 dark:text-blue-400 cursor-pointer underline decoration-dotted underline-offset-2 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          {agentCount} location{agentCount !== 1 ? 's' : ''}
        </p>
      ) : (
        <p className="text-sm text-gray-900 dark:text-gray-100">
          {agentCount} location{agentCount !== 1 ? 's' : ''}
        </p>
      )}
      {showTooltip && hasAgentDetails && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-2 px-2.5 min-w-[200px] max-w-[300px]">
          <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">Agent Locations</p>
          <ul className="space-y-1">
            {agents.map((agent) => (
              <li key={agent.agentId} className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-200">
                <svg className="w-3 h-3 text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                </svg>
                <span className="truncate">{agent.agentName}{agent.location ? ` — ${agent.location}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function TestPopup({ metadata, testName, onClose }: Props) {
  const popupRef = useRef<HTMLDivElement>(null)
  const addCard = useCanvasStore((s) => s.addCard)
  const [testDetails, setTestDetails] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [isDissolving, setIsDissolving] = useState(false)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  // Fetch test details
  useEffect(() => {
    if (!metadata.testId) return

    let cancelled = false
    setLoading(true)

    fetch(`/api/test/${metadata.testId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (!cancelled) {
          setTestDetails(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to fetch test details:', err)
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [metadata.testId])

  const handleViewResults = () => {
    useQueueStore.getState().addPrompt(
      `Show me the test results and performance metrics for "${testName}" (test ID: ${metadata.testId})`
    )
    onClose()
  }

  const handleAddToCanvas = () => {
    const card: TestDetailCard = {
      id: `card-test-${metadata.testId}-${Date.now()}`,
      type: 'test_detail',
      title: testName,
      source: 'thousandeyes',
      data: {
        testId: metadata.testId,
        testName: metadata.testName,
        testType: metadata.testType,
        target: metadata.target,
        enabled: metadata.enabled,
        interval: metadata.interval,
        agents: testDetails?.agents || [],
        alertRules: testDetails?.alertRules || [],
        description: testDetails?.description || '',
        avgLatency: metadata.avgLatency,
        packetLoss: metadata.packetLoss,
        availability: metadata.availability,
        perfAlert: metadata.perfAlert,
        agentCount: metadata.agentCount,
        metrics: testDetails?.metrics,
      },
    }

    // Start the dissolve animation
    setIsDissolving(true)

    // Wait for React to render + dissolve animation to complete, then add card and close
    requestAnimationFrame(() => {
      setTimeout(() => {
        addCard(card)
        onClose()
      }, 220)
    })
  }

  const getThousandEyesUrl = () => {
    if (!metadata.testId) return null
    return `https://app.thousandeyes.com/view/tests/?testId=${metadata.testId}`
  }

  // Format interval (in seconds)
  const formatInterval = (seconds: number) => {
    if (seconds >= 3600) return `${seconds / 3600}h`
    if (seconds >= 60) return `${seconds / 60}m`
    return `${seconds}s`
  }

  const popupWidth = 500

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        ref={popupRef}
        className={`relative bg-white dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-400 rounded-lg shadow-2xl ${isDissolving ? 'animate-popup-dissolve' : ''}`}
        style={{ width: popupWidth, maxHeight: '85vh', overflow: 'auto' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-1.5 pr-2 min-w-0">
            <p className="text-xs font-semibold text-gray-900 dark:text-gray-200 truncate">{testName}</p>
            <span className={`flex-shrink-0 px-1.5 py-0.5 text-xs rounded border ${
              metadata.enabled
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
            }`}>
              {metadata.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading && (
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2">
            <div className="w-3 h-3 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
            <span className="text-xs text-gray-500">Loading test details...</span>
          </div>
        )}

        {/* Performance Metrics — shown first since this is what matters most */}
        {(metadata.avgLatency !== null || metadata.packetLoss !== null || metadata.availability !== null) && (
          <div className="px-3 py-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Performance (24h avg)</span>
              {metadata.perfAlert && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-500/10 text-red-400 border border-red-500/20">
                  Degraded
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2 bg-gray-100 dark:bg-gray-800/40 rounded-lg">
                <p className={`text-lg font-semibold ${
                  metadata.avgLatency === null ? 'text-gray-400' :
                  metadata.avgLatency <= 150 ? 'text-emerald-400' :
                  metadata.avgLatency <= 500 ? 'text-amber-400' : 'text-red-400'
                }`}>{metadata.avgLatency !== null ? `${metadata.avgLatency.toFixed(0)}ms` : '—'}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Latency</p>
                {metadata.avgLatency !== null && (
                  <p className="text-[9px] text-gray-500 mt-0.5">
                    {metadata.avgLatency <= 150 ? 'Good (<150ms)' : metadata.avgLatency <= 500 ? 'Elevated' : 'High (>500ms)'}
                  </p>
                )}
              </div>
              <div className="text-center p-2 bg-gray-100 dark:bg-gray-800/40 rounded-lg">
                <p className={`text-lg font-semibold ${
                  metadata.packetLoss === null ? 'text-gray-400' :
                  metadata.packetLoss <= 1 ? 'text-emerald-400' :
                  metadata.packetLoss <= 5 ? 'text-amber-400' : 'text-red-400'
                }`}>{metadata.packetLoss !== null ? `${metadata.packetLoss.toFixed(2)}%` : '—'}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Packet Loss</p>
                {metadata.packetLoss !== null && (
                  <p className="text-[9px] text-gray-500 mt-0.5">
                    {metadata.packetLoss <= 1 ? 'Good (<1%)' : metadata.packetLoss <= 5 ? 'Elevated' : 'High (>5%)'}
                  </p>
                )}
              </div>
              <div className="text-center p-2 bg-gray-100 dark:bg-gray-800/40 rounded-lg">
                <p className={`text-lg font-semibold ${
                  metadata.availability === null ? 'text-gray-400' :
                  metadata.availability >= 99 ? 'text-emerald-400' :
                  metadata.availability >= 95 ? 'text-amber-400' : 'text-red-400'
                }`}>{metadata.availability !== null ? `${metadata.availability.toFixed(1)}%` : '—'}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Availability</p>
                {metadata.availability !== null && (
                  <p className="text-[9px] text-gray-500 mt-0.5">
                    {metadata.availability >= 99 ? 'Good (>99%)' : metadata.availability >= 95 ? 'Degraded' : 'Poor (<95%)'}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {(metadata.avgLatency !== null || metadata.packetLoss !== null || metadata.availability !== null) && (
          <div className="border-t border-gray-200 dark:border-gray-800" />
        )}

        {/* Test Configuration */}
        <div className="px-3 py-2 space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Test Type</span>
              <p className="text-sm text-gray-900 dark:text-gray-100">{metadata.testType}</p>
            </div>
            <div>
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Interval</span>
              <p className="text-sm text-gray-900 dark:text-gray-100">Every {formatInterval(metadata.interval)}</p>
            </div>
          </div>

          <div>
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Target</span>
            <p className="text-sm text-gray-700 dark:text-gray-300 font-mono break-all">{metadata.target}</p>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <PopupAgentLocations agents={testDetails?.agents} agentCount={metadata.agentCount} />
            <div>
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Test ID</span>
              <p className="text-sm text-gray-700 dark:text-gray-300 font-mono">{metadata.testId}</p>
            </div>
          </div>

          {testDetails?.description && (
            <div>
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Description</span>
              <p className="text-sm text-gray-900 dark:text-gray-100">{testDetails.description}</p>
            </div>
          )}

          {testDetails?.alertRules && testDetails.alertRules.length > 0 && (
            <div>
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Alert Rules</span>
              <p className="text-sm text-gray-900 dark:text-gray-100">
                {testDetails.alertRules.length} rule{testDetails.alertRules.length !== 1 ? 's' : ''} configured
              </p>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 dark:border-gray-800" />

        {/* Actions */}
        <div className="px-3 py-2 space-y-1.5">
          <button
            onClick={handleViewResults}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 rounded-md transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
            View Test Results
          </button>

          <div className="flex gap-1.5">
            <button
              onClick={handleAddToCanvas}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-md transition-colors cursor-pointer"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add to Canvas
            </button>

            {getThousandEyesUrl() && (
              <a href={getThousandEyesUrl()!} target="_blank" rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-800/60 hover:bg-gray-200 dark:hover:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md transition-colors"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                ThousandEyes
              </a>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
