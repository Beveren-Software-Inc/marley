import { FilterX } from 'lucide-react'

export interface ClearFiltersButtonProps {
  onClick: () => void
  className?: string
  title?: string
  disabled?: boolean
  /** Optional badge when filters are active (e.g. lab test filter count). */
  activeCount?: number
}

/**
 * Icon-only control to reset listing filters. Use in filter bars instead of text links.
 */
export function ClearFiltersButton({
  onClick,
  className = '',
  title = 'Clear filters',
  disabled = false,
  activeCount,
}: ClearFiltersButtonProps) {
  const showBadge = activeCount != null && activeCount > 0

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'No filters applied' : title}
      aria-label={disabled ? 'No filters applied' : title}
      className={`relative inline-flex shrink-0 items-center justify-center self-end w-8 h-8 rounded-md border border-slate-300 bg-slate-50 text-slate-600 transition-colors ${
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : 'hover:bg-slate-100 hover:text-slate-900'
      } ${className}`}
    >
      <FilterX className="w-4 h-4" strokeWidth={2} />
      {showBadge ? (
        <span className="absolute -top-1 -right-1 inline-flex min-w-[1rem] h-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-white">
          {activeCount > 9 ? '9+' : activeCount}
        </span>
      ) : null}
    </button>
  )
}
