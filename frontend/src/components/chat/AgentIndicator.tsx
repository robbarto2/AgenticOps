import { useChatStore } from '../../store/chatSlice'
import type { CompletedToolCall } from '../../store/chatSlice'
import { agentDisplayName } from '../../utils/formatters'

const AGENT_DESCRIPTIONS: Record<string, string> = {
  orchestrator: 'Analyzing your query...',
  discovery: 'Discovering network inventory...',
  topology: 'Building network topology map...',
  troubleshooting: 'Diagnosing network issues...',
  security: 'Assessing security posture...',
  compliance: 'Auditing configurations...',
  testing: 'Running instant tests...',
  remediation: 'Preparing configuration changes...',
  performance: 'Analyzing performance metrics...',
  wifi: 'Analyzing wireless network...',
  vision: 'Analyzing your image...',
  canvas: 'Preparing results...',
}

export function AgentIndicator() {
  const activeAgent = useChatStore((s) => s.activeAgent)
  const activeToolCalls = useChatStore((s) => s.activeToolCalls)
  const completedToolCalls = useChatStore((s) => s.completedToolCalls)
  const isProcessing = useChatStore((s) => s.isProcessing)
  const agentPlan = useChatStore((s) => s.agentPlan)
  const planStep = useChatStore((s) => s.planStep)

  if (!isProcessing && !activeAgent) return null

  const description = activeAgent ? AGENT_DESCRIPTIONS[activeAgent] ?? `${agentDisplayName(activeAgent)} working...` : 'Processing...'
  const isMultiPlan = agentPlan && agentPlan.length > 1

  // Group completed tool calls by agent
  const completedByAgent: Record<string, CompletedToolCall[]> = {}
  for (const tc of completedToolCalls) {
    const key = tc.agent
    if (!completedByAgent[key]) completedByAgent[key] = []
    completedByAgent[key].push(tc)
  }

  // Build pipeline steps based on plan
  const pipelineSteps = isMultiPlan
    ? buildMultiPlanPipeline(agentPlan, activeAgent)
    : buildSimplePipeline(activeAgent)

  return (
    <div className="px-4 py-2.5 border-t border-gray-200 dark:border-[#1e2636] bg-gray-100/80 dark:bg-[#0a0d15]/80 space-y-2.5 transition-colors">
      {/* Header: agent name + elapsed timer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          <span className="text-xs text-blue-500 dark:text-blue-400 font-medium">
            {activeAgent ? `${agentDisplayName(activeAgent)} Agent` : 'Processing'}
          </span>
          {isMultiPlan && (
            <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">
              Step {planStep + 1}/{agentPlan.length}
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-400 -mt-1">{description}</p>

      {/* Pipeline progress bar */}
      <div className="flex items-center gap-0">
        {pipelineSteps.map(({ label, state }, i) => (
          <div key={i} className="flex items-center">
            {i > 0 && (
              <div className={`w-8 h-px mx-1 ${
                state === 'pending' ? 'bg-gray-300 dark:bg-gray-700' : 'bg-blue-500/50'
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
                <div className="w-2.5 h-2.5 border border-gray-300 dark:border-gray-600 rounded-full" />
              )}
              <span className={`text-xs ${
                state === 'done' ? 'text-emerald-400' :
                state === 'active' ? 'text-blue-400' :
                'text-gray-500'
              }`}>
                {label}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Tool calls: completed (from previous agents) + active */}
      {(completedToolCalls.length > 0 || activeToolCalls.length > 0) && (
        <div className="space-y-1 pt-0.5">
          {/* Completed tool calls grouped by agent */}
          {Object.entries(completedByAgent).map(([agent, calls]) => (
            <div key={agent} className="space-y-0.5">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">
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
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">
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

type PipelineStep = { label: string; state: 'done' | 'active' | 'pending' }

function buildSimplePipeline(agent: string | null): PipelineStep[] {
  if (!agent) return [
    { label: 'Routing', state: 'pending' },
    { label: 'Agent', state: 'pending' },
    { label: 'Results', state: 'pending' },
  ]
  if (agent === 'orchestrator') return [
    { label: 'Routing', state: 'active' },
    { label: 'Agent', state: 'pending' },
    { label: 'Results', state: 'pending' },
  ]
  if (agent === 'canvas') return [
    { label: 'Routing', state: 'done' },
    { label: 'Agent', state: 'done' },
    { label: 'Results', state: 'active' },
  ]
  return [
    { label: 'Routing', state: 'done' },
    { label: agentDisplayName(agent), state: 'active' },
    { label: 'Results', state: 'pending' },
  ]
}

function buildMultiPlanPipeline(plan: string[], agent: string | null): PipelineStep[] {
  const steps: PipelineStep[] = [{ label: 'Routing', state: 'done' as const }]

  for (const agentName of plan) {
    let state: 'done' | 'active' | 'pending' = 'pending'
    if (agent === agentName) {
      state = 'active'
    } else if (agent === 'canvas') {
      state = 'done'
    } else {
      // Check if this agent is before the active one in the plan
      const activeIdx = plan.indexOf(agent ?? '')
      const thisIdx = plan.indexOf(agentName)
      if (activeIdx >= 0 && thisIdx < activeIdx) {
        state = 'done'
      }
    }
    steps.push({ label: agentDisplayName(agentName), state })
  }

  // Add Results step
  steps.push({
    label: 'Results',
    state: agent === 'canvas' ? 'active' as const : 'pending' as const,
  })

  return steps
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
