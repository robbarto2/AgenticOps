import { useCallback } from 'react'
import { useChatStore } from '../store/chatSlice'
import { useCanvasStore } from '../store/canvasSlice'
import { useWebSocket } from './useWebSocket'
import type { WebSocketInEvent, AgentStartData, ToolCallData, CardData } from '../types/websocket'
import type { AnyCard } from '../types/card'
import type { TableData } from '../types/chat'

export function useChat() {
  const {
    addMessage,
    appendToLastAssistant,
    attachTableData,
    setActiveAgent,
    addToolCall,
    updateToolCall,
    setProcessing,
    clearToolCalls,
  } = useChatStore()
  const addCard = useCanvasStore((s) => s.addCard)

  const handleMessage = useCallback(
    (event: WebSocketInEvent) => {
      switch (event.type) {
        case 'agent_start': {
          const data = event.data as AgentStartData
          setActiveAgent(data.agent)
          clearToolCalls()
          break
        }

        case 'tool_call': {
          const data = event.data as ToolCallData
          if (data.status === 'running') {
            addToolCall(data)
          } else {
            updateToolCall(data.tool, data.status)
          }
          break
        }

        case 'text': {
          const text = event.data as string
          appendToLastAssistant(text)
          break
        }

        case 'card': {
          const cardData = event.data as CardData
          addCard(cardData as AnyCard)
          break
        }

        case 'table_data': {
          const tableData = event.data as TableData
          console.log('[useChat] Received table_data event:', tableData?.table_id, 'rows:', tableData?.rows?.length)
          attachTableData(tableData)
          break
        }

        case 'done': {
          setActiveAgent(null)
          setProcessing(false)
          clearToolCalls()
          break
        }

        case 'error': {
          const errData = event.data as { message: string } | null
          appendToLastAssistant(
            `\n\n_Error: ${errData?.message ?? 'Unknown error'}_`
          )
          break
        }
      }
    },
    [addMessage, appendToLastAssistant, attachTableData, setActiveAgent, addToolCall, updateToolCall, setProcessing, clearToolCalls, addCard]
  )

  const { sendMessage: wsSend, sendStop: wsStop } = useWebSocket(handleMessage)

  const sendMessage = useCallback(
    (content: string) => {
      addMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      })
      setProcessing(true)
      wsSend(content)
    },
    [addMessage, setProcessing, wsSend]
  )

  const stopProcessing = useCallback(() => {
    wsStop()
    setProcessing(false)
    setActiveAgent(null)
    clearToolCalls()
  }, [wsStop, setProcessing, setActiveAgent, clearToolCalls])

  return { sendMessage, stopProcessing }
}
