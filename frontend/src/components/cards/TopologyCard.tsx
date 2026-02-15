import { useMemo, useState } from 'react'
import dagre from 'dagre'
import type { TopologyCard as TopologyCardType, TopologyDeviceType, TopologyNode, TopologyLink } from '../../types/card'
import { useThemeStore } from '../../store/themeSlice'

interface Props {
  data: TopologyCardType['data']
}

const NODE_WIDTH = 120
const NODE_HEIGHT = 72
const PADDING = 40

// Device icon SVG paths (rendered at 24x24)
function DeviceIcon({ type, color }: { type: TopologyDeviceType; color: string }) {
  switch (type) {
    case 'mx': // Shield — security appliance
      return (
        <path
          d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5zm0 2.18L19 8.3v3.7c0 4.47-3.07 8.67-7 9.93C8.07 20.67 5 16.47 5 12V8.3L12 4.18z"
          fill={color}
        />
      )
    case 'ms': // Switch box
      return (
        <g fill={color}>
          <rect x="2" y="7" width="20" height="10" rx="2" fill="none" stroke={color} strokeWidth="1.5" />
          <circle cx="6" cy="12" r="1.5" />
          <circle cx="10" cy="12" r="1.5" />
          <circle cx="14" cy="12" r="1.5" />
          <circle cx="18" cy="12" r="1.5" />
        </g>
      )
    case 'mr': // WiFi
      return (
        <g fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
          <path d="M12 18h.01" fill={color} />
          <path d="M8.5 14.5a5 5 0 017 0" />
          <path d="M5 11a9 9 0 0114 0" />
          <path d="M1.5 7.5a14 14 0 0121 0" />
        </g>
      )
    case 'mv': // Camera
      return (
        <g fill={color}>
          <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z" />
        </g>
      )
    case 'mg': // Globe — cellular gateway
      return (
        <g fill="none" stroke={color} strokeWidth="1.5">
          <circle cx="12" cy="12" r="9" />
          <ellipse cx="12" cy="12" rx="4" ry="9" />
          <path d="M3 12h18" />
          <path d="M12 3v18" />
        </g>
      )
    case 'mt': // Sensor
      return (
        <g fill={color}>
          <path d="M12 2a6 6 0 00-6 6c0 4.5 6 10 6 10s6-5.5 6-10a6 6 0 00-6-6zm0 8a2 2 0 110-4 2 2 0 010 4z" />
        </g>
      )
    case 'internet': // Cloud
      return (
        <path
          d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"
          fill={color}
        />
      )
    case 'client': // Laptop
      return (
        <g fill={color}>
          <path d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z" />
        </g>
      )
    default: // Question mark circle
      return (
        <g fill={color}>
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z" />
        </g>
      )
  }
}

function statusColor(status?: string): string {
  switch (status) {
    case 'online':
      return '#10b981'
    case 'offline':
      return '#ef4444'
    case 'dormant':
      return '#6b7280'
    default:
      return '#6b7280'
  }
}

function linkStyle(linkType?: string): { stroke: string; dasharray: string; width: number } {
  switch (linkType) {
    case 'wireless':
      return { stroke: '#3b82f6', dasharray: '6 3', width: 1.5 }
    case 'wan':
      return { stroke: '#8b5cf6', dasharray: '', width: 2.5 }
    case 'vpn':
      return { stroke: '#10b981', dasharray: '3 3', width: 1.5 }
    case 'wired':
    default:
      return { stroke: '#6b7280', dasharray: '', width: 1.5 }
  }
}

interface LayoutNode {
  id: string
  x: number
  y: number
  node: TopologyNode
}

interface LayoutLink {
  source: LayoutNode
  target: LayoutNode
  link: TopologyLink
}

