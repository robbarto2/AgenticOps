import ReactMarkdown from 'react-markdown'
import { formatTimestamp, agentDisplayName } from '../../utils/formatters'
import type { ChatMessage as ChatMessageType } from '../../types/chat'

interface Props {
  message: ChatMessageType
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user'

  return (
    <div className={`px-4 py-3 ${isUser ? 'bg-gray-900/30' : 'bg-transparent'}`}>
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
            isUser
              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
          }`}
        >
          {isUser ? 'U' : 'A'}
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-gray-300">
              {isUser ? 'You' : 'AgenticOps'}
            </span>
            {message.agentName && (
              <span className="text-xs px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">
                {agentDisplayName(message.agentName)}
              </span>
            )}
            <span className="text-xs text-gray-600">
              {formatTimestamp(message.timestamp)}
            </span>
          </div>

          {/* Content */}
          <div className="text-sm text-gray-300 prose prose-invert prose-sm max-w-none">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  )
}
