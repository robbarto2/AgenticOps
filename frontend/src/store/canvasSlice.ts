import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'
import type { AnyCard } from '../types/card'
import { getNextCardPosition } from '../utils/cardPositioning'

interface CanvasState {
  nodes: Node[]
  edges: Edge[]
  cards: AnyCard[]

  addCard: (card: AnyCard) => void
  removeCard: (cardId: string) => void
  toggleCardCollapse: (cardId: string) => void
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void
}

export const useCanvasStore = create<CanvasState>((set) => ({
  nodes: [],
  edges: [],
  cards: [],

  addCard: (card) =>
    set((state) => {
      const position = getNextCardPosition(state.nodes.length)
      const newNode: Node = {
        id: card.id,
        type: 'cardNode',
        position,
        data: card,
        style: { width: 420 },
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
}))
