import { useMemo, useState, useRef, useCallback } from 'react'
import dagre from 'dagre'
import type { TopologyCard as TopologyCardType, TopologyDeviceType, TopologyNode, TopologyLink } from '../../types/card'
import { useThemeStore } from '../../store/themeSlice'

interface Props {
  data: TopologyCardType['data']
}

const NODE_WIDTH = 140
const NODE_HEIGHT = 90
const PADDING = 60

// Device icon SVG paths (rendered at 28x28 for better visibility)
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
    case 'internet': // Cloud with glow
      return (
        <g>
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <path
            d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"
            fill={color}
            filter="url(#glow)"
          />
        </g>
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
      return { stroke: '#3b82f6', dasharray: '8 4', width: 2 }
    case 'wan':
      return { stroke: '#8b5cf6', dasharray: '', width: 3 }
    case 'vpn':
      return { stroke: '#10b981', dasharray: '4 4', width: 2 }
    case 'wired':
    default:
      return { stroke: '#6b7280', dasharray: '', width: 2 }
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
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })

  const { layoutNodes, layoutLinks, width, height, hasInternet } = useMemo(() => {
    // Check if we have any MX devices
    const hasMX = data.nodes.some((n) => n.deviceType === 'mx')
    const hasInternetNode = data.nodes.some((n) => n.deviceType === 'internet')

    // Add Internet node if we have MX but no Internet node yet
    const nodes = hasInternetNode || !hasMX ? [...data.nodes] : [
      ...data.nodes,
      {
        id: 'internet-node',
        label: 'Internet',
        deviceType: 'internet' as TopologyDeviceType,
        status: 'online' as const,
      }
    ]

    // Add WAN links from MX devices to Internet (swap source/target so Internet is at top)
    const links = [...data.links]
    if (!hasInternetNode && hasMX) {
      const mxDevices = data.nodes.filter((n) => n.deviceType === 'mx')
      for (const mx of mxDevices) {
        links.push({
          source: 'internet-node', // Internet as source (top)
          target: mx.id,            // MX as target (below)
          linkType: 'wan',
          label: 'WAN',
        })
      }
    }

    // Deduplicate links (LLDP/CDP reports both directions)
    const seenLinks = new Set<string>()
    const dedupedLinks: TopologyLink[] = []
    for (const link of links) {
      const key1 = `${link.source}::${link.target}`
      const key2 = `${link.target}::${link.source}`
      if (!seenLinks.has(key1) && !seenLinks.has(key2)) {
        seenLinks.add(key1)
        dedupedLinks.push(link)
      }
    }

    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 100, marginx: PADDING, marginy: PADDING })
    g.setDefaultEdgeLabel(() => ({}))

    // Add nodes with rank hints (Internet at top)
    for (const node of nodes) {
      const config: any = { width: NODE_WIDTH, height: NODE_HEIGHT }
      // Force Internet node to rank 0 (top of hierarchy)
      if (node.deviceType === 'internet') {
        config.rank = 0
      }
      g.setNode(node.id, config)
    }

    for (const link of dedupedLinks) {
      if (g.hasNode(link.source) && g.hasNode(link.target)) {
        g.setEdge(link.source, link.target)
      }
    }

    dagre.layout(g)

    const nodeMap = new Map<string, TopologyNode>(nodes.map((n) => [n.id, n]))
    const layoutNodes: LayoutNode[] = []
    const graphNodes = g.nodes()
    for (const id of graphNodes) {
      const pos = g.node(id)
      const orig = nodeMap.get(id)
      if (pos && orig) {
        layoutNodes.push({ id, x: pos.x, y: pos.y, node: orig })
      }
    }

    const layoutNodeMap = new Map<string, LayoutNode>(layoutNodes.map((n) => [n.id, n]))
    const layoutLinks: LayoutLink[] = []
    for (const link of dedupedLinks) {
      const s = layoutNodeMap.get(link.source)
      const t = layoutNodeMap.get(link.target)
      if (s && t) {
        layoutLinks.push({ source: s, target: t, link })
      }
    }

    const graph = g.graph()
    const w = (graph.width ?? 400) + PADDING * 2
    const h = (graph.height ?? 300) + PADDING * 2

    return { layoutNodes, layoutLinks, width: w, height: h, hasInternet: hasMX }
  }, [data.nodes, data.links])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom((z) => Math.max(0.3, Math.min(3, z * delta)))
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsPanning(true)
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }, [pan])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y })
    }
  }, [isPanning, panStart])

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  const resetView = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  const autoFit = useCallback(() => {
    if (!svgRef.current) return

    const container = svgRef.current.parentElement
    if (!container) return

    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight

    // Calculate zoom to fit content
    const zoomX = containerWidth / width
    const zoomY = containerHeight / height
    const newZoom = Math.min(zoomX, zoomY) * 0.9 // 90% to add padding

    setZoom(Math.max(0.3, Math.min(3, newZoom)))
    setPan({ x: 0, y: 0 })
  }, [width, height])

  const textColor = isDark ? '#e5e7eb' : '#1f2937'
  const subtextColor = isDark ? '#9ca3af' : '#6b7280'
  const nodeBg = isDark ? '#1f2937' : '#ffffff'
  const nodeBorder = isDark ? '#374151' : '#e5e7eb'

  return (
    <div className="w-full h-full flex flex-col" style={{ minHeight: 400 }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3 text-xs" style={{ color: subtextColor }}>
          <span className="flex items-center gap-1.5">
            <svg width="24" height="12"><line x1="0" y1="6" x2="24" y2="6" stroke="#6b7280" strokeWidth="2" /></svg>
            <span className="font-medium">Wired</span>
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="24" height="12"><line x1="0" y1="6" x2="24" y2="6" stroke="#3b82f6" strokeWidth="2" strokeDasharray="8 4" /></svg>
            <span className="font-medium">Wireless</span>
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="24" height="12"><line x1="0" y1="6" x2="24" y2="6" stroke="#8b5cf6" strokeWidth="3" /></svg>
            <span className="font-medium">WAN</span>
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="24" height="12"><line x1="0" y1="6" x2="24" y2="6" stroke="#10b981" strokeWidth="2" strokeDasharray="4 4" /></svg>
            <span className="font-medium">VPN</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={resetView}
            className="px-2 py-1 text-xs font-medium rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            style={{ color: textColor }}
            title="Reset to 100% zoom"
          >
            Reset View
          </button>
          <span className="text-xs font-mono" style={{ color: subtextColor }}>
            {(zoom * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Topology Canvas */}
      <div
        className="flex-1 overflow-hidden relative bg-gray-50 dark:bg-gray-900"
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height="100%"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center',
            transition: isPanning ? 'none' : 'transform 0.2s ease-out',
          }}
          onWheel={handleWheel}
        >
          {/* Links */}
          {layoutLinks.map((l, i) => {
            const style = linkStyle(l.link.linkType)
            const midX = (l.source.x + l.target.x) / 2
            const midY = (l.source.y + l.target.y) / 2

            // Calculate angle for label rotation to reduce overlap
            const dx = l.target.x - l.source.x
            const dy = l.target.y - l.source.y
            const angle = Math.atan2(dy, dx) * (180 / Math.PI)

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
                  opacity={0.6}
                />
                {l.link.label && (
                  <g>
                    {/* Background box for label to prevent overlap */}
                    <rect
                      x={midX - (l.link.label.length * 3.5)}
                      y={midY - 14}
                      width={l.link.label.length * 7}
                      height={16}
                      fill={isDark ? '#1f2937' : '#ffffff'}
                      opacity={0.9}
                      rx={3}
                    />
                    <text
                      x={midX}
                      y={midY - 4}
                      textAnchor="middle"
                      fontSize={9}
                      fontWeight={500}
                      fill={subtextColor}
                    >
                      {l.link.label}
                    </text>
                  </g>
                )}
              </g>
            )
          })}

          {/* Nodes */}
          {layoutNodes.map((ln) => {
            const border = statusColor(ln.node.status)
            const isHovered = hoveredNode === ln.id
            const isInternet = ln.node.deviceType === 'internet'
            return (
              <g
                key={ln.id}
                transform={`translate(${ln.x - NODE_WIDTH / 2}, ${ln.y - NODE_HEIGHT / 2})`}
                onMouseEnter={() => setHoveredNode(ln.id)}
                onMouseLeave={() => setHoveredNode(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Glow effect for hovered nodes */}
                {isHovered && (
                  <rect
                    x={-4}
                    y={-4}
                    width={NODE_WIDTH + 8}
                    height={NODE_HEIGHT + 8}
                    rx={12}
                    fill={border}
                    opacity={0.15}
                  />
                )}

                {/* Node background with gradient */}
                <defs>
                  <linearGradient id={`grad-${ln.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={isDark ? '#374151' : '#ffffff'} />
                    <stop offset="100%" stopColor={isDark ? '#1f2937' : '#f9fafb'} />
                  </linearGradient>
                </defs>
                <rect
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx={10}
                  fill={`url(#grad-${ln.id})`}
                  stroke={isInternet ? '#8b5cf6' : border}
                  strokeWidth={isHovered ? 3 : 2}
                  filter={isHovered ? 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' : undefined}
                />

                {/* Device icon */}
                <svg x={10} y={10} width={28} height={28} viewBox="0 0 24 24">
                  <DeviceIcon type={ln.node.deviceType} color={isInternet ? '#8b5cf6' : border} />
                </svg>

                {/* Text clipping area to prevent overflow */}
                <defs>
                  <clipPath id={`clip-text-${ln.id}`}>
                    <rect x={44} y={0} width={NODE_WIDTH - 58} height={NODE_HEIGHT} />
                  </clipPath>
                </defs>

                {/* Device name - constrained to box width */}
                <text
                  x={44}
                  y={26}
                  fontSize={13}
                  fontWeight={600}
                  fill={textColor}
                  clipPath={`url(#clip-text-${ln.id})`}
                >
                  {ln.node.label.length > 10
                    ? ln.node.label.slice(0, 10) + '…'
                    : ln.node.label}
                </text>

                {/* Device type / model */}
                <text
                  x={44}
                  y={42}
                  fontSize={11}
                  fill={subtextColor}
                  clipPath={`url(#clip-text-${ln.id})`}
                >
                  {ln.node.model && ln.node.model.length > 11
                    ? ln.node.model.slice(0, 11) + '…'
                    : ln.node.model || ln.node.deviceType.toUpperCase()}
                </text>

                {/* IP */}
                {ln.node.ip && (
                  <text
                    x={44}
                    y={58}
                    fontSize={10}
                    fill={subtextColor}
                    fontFamily="monospace"
                    clipPath={`url(#clip-text-${ln.id})`}
                  >
                    {ln.node.ip}
                  </text>
                )}

                {/* Status indicator */}
                <circle cx={NODE_WIDTH - 14} cy={14} r={5} fill={border} />
              </g>
            )
          })}
        </svg>

        {/* Hover tooltip (HTML overlay with smart positioning) */}
        {hoveredNode && (() => {
          const ln = layoutNodes.find((n) => n.id === hoveredNode)
          if (!ln || !svgRef.current) return null

          const container = svgRef.current.parentElement
          if (!container) return null

          // Use SVG's getScreenCTM to correctly map viewBox coords to screen coords
          const ctm = svgRef.current.getScreenCTM()
          if (!ctm) return null

          const containerRect = container.getBoundingClientRect()

          // Transform node center from SVG viewBox coords to container-relative coords
          const pt = svgRef.current.createSVGPoint()
          pt.x = ln.x
          pt.y = ln.y
          const screenPt = pt.matrixTransform(ctm)
          const nodeCenterX = screenPt.x - containerRect.left
          const nodeCenterY = screenPt.y - containerRect.top

          // Calculate half-node size in screen pixels using the CTM scale factors
          const halfW = (NODE_WIDTH / 2) * ctm.a
          const halfH = (NODE_HEIGHT / 2) * ctm.d

          // Tooltip dimensions (approximate)
          const tooltipWidth = 220
          const tooltipHeight = ln.node.serial ? 120 : 100

          const cw = containerRect.width
          const ch = containerRect.height
          const margin = 12

          // Default: position to the right of the node, vertically centered
          let left = nodeCenterX + halfW + 10
          let top = nodeCenterY - tooltipHeight / 2

          // If off right edge, try left side
          if (left + tooltipWidth > cw - margin) {
            left = nodeCenterX - halfW - tooltipWidth - 10
          }

          // If off left edge, position below node
          if (left < margin) {
            left = nodeCenterX - tooltipWidth / 2
            top = nodeCenterY + halfH + 10
          }

          // Clamp to stay within container
          left = Math.max(margin, Math.min(left, cw - tooltipWidth - margin))
          top = Math.max(margin, Math.min(top, ch - tooltipHeight - margin))

          return (
            <div
              className="absolute pointer-events-none z-50"
              style={{
                left: `${left}px`,
                top: `${top}px`,
              }}
            >
              <div className="bg-gray-900 dark:bg-gray-800 text-white rounded-lg shadow-2xl p-3 min-w-[200px] max-w-[220px] border border-gray-700">
                <div className="font-semibold text-sm mb-2 break-words">{ln.node.label}</div>
                <div className="space-y-1 text-xs text-gray-300">
                  {ln.node.model && (
                    <div>
                      <span className="text-gray-400">Model:</span> {ln.node.model}
                    </div>
                  )}
                  {ln.node.ip && (
                    <div>
                      <span className="text-gray-400">IP:</span> <span className="font-mono">{ln.node.ip}</span>
                    </div>
                  )}
                  {ln.node.serial && (
                    <div className="break-all">
                      <span className="text-gray-400">Serial:</span> <span className="font-mono text-xs">{ln.node.serial}</span>
                    </div>
                  )}
                  {ln.node.status && (
                    <div className="flex items-center gap-2 pt-1 mt-1 border-t border-gray-700">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor(ln.node.status) }} />
                      <span className="capitalize">{ln.node.status}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
