import { useState, useCallback } from 'react'
import { TopBar } from './TopBar'
import { ChatPanel } from '../chat/ChatPanel'
import { CanvasPanel } from '../canvas/CanvasPanel'

export function AppLayout() {
  const [chatWidth, setChatWidth] = useState(400)
  const [isDragging, setIsDragging] = useState(false)

  const handleMouseDown = useCallback(() => {
    setIsDragging(true)
  }, [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return
      const newWidth = Math.max(300, Math.min(600, e.clientX))
      setChatWidth(newWidth)
    },
    [isDragging]
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
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
          className={`w-1 cursor-col-resize transition-colors hover:bg-blue-500/50 ${
            isDragging ? 'bg-blue-500/50' : 'bg-gray-800'
          }`}
          onMouseDown={handleMouseDown}
        />

        {/* Canvas Panel */}
        <div className="flex-1 min-w-0">
          <CanvasPanel />
        </div>
      </div>
    </div>
  )
}
