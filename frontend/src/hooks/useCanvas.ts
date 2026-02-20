import { useCallback } from 'react'
import { useCanvasStore } from '../store/canvasSlice'
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react'
import type { NodeChange, EdgeChange } from '@xyflow/react'

export function useCanvas() {
  const { nodes, edges, setNodes, setEdges, removeCard, toggleCardCollapse } =
    useCanvasStore()

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Always read latest nodes from the store to avoid stale closures
      // (e.g. toggleCardCollapse updates nodes, then React Flow fires a
      // dimension change — using the closure's `nodes` would overwrite it)
      const currentNodes = useCanvasStore.getState().nodes
      const updatedNodes = applyNodeChanges(changes, currentNodes)

      // Keep stack positions in sync when dragging stack nodes
      changes.forEach((change) => {
        if (change.type === 'position' && 'id' in change && change.position) {
          const node = currentNodes.find((n) => n.id === change.id)
          if (node?.type === 'stackNode') {
            const stacks = useCanvasStore.getState().stacks
            const stack = stacks[node.id]
            if (stack) {
              useCanvasStore.setState({
                stacks: {
                  ...stacks,
                  [node.id]: { ...stack, position: change.position },
                },
              })
            }
          }
        }
      })

      setNodes(updatedNodes)
    },
    [setNodes]
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
