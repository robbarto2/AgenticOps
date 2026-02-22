import { useState, useCallback, useRef, useEffect } from 'react'
import { TopBar } from './TopBar'
import { ChatPanel } from '../chat/ChatPanel'
import { CanvasPanel } from '../canvas/CanvasPanel'
import { useChatStore } from '../../store/chatSlice'

const DEFAULT_WIDTH = 600
const EXPANDED_RATIO = 0.5

const FLOAT_DEFAULT_W = 420
const FLOAT_DEFAULT_H = 550
const FLOAT_MIN_W = 320
const FLOAT_MIN_H = 350

export function AppLayout() {
  const chatMode = useChatStore((s) => s.chatMode)
  const setChatMode = useChatStore((s) => s.setChatMode)

  // --- Docked split-pane state ---
  const [chatWidth, setChatWidth] = useState(DEFAULT_WIDTH)
  const [isDragging, setIsDragging] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  // --- Floating window state ---
  const [floatingPos, setFloatingPos] = useState({ x: -1, y: -1 })
  const [floatingSize, setFloatingSize] = useState({ w: FLOAT_DEFAULT_W, h: FLOAT_DEFAULT_H })
  const [isDraggingFloat, setIsDraggingFloat] = useState(false)
  const [isResizingFloat, setIsResizingFloat] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const rafDragRef = useRef<number | null>(null)

  // Initialize floating position to bottom-left on first render
  useEffect(() => {
    if (floatingPos.x === -1) {
      setFloatingPos({
        x: 24,
        y: window.innerHeight - FLOAT_DEFAULT_H - 24,
      })
    }
  }, [floatingPos.x])

  // --- Docked drag handlers ---
  const handleMouseDown = useCallback(() => {
    setIsDragging(true)
    setIsExpanded(false)
  }, [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging && !isDraggingFloat && !isResizingFloat) return
      const clientX = e.clientX
      const clientY = e.clientY
      // Throttle via rAF — at most one state update per frame
      if (rafDragRef.current) return
      rafDragRef.current = requestAnimationFrame(() => {
        rafDragRef.current = null
        if (isDragging) {
          const maxWidth = Math.round(window.innerWidth * 0.8)
          setChatWidth(Math.max(300, Math.min(maxWidth, clientX)))
          return
        }
        if (isDraggingFloat) {
          const x = Math.max(0, Math.min(window.innerWidth - floatingSize.w, clientX - dragOffset.current.x))
          const y = Math.max(0, Math.min(window.innerHeight - floatingSize.h, clientY - dragOffset.current.y))
          setFloatingPos({ x, y })
          return
        }
        if (isResizingFloat) {
          const newW = Math.max(FLOAT_MIN_W, clientX - floatingPos.x)
          const newH = Math.max(FLOAT_MIN_H, clientY - floatingPos.y)
          setFloatingSize({ w: newW, h: newH })
        }
      })
    },
    [isDragging, isDraggingFloat, isResizingFloat, floatingSize.w, floatingSize.h, floatingPos.x, floatingPos.y]
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setIsDraggingFloat(false)
    setIsResizingFloat(false)
    if (rafDragRef.current) { cancelAnimationFrame(rafDragRef.current); rafDragRef.current = null }
  }, [])

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev
      setChatWidth(next ? Math.round(window.innerWidth * EXPANDED_RATIO) : DEFAULT_WIDTH)
      return next
    })
  }, [])

  // --- Floating drag start ---
  const handleFloatDragStart = useCallback((e: React.MouseEvent) => {
    setIsDraggingFloat(true)
    dragOffset.current = {
      x: e.clientX - floatingPos.x,
      y: e.clientY - floatingPos.y,
    }
  }, [floatingPos.x, floatingPos.y])

  // --- Floating resize start ---
  const handleFloatResizeStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsResizingFloat(true)
  }, [])

  const anyDragging = isDragging || isDraggingFloat || isResizingFloat

  return (
    <div
      className={`flex flex-col h-screen bg-white dark:bg-[#080b12] transition-colors ${anyDragging ? 'select-none' : ''}`}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <TopBar />

      {/* === DOCKED MODE === */}
      {chatMode === 'docked' && (
        <div className="flex flex-1 overflow-hidden">
          {/* Chat Panel */}
          <div
            className="flex-shrink-0 border-r border-gray-200 dark:border-[#1e2636]"
            style={{ width: chatWidth }}
          >
            <ChatPanel />
          </div>

          {/* Drag Handle */}
          <div
            className={`relative w-1 cursor-col-resize transition-colors hover:bg-blue-500/50 ${
              isDragging ? 'bg-blue-500/50' : 'bg-gray-200 dark:bg-[#1e2636]'
            }`}
            onMouseDown={handleMouseDown}
          >
            {/* Expand/Collapse Toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleExpanded()
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 left-1/2 z-10 w-5 h-8 flex items-center justify-center bg-gray-100 dark:bg-[#141820] border border-gray-300 dark:border-[#1e2636] rounded text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:border-blue-500/50 transition-colors"
              title={isExpanded ? 'Collapse chat panel' : 'Expand chat panel'}
            >
              <svg
                className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Canvas Panel */}
          <div className="flex-1 min-w-0">
            <CanvasPanel />
          </div>
        </div>
      )}

      {/* === FLOATING MODE === */}
      {chatMode === 'floating' && (
        <div className="flex flex-1 overflow-hidden relative">
          {/* Canvas takes full width */}
          <div className="flex-1 min-w-0">
            <CanvasPanel />
          </div>

          {/* Floating chat window */}
          <div
            className="fixed z-30 flex flex-col bg-white dark:bg-[#0c0f18] border-2 border-gray-500 dark:border-gray-300 rounded-xl shadow-2xl overflow-hidden will-change-transform"
            style={{
              transform: `translate3d(${floatingPos.x}px, ${floatingPos.y}px, 0)`,
              left: 0,
              top: 0,
              width: floatingSize.w,
              height: floatingSize.h,
            }}
          >
            {/* Chat content — header is the drag handle */}
            <div className="flex-1 min-h-0">
              <ChatPanel onHeaderMouseDown={handleFloatDragStart} />
            </div>

            {/* Resize handle (bottom-right corner) */}
            <div
              className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
              onMouseDown={handleFloatResizeStart}
            >
              <svg className="w-3 h-3 absolute bottom-0.5 right-0.5 text-gray-400 dark:text-gray-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22 22H20V20H22V22ZM22 18H18V22H22V18ZM22 14H14V22H22V14Z" />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* === FULLSCREEN MODE === */}
      {chatMode === 'fullscreen' && (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1">
            <ChatPanel />
          </div>
          {/* Canvas hidden but not unmounted to preserve state */}
          <div className="hidden">
            <CanvasPanel />
          </div>
        </div>
      )}
    </div>
  )
}
