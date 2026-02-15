import { useCallback } from 'react'
import { useCanvasStore } from '../store/canvasSlice'
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react'
import type { NodeChange, EdgeChange } from '@xyflow/react'

export function useCanvas() {
  const { nodes, edges, setNodes, setEdges, removeCard, toggleCardCollapse } =
    useCanvasStore()

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Use ReactFlow's built-in applyNodeChanges for proper handling
      const updatedNodes = applyNodeChanges(changes, nodes)

      // Keep stack positions in sync when dragging stack nodes
      changes.forEach((change) => {
        if (change.type === 'position' && 'id' in change && change.position) {
          const node = nodes.find((n) => n.id === change.id)
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
