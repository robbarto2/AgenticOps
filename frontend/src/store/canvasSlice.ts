import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'
import type { AnyCard } from '../types/card'
import { getNextCardPosition } from '../utils/cardPositioning'
import { getCardCategory, getCategoryLabel, getCategoryColor } from '../utils/cardCategories'
import type { CardCategory } from '../utils/cardCategories'
import { detectDeviceType } from '../utils/formatters'
import { useToastStore } from './toastSlice'

export interface CardStack {
  id: string
  category: CardCategory
  label: string
  cardIds: string[]
  expanded: boolean
  position: { x: number; y: number }
  color: string
}

interface CanvasState {
  nodes: Node[]
  edges: Edge[]
  cards: AnyCard[]
  stacks: Record<string, CardStack>
  preStackPositions: Record<string, { x: number; y: number }>
  preCollapseSizes: Record<string, { width: number; height: number }>

  addCard: (card: AnyCard) => void
  removeCard: (cardId: string) => void
  toggleCardCollapse: (cardId: string) => void
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void
  clearCanvas: () => void
  stackByType: (category?: CardCategory) => void
  toggleStack: (stackId: string) => void
  unstackCard: (stackId: string, cardId: string) => void
  unstackAll: () => void
  autoLayout: () => void
  clearNewFlag: (cardId: string) => void
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  cards: [],
  stacks: {},
  preStackPositions: {},
  preCollapseSizes: {},

  addCard: (card) =>
    set((state) => {
      // Helper to get a unique key for a card based on its type and data
      const getCardKey = (c: AnyCard): string | null => {
        switch (c.type) {
          case 'switch_detail':
            return `switch:${c.data.serial}`
          case 'access_point_detail':
            return `ap:${c.data.serial}`
          case 'network_detail':
            return `network:${c.data.networkId}`
          case 'test_detail':
            return `test:${c.data.testId}`
          case 'org_summary':
            return 'org_summary' // Only one org summary
          case 'topology':
            return `topology:${c.data.networkName ?? c.title}`
          case 'data_table':
          case 'bar_chart':
          case 'line_chart':
          case 'alert_summary':
          case 'text_report':
          case 'network_health':
            // For generic cards, use title as key
            return `${c.type}:${c.title}`
          default:
            return null // Unknown type, allow duplicates
        }
      }

      // Check if this card already exists
      const newCardKey = getCardKey(card)
      if (newCardKey) {
        const duplicate = state.cards.find(c => getCardKey(c) === newCardKey)
        if (duplicate) {
          // Show toast notification
          useToastStore.getState().addToast(`Card already exists on canvas: ${card.title}`, 'warning')
          // Don't add duplicate - just return current state
          return state
        }
      }

      const position = getNextCardPosition(state.nodes.length)

      // Set default size based on card type
      let defaultWidth = 650
      let defaultHeight = 380

      // Chart cards need more height for the chart area
      if (card.type === 'line_chart' || card.type === 'bar_chart') {
        defaultHeight = 450
      }
      // Access point cards need more height for channel utilization display
      if (card.type === 'access_point_detail') {
        defaultHeight = 480
      }
      // Network detail cards need more height for stats and metadata
      if (card.type === 'network_detail') {
        defaultHeight = 500
      }

      const newNode: Node = {
        id: card.id,
        type: 'cardNode',
        position,
        data: { ...card, isNew: true },
        style: { width: defaultWidth, height: defaultHeight },
      }
      return {
        cards: [...state.cards, card],
        nodes: [...state.nodes, newNode],
      }
    }),

  removeCard: (cardId) =>
    set((state) => ({
      cards: state.cards.filter((c) => c.id !== cardId),
      nodes: state.nodes.filter((n) => n.id !== cardId),
      edges: state.edges.filter((e) => e.source !== cardId && e.target !== cardId),
    })),

  clearCanvas: () => set({ cards: [], nodes: [], edges: [], stacks: {}, preStackPositions: {}, preCollapseSizes: {} }),

