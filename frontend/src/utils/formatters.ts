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
    testing: 'Testing',
    remediation: 'Remediation',
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

export type DeviceIconType = 'wifi' | 'switch' | 'appliance' | 'sensor' | 'camera' | 'gateway'

export interface DeviceTypeInfo {
  icon: DeviceIconType | null
  label: string | null
}

const DEVICE_PREFIX_MAP: Record<string, { icon: DeviceIconType; label: string }> = {
  MR: { icon: 'wifi', label: 'Wireless AP' },
  MS: { icon: 'switch', label: 'Switch' },
  C9: { icon: 'switch', label: 'Switch' },
  MX: { icon: 'appliance', label: 'Appliance' },
  Z: { icon: 'appliance', label: 'Appliance' },
  MT: { icon: 'sensor', label: 'Sensor' },
  MV: { icon: 'camera', label: 'Camera' },
  MG: { icon: 'gateway', label: 'Gateway' },
}

export function detectDeviceType(title: string): DeviceTypeInfo {
  const match = title.match(/\b(MR|MS|MX|MT|MV|MG|C9|Z)\d/i)
  if (!match) return { icon: null, label: null }
  const prefix = match[1].toUpperCase()
  const entry = DEVICE_PREFIX_MAP[prefix]
  return entry ? { icon: entry.icon, label: entry.label } : { icon: null, label: null }
}
