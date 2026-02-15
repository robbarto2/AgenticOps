import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'
import type { AnyCard } from '../types/card'
import { getNextCardPosition } from '../utils/cardPositioning'
import { getCardCategory, getCategoryLabel, getCategoryColor } from '../utils/cardCategories'
import type { CardCategory } from '../utils/cardCategories'

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

  addCard: (card: AnyCard) => void
  removeCard: (cardId: string) => void
  toggleCardCollapse: (cardId: string) => void
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void
  stackByType: () => void
  toggleStack: (stackId: string) => void
  unstackAll: () => void
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  cards: [],
  stacks: {},
  preStackPositions: {},

  addCard: (card) =>
    set((state) => {
      // Helper to get a unique key for a card based on its type and data
      const getCardKey = (c: AnyCard): string | null => {
        switch (c.type) {
          case 'switch_detail':
            return `switch:${c.data.serial}`
          case 'network_detail':
            return `network:${c.data.networkId}`
          case 'test_detail':
            return `test:${c.data.testId}`
          case 'org_summary':
            return 'org_summary' // Only one org summary
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
          console.log(`Card already exists on canvas: ${card.title}`)
          // Don't add duplicate - just return current state
          return state
        }
      }

      const position = getNextCardPosition(state.nodes.length)
      const newNode: Node = {
        id: card.id,
        type: 'cardNode',
        position,
        data: card,
        style: { width: 700, height: 500 },
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

  toggleCardCollapse: (cardId) =>
    set((state) => ({
      cards: state.cards.map((c) =>
        c.id === cardId ? { ...c, collapsed: !c.collapsed } : c
      ),
      nodes: state.nodes.map((n) =>
        n.id === cardId
          ? { ...n, data: { ...n.data, collapsed: !(n.data as AnyCard).collapsed } }
          : n
      ),
    })),

  setNodes: (nodes) => set({ nodes }),

  setEdges: (edges) => set({ edges }),

  updateNodePosition: (nodeId, position) =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === nodeId ? { ...n, position } : n)),
    })),

  stackByType: () => {
    const state = get()
    const cardNodes = state.nodes.filter((n) => n.type === 'cardNode')
    const cardMap = new Map(state.cards.map((c) => [c.id, c]))

    // Helper to generate descriptive label from cards
    const getStackLabel = (category: string, cardIds: string[]): string => {
      const cards = cardIds.map(id => cardMap.get(id)).filter(Boolean) as AnyCard[]
      if (cards.length === 0) return getCategoryLabel(category as CardCategory)

      // For devices (switch_detail cards), extract model info
      if (category === 'device') {
        const models = new Map<string, number>()
        for (const card of cards) {
          if (card.type === 'switch_detail') {
            const model = card.data.model || 'Unknown'
            models.set(model, (models.get(model) || 0) + 1)
          }
        }

        // If all same model, use specific label
        if (models.size === 1) {
          const [model, count] = Array.from(models.entries())[0]
          return `${model} Switches`
        }
        // If mixed models, show count
        if (models.size > 1) {
          return `Switches (${cards.length})`
        }
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

    // Group card node IDs by category
    const groups: Record<string, string[]> = {}
    for (const node of cardNodes) {
      const card = cardMap.get(node.id)
      if (!card) continue
      const category = getCardCategory(card)
      if (!groups[category]) groups[category] = []
      groups[category].push(node.id)
    }

    const newStacks: Record<string, CardStack> = {}
    const preStackPositions: Record<string, { x: number; y: number }> = {}
    const removedNodeIds = new Set<string>()
    const stackNodes: Node[] = []

    for (const [category, cardIds] of Object.entries(groups)) {
      if (cardIds.length < 2) continue

      const stackId = `stack-${category}`
      const firstNode = cardNodes.find((n) => n.id === cardIds[0])
      const position = firstNode ? { ...firstNode.position } : { x: 50, y: 50 }

      // Save pre-stack positions
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
        style: { width: 280 },
      })
    }

    // Keep non-stacked card nodes + add stack nodes
    const remainingNodes = state.nodes.filter((n) => !removedNodeIds.has(n.id) && n.type !== 'stackNode')

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

    const wasExpanded = stack.expanded
    const updatedStack = { ...stack, expanded: !wasExpanded }
    const cardMap = new Map(state.cards.map((c) => [c.id, c]))

    if (wasExpanded) {
      // Collapse: remove expanded card nodes, keep stack node
      const expandedIds = new Set(stack.cardIds)
      const filteredNodes = state.nodes.filter((n) => !expandedIds.has(n.id))

      set({
        stacks: { ...state.stacks, [stackId]: updatedStack },
        nodes: filteredNodes,
      })
    } else {
      // Expand: add card nodes in a 2-col grid near the stack position
      const CARD_W = 720
      const CARD_H = 520
      const GAP = 30
      const COLS = 2
      const offsetX = 300 // offset from stack node

      const expandedNodes: Node[] = stack.cardIds.map((cid, i) => {
        const col = i % COLS
        const row = Math.floor(i / COLS)
        const card = cardMap.get(cid)
        return {
          id: cid,
          type: 'cardNode',
          position: {
            x: stack.position.x + offsetX + col * (CARD_W + GAP),
            y: stack.position.y + row * (CARD_H + GAP),
          },
          data: card ?? {},
          style: { width: 700, height: 500 },
        }
      })

      set({
        stacks: { ...state.stacks, [stackId]: updatedStack },
        nodes: [...state.nodes, ...expandedNodes],
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
}))
