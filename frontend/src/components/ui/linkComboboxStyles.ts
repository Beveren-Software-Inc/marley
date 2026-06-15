/**
 * Shared styles for searchable link / item comboboxes (matches Create Service Request modal).
 * Use for practitioner, patient, template, item, branch, and similar async search fields.
 */

export const linkComboboxInputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-emerald-400/80 focus:outline-none focus:ring-2 focus:ring-emerald-500/25'

/** Tighter vertical padding for dense forms / table rows */
export const linkComboboxInputClassCompact =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-emerald-400/80 focus:outline-none focus:ring-2 focus:ring-emerald-500/25'

/** Room for clear button or chevron on the right */
export const linkComboboxInputWithClearClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-emerald-400/80 focus:outline-none focus:ring-2 focus:ring-emerald-500/25'

/** Dropdown under the input — z-50 works inside most modals */
export const linkComboboxDropdownClass =
  'absolute z-50 mt-1.5 w-full max-h-56 overflow-y-auto rounded-xl border border-emerald-200/80 bg-white py-1 text-slate-900 shadow-lg ring-1 ring-emerald-300/40'

/** Compact height for table-row item pickers */
export const linkComboboxDropdownClassLow =
  'absolute z-50 mt-1.5 w-full max-h-40 overflow-y-auto rounded-xl border border-emerald-200/80 bg-white py-1 text-slate-900 shadow-lg ring-1 ring-emerald-300/40'

export const linkComboboxDropdownClassTall =
  'absolute z-50 mt-1.5 w-full max-h-60 overflow-y-auto rounded-xl border border-emerald-200/80 bg-white py-1 text-slate-900 shadow-lg ring-1 ring-emerald-300/40'

/** Shorter panel (e.g. patient picker in a tight modal) */
export const linkComboboxDropdownClassShort =
  'absolute z-50 mt-1.5 w-full max-h-48 overflow-y-auto rounded-xl border border-emerald-200/80 bg-white py-1 text-slate-900 shadow-lg ring-1 ring-emerald-300/40'

/** Option row / button inside the dropdown */
export const linkComboboxOptionClass =
  'w-full border-b border-slate-50 px-3 py-2.5 text-left text-sm transition last:border-0 hover:bg-emerald-50/80 focus:bg-emerald-50/80 focus:outline-none'

export const linkComboboxOptionClassCompact =
  'w-full px-3 py-2 text-left text-sm transition hover:bg-emerald-50/80 focus:bg-emerald-50/80 focus:outline-none'

/** Input when the modal uses dark surfaces (insurance, etc.) */
export const linkComboboxInputDarkSurfaceClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-emerald-400/80 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-400 dark:focus:border-emerald-500/50 dark:focus:ring-emerald-500/25'

/** Dropdown on dark-surface modals */
export const linkComboboxDropdownDarkSurfaceClass =
  'absolute z-50 mt-1.5 w-full max-h-52 overflow-y-auto rounded-xl border border-emerald-200/80 bg-white py-1 text-slate-900 shadow-lg ring-1 ring-emerald-300/40 dark:border-emerald-800/40 dark:bg-slate-800 dark:text-white dark:ring-emerald-900/25'

export const linkComboboxDropdownDarkSurfaceClassTight =
  'absolute z-50 mt-1.5 w-full max-h-44 overflow-y-auto rounded-xl border border-emerald-200/80 bg-white py-1 text-slate-900 shadow-lg ring-1 ring-emerald-300/40 dark:border-emerald-800/40 dark:bg-slate-800 dark:text-white dark:ring-emerald-900/25'

export const linkComboboxOptionDarkSurfaceClass =
  'w-full px-3 py-2 text-left text-sm text-slate-900 transition hover:bg-emerald-50/80 focus:bg-emerald-50/80 focus:outline-none dark:text-white dark:hover:bg-emerald-950/35 dark:focus:bg-emerald-950/35'

/** Empty-state panel under link search */
export const linkComboboxEmptyPanelClass =
  'absolute z-50 mt-1.5 w-full rounded-xl border border-emerald-200/80 bg-white py-2 px-3 text-xs text-slate-500 shadow-lg ring-1 ring-emerald-300/40'
