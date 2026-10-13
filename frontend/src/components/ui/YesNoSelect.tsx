/**
 * Yes/No segmented control for Frappe `Check` fields.
 *
 * The stored value stays 0/1 on the backend; this control lets the clinician pick
 * Yes or No explicitly instead of relying on an unchecked checkbox. A value of ''
 * means "not answered yet" (nothing highlighted). Clicking the active choice clears it.
 * Value helpers live in ./yesNoValue.
 */

import type { YesNoChoice } from './yesNoValue'

interface YesNoSelectProps {
  /** Visible question text. Omit when the label is rendered by the caller. */
  label?: string
  value: YesNoChoice
  onChange: (value: YesNoChoice) => void
  disabled?: boolean
  required?: boolean
  /** Smaller buttons — for inline use next to a section heading. */
  compact?: boolean
  className?: string
  labelClassName?: string
  /** Rendered below the control (e.g. an error or hint). */
  hint?: string
  yesLabel?: string
  noLabel?: string
}

export function YesNoSelect({
  label,
  value,
  onChange,
  disabled = false,
  required = false,
  compact = false,
  className = '',
  labelClassName,
  hint,
  yesLabel = 'Yes',
  noLabel = 'No',
}: YesNoSelectProps) {
  const sizeClass = compact ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm'
  const baseClass = `rounded-md border font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60 ${sizeClass}`
  const idleClass = 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
  const yesClass =
    value === 'yes' ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm' : idleClass
  const noClass = value === 'no' ? 'border-rose-600 bg-rose-600 text-white shadow-sm' : idleClass

  return (
    <div className={className}>
      {label ? (
        <label className={labelClassName ?? 'block text-sm font-medium text-slate-700 mb-1'}>
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      ) : null}
      <div className="inline-flex items-center gap-2" role="group" aria-label={label}>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={value === 'yes'}
          className={`${baseClass} ${yesClass}`}
          onClick={() => onChange(value === 'yes' ? '' : 'yes')}
        >
          {yesLabel}
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={value === 'no'}
          className={`${baseClass} ${noClass}`}
          onClick={() => onChange(value === 'no' ? '' : 'no')}
        >
          {noLabel}
        </button>
      </div>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}
