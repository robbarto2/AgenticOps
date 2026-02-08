import { useState, useCallback } from 'react'
import { useChatStore } from '../../store/chatSlice'

interface Props {
  onSend: (content: string) => void
}

export function ChatInput({ onSend }: Props) {
  const [value, setValue] = useState('')
  const isProcessing = useChatStore((s) => s.isProcessing)

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || isProcessing) return
    onSend(trimmed)
    setValue('')
  }, [value, isProcessing, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <div className="p-3 border-t border-gray-800 bg-gray-900/50">
      <div className="flex items-end gap-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your network..."
          rows={1}
          className="flex-1 resize-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
          disabled={isProcessing}
        />
        <button
          onClick={handleSubmit}
          disabled={isProcessing || !value.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  )
}
