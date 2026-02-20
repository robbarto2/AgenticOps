export type CardType =
  | 'data_table'
  | 'bar_chart'
  | 'line_chart'
  | 'alert_summary'
  | 'text_report'
  | 'network_health'
  | 'network_detail'
  | 'org_summary'
  | 'switch_detail'
  | 'access_point_detail'
  | 'device_detail'
  | 'test_detail'
  | 'topology'

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

export interface NetworkProblemDevice {
  name: string
  model: string
  serial: string
  status: string
}

export interface NetworkDetailCard extends CardBase {
  type: 'network_detail'
  data: {
    networkId: string
    timeZone?: string
    tags?: string[]
    productTypes?: string[]
    notes?: string
    location?: string
    stats: {
      deviceCount: number
      clientCount: number
      ssidCount: number
      onlineCount?: number
      offlineCount?: number
      alertingCount?: number
    }
    problemDevices?: NetworkProblemDevice[]
  }
}

export interface OrgSummaryCard extends CardBase {
  type: 'org_summary'
  data: {
    orgName: string
    networks: { total: number; prompt?: string }
    clients: { total: number; prompt?: string }
    devices: {
      total: number
      byType: { type: string; count: number; icon: string; prompt?: string }[]
    }
    health: { score: number; status: 'healthy' | 'warning' | 'critical'; prompt?: string }
    alerts?: { critical: number; high: number; medium: number; low: number; prompt?: string }
    license?: { status: string; daysRemaining?: number; prompt?: string }
    firmware?: { compliance: number; prompt?: string }
  }
}

export interface SwitchPort {
  portId: string
  enabled: boolean
  status: 'active' | 'disabled' | 'disconnected' | 'warning' | 'error'
  poeEnabled?: boolean
  poeActive?: boolean
  isUplink?: boolean
  speedMbps?: number
  duplexMode?: string
  vlan?: number
  client?: string
}

export interface SwitchDetailCard extends CardBase {
  type: 'switch_detail'
  data: {
    serial: string
    model: string
    lanIp?: string
    publicIp?: string
    gateway?: string
    dns?: string
    firmware?: string
    uptime?: string
    lastBoot?: string
    lastBootReason?: string
    configStatus?: string
    configLastFetched?: string
    upgradeStatus?: string
    upgradeCompletedAt?: string
    networkId?: string
    orgId?: string
    ports?: SwitchPort[]
    totalPorts?: number
  }
}

export interface ChannelUtilization {
  band: '2.4' | '5' | '6'
  utilization: number  // 0-100 percentage
}

export interface AccessPointDetailCard extends CardBase {
  type: 'access_point_detail'
  data: {
    serial: string
    model: string
    lanIp?: string
    firmware?: string
    networkId?: string
    clientCount?: number
    ssidCount?: number
    status?: string
    tags?: string[]
    notes?: string
    channelUtilization?: ChannelUtilization[]
  }
}

export interface DeviceDetailCard extends CardBase {
  type: 'device_detail'
  data: {
    serial: string
    model: string
    deviceType: string  // 'Camera', 'Sensor', 'Security Appliance', 'Cellular Gateway', etc.
    lanIp?: string
    firmware?: string
    networkId?: string
    status?: string
    tags?: string[]
    notes?: string
  }
}

export interface TestAgent {
  agentId: string
  agentName: string
  location?: string
  countryId?: string
}

export interface TestMetricDataPoint {
  agentName: string
  location?: string
  responseTime?: number
  availability?: number
  loss?: number
  latency?: number
  jitter?: number
  timestamp?: string
}

export interface TestAlertRule {
  ruleId: string
  ruleName: string
  expression: string
  notifications?: { email?: string[]; webhook?: string[] }
}

export interface TestDetailCard extends CardBase {
  type: 'test_detail'
  data: {
    testId: string
    testName: string
    testType: string
    target: string
    enabled: boolean
    interval: number
    agents: TestAgent[]
    alertRules?: TestAlertRule[]
    description?: string
    avgLatency?: number | null
    packetLoss?: number | null
    availability?: number | null
    perfAlert?: boolean
    agentCount?: number
    metrics?: {
      availability?: number
      avgResponseTime?: number
      maxLoss?: number
      dataPoints?: TestMetricDataPoint[]
    }
  }
}

export type TopologyDeviceType =
  | 'mx'
  | 'ms'
  | 'mr'
  | 'mv'
  | 'mg'
  | 'mt'
  | 'client'
  | 'internet'
  | 'unknown'

export interface TopologyNode {
  id: string
  label: string
  deviceType: TopologyDeviceType
  status?: 'online' | 'offline' | 'dormant'
  ip?: string
  model?: string
  serial?: string
}

export interface TopologyLink {
  source: string
  target: string
  linkType?: 'wired' | 'wireless' | 'wan' | 'vpn'
  label?: string
  speed?: string
}

export interface TopologyCard extends CardBase {
  type: 'topology'
  data: {
    nodes: TopologyNode[]
    links: TopologyLink[]
    networkName?: string
  }
}

export type AnyCard =
  | DataTableCard
  | BarChartCard
  | LineChartCard
  | AlertSummaryCard
  | TextReportCard
  | NetworkHealthCard
  | NetworkDetailCard
  | OrgSummaryCard
  | SwitchDetailCard
  | AccessPointDetailCard
  | DeviceDetailCard
  | TestDetailCard
  | TopologyCard
