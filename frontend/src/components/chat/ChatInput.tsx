import { useState, useCallback } from 'react'
import { useChatStore } from '../../store/chatSlice'

interface Props {
  onSend: (content: string) => void
  onStop: () => void
}

export function ChatInput({ onSend, onStop }: Props) {
  const [value, setValue] = useState('')
  const isProcessing = useChatStore((s) => s.isProcessing)

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed) return

    // Just add to queue - useChat will auto-process
    onSend(trimmed)
    setValue('')
  }, [value, onSend])

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
    <div className="p-3 border-t border-gray-200 dark:border-[#1e2636] bg-white dark:bg-[#0a0d15] transition-colors">
      <div className="flex items-end gap-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your network..."
          rows={1}
          className="flex-1 resize-none bg-gray-100 dark:bg-[#141c2b] border border-gray-300 dark:border-[#263045] rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-200 placeholder:text-gray-500 dark:placeholder:text-gray-500 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/25 transition-colors"
          disabled={false}
        />
        {isProcessing ? (
          <button
            onClick={onStop}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 dark:disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Send
          </button>
        )}
      </div>
    </div>
  )
}
