export interface ClearFiltersButtonProps {
  onClick: () => void
  className?: string
  title?: string
  disabled?: boolean
  /** Optional badge when filters are active (e.g. lab test filter count). */
  activeCount?: number
}

/**
 * Clear-filters control — removed by request. Kept as a no-op so existing call sites
 * don't need touching; renders nothing.
 */
export function ClearFiltersButton(_props: ClearFiltersButtonProps) {
  return null
}
