import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchUserActivityFilterOptions,
  fetchUserActivityReport,
  fetchUserActivitySummary,
  searchAuditUsers,
  type ActivityAuditFilters,
  type ActivityAuditRow,
  type AuditUserOption,
  type SummarySortKey,
  type UserActivitySummaryRow,
} from '../../services/userActivityAudit'
import { toast } from '../../hooks/useToast'

type ViewMode = 'timeline' | 'summary'
type SortKey = NonNullable<ActivityAuditFilters['sort_by']>

const ACTIVITY_TYPE_OPTIONS = [
  { value: 'all', label: 'All activity' },
  { value: 'login', label: 'Login / Logout' },
  { value: 'route', label: 'Page / Route access' },
  { value: 'document', label: 'Document edits' },
] as const

const PERIOD_PRESETS = [
  { value: 1, label: 'Today' },
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
]

const SUMMARY_SORT_OPTIONS: { value: SummarySortKey; label: string }[] = [
  { value: 'document_edits', label: 'Document edits' },
  { value: 'total_events', label: 'Total activity' },
  { value: 'logins', label: 'Logins' },
  { value: 'routes', label: 'Page views' },
  { value: 'last_activity', label: 'Last active' },
  { value: 'user', label: 'User name' },
]

function activityBadgeClass(type: string): string {
  if (type === 'Login' || type === 'Logout' || type === 'Impersonate') {
    return 'bg-blue-50 text-blue-700 border-blue-200'
  }
  if (type === 'Route View') return 'bg-violet-50 text-violet-700 border-violet-200'
  if (type === 'Document Edit') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  return 'bg-slate-50 text-slate-700 border-slate-200'
}

function SortHeader({
  label,
  column,
  sortBy,
  sortOrder,
  onSort,
}: {
  label: string
  column: SortKey
  sortBy: SortKey
  sortOrder: 'asc' | 'desc'
  onSort: (column: SortKey) => void
}) {
  const active = sortBy === column
  const arrow = active ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className="inline-flex items-center gap-0.5 font-semibold text-slate-600 hover:text-slate-900"
    >
      {label}
      {arrow}
    </button>
  )
}

