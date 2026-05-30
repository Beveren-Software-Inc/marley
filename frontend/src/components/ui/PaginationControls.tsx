import { useDashboardCompactClinical } from '../../contexts/CardFilterContext'

export const PAGE_SIZE_OPTIONS = [20, 100, 500, 2500] as const
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
export const DEFAULT_PAGE_SIZE: PageSize = 20

export interface PaginationControlsProps {
  page: number
  pageSize: PageSize
  totalCount: number
  loading?: boolean
  onPageChange: (page: number) => void
  onPageSizeChange: (size: PageSize) => void
}

export const PaginationControls = ({
  page,
  pageSize,
  totalCount,
  loading,
  onPageChange,
  onPageSizeChange,
}: PaginationControlsProps) => {
  const compactClinical = useDashboardCompactClinical()
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalCount)

  return (
    <div
      className={`mt-auto flex-shrink-0 bg-white flex-wrap items-center justify-between gap-3 px-1 py-2 text-sm text-slate-600 border-t border-slate-200 ${
        compactClinical ? 'hidden md:flex' : 'flex'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="whitespace-nowrap">Rows per page</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value) as PageSize)}
          disabled={loading}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        >
          {PAGE_SIZE_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="text-slate-400 whitespace-nowrap">
          {totalCount > 0 ? `${from}\u2013${to} of ${totalCount}` : 'No records'}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1 || loading}
          onClick={() => onPageChange(1)}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
          title="First page"
        >
          &laquo;&laquo;
        </button>
        <button
          type="button"
          disabled={page <= 1 || loading}
          onClick={() => onPageChange(page - 1)}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
          title="Previous page"
        >
          &laquo;
        </button>
        <span className="px-2 font-medium tabular-nums">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages || loading}
          onClick={() => onPageChange(page + 1)}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
          title="Next page"
        >
          &raquo;
        </button>
        <button
          type="button"
          disabled={page >= totalPages || loading}
          onClick={() => onPageChange(totalPages)}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
          title="Last page"
        >
          &raquo;&raquo;
        </button>
      </div>
    </div>
  )
}
