import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useReactFlow,
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

function CanvasToolbar() {
  const { fitView } = useReactFlow()
  const stacks = useCanvasStore((s) => s.stacks)
  const stackByType = useCanvasStore((s) => s.stackByType)
  const unstackAll = useCanvasStore((s) => s.unstackAll)
  const autoLayout = useCanvasStore((s) => s.autoLayout)
  const clearCanvas = useCanvasStore((s) => s.clearCanvas)
  const hasCards = useCanvasStore((s) => s.cards.length > 0)
  const hasStacks = Object.keys(stacks).length > 0
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const handleAutoLayout = useCallback(() => {
    autoLayout()
    setTimeout(() => fitView({ padding: 0.12, duration: 500 }), 30)
  }, [autoLayout, fitView])

  if (!hasCards) return null

  return (
    <>
      <div className="absolute top-3 right-3 z-10 flex gap-2">
        {/* Auto Layout button */}
        <button
          onClick={handleAutoLayout}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors shadow-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
          Auto Layout
        </button>

        {/* Stack / Unstack button */}
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

        {/* Clear Canvas button */}
        <button
          onClick={() => setShowClearConfirm(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors shadow-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:border-red-300 dark:hover:border-red-500/30"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
          Clear Canvas
        </button>
      </div>

      {/* Clear canvas confirmation modal */}
      {showClearConfirm && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          onClick={() => setShowClearConfirm(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative bg-white dark:bg-[#111827] border border-gray-200 dark:border-[#1e2636] rounded-xl shadow-2xl w-80 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-4 text-center">
              <div className="mx-auto w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-200 mb-1">Clear all cards?</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                This will remove all cards from the canvas. Chat history will not be affected.
              </p>
            </div>
            <div className="flex border-t border-gray-200 dark:border-[#1e2636]">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <div className="w-px bg-gray-200 dark:bg-gray-800" />
              <button
                onClick={() => {
                  clearCanvas()
                  setShowClearConfirm(false)
                }}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

export function CanvasPanel() {
  const { nodes, edges, onNodesChange, onEdgesChange } = useCanvas()
  const mode = useThemeStore((s) => s.mode)
  const isDark = mode === 'dark'

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
        nodesFocusable={false}
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

        <CanvasToolbar />

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
