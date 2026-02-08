/**
 * Formatting utilities for display values.
 */

export function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function agentDisplayName(agent: string): string {
  const names: Record<string, string> = {
    troubleshooting: 'Troubleshooting',
    compliance: 'Compliance',
    security: 'Security',
    discovery: 'Discovery',
    canvas: 'Canvas',
    orchestrator: 'Orchestrator',
  }
  return names[agent] ?? agent
}

export function sourceColor(source: string): string {
  return source === 'meraki' ? '#3b82f6' : '#8b5cf6'
}

export function severityColor(severity: string): string {
  const colors: Record<string, string> = {
    critical: '#ef4444',
    high: '#f97316',
    medium: '#f59e0b',
    low: '#3b82f6',
    info: '#6b7280',
  }
  return colors[severity] ?? '#6b7280'
}

export function statusColor(status: string): string {
  const colors: Record<string, string> = {
    healthy: '#10b981',
    warning: '#f59e0b',
    critical: '#ef4444',
  }
  return colors[status] ?? '#6b7280'
}
