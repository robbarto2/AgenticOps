import type { AnyCard } from '../types/card'
import { detectDeviceType } from './formatters'

export type CardCategory = 'network' | 'topology' | 'org' | 'switch' | 'access_point' | 'device' | 'test' | 'alert' | 'chart' | 'table' | 'report'

const CATEGORY_META: Record<CardCategory, { label: string; color: string }> = {
  switch: { label: 'Switches', color: '#3b82f6' },
  access_point: { label: 'Wireless Access Points', color: '#06b6d4' },
  device: { label: 'Devices', color: '#f97316' },
  network: { label: 'Networks', color: '#10b981' },
  org: { label: 'Organization', color: '#eab308' },
  test: { label: 'Tests', color: '#ec4899' },
  topology: { label: 'Topologies', color: '#8b5cf6' },
  alert: { label: 'Alerts', color: '#ef4444' },
  chart: { label: 'Charts', color: '#14b8a6' },
  table: { label: 'Tables', color: '#6366f1' },
  report: { label: 'Reports', color: '#94a3b8' },
}

export function getCardCategory(card: AnyCard): CardCategory {
  switch (card.type) {
    case 'network_detail':
    case 'network_health':
      return 'network'
    case 'topology':
      return 'topology'
    case 'org_summary':
      return 'org'
    case 'switch_detail':
      return 'switch'
    case 'access_point_detail':
      return 'access_point'
    case 'device_detail':
      return 'device'
    case 'test_detail':
      return 'test'
    case 'alert_summary':
      return 'alert'
    case 'bar_chart':
    case 'line_chart':
      return 'chart'
    case 'text_report':
      return 'report'
    case 'data_table': {
      const device = detectDeviceType(card.title)
      return device.icon ? 'device' : 'table'
    }
    default:
      return 'table'
  }
}

export function getCategoryLabel(category: CardCategory): string {
  return CATEGORY_META[category]?.label ?? category
}

export function getCategoryColor(category: CardCategory): string {
  return CATEGORY_META[category]?.color ?? '#6b7280'
}
