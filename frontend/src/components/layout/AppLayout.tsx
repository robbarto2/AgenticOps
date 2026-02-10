import { useState, useCallback } from 'react'
import { TopBar } from './TopBar'
import { ChatPanel } from '../chat/ChatPanel'
import { CanvasPanel } from '../canvas/CanvasPanel'
const DEFAULT_WIDTH = 400
const EXPANDED_RATIO = 0.5

export function AppLayout() {
  const [chatWidth, setChatWidth] = useState(DEFAULT_WIDTH)
  const [isDragging, setIsDragging] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const handleMouseDown = useCallback(() => {
    setIsDragging(true)
    setIsExpanded(false)
  }, [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return
      const maxWidth = Math.round(window.innerWidth * 0.8)
      const newWidth = Math.max(300, Math.min(maxWidth, e.clientX))
      setChatWidth(newWidth)
    },
    [isDragging]
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev
      setChatWidth(next ? Math.round(window.innerWidth * EXPANDED_RATIO) : DEFAULT_WIDTH)
      return next
    })
  }, [])

  return (
    <div
      className="flex flex-col h-screen bg-gray-950"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        {/* Chat Panel */}
        <div
          className="flex-shrink-0 border-r border-gray-800"
          style={{ width: chatWidth }}
        >
          <ChatPanel />
        </div>

        {/* Drag Handle */}
        <div
          className={`relative w-1 cursor-col-resize transition-colors hover:bg-blue-500/50 ${
            isDragging ? 'bg-blue-500/50' : 'bg-gray-800'
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
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 left-1/2 z-10 w-5 h-8 flex items-center justify-center bg-gray-800 border border-gray-700 rounded text-gray-400 hover:text-blue-400 hover:border-blue-500/50 transition-colors"
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
    </div>
  )
}
