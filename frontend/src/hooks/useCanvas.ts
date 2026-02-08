import { useCallback } from 'react'
import { useCanvasStore } from '../store/canvasSlice'
import type { NodeChange, EdgeChange, applyNodeChanges, applyEdgeChanges } from '@xyflow/react'

export function useCanvas() {
  const { nodes, edges, setNodes, setEdges, removeCard, toggleCardCollapse } =
    useCanvasStore()

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Apply position changes manually to avoid import issues
      const updated = nodes.map((node) => {
        const change = changes.find(
          (c) => c.type === 'position' && 'id' in c && c.id === node.id
        )
        if (change && change.type === 'position' && 'position' in change && change.position) {
          return { ...node, position: change.position }
        }
        // Handle remove changes
        const removeChange = changes.find(
          (c) => c.type === 'remove' && 'id' in c && c.id === node.id
        )
        if (removeChange) return null
        return node
      }).filter(Boolean) as typeof nodes

      setNodes(updated)
    },
    [nodes, setNodes]
  )

  const onEdgesChange = useCallback(
    (_changes: EdgeChange[]) => {
      // Edges are minimal for now
    },
    []
  )

  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    removeCard,
    toggleCardCollapse,
  }
}
