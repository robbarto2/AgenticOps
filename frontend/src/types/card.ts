export type CardType =
  | 'data_table'
  | 'bar_chart'
  | 'line_chart'
  | 'alert_summary'
  | 'text_report'
  | 'network_health'

export interface CardBase {
  id: string
  type: CardType
  title: string
  source: 'meraki' | 'thousandeyes'
  collapsed?: boolean
}

export interface DataTableCard extends CardBase {
  type: 'data_table'
  data: {
    columns: string[]
    rows: string[][]
  }
}

export interface BarChartCard extends CardBase {
  type: 'bar_chart'
  data: {
    labels: string[]
    datasets: ChartDataset[]
  }
}

export interface LineChartCard extends CardBase {
  type: 'line_chart'
  data: {
    labels: string[]
    datasets: ChartDataset[]
  }
}

export interface ChartDataset {
  label: string
  data: number[]
  color: string
}

export interface AlertSummaryCard extends CardBase {
  type: 'alert_summary'
  data: {
    alerts: AlertItem[]
  }
}

export interface AlertItem {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  title: string
  description: string
  timestamp?: string
}

export interface TextReportCard extends CardBase {
  type: 'text_report'
  data: {
    content: string
  }
}

export interface NetworkHealthCard extends CardBase {
  type: 'network_health'
  data: {
    metrics: HealthMetric[]
  }
}

export interface HealthMetric {
  label: string
  value: string
  status: 'healthy' | 'warning' | 'critical'
  icon?: 'wifi' | 'server' | 'shield' | 'globe'
}

export type AnyCard =
  | DataTableCard
  | BarChartCard
  | LineChartCard
  | AlertSummaryCard
  | TextReportCard
  | NetworkHealthCard