  toggleCardCollapse: (cardId) =>
    set((state) => {
      const card = state.cards.find((c) => c.id === cardId)
      if (!card) return state
      const node = state.nodes.find((n) => n.id === cardId)
      const isCollapsing = !card.collapsed

      if (isCollapsing) {
        // Save current dimensions before collapsing
        const currentWidth = node?.width ?? (node?.style?.width as number) ?? 650
        const currentHeight = node?.height ?? (node?.style?.height as number) ?? 380
        return {
          cards: state.cards.map((c) =>
            c.id === cardId ? { ...c, collapsed: true } : c
          ),
          nodes: state.nodes.map((n) =>
            n.id === cardId
              ? { ...n, data: { ...n.data, collapsed: true }, style: { width: 250, height: 90 }, width: 250, height: 90 }
              : n
          ),
          preCollapseSizes: {
            ...state.preCollapseSizes,
            [cardId]: { width: currentWidth, height: currentHeight },
          },
        }
      } else {
        // Restore saved dimensions on expand
        const saved = state.preCollapseSizes[cardId]
        const restoreWidth = saved?.width ?? 650
        const restoreHeight = saved?.height ?? 380
        const { [cardId]: _removed, ...remainingCollapseSizes } = state.preCollapseSizes
        return {
          cards: state.cards.map((c) =>
            c.id === cardId ? { ...c, collapsed: false } : c
          ),
          nodes: state.nodes.map((n) =>
            n.id === cardId
              ? { ...n, data: { ...n.data, collapsed: false }, style: { width: restoreWidth, height: restoreHeight }, width: restoreWidth, height: restoreHeight }
              : n
          ),
          preCollapseSizes: remainingCollapseSizes,
        }
      }
    }),

  setNodes: (nodes) => set({ nodes }),

  setEdges: (edges) => set({ edges }),

