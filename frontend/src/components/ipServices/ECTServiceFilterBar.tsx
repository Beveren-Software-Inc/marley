import { DateFilterInput } from '../ui/DateFilterInput'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import type { IPServiceCareType } from '../../services/ipServices'

const FILTER_LABEL_CLASS = 'text-xs font-medium text-slate-500 uppercase tracking-wide'
const FILTER_CONTROL_CLASS =
  'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary'

interface ECTServiceFilterBarProps {
  /** ECT session (service) date range (YYYY-MM-DD). From/To default to today on the ECT Service page. */
  dateFrom: string
  dateTo: string
  onDateFromChange: (value: string) => void
  onDateToChange: (value: string) => void
  /** Care type applied to the list: the navbar OP/IP selection unless 'All' was chosen. */
  careType: IPServiceCareType
  /** 'All' shows every care type, ignoring the navbar; null follows the navbar OP/IP selection again. */
  onCareTypeChange: (value: IPServiceCareType | null) => void
  onClear: () => void
}

/**
 * Filter bar for the ECT Service listing (doctor + nurse): From/To service date
 * (the ECT session / Patient Visit encounter date, defaulting to today) plus an
 * "All" toggle. The care type otherwise follows the OP/IP selection in the
 * navbar — "All" is the only override.
 */
export function ECTServiceFilterBar({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  careType,
  onCareTypeChange,
  onClear,
}: ECTServiceFilterBarProps) {
  const allCareTypes = careType === 'All'
  const hasActiveFilters = Boolean(dateFrom || dateTo || allCareTypes)

  return (
    <div className="card-filter-bar mb-3 flex flex-shrink-0 flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className={FILTER_LABEL_CLASS}>From Date</label>
        <DateFilterInput
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className={FILTER_CONTROL_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className={FILTER_LABEL_CLASS}>To Date</label>
        <DateFilterInput
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className={FILTER_CONTROL_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className={FILTER_LABEL_CLASS}>Care Type</label>
        <div className="flex h-[30px] overflow-hidden rounded-md border border-slate-300 bg-white">
          <button
            type="button"
            onClick={() => onCareTypeChange(allCareTypes ? null : 'All')}
            aria-pressed={allCareTypes}
            title={
              allCareTypes
                ? 'Showing all care types — click to follow the OP/IP selection in the navbar again'
                : 'Show all care types (ignores the OP/IP selection in the navbar)'
            }
            className={`h-full flex-1 px-3 text-sm font-medium transition-colors ${
              allCareTypes ? 'bg-primary text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            All
          </button>
        </div>
      </div>

      <ClearFiltersButton onClick={onClear} disabled={!hasActiveFilters} className="!ml-0" />
    </div>
  )
}
