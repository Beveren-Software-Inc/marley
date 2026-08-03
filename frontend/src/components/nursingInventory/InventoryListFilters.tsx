import type { ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import { DateFilterInput } from '../ui/DateFilterInput'

export const FILTER_SELECT_CLASS =
  'py-2 px-3 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white text-slate-700 min-w-[140px]'

export const FILTER_INPUT_CLASS =
  'w-full py-2 px-3 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary'

export function FilterToggleButton({
  active,
  onClick,
}: {
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border p-1.5 transition-colors ${
        active ? 'border-primary bg-primary/10 text-primary' : 'border-slate-300 text-slate-500 hover:bg-slate-50'
      }`}
      title={active ? 'Hide filters' : 'Show filters'}
      aria-label={active ? 'Hide filters' : 'Show filters'}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
        />
      </svg>
    </button>
  )
}

export function InventoryFilterBar({
  children,
  onClear,
  hasActiveFilters,
}: {
  children: ReactNode
  onClear?: () => void
  hasActiveFilters?: boolean
}) {
  return (
    <div className="card-filter-bar mb-4 flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-slate-50/80 px-3 py-3">
      {children}
      {hasActiveFilters && onClear ? <ClearFiltersButton onClick={onClear} /> : null}
    </div>
  )
}

export function FilterSearchInput({
  value,
  onChange,
  placeholder,
  className = 'relative flex-1 min-w-[180px]',
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  className?: string
}) {
  return (
    <div className={className}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${FILTER_INPUT_CLASS} pl-8 pr-8`}
        data-search-icon
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  )
}

export function FilterDateField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="min-w-[150px]">
      <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
      <DateFilterInput value={value} onChange={(e) => onChange(e.target.value)} className={FILTER_INPUT_CLASS} />
    </div>
  )
}

export function FilterSelectField({
  label,
  value,
  onChange,
  options,
  placeholder = 'All',
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ name: string; label: string }>
  placeholder?: string
  className?: string
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={FILTER_SELECT_CLASS}>
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.name} value={option.name}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function normalizeDate(value?: string): string {
  if (!value) return ''
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return trimmed.slice(0, 10)
  return parsed.toISOString().slice(0, 10)
}

export function matchesDateRange(dateValue: string | undefined, dateFrom: string, dateTo: string): boolean {
  if (!dateFrom && !dateTo) return true
  const normalized = normalizeDate(dateValue)
  if (!normalized) return false
  if (dateFrom && normalized < dateFrom) return false
  if (dateTo && normalized > dateTo) return false
  return true
}

export function matchesTextQuery(haystack: string | undefined, query: string): boolean {
  if (!query.trim()) return true
  return (haystack || '').toLowerCase().includes(query.trim().toLowerCase())
}

export function matchesAnyItemQuery(
  items: Array<{ item_code?: string; item_name?: string }> | undefined,
  query: string,
): boolean {
  if (!query.trim()) return true
  const q = query.trim().toLowerCase()
  return (items || []).some(
    (item) =>
      (item.item_code || '').toLowerCase().includes(q) ||
      (item.item_name || '').toLowerCase().includes(q),
  )
}

export function collectUniqueStrings(values: Array<string | undefined | null>): Array<{ name: string; label: string }> {
  const seen = new Set<string>()
  const out: Array<{ name: string; label: string }> = []
  for (const value of values) {
    const name = (value || '').trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    out.push({ name, label: name })
  }
  return out.sort((a, b) => a.label.localeCompare(b.label))
}
