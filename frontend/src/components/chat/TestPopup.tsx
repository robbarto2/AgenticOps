import { useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCanvasStore } from '../../store/canvasSlice'
import type { TestDetailCard, TestAgent, TestAlertRule } from '../../types/card'

interface TestMetadata {
  testId: string
  testName: string
  testType: string
  target: string
  enabled: boolean
  interval: number
  agentCount: number
}

interface Props {
  metadata: TestMetadata
  testName: string
  onClose: () => void
}

export function TestPopup({ metadata, testName, onClose }: Props) {
  const popupRef = useRef<HTMLDivElement>(null)
  const addCard = useCanvasStore((s) => s.addCard)
  const [testDetails, setTestDetails] = useState<any>(null)
  const [loading, setLoading] = useState(false)

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
        metrics: testDetails?.metrics,
      },
    }
    addCard(card)
    onClose()
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
        className="relative bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-lg shadow-2xl"
        style={{ width: popupWidth, maxHeight: '85vh', overflow: 'auto' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2 pr-2">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-200 truncate">
              {testName}
            </p>
            <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${
              metadata.enabled
                ? 'bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/20'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700'
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
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
              <span className="text-sm text-gray-500">Loading test details...</span>
            </div>
          </div>
        )}

        {/* Test metadata */}
        <div className="px-4 py-3 space-y-2.5">
          <div>
            <span className="text-sm text-gray-600 dark:text-gray-500">Test Type</span>
            <p className="text-sm text-gray-800 dark:text-gray-300">{metadata.testType}</p>
          </div>

          <div>
            <span className="text-sm text-gray-600 dark:text-gray-500">Target</span>
            <p className="text-sm text-gray-800 dark:text-gray-300 font-mono break-all">{metadata.target}</p>
          </div>

          <div>
            <span className="text-sm text-gray-600 dark:text-gray-500">Test Interval</span>
            <p className="text-sm text-gray-800 dark:text-gray-300">Every {formatInterval(metadata.interval)}</p>
          </div>

          <div>
            <span className="text-sm text-gray-600 dark:text-gray-500">Agents</span>
            <p className="text-sm text-gray-800 dark:text-gray-300">{metadata.agentCount} location{metadata.agentCount !== 1 ? 's' : ''}</p>
          </div>

          {testDetails?.description && (
            <div>
              <span className="text-sm text-gray-600 dark:text-gray-500">Description</span>
              <p className="text-sm text-gray-800 dark:text-gray-300">{testDetails.description}</p>
            </div>
          )}

          {testDetails?.metrics && (
            <>
              {testDetails.metrics.availability !== undefined && (
                <div>
                  <span className="text-sm text-gray-600 dark:text-gray-500">Availability (24h)</span>
                  <p className={`text-sm font-medium ${
                    testDetails.metrics.availability >= 99
                      ? 'text-green-600 dark:text-green-400'
                      : testDetails.metrics.availability >= 95
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {testDetails.metrics.availability.toFixed(2)}%
                  </p>
                </div>
              )}

              {testDetails.metrics.avgResponseTime !== undefined && (
                <div>
                  <span className="text-sm text-gray-600 dark:text-gray-500">Avg Response Time (24h)</span>
                  <p className="text-sm text-gray-800 dark:text-gray-300">
                    {testDetails.metrics.avgResponseTime.toFixed(0)} ms
                  </p>
                </div>
              )}
            </>
          )}

          {testDetails?.alertRules && testDetails.alertRules.length > 0 && (
            <div>
              <span className="text-sm text-gray-600 dark:text-gray-500">Alert Rules</span>
              <p className="text-sm text-gray-800 dark:text-gray-300">
                {testDetails.alertRules.length} rule{testDetails.alertRules.length !== 1 ? 's' : ''} configured
              </p>
            </div>
          )}

          <div>
            <span className="text-sm text-gray-600 dark:text-gray-500">Test ID</span>
            <p className="text-sm text-gray-600 dark:text-gray-400 font-mono">{metadata.testId}</p>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 dark:border-gray-800" />

        {/* Action buttons */}
        <div className="px-4 py-3 space-y-2.5">
          <button
            onClick={handleAddToCanvas}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10 hover:bg-purple-100 dark:hover:bg-purple-500/20 border border-purple-200 dark:border-purple-500/20 rounded-md transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add to Canvas
          </button>

          {getThousandEyesUrl() && (
            <a
              href={getThousandEyesUrl()!}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              View in ThousandEyes
            </a>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
