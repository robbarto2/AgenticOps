import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { useCanvasStore } from '../../store/canvasSlice'
import type { CardStack } from '../../store/canvasSlice'
import type { CardCategory } from '../../utils/cardCategories'

function CategoryIcon({ category, color }: { category: CardCategory; color: string }) {
  switch (category) {
    case 'network':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
      )
    case 'org':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
        </svg>
      )
    case 'device':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-13.5-3a3 3 0 0 1 0-6h13.5a3 3 0 1 1 0 6m-13.5 0h13.5" />
        </svg>
      )
    case 'test':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
        </svg>
      )
    case 'alert':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      )
    case 'chart':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
        </svg>
      )
    case 'table':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-8.625 0V7.875c0-.621.504-1.125 1.125-1.125h6.375m0 0h6.375c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125m-13.5-13.5h13.5m-13.5 0V4.875c0-.621.504-1.125 1.125-1.125h11.25c.621 0 1.125.504 1.125 1.125v2.25m0 0V18.375m-2.625-6.375h-6.75" />
        </svg>
      )
    case 'report':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      )
  }
}

function StackNodeInner({ data }: NodeProps) {
  const stack = data as unknown as CardStack
  const toggleStack = useCanvasStore((s) => s.toggleStack)
  const count = stack.cardIds.length

  return (
    <div
      className="relative cursor-pointer select-none"
      onClick={() => toggleStack(stack.id)}
    >
      {/* Shadow layers for stacked effect */}
      <div
        className="absolute top-2 left-1 w-full h-full rounded-lg border border-gray-300/30 dark:border-gray-700/30 bg-gray-200/60 dark:bg-gray-800/60"
        style={{ borderLeftColor: stack.color, borderLeftWidth: 3 }}
      />
      <div
        className="absolute top-1 left-0.5 w-full h-full rounded-lg border border-gray-300/40 dark:border-gray-700/40 bg-gray-100/70 dark:bg-gray-850/70"
        style={{ borderLeftColor: stack.color, borderLeftWidth: 3 }}
      />

      {/* Front card */}
      <div
        className="relative rounded-lg border-2 bg-white dark:bg-gray-900 shadow-lg px-5 py-4"
        style={{ borderColor: `${stack.color}40`, borderLeftColor: stack.color, borderLeftWidth: 4 }}
      >
        <div className="flex items-center gap-3">
          <CategoryIcon category={stack.category} color={stack.color} />
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {stack.label}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {count} {count === 1 ? 'card' : 'cards'} • {stack.expanded ? 'Click to collapse' : 'Click to expand'}
            </div>
          </div>
          <span
            className="flex items-center justify-center text-sm font-bold rounded-full w-8 h-8"
            style={{
              backgroundColor: `${stack.color}20`,
              color: stack.color,
              border: `2px solid ${stack.color}60`,
            }}
          >
            {count}
          </span>
        </div>
      </div>
    </div>
  )
}

export const StackNode = memo(StackNodeInner)
