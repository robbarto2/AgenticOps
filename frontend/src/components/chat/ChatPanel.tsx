import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useChatStore } from '../../store/chatSlice'
import type { ChatMode } from '../../store/chatSlice'
import { useChat } from '../../hooks/useChat'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { AgentIndicator } from './AgentIndicator'
import { ConfirmationModal } from './ConfirmationModal'
import { PromptQueue } from './PromptQueue'

const CHAT_MODES: { mode: ChatMode; label: string; description: string; icon: JSX.Element }[] = [
  {
    mode: 'docked',
    label: 'Docked',
    description: 'Side-by-side with canvas',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="10" y1="3" x2="10" y2="21" />
      </svg>
    ),
  },
  {
    mode: 'floating',
    label: 'Floating Window',
    description: 'Draggable window over canvas',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="2" width="20" height="20" rx="2" />
        <rect x="8" y="8" width="14" height="14" rx="2" fill="currentColor" fillOpacity="0.15" />
      </svg>
    ),
  },
  {
    mode: 'fullscreen',
    label: 'Full Screen',
    description: 'Chat fills entire screen',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
      </svg>
    ),
  },
]

interface ChatPanelProps {
  onHeaderMouseDown?: (e: React.MouseEvent) => void
}

export function ChatPanel({ onHeaderMouseDown }: ChatPanelProps = {}) {
  const messages = useChatStore((s) => s.messages)
  const pendingPrompt = useChatStore((s) => s.pendingPrompt)
  const setPendingPrompt = useChatStore((s) => s.setPendingPrompt)
  const clearMessages = useChatStore((s) => s.clearMessages)
  const chatMode = useChatStore((s) => s.chatMode)
  const setChatMode = useChatStore((s) => s.setChatMode)
  const { sendMessage, stopProcessing } = useChat()
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showModePicker, setShowModePicker] = useState(false)
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
    <div className="flex flex-col h-full bg-gray-50 dark:bg-[#0c0f18] transition-colors">
      {/* Header */}
      <div
        className={`px-4 py-3 border-b border-gray-200 dark:border-[#1e2636] flex items-center justify-between${onHeaderMouseDown ? ' cursor-move' : ''}`}
        onMouseDown={onHeaderMouseDown}
      >
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-300">Chat</h2>
        <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
          {/* Mode Picker */}
          <div className="relative">
            <button
              onClick={() => setShowModePicker((v) => !v)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#141820] rounded transition-colors cursor-pointer"
              title="Change chat layout"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="10" y1="3" x2="10" y2="21" />
              </svg>
            </button>

            {showModePicker && (
              <>
                {/* Backdrop to close on outside click */}
                <div className="fixed inset-0 z-40" onClick={() => setShowModePicker(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-white dark:bg-[#111827] border border-gray-200 dark:border-[#1e2636] rounded-lg shadow-xl overflow-hidden">
                  {CHAT_MODES.map(({ mode, label, description, icon }) => (
                    <button
                      key={mode}
                      onClick={() => {
                        setChatMode(mode)
                        setShowModePicker(false)
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer ${
                        chatMode === mode
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#141820]'
                      }`}
                    >
                      <span className={chatMode === mode ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'}>{icon}</span>
                      <div className="min-w-0">
                        <div className="text-xs font-medium">{label}</div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-500">{description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* New Chat Button */}
          <button
            onClick={() => messages.length > 0 && setShowClearConfirm(true)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
              messages.length > 0
                ? 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#141820] cursor-pointer'
                : 'text-gray-300 dark:text-gray-600 cursor-default'
            }`}
            title="New chat"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
          </button>
        </div>
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
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Ask about your network</p>
            <p className="text-xs text-gray-500 dark:text-gray-500">
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

      {/* Remediation Confirmation */}
      <ConfirmationModal />

      {/* Prompt Queue */}
      <PromptQueue onStopProcessing={stopProcessing} />

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
            className="relative bg-white dark:bg-[#111827] border border-gray-200 dark:border-[#1e2636] rounded-xl shadow-2xl w-80 overflow-hidden animate-in fade-in zoom-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Warning icon + message */}
            <div className="px-5 pt-5 pb-4 text-center">
              <div className="mx-auto w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-200 mb-1">Clear chat history?</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                This will remove all messages from the chat. Cards on the canvas will not be affected.
              </p>
            </div>

            {/* Actions */}
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