export function TopologyCard({ data }: Props) {
  const isDark = useThemeStore((s) => s.mode === 'dark')
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  const { layoutNodes, layoutLinks, width, height } = useMemo(() => {
    // Deduplicate links (LLDP/CDP reports both directions)
    const seenLinks = new Set<string>()
    const dedupedLinks: TopologyLink[] = []
    for (const link of data.links) {
      const key1 = `${link.source}::${link.target}`
      const key2 = `${link.target}::${link.source}`
      if (!seenLinks.has(key1) && !seenLinks.has(key2)) {
        seenLinks.add(key1)
        dedupedLinks.push(link)
      }
    }

    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80, marginx: PADDING, marginy: PADDING })
    g.setDefaultEdgeLabel(() => ({}))

    for (const node of data.nodes) {
      g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
    }
    for (const link of dedupedLinks) {
      if (g.hasNode(link.source) && g.hasNode(link.target)) {
        g.setEdge(link.source, link.target)
      }
    }

    dagre.layout(g)

    const nodeMap = new Map<string, TopologyNode>(data.nodes.map((n) => [n.id, n]))
    const nodes: LayoutNode[] = []
    const graphNodes = g.nodes()
    for (const id of graphNodes) {
      const pos = g.node(id)
      const orig = nodeMap.get(id)
      if (pos && orig) {
        nodes.push({ id, x: pos.x, y: pos.y, node: orig })
      }
    }

    const layoutNodeMap = new Map<string, LayoutNode>(nodes.map((n) => [n.id, n]))
    const links: LayoutLink[] = []
    for (const link of dedupedLinks) {
      const s = layoutNodeMap.get(link.source)
      const t = layoutNodeMap.get(link.target)
      if (s && t) {
        links.push({ source: s, target: t, link })
      }
    }

    const graph = g.graph()
    const w = (graph.width ?? 400) + PADDING * 2
    const h = (graph.height ?? 300) + PADDING * 2

    return { layoutNodes: nodes, layoutLinks: links, width: w, height: h }
  }, [data.nodes, data.links])

  const textColor = isDark ? '#e5e7eb' : '#1f2937'
  const subtextColor = isDark ? '#9ca3af' : '#6b7280'
  const nodeBg = isDark ? '#1f2937' : '#ffffff'
  const tooltipBg = isDark ? '#111827' : '#f9fafb'
  const tooltipBorder = isDark ? '#374151' : '#d1d5db'

  return (
    <div className="w-full overflow-auto" style={{ maxHeight: 500 }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ minHeight: 200, maxHeight: 480 }}
      >
        {/* Links */}
        {layoutLinks.map((l, i) => {
          const style = linkStyle(l.link.linkType)
          const midX = (l.source.x + l.target.x) / 2
          const midY = (l.source.y + l.target.y) / 2
          return (
            <g key={`link-${i}`}>
              <line
                x1={l.source.x}
                y1={l.source.y}
                x2={l.target.x}
                y2={l.target.y}
                stroke={style.stroke}
                strokeWidth={style.width}
                strokeDasharray={style.dasharray || undefined}
                opacity={0.7}
              />
              {l.link.label && (
                <text
                  x={midX}
                  y={midY - 6}
                  textAnchor="middle"
                  fontSize={8}
                  fill={subtextColor}
                >
                  {l.link.label}
                </text>
              )}
            </g>
          )
        })}

        {/* Nodes */}
        {layoutNodes.map((ln) => {
          const border = statusColor(ln.node.status)
          const isHovered = hoveredNode === ln.id
          return (
            <g
              key={ln.id}
              transform={`translate(${ln.x - NODE_WIDTH / 2}, ${ln.y - NODE_HEIGHT / 2})`}
              onMouseEnter={() => setHoveredNode(ln.id)}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ cursor: 'default' }}
            >
              {/* Node background */}
              <rect
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={8}
                ry={8}
                fill={nodeBg}
                stroke={border}
                strokeWidth={isHovered ? 2.5 : 1.5}
              />

              {/* Device icon */}
              <svg x={8} y={8} width={24} height={24} viewBox="0 0 24 24">
                <DeviceIcon type={ln.node.deviceType} color={border} />
              </svg>

              {/* Label */}
              <text
                x={38}
                y={22}
                fontSize={11}
                fontWeight={600}
                fill={textColor}
                clipPath={`inset(0 0 0 0)`}
              >
                {ln.node.label.length > 10
                  ? ln.node.label.slice(0, 10) + '…'
                  : ln.node.label}
              </text>

              {/* Device type / model */}
              <text x={38} y={36} fontSize={9} fill={subtextColor}>
                {ln.node.model || ln.node.deviceType.toUpperCase()}
              </text>

              {/* IP */}
              {ln.node.ip && (
                <text x={38} y={50} fontSize={8} fill={subtextColor}>
                  {ln.node.ip}
                </text>
              )}

              {/* Status dot */}
              <circle cx={NODE_WIDTH - 12} cy={12} r={4} fill={border} />

              {/* Tooltip on hover */}
              {isHovered && (
                <g transform={`translate(${NODE_WIDTH + 8}, 0)`}>
                  <rect
                    width={160}
                    height={ln.node.serial ? 76 : 56}
                    rx={6}
                    fill={tooltipBg}
                    stroke={tooltipBorder}
                    strokeWidth={1}
                  />
                  <text x={8} y={16} fontSize={10} fontWeight={600} fill={textColor}>
                    {ln.node.label}
                  </text>
                  <text x={8} y={30} fontSize={9} fill={subtextColor}>
                    {ln.node.model ? `Model: ${ln.node.model}` : `Type: ${ln.node.deviceType.toUpperCase()}`}
                  </text>
                  <text x={8} y={44} fontSize={9} fill={subtextColor}>
                    {ln.node.ip ? `IP: ${ln.node.ip}` : `Status: ${ln.node.status ?? 'unknown'}`}
                  </text>
                  {ln.node.serial && (
                    <text x={8} y={58} fontSize={9} fill={subtextColor}>
                      S/N: {ln.node.serial}
                    </text>
                  )}
                </g>
              )}
            </g>
          )
        })}
      </svg>

      {/* Link type legend */}
      <div className="flex gap-4 px-2 py-1 text-[10px]" style={{ color: subtextColor }}>
        <span className="flex items-center gap-1">
          <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#6b7280" strokeWidth="1.5" /></svg>
          Wired
        </span>
        <span className="flex items-center gap-1">
          <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="6 3" /></svg>
          Wireless
        </span>
        <span className="flex items-center gap-1">
          <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#8b5cf6" strokeWidth="2.5" /></svg>
          WAN
        </span>
        <span className="flex items-center gap-1">
          <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#10b981" strokeWidth="1.5" strokeDasharray="3 3" /></svg>
          VPN
        </span>
      </div>
    </div>
  )
}
