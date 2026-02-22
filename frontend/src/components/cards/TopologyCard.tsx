import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
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

function linkStyle(linkType?: string, status?: string): { stroke: string; dasharray: string; width: number } {
  // For WAN links, override style based on uplink status
  if (linkType === 'wan' && status) {
    const s = status.toLowerCase()
    if (s === 'failed') {
      return { stroke: '#ef4444', dasharray: '', width: 3 }
    }
    if (s === 'not connected') {
      return { stroke: '#9ca3af', dasharray: '6 3', width: 2 }
    }
  }
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
  offset: number  // perpendicular offset for parallel links (0 if only one link)
}

export function TopologyCard({ data }: Props) {
  const isDark = useThemeStore((s) => s.mode === 'dark')
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [isFullscreen, setIsFullscreen] = useState(false)

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

    // Normalize Internet links so Internet is always the source (top in TB layout)
    const internetIds = new Set(nodes.filter((n) => n.deviceType === 'internet').map((n) => n.id))
    const normalizedLinks = links.map((link) => {
      if (internetIds.has(link.target) && !internetIds.has(link.source)) {
        return { ...link, source: link.target, target: link.source }
      }
      return link
    })

    // Deduplicate links (LLDP/CDP reports both directions)
    // Include label in key so multiple WAN interfaces (wan1, wan2) aren't collapsed
    const seenLinks = new Set<string>()
    const dedupedLinks: TopologyLink[] = []
    for (const link of normalizedLinks) {
      const suffix = link.label ? `::${link.label}` : ''
      const key1 = `${link.source}::${link.target}${suffix}`
      const key2 = `${link.target}::${link.source}${suffix}`
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

    // Group links by node pair to compute perpendicular offsets for parallel links
    const pairGroups = new Map<string, TopologyLink[]>()
    for (const link of dedupedLinks) {
      const pairKey = [link.source, link.target].sort().join('::')
      const group = pairGroups.get(pairKey)
      if (group) group.push(link)
      else pairGroups.set(pairKey, [link])
    }

    const layoutLinks: LayoutLink[] = []
    const PARALLEL_GAP = 55  // px between parallel links (enough for label boxes)
    for (const group of pairGroups.values()) {
      const count = group.length
      for (let idx = 0; idx < count; idx++) {
        const link = group[idx]
        const s = layoutNodeMap.get(link.source)
        const t = layoutNodeMap.get(link.target)
        if (s && t) {
          // Center offsets: e.g. 3 links → [-20, 0, 20]
          const offset = count > 1 ? (idx - (count - 1) / 2) * PARALLEL_GAP : 0
          layoutLinks.push({ source: s, target: t, link, offset })
        }
      }
    }

    const graph = g.graph()
    const w = (graph.width ?? 400) + PADDING * 2
    const h = (graph.height ?? 300) + PADDING * 2

    return { layoutNodes, layoutLinks, width: w, height: h, hasInternet: hasMX }
  }, [data.nodes, data.links])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.97 : 1.03
    setZoom((z) => Math.max(0.1, Math.min(5, z * delta))
    )
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
    // The SVG viewBox already handles content-to-container fitting
    // (preserveAspectRatio="xMidYMid meet" is the default).
    // Just reset zoom and pan to show the full topology.
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  // Close fullscreen on Escape
  useEffect(() => {
    if (!isFullscreen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFullscreen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isFullscreen])

  // Auto-fit when entering fullscreen (after portal renders)
  useEffect(() => {
    if (isFullscreen) {
      requestAnimationFrame(() => autoFit())
    }
  }, [isFullscreen, autoFit])

  const textColor = isDark ? '#e5e7eb' : '#1f2937'
  const subtextColor = isDark ? '#9ca3af' : '#6b7280'
  const nodeBg = isDark ? '#1f2937' : '#ffffff'
  const nodeBorder = isDark ? '#374151' : '#e5e7eb'

  const content = (
    <div className={isFullscreen ? 'fixed inset-0 z-[100] flex flex-col bg-gray-50 dark:bg-gray-950' : 'w-full h-full flex flex-col'} style={isFullscreen ? undefined : { minHeight: 400 }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
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
          <span className="flex items-center gap-1.5">
            <svg width="24" height="12">
              <line x1="0" y1="6" x2="24" y2="6" stroke="#ef4444" strokeWidth="3" />
              <circle cx="12" cy="6" r="4" fill="#ef4444" />
              <text x="12" y="9" textAnchor="middle" fontSize="7" fontWeight="700" fill="#fff">✕</text>
            </svg>
            <span className="font-medium">Failed</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={autoFit}
            className="px-2 py-1 text-xs font-medium rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            style={{ color: textColor }}
            title="Fit topology to view"
          >
            Fit
          </button>
          <button
            onClick={resetView}
            className="px-2 py-1 text-xs font-medium rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            style={{ color: textColor }}
            title="Reset to 100% zoom"
          >
            Reset
          </button>
          <button
            onClick={() => setIsFullscreen((f) => !f)}
            className="px-2 py-1 text-xs font-medium rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            )}
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
            const style = linkStyle(l.link.linkType, l.link.status)
            const isFailed = l.link.status?.toLowerCase() === 'failed'
            const isNotConnected = l.link.status?.toLowerCase() === 'not connected'

            // Compute perpendicular offset for parallel links
            const dx = l.target.x - l.source.x
            const dy = l.target.y - l.source.y
            const len = Math.sqrt(dx * dx + dy * dy) || 1
            // Normal vector (perpendicular)
            const nx = -dy / len
            const ny = dx / len
            const ox = nx * l.offset
            const oy = ny * l.offset

            const x1 = l.source.x + ox
            const y1 = l.source.y + oy
            const x2 = l.target.x + ox
            const y2 = l.target.y + oy
            const midX = (x1 + x2) / 2
            const midY = (y1 + y2) / 2

            return (
              <g key={`link-${i}`}>
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={style.stroke}
                  strokeWidth={style.width}
                  strokeDasharray={style.dasharray || undefined}
                  opacity={isFailed ? 0.85 : 0.6}
                />
                {/* Failed link icon */}
                {isFailed && (
                  <g transform={`translate(${midX}, ${midY - 18})`}>
                    <circle r={8} fill="#ef4444" opacity={0.9} />
                    <text textAnchor="middle" y={4} fontSize={11} fontWeight={700} fill="#fff">✕</text>
                  </g>
                )}
                {(l.link.label || l.link.speed) && (() => {
                  const labelText = l.link.label || ''
                  const speedText = l.link.speed || ''
                  const hasTwo = !!(labelText && speedText)
                  const longestLen = Math.max(labelText.length, speedText.length)
                  const boxW = Math.max(longestLen * 6.5 + 10, 40)
                  const boxH = hasTwo ? 28 : 16

                  // Color the status text based on uplink state
                  const speedColor = isFailed
                    ? '#ef4444'
                    : isNotConnected
                      ? '#9ca3af'
                      : l.link.status?.toLowerCase() === 'active'
                        ? '#10b981'
                        : isDark ? '#60a5fa' : '#3b82f6'

                  return (
                    <g>
                      <rect
                        x={midX - boxW / 2}
                        y={midY - boxH / 2 - 2}
                        width={boxW}
                        height={boxH}
                        fill={isDark ? '#1f2937' : '#ffffff'}
                        opacity={0.9}
                        rx={3}
                      />
                      {labelText && (
                        <text
                          x={midX}
                          y={hasTwo ? midY - 5 : midY + 2}
                          textAnchor="middle"
                          fontSize={9}
                          fontWeight={500}
                          fill={subtextColor}
                        >
                          {labelText}
                        </text>
                      )}
                      {speedText && (
                        <text
                          x={midX}
                          y={hasTwo ? midY + 8 : midY + 2}
                          textAnchor="middle"
                          fontSize={8}
                          fontWeight={600}
                          fill={speedColor}
                        >
                          {speedText}
                        </text>
                      )}
                    </g>
                  )
                })()}
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

          // Find connections for this node with direction info
          const connections = layoutLinks.filter(
            (l) => l.source.id === hoveredNode || l.target.id === hoveredNode
          ).map((l) => {
            const isSource = l.source.id === hoveredNode
            const peer = isSource ? l.target : l.source
            const linkType = l.link.linkType || 'wired'

            // Determine direction: peer with lower Y (higher on screen) = upstream
            let direction: 'upstream' | 'downstream' | 'wan'
            if (linkType === 'wan') {
              direction = 'wan'
            } else if (peer.y < ln.y) {
              direction = 'upstream'
            } else if (peer.y > ln.y) {
              direction = 'downstream'
            } else {
              // Same row — use dagre source/target as hint
              direction = isSource ? 'downstream' : 'upstream'
            }

            return {
              peerName: peer.node.label,
              port: l.link.label || '',
              speed: l.link.speed || '',
              linkType,
              direction,
              status: l.link.status || '',
            }
          })
          // Sort: upstream first, then WAN, then downstream
          const dirOrder = { upstream: 0, wan: 1, downstream: 2 }
          connections.sort((a, b) => dirOrder[a.direction] - dirOrder[b.direction])

          // Tooltip dimensions (approximate)
          const tooltipWidth = 220
          const baseHeight = ln.node.serial ? 120 : 100
          const connHeight = connections.length > 0 ? 16 + connections.length * 52 : 0
          const tooltipHeight = baseHeight + connHeight

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
              <div className="bg-gray-900 dark:bg-gray-800 text-white rounded-lg shadow-2xl p-3 min-w-[200px] max-w-[240px] border border-gray-700">
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
                  {connections.length > 0 && (
                    <div className="pt-1 mt-1 border-t border-gray-700 space-y-1.5">
                      {connections.map((conn, i) => {
                        const dirLabel =
                          conn.direction === 'wan' ? 'WAN' :
                          conn.direction === 'upstream' ? 'Upstream' :
                          'Downstream'
                        const dirColor =
                          conn.direction === 'wan' ? 'text-purple-400' :
                          conn.direction === 'upstream' ? 'text-amber-400' :
                          'text-cyan-400'
                        return (
                          <div key={i}>
                            <div className="flex items-center gap-1">
                              <span className={`${dirColor} font-medium`} style={{ fontSize: '10px' }}>
                                {conn.direction === 'upstream' ? '▲' : conn.direction === 'downstream' ? '▼' : '◆'} {dirLabel}
                              </span>
                              {conn.speed && (
                                <span className="font-medium" style={{
                                  fontSize: '10px',
                                  color: conn.status?.toLowerCase() === 'failed' ? '#ef4444'
                                    : conn.status?.toLowerCase() === 'not connected' ? '#9ca3af'
                                    : conn.status?.toLowerCase() === 'active' ? '#10b981'
                                    : '#60a5fa',
                                }}>({conn.speed})</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 pl-2.5">
                              <span className="text-gray-200 truncate text-xs">{conn.peerName}</span>
                            </div>
                            {conn.port && (
                              <div className="text-gray-500 font-mono pl-2.5" style={{ fontSize: '10px' }}>{conn.port}</div>
                            )}
                          </div>
                        )
                      })}
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

  return isFullscreen ? createPortal(content, document.body) : content
}
