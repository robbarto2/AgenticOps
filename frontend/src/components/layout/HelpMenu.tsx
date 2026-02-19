import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useChatStore } from '../../store/chatSlice'

interface PromptCategory {
  label: string
  source: 'meraki' | 'thousandeyes'
  prompts: string[]
}

const PROMPT_CATEGORIES: PromptCategory[] = [
  {
    label: 'Discovery',
    source: 'meraki',
    prompts: [
      'Show me an organizational summary',
      'List all my networks',
      'List all devices across the organization',
      'Show me all connected clients across all networks in the organization',
      'Show organization-wide network health',
      'Show organization license info',
      'What devices are offline across the organization?',
      'Display device inventory by model across the organization',
      'Show all access points and their status across the organization',
      'List all switches in the organization',
      'List all SSIDs across all networks',
    ],
  },
  {
    label: 'Troubleshooting',
    source: 'meraki',
    prompts: [
      'Check WAN uplink status across all networks',
      'Are there any network events in the last hour across all networks?',
      'Have any WAN uplinks failed over or changed in the last 24 hours?',
      'Which devices are in an alerting state across the organization?',
      'Are there any devices across the organization with repeated connectivity loss events?',
    ],
  },
  {
    label: 'Security',
    source: 'meraki',
    prompts: [
      'Review firewall rules across all networks',
      'Show security events from the last 24 hours across the organization',
      'Check for overly permissive firewall rules',
      'Are there any switch port security violations across the organization?',
      'Audit content filtering settings across networks',
    ],
  },
  {
    label: 'Compliance',
    source: 'meraki',
    prompts: [
      'Audit SSID configurations across all networks',
      'What is the firmware status across all devices?',
      'Check VLAN configurations across all networks',
      'Review switch port configurations across the organization',
    ],
  },
  {
    label: 'Monitoring',
    source: 'thousandeyes',
    prompts: [
      'What ThousandEyes tests are currently running?',
      'Are there any active ThousandEyes alerts?',
      'Show me recent ThousandEyes test failures',
      'Which monitored tests have the highest latency right now?',
      'List all ThousandEyes Enterprise Agent statuses',
    ],
  },
  {
    label: 'Path Analysis',
    source: 'thousandeyes',
    prompts: [
      'Show me network path analysis for all running tests',
      'Are there any BGP route changes in the last 24 hours?',
      'Are there any routing anomalies detected?',
      'Check ISP performance metrics',
    ],
  },
]

const MERAKI_CATEGORIES = PROMPT_CATEGORIES.filter((c) => c.source === 'meraki')
const TE_CATEGORIES = PROMPT_CATEGORIES.filter((c) => c.source === 'thousandeyes')

export function HelpMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const setPendingPrompt = useChatStore((s) => s.setPendingPrompt)

  const updatePosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropdownPos({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      })
    }
  }, [])

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => {
      if (!prev) updatePosition()
      return !prev
    })
  }, [updatePosition])

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        menuRef.current && !menuRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const handleSelect = (prompt: string) => {
    setPendingPrompt(prompt)
    setIsOpen(false)
  }

  const renderSection = (title: string, badge: string, badgeColor: string, categories: PromptCategory[]) => (
    <div>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-800">
        <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${badgeColor}`}>
          {badge}
        </span>
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{title}</span>
      </div>
      {categories.map((category) => (
        <div key={category.label}>
          <div className="px-3 py-1.5">
            <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">
              {category.label}
            </span>
          </div>
          {category.prompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => handleSelect(prompt)}
              className="w-full text-left px-4 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              {prompt}
            </button>
          ))}
        </div>
      ))}
    </div>
  )

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors cursor-pointer ${
          isOpen
            ? 'text-blue-500 dark:text-blue-400 bg-blue-500/10 border-blue-500/30'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-800/60 hover:bg-gray-200 dark:hover:bg-gray-800 border-gray-300 dark:border-gray-700'
        }`}
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M12 18h.01" />
        </svg>
        Quick Actions
        <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && createPortal(
        <div
          ref={menuRef}
          className="fixed w-80 max-h-[75vh] overflow-y-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-2xl z-[100]"
          style={{ top: dropdownPos.top, right: dropdownPos.right }}
        >
          {renderSection('Meraki', 'Meraki', 'bg-blue-500/20 text-blue-400', MERAKI_CATEGORIES)}
          <div className="border-t border-gray-200 dark:border-gray-700" />
          {renderSection('ThousandEyes', 'TE', 'bg-purple-500/20 text-purple-400', TE_CATEGORIES)}
        </div>,
        document.body
      )}
    </>
  )
}