  updateNodePosition: (nodeId, position) =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === nodeId ? { ...n, position } : n)),
    })),

  stackByType: (filterCategory?) => {
    const state = get()
    const cardNodes = state.nodes.filter((n) => n.type === 'cardNode')
    const cardMap = new Map(state.cards.map((c) => [c.id, c]))

    // Helper to generate descriptive label from cards
    const getStackLabel = (category: string, cardIds: string[]): string => {
      const cards = cardIds.map(id => cardMap.get(id)).filter(Boolean) as AnyCard[]
      if (cards.length === 0) return getCategoryLabel(category as CardCategory)

      // For devices, extract device type from card data or titles
      if (category === 'device') {
        const deviceLabels = new Map<string, number>()
        for (const card of cards) {
          if (card.type === 'switch_detail') {
            const model = card.data.model || 'Switch'
            deviceLabels.set(model, (deviceLabels.get(model) || 0) + 1)
          } else if (card.type === 'access_point_detail') {
            const model = card.data.model || 'Access Point'
            deviceLabels.set(model, (deviceLabels.get(model) || 0) + 1)
          } else if (card.type === 'device_detail') {
            const dt = card.data.deviceType || 'Device'
            deviceLabels.set(dt, (deviceLabels.get(dt) || 0) + 1)
          } else {
            // data_table or other: detect device type from title
            const dt = detectDeviceType(card.title)
            const label = dt.label || 'Device'
            deviceLabels.set(label, (deviceLabels.get(label) || 0) + 1)
          }
        }

        if (deviceLabels.size === 1) {
          const [label] = Array.from(deviceLabels.keys())
          // Pluralize: "Switch" → "Switches", "Appliance" → "Appliances"
          const plural = label.endsWith('ch') ? `${label}es` : label.endsWith('s') ? label : `${label}s`
          return `${plural} (${cards.length})`
        }
        if (deviceLabels.size > 1) {
          return `Devices (${cards.length})`
        }
        return `Devices (${cards.length})`
      }

      // For tests, check if all same type
      if (category === 'test') {
        const types = new Set(cards.map(c => c.type === 'test_detail' ? c.data.testType : ''))
        if (types.size === 1 && types.values().next().value) {
          const type = types.values().next().value
          return `${type} Tests`
        }
        return `Tests (${cards.length})`
      }

      // For networks, use generic label
      if (category === 'network') {
        return `Networks (${cards.length})`
      }

      // Default: category label
      return getCategoryLabel(category as CardCategory)
    }

    // Group card node IDs by category (only unstacked cards)
    const groups: Record<string, string[]> = {}
    for (const node of cardNodes) {
      const card = cardMap.get(node.id)
      if (!card) continue
      const category = getCardCategory(card)
      // If filtering by a specific category, skip others
      if (filterCategory && category !== filterCategory) continue
      if (!groups[category]) groups[category] = []
      groups[category].push(node.id)
    }

    // When stacking a single category, preserve existing stacks
    const newStacks: Record<string, CardStack> = filterCategory ? { ...state.stacks } : {}
    const preStackPositions: Record<string, { x: number; y: number }> = filterCategory ? { ...state.preStackPositions } : {}
    const removedNodeIds = new Set<string>()
    const stackNodes: Node[] = []

    const updatedStackNodeIds = new Set<string>()

    for (const [category, cardIds] of Object.entries(groups)) {
      const stackId = `stack-${category}`
      const existingStack = state.stacks[stackId]

      if (existingStack) {
        // Merge unstacked cards into the existing stack
        if (cardIds.length < 1) continue

        for (const cid of cardIds) {
          const node = cardNodes.find((n) => n.id === cid)
          if (node) preStackPositions[cid] = { ...node.position }
          removedNodeIds.add(cid)
        }

        const mergedCardIds = [...existingStack.cardIds, ...cardIds]
        newStacks[stackId] = {
          ...existingStack,
          cardIds: mergedCardIds,
          label: getStackLabel(category, mergedCardIds),
        }
        updatedStackNodeIds.add(stackId)
      } else {
        // Create a new stack (requires 2+ cards)
        if (cardIds.length < 2) continue

        const firstNode = cardNodes.find((n) => n.id === cardIds[0])
        const position = firstNode ? { ...firstNode.position } : { x: 50, y: 50 }

        for (const cid of cardIds) {
          const node = cardNodes.find((n) => n.id === cid)
          if (node) preStackPositions[cid] = { ...node.position }
          removedNodeIds.add(cid)
        }

        newStacks[stackId] = {
          id: stackId,
          category: category as CardCategory,
          label: getStackLabel(category, cardIds),
          cardIds,
          expanded: false,
          position,
          color: getCategoryColor(category as CardCategory),
        }

        stackNodes.push({
          id: stackId,
          type: 'stackNode',
          position,
          data: newStacks[stackId],
          style: { width: 500 },
        })
      }
    }

    // Keep non-stacked card nodes + add new stack nodes
    // Update existing stack nodes with merged data
    const remainingNodes = filterCategory
      ? state.nodes.filter((n) => !removedNodeIds.has(n.id)).map((n) =>
          updatedStackNodeIds.has(n.id) ? { ...n, data: newStacks[n.id] } : n
        )
      : state.nodes.filter((n) => !removedNodeIds.has(n.id) && n.type !== 'stackNode')

    set({
      stacks: newStacks,
      preStackPositions,
      nodes: [...remainingNodes, ...stackNodes],
    })
  },

  toggleStack: (stackId) => {
    const state = get()
    const stack = state.stacks[stackId]
    if (!stack) return

    const cardMap = new Map(state.cards.map((c) => [c.id, c]))

    // Expand: remove the stack node, add individual card nodes, dissolve the stack record
    const CARD_W = 700
    const CARD_H = 500
    const GAP = 30
    const COLS = 2

    const expandedNodes: Node[] = stack.cardIds.map((cid, i) => {
      const col = i % COLS
      const row = Math.floor(i / COLS)
      const card = cardMap.get(cid)
      return {
        id: cid,
        type: 'cardNode',
        position: {
          x: stack.position.x + col * (CARD_W + GAP),
          y: stack.position.y + row * (CARD_H + GAP),
        },
        data: card ?? {},
        style: { width: CARD_W, height: CARD_H },
      }
    })

    // Remove the stack node from canvas; remove from stacks record and preStackPositions
    const { [stackId]: _removed, ...remainingStacks } = state.stacks
    const newPreStackPositions = { ...state.preStackPositions }
    for (const cid of stack.cardIds) delete newPreStackPositions[cid]

    set({
      stacks: remainingStacks,
      preStackPositions: newPreStackPositions,
      nodes: [
        ...state.nodes.filter((n) => n.id !== stackId),
        ...expandedNodes,
      ],
    })
  },

  unstackCard: (stackId, cardId) => {
    const state = get()
    const stack = state.stacks[stackId]
    if (!stack) return

    const cardMap = new Map(state.cards.map((c) => [c.id, c]))
    const card = cardMap.get(cardId)
    if (!card) return

    const remainingIds = stack.cardIds.filter((id) => id !== cardId)

    // Place the unstacked card to the right of the stack
    const CARD_W = 700
    const CARD_H = 500
    const unstackedNode: Node = {
      id: cardId,
      type: 'cardNode',
      position: {
        x: stack.position.x + 550,
        y: stack.position.y,
      },
      data: card,
      style: { width: CARD_W, height: CARD_H },
    }

    // Clean up pre-stack position for the removed card
    const newPreStackPositions = { ...state.preStackPositions }
    delete newPreStackPositions[cardId]

    if (remainingIds.length <= 1) {
      // Stack has 0 or 1 cards left — dissolve it
      const { [stackId]: _removed, ...remainingStacks } = state.stacks

      // Restore the last remaining card as a collapsed (minimized) card node
      const lastCardNodes: Node[] = remainingIds.map((cid) => {
        const c = cardMap.get(cid)
        delete newPreStackPositions[cid]
        return {
          id: cid,
          type: 'cardNode',
          position: { x: stack.position.x, y: stack.position.y },
          data: { ...(c ?? {}), collapsed: true },
          style: { width: 250, height: 90 },
        }
      })

      set({
        stacks: remainingStacks,
        preStackPositions: newPreStackPositions,
        nodes: [
          ...state.nodes.filter((n) => n.id !== stackId),
          ...lastCardNodes,
          unstackedNode,
        ],
      })
    } else {
      // Update the stack with the remaining cards
      const updatedStack = { ...stack, cardIds: remainingIds }

      set({
        stacks: { ...state.stacks, [stackId]: updatedStack },
        preStackPositions: newPreStackPositions,
        nodes: [
          ...state.nodes.map((n) =>
            n.id === stackId ? { ...n, data: updatedStack } : n
          ),
          unstackedNode,
        ],
      })
    }
  },

  unstackAll: () => {
    const state = get()
    const { preStackPositions, stacks } = state
    const cardMap = new Map(state.cards.map((c) => [c.id, c]))

    // Collect all card IDs that were stacked
    const allStackedIds = new Set<string>()
    for (const stack of Object.values(stacks)) {
      for (const cid of stack.cardIds) allStackedIds.add(cid)
    }

    // Remove stack nodes and any already-expanded card nodes for stacked cards
    const cleanedNodes = state.nodes.filter(
      (n) => n.type !== 'stackNode' && !allStackedIds.has(n.id)
    )

    // Restore card nodes at their pre-stack positions
    const restoredNodes: Node[] = []
    for (const cid of allStackedIds) {
      const card = cardMap.get(cid)
      if (!card) continue
      const pos = preStackPositions[cid] ?? { x: 50, y: 50 }
      restoredNodes.push({
        id: cid,
        type: 'cardNode',
        position: pos,
        data: card,
        style: { width: 700, height: 500 },
      })
    }

    set({
      stacks: {},
      preStackPositions: {},
      nodes: [...cleanedNodes, ...restoredNodes],
    })
  },

  autoLayout: () => {
    const state = get()
    const cardMap = new Map(state.cards.map((c) => [c.id, c]))

    const GAP_X = 40
    const GAP_Y = 20       // Tight gap within a category group
    const GROUP_GAP_Y = 60 // Larger gap between different categories
    const START_X = 40
    const START_Y = 40

    const CATEGORY_ORDER: CardCategory[] = [
      'org', 'network', 'topology', 'switch', 'access_point', 'device',
      'test', 'alert', 'chart', 'table', 'report',
    ]

    // Build a map: category → { stackNodes, collapsedNodes, expandedNodes }
    const categoryGroups = new Map<string, { stackNodes: Node[]; collapsedNodes: Node[]; expandedNodes: Node[] }>()

    for (const node of state.nodes) {
      let category: string

      if (node.type === 'stackNode') {
        category = (node.data as CardStack).category ?? 'other'
      } else if (node.type === 'cardNode') {
        const card = cardMap.get(node.id)
        if (!card) continue
        category = getCardCategory(card)
      } else {
        continue
      }

      if (!categoryGroups.has(category)) {
        categoryGroups.set(category, { stackNodes: [], collapsedNodes: [], expandedNodes: [] })
      }
      const group = categoryGroups.get(category)!

      if (node.type === 'stackNode') {
        group.stackNodes.push(node)
      } else {
        const card = cardMap.get(node.id)
        if (card?.collapsed) {
          group.collapsedNodes.push(node)
        } else {
          group.expandedNodes.push(node)
        }
      }
    }

    // Sort categories by CATEGORY_ORDER
    const sortedCategories = [...categoryGroups.keys()].sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a as CardCategory)
      const bi = CATEGORY_ORDER.indexOf(b as CardCategory)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })

    let currentY = START_Y
    const updatedPositions: Record<string, { x: number; y: number }> = {}

    // Helper: lay out nodes in a row, wrapping into multiple rows if needed
    const layoutRow = (nodes: Node[], defaultW: number, defaultH: number, maxCols: number) => {
      if (nodes.length === 0) return
      const cols = Math.min(nodes.length, maxCols)
      for (let i = 0; i < nodes.length; i++) {
        const col = i % cols
        const row = Math.floor(i / cols)
        const w = nodes[i].width ?? (nodes[i].style?.width as number) ?? defaultW
        const h = nodes[i].height ?? (nodes[i].style?.height as number) ?? defaultH

        // Calculate x based on column position
        let x = START_X
        for (let c = 0; c < col; c++) {
          const prevW = nodes[Math.floor(i / cols) * cols + c]?.width
            ?? (nodes[Math.floor(i / cols) * cols + c]?.style?.width as number)
            ?? defaultW
          x += prevW + GAP_X
        }

        // Calculate y offset for this row
        const rowStart = row * cols
        const rowEnd = Math.min(rowStart + cols, nodes.length)
        const rowMaxH = Math.max(
          ...nodes.slice(rowStart, rowEnd).map(n => n.height ?? (n.style?.height as number) ?? defaultH)
        )

        let rowY = currentY
        for (let r = 0; r < row; r++) {
          const rStart = r * cols
          const rEnd = Math.min(rStart + cols, nodes.length)
          rowY += Math.max(
            ...nodes.slice(rStart, rEnd).map(n => n.height ?? (n.style?.height as number) ?? defaultH)
          ) + GAP_Y
        }

        updatedPositions[nodes[i].id] = { x, y: rowY }
      }

      // Advance currentY past all rows
      const totalRows = Math.ceil(nodes.length / cols)
      for (let r = 0; r < totalRows; r++) {
        const rStart = r * cols
        const rEnd = Math.min(rStart + cols, nodes.length)
        const rowH = Math.max(
          ...nodes.slice(rStart, rEnd).map(n => n.height ?? (n.style?.height as number) ?? defaultH)
        )
        currentY += rowH + GAP_Y
      }
    }

    let categoryIndex = 0
    for (const category of sortedCategories) {
      const group = categoryGroups.get(category)!
      const hasItems = group.stackNodes.length > 0 || group.collapsedNodes.length > 0 || group.expandedNodes.length > 0
      if (!hasItems) continue

      // Combine stack nodes and collapsed cards into a single compact row
      // since they're both small (stack ~500px, collapsed ~250px)
      const compactNodes = [...group.stackNodes, ...group.collapsedNodes]
      if (compactNodes.length > 0) {
        const compactCols = Math.min(compactNodes.length, 4)
        layoutRow(compactNodes, 500, 120, compactCols)
      }

      // Expanded cards in a grid (up to 3 columns)
      const expandedCols = group.expandedNodes.length <= 2 ? group.expandedNodes.length : group.expandedNodes.length <= 6 ? 3 : 4
      layoutRow(group.expandedNodes, 650, 380, expandedCols)

      // Add gap between categories (but not after the last one)
      categoryIndex++
      if (categoryIndex < sortedCategories.length) {
        currentY += GROUP_GAP_Y - GAP_Y
      }
    }

    set({
      nodes: state.nodes.map((n) =>
        updatedPositions[n.id] ? { ...n, position: updatedPositions[n.id] } : n
      ),
      stacks: Object.fromEntries(
        Object.entries(state.stacks).map(([id, stack]) => [
          id,
          updatedPositions[id] ? { ...stack, position: updatedPositions[id] } : stack,
        ])
      ),
    })
  },

  clearNewFlag: (cardId) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === cardId ? { ...n, data: { ...n.data, isNew: false } } : n
      ),
    })),
}))
