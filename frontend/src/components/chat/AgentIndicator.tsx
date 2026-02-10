import { useState, useEffect } from 'react'
import { useChatStore } from '../../store/chatSlice'
import type { CompletedToolCall } from '../../store/chatSlice'
import { agentDisplayName } from '../../utils/formatters'

const AGENT_DESCRIPTIONS: Record<string, string> = {
  orchestrator: 'Analyzing your query...',
  discovery: 'Discovering network inventory...',
  troubleshooting: 'Diagnosing network issues...',
  security: 'Assessing security posture...',
  compliance: 'Auditing configurations...',
  canvas: 'Preparing results...',
}

const PIPELINE_STEPS = ['Routing', 'Agent', 'Results'] as const

function getPipelineState(agent: string | null): ('done' | 'active' | 'pending')[] {
  if (!agent) return ['pending', 'pending', 'pending']
  if (agent === 'orchestrator') return ['active', 'pending', 'pending']
  if (agent === 'canvas') return ['done', 'done', 'active']
  // Any specialist agent
  return ['done', 'active', 'pending']
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}m ${sec.toString().padStart(2, '0')}s`
}

export function AgentIndicator() {
  const activeAgent = useChatStore((s) => s.activeAgent)
  const activeToolCalls = useChatStore((s) => s.activeToolCalls)
  const completedToolCalls = useChatStore((s) => s.completedToolCalls)
  const isProcessing = useChatStore((s) => s.isProcessing)
  const processingStartedAt = useChatStore((s) => s.processingStartedAt)

  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!processingStartedAt) {
      setElapsed(0)
      return
    }
    setElapsed(Date.now() - processingStartedAt)
    const interval = setInterval(() => {
      setElapsed(Date.now() - processingStartedAt)
    }, 1000)
    return () => clearInterval(interval)
  }, [processingStartedAt])

  if (!isProcessing && !activeAgent) return null

  const pipelineState = getPipelineState(activeAgent)
  const description = activeAgent ? AGENT_DESCRIPTIONS[activeAgent] ?? `${agentDisplayName(activeAgent)} working...` : 'Processing...'

  // Determine the label for the middle pipeline step
  const middleLabel = activeAgent && activeAgent !== 'orchestrator' && activeAgent !== 'canvas'
    ? agentDisplayName(activeAgent)
    : PIPELINE_STEPS[1]

  // Group completed tool calls by agent
  const completedByAgent: Record<string, CompletedToolCall[]> = {}
  for (const tc of completedToolCalls) {
    const key = tc.agent
    if (!completedByAgent[key]) completedByAgent[key] = []
    completedByAgent[key].push(tc)
  }

  return (
    <div className="px-4 py-2.5 border-t border-gray-800 bg-gray-900/50 space-y-2.5">
      {/* Header: agent name + elapsed timer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          <span className="text-xs text-blue-400 font-medium">
            {activeAgent ? `${agentDisplayName(activeAgent)} Agent` : 'Processing'}
          </span>
        </div>
        {processingStartedAt && (
          <span className="text-xs text-gray-500 font-mono tabular-nums">
            {formatElapsed(elapsed)}
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-xs text-gray-500 -mt-1">{description}</p>

      {/* Pipeline progress bar */}
      <div className="flex items-center gap-0">
        {[PIPELINE_STEPS[0], middleLabel, PIPELINE_STEPS[2]].map((label, i) => {
          const state = pipelineState[i]
          return (
            <div key={i} className="flex items-center">
              {i > 0 && (
                <div className={`w-8 h-px mx-1 ${
                  state === 'pending' ? 'bg-gray-700' : 'bg-blue-500/50'
                }`} />
              )}
              <div className="flex items-center gap-1.5">
                {state === 'done' ? (
                  <svg className="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : state === 'active' ? (
                  <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
                ) : (
                  <div className="w-2.5 h-2.5 border border-gray-600 rounded-full" />
                )}
                <span className={`text-xs ${
                  state === 'done' ? 'text-emerald-400' :
                  state === 'active' ? 'text-blue-400' :
                  'text-gray-600'
                }`}>
                  {label}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Tool calls: completed (from previous agents) + active */}
      {(completedToolCalls.length > 0 || activeToolCalls.length > 0) && (
        <div className="space-y-1 pt-0.5">
          {/* Completed tool calls grouped by agent */}
          {Object.entries(completedByAgent).map(([agent, calls]) => (
            <div key={agent} className="space-y-0.5">
              <span className="text-[10px] text-gray-600 uppercase tracking-wider">
                {agentDisplayName(agent)}
              </span>
              {calls.map((tc, i) => (
                <ToolCallRow key={`${agent}-${tc.tool}-${i}`} tool={tc.tool} source={tc.source} status="complete" dimmed />
              ))}
            </div>
          ))}

          {/* Active tool calls */}
          {activeToolCalls.length > 0 && (
            <div className="space-y-0.5">
              {completedToolCalls.length > 0 && activeAgent && (
                <span className="text-[10px] text-gray-600 uppercase tracking-wider">
                  {agentDisplayName(activeAgent)}
                </span>
              )}
              {activeToolCalls.map((tc, i) => (
                <ToolCallRow key={`active-${tc.tool}-${i}`} tool={tc.tool} source={tc.source} status={tc.status} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ToolCallRow({ tool, source, status, dimmed }: {
  tool: string
  source: 'meraki' | 'thousandeyes'
  status: 'running' | 'complete'
  dimmed?: boolean
}) {
  return (
    <div className={`flex items-center gap-2 ${dimmed ? 'opacity-50' : ''}`}>
      {status === 'running' ? (
        <svg className="w-3 h-3 text-amber-400 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.3" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ) : (
        <svg className="w-3 h-3 text-emerald-400" viewBox="0 0 24 24" fill="none">
          <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <span className="text-xs text-gray-400 font-mono truncate">{tool}</span>
      <span className={`text-xs px-1.5 py-0.5 rounded ${
        source === 'meraki'
          ? 'bg-blue-500/10 text-blue-400'
          : 'bg-purple-500/10 text-purple-400'
      }`}>
        {source}
      </span>
    </div>
  )
}
