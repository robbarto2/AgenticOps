import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useCanvas } from '../../hooks/useCanvas'
import { CardNode } from '../cards/CardNode'
import { StackNode } from '../cards/StackNode'
import { useCanvasStore } from '../../store/canvasSlice'
import { useThemeStore } from '../../store/themeSlice'

const nodeTypes = {
  cardNode: CardNode,
  stackNode: StackNode,
}

export function CanvasPanel() {
  const { nodes, edges, onNodesChange, onEdgesChange } = useCanvas()
  const mode = useThemeStore((s) => s.mode)
  const isDark = mode === 'dark'
  const stacks = useCanvasStore((s) => s.stacks)
  const stackByType = useCanvasStore((s) => s.stackByType)
  const unstackAll = useCanvasStore((s) => s.unstackAll)
  const hasCards = useCanvasStore((s) => s.cards.length > 0)
  const hasStacks = Object.keys(stacks).length > 0

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView={false}
        minZoom={0.2}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color={isDark ? '#4a5568' : '#94a3b8'}
        />
        <Controls position="bottom-right" />
        <MiniMap
          position="bottom-left"
          nodeColor="#3b82f6"
          maskColor={isDark ? 'rgba(14, 17, 25, 0.8)' : 'rgba(255,255,255,0.7)'}
          style={{
            backgroundColor: isDark ? '#1a202c' : '#f1f5f9',
            border: isDark ? '2px solid #4a5568' : '1px solid #e2e8f0',
          }}
        />

        {/* Stack / Unstack button */}
        {hasCards && (
          <div className="absolute top-3 right-3 z-10">
            <button
              onClick={hasStacks ? unstackAll : stackByType}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors shadow-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {hasStacks ? (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
                  </svg>
                  Unstack All
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75 6.43 9.75m11.14 0 4.179 2.25L12 17.25 2.25 12l4.179-2.25" />
                  </svg>
                  Stack by Type
                </>
              )}
            </button>
          </div>
        )}

        {/* Empty state overlay */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-200/50 dark:bg-gray-800/50 flex items-center justify-center border border-gray-300/50 dark:border-gray-700/50">
                <svg className="w-8 h-8 text-gray-400 dark:text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
                </svg>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Cards will appear here</p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                Ask a question in the chat to get started
              </p>
            </div>
          </div>
        )}
      </ReactFlow>
    </div>
  )
}
