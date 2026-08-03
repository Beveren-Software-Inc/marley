import { Plus, Trash2 } from 'lucide-react'

export type PaymentModeLine = {
  id: string
  mode_of_payment: string
  amount: string
  reference_no: string
}

export function newPaymentModeLine(defaultMode = ''): PaymentModeLine {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mode_of_payment: defaultMode,
    amount: '',
    reference_no: '',
  }
}

export function sumPaymentModeLines(lines: PaymentModeLine[]): number {
  return lines.reduce((sum, line) => {
    const n = parseFloat(line.amount)
    return sum + (Number.isFinite(n) && n > 0 ? n : 0)
  }, 0)
}

export function paymentModesPayload(lines: PaymentModeLine[]) {
  return lines
    .map((line) => ({
      mode_of_payment: (line.mode_of_payment || '').trim(),
      amount: parseFloat(line.amount) || 0,
      reference_no: (line.reference_no || '').trim() || undefined,
    }))
    .filter((line) => line.mode_of_payment && line.amount > 0)
}

export function validatePaymentModeLines(lines: PaymentModeLine[]): string | null {
  const payload = paymentModesPayload(lines)
  if (payload.length === 0) {
    return 'Add at least one mode of payment with an amount greater than zero'
  }
  const modes = new Set<string>()
  for (const line of payload) {
    if (modes.has(line.mode_of_payment)) {
      return `Duplicate mode of payment: ${line.mode_of_payment}. Combine amounts into one line or use different modes.`
    }
    modes.add(line.mode_of_payment)
  }
  return null
}

type PaymentModeLinesProps = {
  modes: string[]
  lines: PaymentModeLine[]
  onChange: (lines: PaymentModeLine[]) => void
  moneyStep?: string | number
  moneyMin?: number
  moneyPlaceholder?: string
  formatMoney?: (n: number) => string
  className?: string
  /** Compact styling for dense slide-over panels */
  compact?: boolean
}

export function PaymentModeLines({
  modes,
  lines,
  onChange,
  moneyStep = '0.001',
  moneyMin = 0,
  moneyPlaceholder = '0.000',
  formatMoney,
  className = '',
  compact = false,
}: PaymentModeLinesProps) {
  const labelClass = compact
    ? 'mb-1 block text-sm font-medium text-emerald-900/90'
    : 'block text-xs font-medium text-slate-600 mb-1.5'
  const inputClass = compact
    ? 'w-full rounded-lg border border-emerald-200/70 bg-white/90 px-3 py-2 text-sm text-emerald-950 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/30'
    : 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white'
  const total = sumPaymentModeLines(lines)

  const updateLine = (id: string, patch: Partial<PaymentModeLine>) => {
    onChange(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)))
  }

  const removeLine = (id: string) => {
    if (lines.length <= 1) return
    onChange(lines.filter((line) => line.id !== id))
  }

  const addLine = () => {
    const unused = modes.find((m) => !lines.some((l) => l.mode_of_payment === m)) || modes[0] || ''
    onChange([...lines, newPaymentModeLine(unused)])
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <label className={labelClass}>
          Modes of payment <span className="text-red-500">*</span>
        </label>
        <button
          type="button"
          onClick={addLine}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add mode
        </button>
      </div>

      <div className="space-y-2">
        {lines.map((line, idx) => (
          <div
            key={line.id}
            className={`grid grid-cols-[1.2fr_0.9fr_1fr_auto] gap-2 rounded-lg border p-2 ${
              compact ? 'border-emerald-200/70 bg-white/70' : 'border-slate-200 bg-slate-50/60'
            }`}
          >
            <div>
              {idx === 0 ? (
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Mode
                </span>
              ) : null}
              <select
                value={line.mode_of_payment}
                onChange={(e) => updateLine(line.id, { mode_of_payment: e.target.value })}
                className={inputClass}
                required
              >
                <option value="">Select…</option>
                {modes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              {idx === 0 ? (
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Amount
                </span>
              ) : null}
              <input
                type="number"
                min={moneyMin}
                step={moneyStep}
                value={line.amount}
                onChange={(e) => updateLine(line.id, { amount: e.target.value })}
                placeholder={moneyPlaceholder}
                className={inputClass}
                required
              />
            </div>
            <div>
              {idx === 0 ? (
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Ref (optional)
                </span>
              ) : null}
              <input
                type="text"
                value={line.reference_no}
                onChange={(e) => updateLine(line.id, { reference_no: e.target.value })}
                placeholder="Cheque / txn"
                className={inputClass}
              />
            </div>
            <div className={`flex items-end ${idx === 0 ? 'pb-0.5' : ''}`}>
              <button
                type="button"
                onClick={() => removeLine(line.id)}
                disabled={lines.length <= 1}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                title="Remove mode"
                aria-label="Remove mode"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className={`text-xs ${compact ? 'text-emerald-900/80' : 'text-slate-600'}`}>
        Total received:{' '}
        <strong>{formatMoney ? formatMoney(total) : total.toFixed(3)}</strong>
        {lines.length > 1 ? (
          <span className="text-slate-500"> — one Payment Entry will be created per mode</span>
        ) : null}
      </p>
    </div>
  )
}
