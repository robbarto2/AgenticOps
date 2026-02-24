import { memo, useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
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
import { DeviceDetailCard } from './DeviceDetailCard'
import { TopologyCard } from './TopologyCard'
import { WifiHealthCard } from './WifiHealthCard'
import { SsidDetailCard } from './SsidDetailCard'
import { PieChartCard } from './PieChartCard'

const _WIFI_CHART_RE = /channel\s+utiliz|client\s+density|wireless\s+(client|activity|band)|band\s+distrib/i

function cardAccentColor(card: AnyCard): string {
  switch (card.type) {
    case 'switch_detail':
      return '#3b82f6' // blue — switches
    case 'access_point_detail':
      return '#06b6d4' // cyan — wireless APs
    case 'device_detail':
      return '#f97316' // orange — generic devices (cameras, sensors, appliances, gateways)
    case 'network_detail':
    case 'network_health':
      return '#10b981' // emerald — networks
    case 'org_summary':
      return '#facc15' // yellow — organizational overview
    case 'test_detail':
      return '#ec4899' // pink — ThousandEyes tests
    case 'wifi_health':
      return '#38bdf8' // sky-400 — WiFi health
    case 'ssid_detail':
      return '#a855f7' // purple-500 — SSIDs
    case 'topology':
      return '#8b5cf6' // purple — topology maps
    case 'alert_summary':
      return '#ef4444' // red — alerts
    case 'pie_chart':
      if (_WIFI_CHART_RE.test(card.title)) return '#38bdf8' // sky-400 — WiFi charts
      return '#14b8a6' // teal — charts
    case 'bar_chart':
    case 'line_chart':
      if (_WIFI_CHART_RE.test(card.title)) return '#38bdf8' // sky-400 — WiFi charts
      return '#14b8a6' // teal — charts
    case 'data_table':
      return '#6366f1' // indigo — data tables
    case 'text_report':
      return '#94a3b8' // slate — text reports
    default:
      return '#6b7280' // gray
  }
}

function CardNodeInner({ data }: NodeProps) {
  const card = data as unknown as AnyCard
  const removeCard = useCanvasStore((s) => s.removeCard)
  const toggleCollapse = useCanvasStore((s) => s.toggleCardCollapse)
  const clearNewFlag = useCanvasStore((s) => s.clearNewFlag)
  const accent = cardAccentColor(card)
  const isNew = (card as any).isNew === true
  const [isFullscreen, setIsFullscreen] = useState(false)

  const toggleFullscreen = useCallback(() => setIsFullscreen((f) => !f), [])

  // Clear the isNew flag after animation completes
  useEffect(() => {
    if (isNew) {
      const timer = setTimeout(() => clearNewFlag(card.id), 320)
      return () => clearTimeout(timer)
    }
  }, [isNew, card.id, clearNewFlag])

  // Close fullscreen on Escape
  useEffect(() => {
    if (!isFullscreen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isFullscreen])

  const renderContent = () => {
    if (card.collapsed) return null

    switch (card.type) {
      case 'data_table':
        return <DataTableCard data={card.data} />
      case 'bar_chart':
        return <BarChartCard data={card.data} title={card.title} source={card.source} />
      case 'line_chart':
        return <LineChartCard data={card.data} title={card.title} source={card.source} />
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
      case 'device_detail':
        return <DeviceDetailCard data={card.data} title={card.title} />
      case 'test_detail':
        return <TestDetailCard card={card} />
      case 'wifi_health':
        return <WifiHealthCard data={card.data} />
      case 'ssid_detail':
        return <SsidDetailCard data={card.data} />
      case 'pie_chart':
        return <PieChartCard data={card.data} />
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

  const cardInner = (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-[100] flex flex-col bg-white dark:bg-gray-950'
          : `w-full h-full p-[3px] ${isNew ? 'animate-card-enter' : ''}`
      }
    >
      <div
        className={
          isFullscreen
            ? 'flex-1 flex flex-col overflow-hidden'
            : 'bg-white dark:bg-gray-950 border-[3px] rounded-lg shadow-xl overflow-hidden w-full h-full flex flex-col relative'
        }
        style={isFullscreen ? undefined : { borderColor: accent }}
      >
        <CardHeader
          title={card.title}
          source={card.source}
          collapsed={card.collapsed}
          isFullscreen={isFullscreen}
          onCollapse={() => toggleCollapse(card.id)}
          onFullscreen={toggleFullscreen}
          onClose={() => removeCard(card.id)}
        />
        {!card.collapsed && (
          <div className={`card-content nodrag nopan nowheel select-text cursor-auto flex-1 overflow-auto min-h-0 flex flex-col ${isFullscreen ? 'p-6' : 'p-3'}`}>
            {renderContent()}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <>
      {!isFullscreen && (
        <NodeResizer
          isVisible={!card.collapsed}
          minWidth={400}
          minHeight={200}
          lineStyle={{
            borderColor: 'transparent',
            borderWidth: 0,
          }}
          handleStyle={{
            backgroundColor: 'transparent',
            width: 12,
            height: 12,
            border: 'none',
          }}
        />
      )}
      {isFullscreen ? createPortal(cardInner, document.body) : cardInner}
    </>
  )
}

export const CardNode = memo(CardNodeInner)
