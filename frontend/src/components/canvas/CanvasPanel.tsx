import { useCallback, useEffect, useRef, useState } from 'react'
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
import { getCardCategory, getCategoryLabel, getCategoryColor } from '../../utils/cardCategories'
import type { CardCategory } from '../../utils/cardCategories'

const nodeTypes = {
  cardNode: CardNode,
  stackNode: StackNode,
}

function CanvasToolbar({ onClearRequest }: { onClearRequest: () => void }) {
  const { fitView } = useReactFlow()
  const stacks = useCanvasStore((s) => s.stacks)
  const cards = useCanvasStore((s) => s.cards)
  const nodes = useCanvasStore((s) => s.nodes)
  const stackByType = useCanvasStore((s) => s.stackByType)
  const toggleStack = useCanvasStore((s) => s.toggleStack)
  const unstackAll = useCanvasStore((s) => s.unstackAll)
  const autoLayout = useCanvasStore((s) => s.autoLayout)
  const hasCards = cards.length > 0
  const hasStacks = Object.keys(stacks).length > 0
  const [showStackMenu, setShowStackMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleAutoLayout = useCallback(() => {
    autoLayout()
    setTimeout(() => fitView({ padding: 0.12, maxZoom: 0.8, duration: 500 }), 30)
  }, [autoLayout, fitView])

  // Close menu on outside click
  useEffect(() => {
    if (!showStackMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowStackMenu(false)
      }
    }
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler) }
  }, [showStackMenu])

  // Build list of stackable categories from unstacked card nodes
  const unstackedCardNodes = nodes.filter((n) => n.type === 'cardNode')
  const cardMap = new Map(cards.map((c) => [c.id, c]))
  const categoryCounts: Record<string, number> = {}
  for (const node of unstackedCardNodes) {
    const card = cardMap.get(node.id)
    if (!card) continue
    const cat = getCardCategory(card)
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
  }
  // Show categories with 2+ unstacked cards, or 1+ if a stack already exists (merge)
  const stackableCategories = Object.entries(categoryCounts)
    .filter(([cat, count]) => count >= 2 || (count >= 1 && stacks[`stack-${cat}`]))
    .sort(([a], [b]) => a.localeCompare(b))

  // Build list of existing stacks for per-stack unstack entries
  const existingStacks = Object.values(stacks).sort((a, b) =>
    a.category.localeCompare(b.category)
  )

  if (!hasCards) return null

  const btnClass = "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors shadow-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"

  return (
    <>
      <div className="absolute top-3 right-3 z-10 flex gap-2">
        {/* Auto Layout button */}
        <button onClick={handleAutoLayout} className={btnClass}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
          Auto Layout
        </button>

        {/* Stack dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowStackMenu((v) => !v)}
            className={btnClass}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75 6.43 9.75m11.14 0 4.179 2.25L12 17.25 2.25 12l4.179-2.25" />
            </svg>
            Stack
            <svg className={`w-3 h-3 transition-transform ${showStackMenu ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {showStackMenu && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl overflow-hidden z-20">
              {/* Stack All option */}
              {stackableCategories.length > 1 && (
                <>
                  <button
                    onClick={() => { stackByType(); setShowStackMenu(false) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75 6.43 9.75m11.14 0 4.179 2.25L12 17.25 2.25 12l4.179-2.25" />
                    </svg>
                    Stack All
                  </button>
                  <div className="border-t border-gray-200 dark:border-gray-700" />
                </>
              )}

              {/* Per-category options */}
              {stackableCategories.length > 0 ? (
                stackableCategories.map(([cat, count]) => (
                  <button
                    key={cat}
                    onClick={() => { stackByType(cat as CardCategory); setShowStackMenu(false) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getCategoryColor(cat as CardCategory) }}
                    />
                    <span className="flex-1 text-left">{getCategoryLabel(cat as CardCategory)}</span>
                    <span className="text-gray-400 dark:text-gray-500">{count}</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 italic">
                  No stackable types (need 2+ cards of same type)
                </div>
              )}

              {/* Per-stack unstack options */}
              {hasStacks && (
                <>
                  <div className="border-t border-gray-200 dark:border-gray-700" />
                  {existingStacks.map((stack) => (
                    <button
                      key={stack.id}
                      onClick={() => { toggleStack(stack.id); setShowStackMenu(false) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: stack.color }}
                      />
                      <span className="flex-1 text-left">Unstack {getCategoryLabel(stack.category)}</span>
                      <span className="text-gray-400 dark:text-gray-500">{stack.cardIds.length}</span>
                    </button>
                  ))}
                  <div className="border-t border-gray-200 dark:border-gray-700" />
                  <button
                    onClick={() => { unstackAll(); setShowStackMenu(false) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
                    </svg>
                    Unstack All
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Clear Canvas button */}
        <button
          onClick={onClearRequest}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors shadow-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:border-red-300 dark:hover:border-red-500/30"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
          Clear Canvas
        </button>
      </div>
    </>
  )
}

export function CanvasPanel() {
  const { nodes, edges, onNodesChange, onEdgesChange } = useCanvas()
  const mode = useThemeStore((s) => s.mode)
  const isDark = mode === 'dark'
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const clearCanvas = useCanvasStore((s) => s.clearCanvas)

  return (
    <div className="h-full w-full relative">
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
          size={1.5}
          color={isDark ? '#6b7280' : '#9ca3af'}
        />
        <Controls position="bottom-right" />
        <MiniMap
          position="bottom-left"
          nodeColor="#3b82f6"
          maskColor={isDark ? 'rgba(14, 17, 25, 0.8)' : 'rgba(255,255,255,0.7)'}
          style={{
            backgroundColor: isDark ? '#1a202c' : '#f1f5f9',
            border: isDark ? '2px solid #d1d5db' : '2px solid #9ca3af',
          }}
        />

        <CanvasToolbar onClearRequest={() => setShowClearConfirm(true)} />

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

      {/* Clear canvas confirmation — scoped to canvas area only */}
      {showClearConfirm && (
        <div
          className="absolute inset-0 z-[100] flex items-center justify-center"
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
        </div>
      )}
    </div>
  )
}
