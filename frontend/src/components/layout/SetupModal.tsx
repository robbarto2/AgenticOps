import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useSettingsStore } from '../../store/settingsSlice'
import { useToastStore } from '../../store/toastSlice'

export function SetupModal() {
  const isOpen = useSettingsStore((s) => s.isOpen)
  const isLoading = useSettingsStore((s) => s.isLoading)
  const runSetup = useSettingsStore((s) => s.runSetup)
  const currentValues = useSettingsStore((s) => s.currentValues)
  const addToast = useToastStore((s) => s.addToast)

  // Org ID is not a secret — pre-fill with the actual value
  const [anthropicKey, setAnthropicKey] = useState('')
  const [merakiKey, setMerakiKey] = useState('')
  const [merakiOrg, setMerakiOrg] = useState(currentValues?.meraki_org_id ?? '')
  const [teToken, setTeToken] = useState('')

  if (!isOpen) return null

  const hasExisting = (masked: string | undefined, typed: string) =>
    typed.trim() !== '' || (masked != null && masked !== '')

  const canSubmit =
    hasExisting(currentValues?.anthropic_api_key, anthropicKey) &&
    hasExisting(currentValues?.meraki_api_key, merakiKey) &&
    hasExisting(currentValues?.meraki_org_id, merakiOrg) &&
    !isLoading

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Send empty string for unchanged fields — backend keeps existing value
    const ok = await runSetup({
      anthropic_api_key: anthropicKey.trim(),
      meraki_api_key: merakiKey.trim(),
      meraki_org_id: merakiOrg.trim(),
      te_token: teToken.trim() || undefined,
    })
    if (ok) {
      addToast('Setup complete — MCP servers connected.', 'success')
    } else {
      const error = useSettingsStore.getState().error
      addToast(error || 'Setup failed.', 'error')
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg mx-4 bg-white dark:bg-[#0f1320] border border-gray-200 dark:border-[#1e2636] rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Welcome to AgenticOps
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Configure your API keys to get started.
          </p>
        </div>

        {/* Fields */}
        <div className="px-6 space-y-4">
          <Field
            label="Claude API Key"
            required
            type="password"
            value={anthropicKey}
            onChange={setAnthropicKey}
            placeholder={currentValues?.anthropic_api_key}
            hint="From console.anthropic.com → API Keys"
          />
          <Field
            label="Meraki API Key"
            required
            type="password"
            value={merakiKey}
            onChange={setMerakiKey}
            placeholder={currentValues?.meraki_api_key}
            hint="Dashboard → My Profile → API access"
          />
          <Field
            label="Meraki Organization ID"
            required
            type="text"
            value={merakiOrg}
            onChange={setMerakiOrg}
            placeholder={currentValues?.meraki_org_id}
            hint="Dashboard → Organization → Settings (numeric ID in the URL)"
          />
          <Field
            label="ThousandEyes Token"
            type="password"
            value={teToken}
            onChange={setTeToken}
            placeholder={currentValues?.te_token}
            hint="Optional — enables ThousandEyes integration"
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-5 mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => useSettingsStore.getState().setOpen(false)}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading && <Spinner />}
            {isLoading ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------------------ */
/* Internal helpers                                                    */
/* ------------------------------------------------------------------ */

function Field({
  label,
  required,
  type = 'text',
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string
  required?: boolean
  type?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || undefined}
        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-[#2a3348] bg-white dark:bg-[#141820] text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
        autoComplete="off"
      />
      {hint && (
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{hint}</p>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}
