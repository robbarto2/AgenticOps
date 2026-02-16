import { memo } from 'react'
import { NodeResizer } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { AnyCard } from '../../types/card'
import { useCanvasStore } from '../../store/canvasSlice'
import { CardHeader } from './CardHeader'
import { DataTableCard } from './DataTableCard'
import { BarChartCard } from './BarChartCard'
import { LineChartCard } from './LineChartCard'
import { AlertSummaryCard } from './AlertSummaryCard'
import { TextReportCard } from './TextReportCard'
import { NetworkHealthCard } from './NetworkHealthCard'
import { NetworkDetailCard } from './NetworkDetailCard'
import { OrgSummaryCard } from './OrgSummaryCard'
import { SwitchDetailCard } from './SwitchDetailCard'
import { AccessPointDetailCard } from './AccessPointDetailCard'
import { TestDetailCard } from './TestDetailCard'
import { TopologyCard } from './TopologyCard'

function cardAccentColor(type: string): string {
  switch (type) {
    case 'network_detail':
    case 'network_health':
      return '#10b981' // emerald — network-level
    case 'org_summary':
      return '#8b5cf6' // purple — org-level
    case 'switch_detail':
      return '#3b82f6' // blue — switches
    case 'access_point_detail':
      return '#22c55e' // green — wireless APs (brighter green than network)
    case 'test_detail':
      return '#06b6d4' // cyan — tests
    case 'topology':
      return '#a855f7' // purple-500 — topology
    case 'alert_summary':
      return '#f59e0b' // amber — alerts
    case 'bar_chart':
    case 'line_chart':
      return '#14b8a6' // teal — charts
    case 'data_table':
      return '#6366f1' // indigo — tables
    case 'text_report':
      return '#64748b' // slate — reports
    default:
      return '#6b7280' // gray
  }
}

function CardNodeInner({ data, selected }: NodeProps) {
  const card = data as unknown as AnyCard
  const removeCard = useCanvasStore((s) => s.removeCard)
  const toggleCollapse = useCanvasStore((s) => s.toggleCardCollapse)
  const accent = cardAccentColor(card.type)

  const renderContent = () => {
    if (card.collapsed) return null

    switch (card.type) {
      case 'data_table':
        return <DataTableCard data={card.data} />
      case 'bar_chart':
        return <BarChartCard data={card.data} />
      case 'line_chart':
        return <LineChartCard data={card.data} />
      case 'alert_summary':
        return <AlertSummaryCard data={card.data} />
      case 'text_report':
        return <TextReportCard data={card.data} />
      case 'network_health':
        return <NetworkHealthCard data={card.data} />
      case 'network_detail':
        return <NetworkDetailCard data={card.data} />
      case 'org_summary':
        return <OrgSummaryCard data={card.data} />
      case 'switch_detail':
        return <SwitchDetailCard data={card.data} />
      case 'access_point_detail':
        return <AccessPointDetailCard data={card.data} />
      case 'test_detail':
        return <TestDetailCard card={card} />
      case 'topology':
        return <TopologyCard data={card.data} />
      default:
        return (
          <p className="text-xs text-gray-500 p-2">
            Unknown card type: {(card as AnyCard).type}
          </p>
        )
    }
  }

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={400}
        minHeight={200}
        lineStyle={{ borderColor: '#3b82f680' }}
        handleStyle={{ backgroundColor: '#3b82f6', width: 8, height: 8 }}
      />
      <div
        className="bg-white dark:bg-gray-900 border-[3px] rounded-lg shadow-xl overflow-hidden w-full h-full flex flex-col"
        style={{ borderColor: accent }}
      >
        <CardHeader
          title={card.title}
          source={card.source}
          collapsed={card.collapsed}
          onCollapse={() => toggleCollapse(card.id)}
          onClose={() => removeCard(card.id)}
        />
        {!card.collapsed && (
          <div className="p-3 card-content nodrag nopan nowheel select-text cursor-auto flex-1 overflow-auto min-h-0">{renderContent()}</div>
        )}
      </div>
    </>
  )
}

export const CardNode = memo(CardNodeInner)
