import { useCallback, useEffect, useRef } from 'react'
import { useChatStore } from '../store/chatSlice'
import { useCanvasStore } from '../store/canvasSlice'
import { useWebSocket } from './useWebSocket'
import type { WebSocketInEvent, AgentStartData, ToolCallData, CardData, AgentPlanData, ConfirmationRequestData } from '../types/websocket'
import type { AnyCard } from '../types/card'
import type { TableData } from '../types/chat'

// Timeout after 2 minutes of no response
const RESPONSE_TIMEOUT_MS = 120000

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
    setAgentPlan,
    setPendingConfirmation,
  } = useChatStore()
  const addCard = useCanvasStore((s) => s.addCard)
  const responseTimeoutRef = useRef<ReturnType<typeof setTimeout>>()

  const handleMessage = useCallback(
    (event: WebSocketInEvent) => {
      // Clear timeout on any message
      if (responseTimeoutRef.current) {
        clearTimeout(responseTimeoutRef.current)
        responseTimeoutRef.current = undefined
      }

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

        case 'agent_plan': {
          const data = event.data as AgentPlanData
          setAgentPlan(data.plan, data.step)
          break
        }

        case 'confirmation_request': {
          const data = event.data as ConfirmationRequestData
          setPendingConfirmation({ description: data.description, agent: data.agent })
          break
        }

        case 'done': {
          clearToolCalls()
          setActiveAgent(null)
          setProcessing(false)
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
    [addMessage, appendToLastAssistant, attachTableData, setActiveAgent, addToolCall, updateToolCall, setProcessing, clearToolCalls, addCard, setAgentPlan, setPendingConfirmation]
  )

  const { sendMessage: wsSend, sendStop: wsStop, sendRaw } = useWebSocket(handleMessage)

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

      // Set timeout to detect backend hanging
      responseTimeoutRef.current = setTimeout(() => {
        appendToLastAssistant(
          '\n\n⚠️ **Backend Timeout**: No response received after 2 minutes. The backend may be unresponsive. Please check if the backend is running or restart it.'
        )
        setProcessing(false)
        setActiveAgent(null)
        clearToolCalls()
      }, RESPONSE_TIMEOUT_MS)
    },
    [addMessage, setProcessing, wsSend, appendToLastAssistant, setActiveAgent, clearToolCalls]
  )

  const sendConfirmation = useCallback(
    (approved: boolean) => {
      setPendingConfirmation(null)
      if (approved) {
        setProcessing(true)
      }
      sendRaw({
        type: 'confirmation_response',
        approved,
        session_id: 'default',
      })
    },
    [setPendingConfirmation, setProcessing, sendRaw]
  )

  const stopProcessing = useCallback(() => {
    wsStop()
    setProcessing(false)
    setActiveAgent(null)
    clearToolCalls()
    if (responseTimeoutRef.current) {
      clearTimeout(responseTimeoutRef.current)
      responseTimeoutRef.current = undefined
    }
  }, [wsStop, setProcessing, setActiveAgent, clearToolCalls])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (responseTimeoutRef.current) {
        clearTimeout(responseTimeoutRef.current)
      }
    }
  }, [])

  // Connection status is shown in the top bar indicator, no need for chat messages

  return { sendMessage, sendConfirmation, stopProcessing }
}
