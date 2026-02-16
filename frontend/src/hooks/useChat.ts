import { useCallback, useEffect, useRef } from 'react'
import { useChatStore } from '../store/chatSlice'
import { useCanvasStore } from '../store/canvasSlice'
import { useQueueStore } from '../store/queueSlice'
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
  const getNextPending = useQueueStore((s) => s.getNextPending)
  const setPromptStatus = useQueueStore((s) => s.setPromptStatus)
  const responseTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const processingPromptIdRef = useRef<string | null>(null)

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

          // Mark current prompt as completed and show elapsed time
          if (processingPromptIdRef.current) {
            const prompt = useQueueStore.getState().queue.find((p) => p.id === processingPromptIdRef.current)

            if (prompt?.startedAt) {
              const elapsedMs = Date.now() - prompt.startedAt
              const elapsedSec = (elapsedMs / 1000).toFixed(1)
              appendToLastAssistant(`\n\n_Completed in ${elapsedSec}s_`)
            }

            setPromptStatus(processingPromptIdRef.current, 'completed')
            processingPromptIdRef.current = null
          }
          // Next prompt will be auto-processed by useEffect
          break
        }

        case 'error': {
          const errData = event.data as { message: string } | null
          appendToLastAssistant(
            `\n\n_Error: ${errData?.message ?? 'Unknown error'}_`
          )

          // Mark current prompt as error
          if (processingPromptIdRef.current) {
            setPromptStatus(processingPromptIdRef.current, 'error')
            processingPromptIdRef.current = null
          }
          setProcessing(false)
          // Next prompt will be auto-processed by useEffect
          break
        }
      }
    },
    [addMessage, appendToLastAssistant, attachTableData, setActiveAgent, addToolCall, updateToolCall, setProcessing, clearToolCalls, addCard, setAgentPlan, setPendingConfirmation, setPromptStatus]
  )

  const { sendMessage: wsSend, sendStop: wsStop, sendRaw } = useWebSocket(handleMessage)

  // Process a prompt from the queue
  const processPrompt = useCallback(
    (promptId: string, content: string) => {
      processingPromptIdRef.current = promptId
      setPromptStatus(promptId, 'processing')

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
        if (processingPromptIdRef.current) {
          setPromptStatus(processingPromptIdRef.current, 'error')
          processingPromptIdRef.current = null
        }
      }, RESPONSE_TIMEOUT_MS)
    },
    [addMessage, setProcessing, wsSend, appendToLastAssistant, setActiveAgent, clearToolCalls, setPromptStatus]
  )

  // Auto-process next prompt from queue when idle
  const isProcessing = useChatStore((s) => s.isProcessing)
  const queueLength = useQueueStore((s) => s.queue.length)
  useEffect(() => {
    if (!isProcessing && !processingPromptIdRef.current) {
      const nextPrompt = getNextPending()
      if (nextPrompt) {
        processPrompt(nextPrompt.id, nextPrompt.prompt)
      }
    }
  }, [isProcessing, queueLength, getNextPending, processPrompt])

  // Legacy sendMessage for backward compatibility (adds to queue)
  const sendMessage = useCallback(
    (content: string) => {
      useQueueStore.getState().addPrompt(content)
      // Processing will be triggered by the useEffect above
    },
    []
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
    // Mark current prompt as cancelled
    if (processingPromptIdRef.current) {
      setPromptStatus(processingPromptIdRef.current, 'cancelled')
      processingPromptIdRef.current = null
    }
    // Cancel all pending prompts in the queue
    useQueueStore.getState().cancelAllPending()
  }, [wsStop, setProcessing, setActiveAgent, clearToolCalls, setPromptStatus])

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