function UserSearchCombobox({
  value,
  displayLabel,
  onSelect,
  onClear,
}: {
  value: string
  displayLabel: string
  onSelect: (user: AuditUserOption) => void
  onClear: () => void
}) {
  const [query, setQuery] = useState(displayLabel || '')
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<AuditUserOption[]>([])
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(displayLabel || '')
  }, [displayLabel, value])

  useEffect(() => {
    if (!open) return
    const id = setTimeout(async () => {
      setLoading(true)
      try {
        setOptions(await searchAuditUsers(query.trim() || undefined, 40))
      } catch {
        setOptions([])
      } finally {
        setLoading(false)
      }
    }, query.trim() ? 250 : 0)
    return () => clearTimeout(id)
  }, [query, open])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={value ? displayLabel || value : query}
        onChange={(e) => {
          setQuery(e.target.value)
          if (value) onClear()
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search user name or email…"
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onClear()
            setQuery('')
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
          title="Clear user filter"
        >
          ✕
        </button>
      )}
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-56 overflow-auto text-sm">
          {!value && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-600 border-b border-slate-100"
              onClick={() => {
                onClear()
                setQuery('')
                setOpen(false)
              }}
            >
              All users
            </button>
          )}
          {loading ? (
            <div className="px-3 py-2 text-slate-500 text-xs">Searching…</div>
          ) : options.length === 0 ? (
            <div className="px-3 py-2 text-slate-500 text-xs">No users found</div>
          ) : (
            options.map((u) => (
              <button
                key={u.user}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-slate-50"
                onClick={() => {
                  onSelect(u)
                  setQuery(u.full_name || u.user)
                  setOpen(false)
                }}
              >
                <div className="font-medium text-slate-800">{u.full_name || u.user}</div>
                <div className="text-[10px] text-slate-500">{u.email || u.user}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  row,
  onViewTimeline,
}: {
  row: UserActivitySummaryRow
  onViewTimeline: (user: string, fullName: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onViewTimeline(row.user, row.full_name)}
      className="text-left bg-white border border-slate-200 rounded-xl shadow-sm p-4 hover:border-primary/40 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{row.full_name || row.user}</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">{row.user}</p>
        </div>
        <span className="inline-flex px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
          {row.document_edits} edits
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <div className="rounded-lg bg-slate-50 px-2 py-1.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Logins</div>
          <div className="text-sm font-semibold text-slate-800">{row.login_count}</div>
        </div>
        <div className="rounded-lg bg-slate-50 px-2 py-1.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Pages</div>
          <div className="text-sm font-semibold text-slate-800">{row.route_views}</div>
        </div>
        <div className="rounded-lg bg-emerald-50 px-2 py-1.5">
          <div className="text-[10px] text-emerald-700 uppercase tracking-wide">Documents</div>
          <div className="text-sm font-semibold text-emerald-800">{row.document_edits}</div>
        </div>
        <div className="rounded-lg bg-blue-50 px-2 py-1.5">
          <div className="text-[10px] text-blue-700 uppercase tracking-wide">Total</div>
          <div className="text-sm font-semibold text-blue-800">{row.total_events}</div>
        </div>
      </div>

      {row.top_doctypes.length > 0 ? (
        <div>
          <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-1.5">
            Top documents manipulated
          </div>
          <div className="flex flex-wrap gap-1.5">
            {row.top_doctypes.map((dt) => (
              <span
                key={`${row.user}-${dt.doctype}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-[10px] text-slate-700"
              >
                <span className="font-medium">{dt.doctype}</span>
                <span className="text-slate-500">({dt.count})</span>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500">No document edits in this period.</p>
      )}

      {row.last_activity && (
        <p className="text-[10px] text-slate-400 mt-3">
          Last active: {new Date(row.last_activity).toLocaleString('en-GB')}
        </p>
      )}

      <p className="text-[10px] text-primary mt-2 font-medium">Click to view full activity log →</p>
    </button>
  )
}

export function UserActivityAuditReport() {
  const [viewMode, setViewMode] = useState<ViewMode>('timeline')
  const [loading, setLoading] = useState(true)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [rows, setRows] = useState<ActivityAuditRow[]>([])
  const [summaryRows, setSummaryRows] = useState<UserActivitySummaryRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [totalUsers, setTotalUsers] = useState(0)
  const [doctypeOptions, setDoctypeOptions] = useState<string[]>([])

  const [periodDays, setPeriodDays] = useState(7)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [user, setUser] = useState('')
  const [userLabel, setUserLabel] = useState('')
  const [doctype, setDoctype] = useState('')
  const [activityType, setActivityType] = useState<ActivityAuditFilters['activity_type']>('all')
  const [sortBy, setSortBy] = useState<SortKey>('timestamp')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [summarySortBy, setSummarySortBy] = useState<SummarySortKey>('document_edits')
  const [summarySortOrder, setSummarySortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(0)
  const pageSize = 100

  const dateFilters = useMemo(
    () => ({
      period_days: fromDate || toDate ? undefined : periodDays,
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
    }),
    [fromDate, toDate, periodDays]
  )

  const buildFilters = useCallback(
    (pageOffset = page): ActivityAuditFilters => ({
      ...dateFilters,
      user: user || undefined,
      doctype: doctype || undefined,
      activity_type: activityType,
      sort_by: sortBy,
      sort_order: sortOrder,
      limit: pageSize,
      offset: pageOffset * pageSize,
    }),
    [activityType, dateFilters, doctype, page, sortBy, sortOrder, user]
  )

  const loadFilterOptions = useCallback(async () => {
    try {
      const opts = await fetchUserActivityFilterOptions(dateFilters)
      setDoctypeOptions(opts.doctypes || [])
    } catch {
      /* non-fatal */
    }
  }, [dateFilters.from_date, dateFilters.period_days, dateFilters.to_date])

  const loadReport = useCallback(async () => {
    try {
      setLoading(true)
      const report = await fetchUserActivityReport(buildFilters())
      setRows(report.rows || [])
      setTotalCount(report.total_count || 0)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load activity report')
      setRows([])
      setTotalCount(0)
    } finally {
      setLoading(false)
    }
  }, [buildFilters])

  const loadSummary = useCallback(async () => {
    try {
      setSummaryLoading(true)
      const report = await fetchUserActivitySummary({
        ...dateFilters,
        user: user || undefined,
        sort_by: summarySortBy,
        sort_order: summarySortOrder,
        limit: 200,
      })
      setSummaryRows(report.rows || [])
      setTotalUsers(report.total_users || 0)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load user summary')
      setSummaryRows([])
      setTotalUsers(0)
    } finally {
      setSummaryLoading(false)
    }
  }, [dateFilters, summarySortBy, summarySortOrder, user])

  const refreshAll = useCallback(() => {
    loadFilterOptions()
    loadReport()
    loadSummary()
  }, [loadFilterOptions, loadReport, loadSummary])

  useEffect(() => {
    loadFilterOptions()
  }, [loadFilterOptions])

  useEffect(() => {
    loadReport()
  }, [loadReport])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

  const handleSort = (column: SortKey) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(column)
      setSortOrder(column === 'timestamp' ? 'desc' : 'asc')
    }
    setPage(0)
  }

  const handleViewUserTimeline = (selectedUser: string, fullName: string) => {
    setUser(selectedUser)
    setUserLabel(fullName)
    setViewMode('timeline')
    setPage(0)
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  return (
    <div className="flex flex-col h-full">
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-base md:text-lg font-semibold text-slate-900">Staff Activity Audit</h1>
            <p className="text-xs md:text-sm text-slate-600 mt-0.5">
              Combined view of logins, page access, and document changes. CEO access only.
            </p>
          </div>
          <button
            type="button"
            onClick={refreshAll}
            disabled={loading || summaryLoading}
            className="px-3 py-1.5 text-xs rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading || summaryLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setViewMode('timeline')}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              viewMode === 'timeline'
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            Activity Log
          </button>
          <button
            type="button"
            onClick={() => setViewMode('summary')}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              viewMode === 'summary'
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            User Workload Summary
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-2">
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-slate-500">Period</label>
            <select
              value={fromDate || toDate ? 'custom' : String(periodDays)}
              onChange={(e) => {
                const val = e.target.value
                if (val === 'custom') return
                setFromDate('')
                setToDate('')
                setPeriodDays(Number(val))
                setPage(0)
              }}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            >
              {PERIOD_PRESETS.map((p) => (
                <option key={p.value} value={String(p.value)}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Custom dates</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-slate-500">From date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value)
                setPage(0)
              }}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-slate-500">To date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value)
                setPage(0)
              }}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-slate-500">User</label>
            <UserSearchCombobox
              value={user}
              displayLabel={userLabel}
              onSelect={(u) => {
                setUser(u.user)
                setUserLabel(u.full_name || u.user)
                setPage(0)
              }}
              onClear={() => {
                setUser('')
                setUserLabel('')
                setPage(0)
              }}
            />
          </div>

          {viewMode === 'timeline' && (
            <>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-500">DocType</label>
                <select
                  value={doctype}
                  onChange={(e) => {
                    setDoctype(e.target.value)
                    setPage(0)
                  }}
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
                >
                  <option value="">All doctypes</option>
                  {doctypeOptions.map((dt) => (
                    <option key={dt} value={dt}>
                      {dt}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-500">Activity type</label>
                <select
                  value={activityType}
                  onChange={(e) => {
                    setActivityType(e.target.value as ActivityAuditFilters['activity_type'])
                    setPage(0)
                  }}
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
                >
                  {ACTIVITY_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {viewMode === 'summary' && (
            <>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-500">Sort by</label>
                <select
                  value={summarySortBy}
                  onChange={(e) => setSummarySortBy(e.target.value as SummarySortKey)}
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
                >
                  {SUMMARY_SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-500">Order</label>
                <select
                  value={summarySortOrder}
                  onChange={(e) => setSummarySortOrder(e.target.value as 'asc' | 'desc')}
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
                >
                  <option value="desc">Highest first</option>
                  <option value="asc">Lowest first</option>
                </select>
              </div>
            </>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {viewMode === 'summary' ? (
          <>
            <div className="mb-3 text-xs text-slate-500">
              {summaryLoading
                ? 'Loading summaries…'
                : `${totalUsers} active user${totalUsers === 1 ? '' : 's'} in selected period`}
            </div>
            {summaryLoading ? (
              <div className="text-sm text-slate-500 py-12 text-center">Loading user summaries…</div>
            ) : summaryRows.length === 0 ? (
              <div className="text-sm text-slate-500 py-12 text-center">
                No user activity found for the selected filters.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {summaryRows.map((row) => (
                  <SummaryCard key={row.user} row={row} onViewTimeline={handleViewUserTimeline} />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
              <span>
                Showing {rows.length ? page * pageSize + 1 : 0}–{page * pageSize + rows.length} of{' '}
                {totalCount.toLocaleString()} events
                {user ? ` for ${userLabel || user}` : ''}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 0 || loading}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="px-2 py-1 rounded border border-slate-300 disabled:opacity-40"
                >
                  Previous
                </button>
                <span>
                  Page {page + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page + 1 >= totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-2 py-1 rounded border border-slate-300 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>

            {loading ? (
              <div className="text-sm text-slate-500 py-12 text-center">Loading activity…</div>
            ) : rows.length === 0 ? (
              <div className="text-sm text-slate-500 py-12 text-center">
                No activity found for the selected filters.
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left">
                        <SortHeader
                          label="Date / Time"
                          column="timestamp"
                          sortBy={sortBy}
                          sortOrder={sortOrder}
                          onSort={handleSort}
                        />
                      </th>
                      <th className="px-3 py-2 text-left">
                        <SortHeader
                          label="User"
                          column="user"
                          sortBy={sortBy}
                          sortOrder={sortOrder}
                          onSort={handleSort}
                        />
                      </th>
                      <th className="px-3 py-2 text-left">
                        <SortHeader
                          label="Activity"
                          column="activity_type"
                          sortBy={sortBy}
                          sortOrder={sortOrder}
                          onSort={handleSort}
                        />
                      </th>
                      <th className="px-3 py-2 text-left">
                        <SortHeader
                          label="DocType"
                          column="doctype"
                          sortBy={sortBy}
                          sortOrder={sortOrder}
                          onSort={handleSort}
                        />
                      </th>
                      <th className="px-3 py-2 text-left">
                        <SortHeader
                          label="Reference"
                          column="reference"
                          sortBy={sortBy}
                          sortOrder={sortOrder}
                          onSort={handleSort}
                        />
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row, idx) => (
                      <tr key={`${row.timestamp}-${row.user}-${idx}`} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                          {row.timestamp ? new Date(row.timestamp).toLocaleString('en-GB') : '—'}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-800">{row.full_name || row.user}</div>
                          <div className="text-[10px] text-slate-500">{row.user}</div>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-medium ${activityBadgeClass(row.activity_type)}`}
                          >
                            {row.activity_type}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-700">{row.doctype || '—'}</td>
                        <td className="px-3 py-2 text-slate-700 max-w-[180px] truncate" title={row.reference}>
                          {row.reference || '—'}
                        </td>
                        <td className="px-3 py-2 text-slate-600 max-w-[260px]">{row.details || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
