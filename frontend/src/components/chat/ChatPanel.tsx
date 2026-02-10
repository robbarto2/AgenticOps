import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useChatStore } from '../../store/chatSlice'
import { useChat } from '../../hooks/useChat'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { AgentIndicator } from './AgentIndicator'

export function ChatPanel() {
  const messages = useChatStore((s) => s.messages)
  const pendingPrompt = useChatStore((s) => s.pendingPrompt)
  const setPendingPrompt = useChatStore((s) => s.setPendingPrompt)
  const clearMessages = useChatStore((s) => s.clearMessages)
  const { sendMessage, stopProcessing } = useChat()
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (pendingPrompt) {
      sendMessage(pendingPrompt)
      setPendingPrompt(null)
    }
  }, [pendingPrompt, sendMessage, setPendingPrompt])

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300">Chat</h2>
        {messages.length > 0 && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors cursor-pointer"
            title="Clear chat history"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="w-12 h-12 mb-4 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
              <svg className="w-6 h-6 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
              </svg>
            </div>
            <p className="text-sm text-gray-400 mb-2">Ask about your network</p>
            <p className="text-xs text-gray-600">
              Try: "Show me all networks" or "Why is WiFi slow?"
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Agent Indicator */}
      <AgentIndicator />

      {/* Input */}
      <ChatInput onSend={sendMessage} onStop={stopProcessing} />

      {/* Clear confirmation modal */}
      {showClearConfirm && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          onClick={() => setShowClearConfirm(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Dialog */}
          <div
            className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-80 overflow-hidden animate-in fade-in zoom-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Warning icon + message */}
            <div className="px-5 pt-5 pb-4 text-center">
              <div className="mx-auto w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-200 mb-1">Clear chat history?</h3>
              <p className="text-xs text-gray-400">
                This will remove all messages from the chat. Cards on the canvas will not be affected.
              </p>
            </div>

            {/* Actions */}
            <div className="flex border-t border-gray-800">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <div className="w-px bg-gray-800" />
              <button
                onClick={() => {
                  clearMessages()
                  setShowClearConfirm(false)
                }}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
