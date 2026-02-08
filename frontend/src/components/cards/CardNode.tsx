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

function CardNodeInner({ data, selected }: NodeProps) {
  const card = data as unknown as AnyCard
  const removeCard = useCanvasStore((s) => s.removeCard)
  const toggleCollapse = useCanvasStore((s) => s.toggleCardCollapse)

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
        minWidth={280}
        minHeight={100}
        lineStyle={{ borderColor: '#3b82f680' }}
        handleStyle={{ backgroundColor: '#3b82f6', width: 8, height: 8 }}
      />
      <div className="bg-gray-900 border border-gray-700/60 rounded-lg shadow-xl overflow-hidden">
        <CardHeader
          title={card.title}
          source={card.source}
          collapsed={card.collapsed}
          onCollapse={() => toggleCollapse(card.id)}
          onClose={() => removeCard(card.id)}
        />
        {!card.collapsed && (
          <div className="p-3">{renderContent()}</div>
        )}
      </div>
    </>
  )
}

export const CardNode = memo(CardNodeInner)
