import { X } from 'lucide-react'

export interface ClearFiltersButtonProps {
  onClick: () => void
  className?: string
  title?: string
  disabled?: boolean
  /** Optional badge when filters are active (e.g. lab test filter count). */
  activeCount?: number
}

/**
 * Clear-filters control — sits at the far right of every filter bar (ml-auto)
 * and resets all of that card's filters.
 */
export function ClearFiltersButton({
  onClick,
  className = '',
  title = 'Clear all filters',
  disabled = false,
  activeCount,
}: ClearFiltersButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`ml-auto inline-flex h-[30px] shrink-0 items-center gap-1 self-end rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      <X className="h-3.5 w-3.5" />
      Clear Filter
      {activeCount ? (
        <span className="rounded-full bg-red-100 px-1.5 text-[10px] font-semibold text-red-700">
          {activeCount}
        </span>
      ) : null}
    </button>
  )
}
