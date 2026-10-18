import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  CalendarRange,
  Layers3,
  Package as PackageIcon,
  Pencil,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { toast } from '../../hooks/useToast'
import { formatMoneyAmount } from '../../utils/currencyFormat'
import {
  fetchPackageManagementData,
  type InpatientPackageRecord,
  type PackageManagementData,
  type PackageManagementMeta,
} from '../../services/inpatientPackages'
import PackageEditModal from './PackageEditModal'

type StatusFilter = 'all' | 'active' | 'inactive'

function isChecked(value: unknown): boolean {
  return value === true || value === 1 || value === '1'
}

function packageCurrency(pkg: InpatientPackageRecord, meta: PackageManagementMeta): string {
  return (
    meta.companies.find((company) => company.value === pkg.company)?.currency ||
    meta.default_currency ||
    'BHD'
  )
}

function programLabel(pkg: InpatientPackageRecord): string {
  if (isChecked(pkg.is_daily_default)) return 'Daily rate package'
  const days = Number(pkg.no_of_days || 0)
  return days > 0 ? `${days}-day program` : 'Flexible stay'
}

function formatDayRange(fromDay: number | null | undefined, toDay: number | null | undefined) {
  if (!fromDay && !toDay) return '—'
  return `${fromDay ?? 1}–${toDay || '∞'} days`
}

function MetricCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode
  label: string
  value: number | string
  hint: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
    </div>
  )
}
function PackageCard({
  pkg,
  meta,
  onEdit,
}: {
  pkg: InpatientPackageRecord
  meta: PackageManagementMeta
  onEdit: () => void
}) {
  const currency = packageCurrency(pkg, meta)
  const active = isChecked(pkg.active)
  const services = pkg.services || []
  const slabs = pkg.duration_pricing || []
  const baseTotal = Number(pkg.base_total || 0)
  const visibleServices = services.slice(0, 3)
  const visibleSlabs = slabs.slice(0, 3)

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-900/5">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-[15px] font-semibold text-slate-900">
              {pkg.package_name || pkg.name}
            </h3>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                active
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-slate-100 text-slate-500'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-400'}`}
              />
              {active ? 'Active' : 'Inactive'}
            </span>
            {isChecked(pkg.is_daily_default) ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                Daily default
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span>{pkg.category_name || pkg.package_category || 'All room categories'}</span>
            <span className="text-slate-300">·</span>
            <span>{programLabel(pkg)}</span>
            <span className="text-slate-300">·</span>
            <span className="font-mono text-[10px] text-slate-400">{pkg.name}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
        >
          <Pencil className="h-3 w-3" /> Edit
        </button>
      </div>

      <div className="grid grid-cols-2 gap-px border-b border-slate-100 bg-slate-100">
        <div className="bg-white px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Package rate
          </p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
            {formatMoneyAmount(Number(pkg.package_rate || 0), currency)}
          </p>
          <p className="text-[10px] text-slate-400">per day</p>
        </div>
        <div className="bg-white px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Base total
          </p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
            {baseTotal > 0 ? formatMoneyAmount(baseTotal, currency) : '—'}
          </p>
          <p className="text-[10px] text-slate-400">
            {Number(pkg.no_of_days || 0) > 0 ? `${pkg.no_of_days} included days` : 'day-rate basis'}
          </p>
        </div>
      </div>


      <div className="flex-1 space-y-4 px-4 py-3.5">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Included services
            </p>
            <span className="text-[11px] tabular-nums text-slate-400">{services.length}</span>
          </div>
          {services.length === 0 ? (
            <p className="text-xs text-slate-400">No services linked</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {visibleServices.map((service, index) => (
                <span
                  key={`${service.service_type}-${service.reference}-${index}`}
                  title={`${service.service_type}: ${service.reference_label || service.reference}`}
                  className="inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700"
                >
                  <span className="truncate font-medium">
                    {service.reference_label || service.reference}
                  </span>
                  <span className="shrink-0 text-[9px] uppercase tracking-wide text-slate-400">
                    {service.service_type}
                  </span>
                  {isChecked(service.is_unlimited) ? (
                    <span className="shrink-0 text-[10px] font-semibold text-emerald-600">∞</span>
                  ) : null}
                </span>
              ))}
              {services.length > visibleServices.length ? (
                <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500">
                  +{services.length - visibleServices.length} more
                </span>
              ) : null}
            </div>
          )}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Duration pricing
            </p>
            <span className="text-[11px] tabular-nums text-slate-400">{slabs.length}</span>
          </div>
          {slabs.length === 0 ? (
            <p className="text-xs text-slate-400">Rate × days applies</p>
          ) : (
            <div className="space-y-1">
              {visibleSlabs.map((slab, index) => (
                <div
                  key={`${slab.duration_class}-${index}`}
                  className="flex items-center justify-between gap-2 text-[11px]"
                >
                  <span className="min-w-0 truncate text-slate-500">
                    <span className="font-medium text-slate-700">
                      {slab.duration_name || slab.duration_class}
                    </span>{' '}
                    · {formatDayRange(slab.from_day, slab.to_day)}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-slate-700">
                    {formatMoneyAmount(Number(slab.amount || 0), currency)}
                  </span>
                </div>
              ))}
              {slabs.length > visibleSlabs.length ? (
                <p className="text-[10px] text-slate-400">
                  +{slabs.length - visibleSlabs.length} more slabs
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5">
        <span className="truncate text-[11px] text-slate-500">
          {pkg.cost_center || pkg.company || 'No branch assigned'}
        </span>
        <span className="shrink-0 text-[10px] text-slate-400">{currency}</span>
      </div>
    </article>
  )
}

export default function Packages() {
  const [data, setData] = useState<PackageManagementData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [editing, setEditing] = useState<InpatientPackageRecord | null>(null)

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') setLoading(true)
    else setRefreshing(true)
    setError('')
    try {
      const response = await fetchPackageManagementData()
      setData(response)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to load the inpatient package catalogue.'
      setError(message)
      toast.error(message)
    } finally {
      if (mode === 'initial') setLoading(false)
      else setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load('initial')
  }, [load])

  const packages = useMemo(() => data?.packages ?? [], [data])
  const meta = data?.meta
  const term = query.trim().toLowerCase()

  const filteredPackages = useMemo(() => {
    return packages.filter((pkg) => {
      const active = isChecked(pkg.active)
      if (statusFilter === 'active' && !active) return false
      if (statusFilter === 'inactive' && active) return false
      if (!term) return true
      const haystack = [
        pkg.name,
        pkg.package_name,
        pkg.category_name,
        pkg.package_category,
        pkg.company,
        pkg.cost_center,
        ...(pkg.services || []).map(
          (service) => `${service.reference_label || ''} ${service.reference} ${service.service_type}`,
        ),
        ...(pkg.duration_pricing || []).map(
          (duration) => `${duration.duration_name || ''} ${duration.duration_class}`,
        ),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(term)
    })
  }, [packages, statusFilter, term])

  const activeCount = packages.filter((pkg) => isChecked(pkg.active)).length
  const inactiveCount = packages.length - activeCount
  const dailyDefaultCount = packages.filter((pkg) => isChecked(pkg.is_daily_default)).length
  const serviceCount = packages.reduce((total, pkg) => total + (pkg.services?.length || 0), 0)
  const slabCount = packages.reduce(
    (total, pkg) => total + (pkg.duration_pricing?.length || 0),
    0,
  )

  const handleSaved = useCallback((saved: InpatientPackageRecord) => {
    setData((previous) => {
      if (!previous) return previous
      const exists = previous.packages.some((pkg) => pkg.name === saved.name)
      return {
        ...previous,
        packages: exists
          ? previous.packages.map((pkg) => (pkg.name === saved.name ? saved : pkg))
          : [saved, ...previous.packages],
      }
    })
    setEditing(null)
    toast.success(`${saved.package_name || saved.name} updated.`)
  }, [])

  const resetFilters = () => {
    setQuery('')
    setStatusFilter('all')
  }

  const statusFilters: Array<{ value: StatusFilter; label: string; count: number }> = [
    { value: 'all', label: 'All', count: packages.length },
    { value: 'active', label: 'Active', count: activeCount },
    { value: 'inactive', label: 'Inactive', count: inactiveCount },
  ]

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-white via-emerald-50/40 to-teal-50/30 p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-600/20">
              <PackageIcon className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <h3 className="text-base font-semibold tracking-tight text-slate-900">
                Inpatient package catalogue
              </h3>
              <p className="text-xs text-slate-500">
                Bundled room, service and duration pricing available to admissions.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load('refresh')}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            icon={<PackageIcon className="h-3.5 w-3.5" />}
            label="Packages"
            value={packages.length}
            hint={`${activeCount} active · ${inactiveCount} inactive`}
          />
          <MetricCard
            icon={<Layers3 className="h-3.5 w-3.5" />}
            label="Service lines"
            value={serviceCount}
            hint="Across all package definitions"
          />
          <MetricCard
            icon={<CalendarRange className="h-3.5 w-3.5" />}
            label="Duration slabs"
            value={slabCount}
            hint="Fixed stay-length totals"
          />
          <MetricCard
            icon={<PackageIcon className="h-3.5 w-3.5" />}
            label="Daily defaults"
            value={dailyDefaultCount}
            hint="Fallback day-rate packages"
          />
        </div>
      </div>


      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search packages, services or branches…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-700 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <div className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {statusFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatusFilter(filter.value)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === filter.value
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {filter.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                  statusFilter === filter.value
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-200/70 text-slate-500'
                }`}
              >
                {filter.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-rose-800">Could not load packages</p>
            <p className="mt-0.5 text-xs text-rose-700">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void load('refresh')}
            disabled={refreshing}
            className="shrink-0 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
          >
            Try again
          </button>
        </div>
      ) : null}


      {loading && !data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="animate-pulse overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="h-4 w-2/3 rounded bg-slate-200" />
              <div className="mt-2 h-3 w-1/2 rounded bg-slate-100" />
              <div className="mt-4 h-16 rounded-lg bg-slate-100" />
              <div className="mt-3 space-y-2">
                <div className="h-3 w-full rounded bg-slate-100" />
                <div className="h-3 w-4/5 rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ) : !data ? null : packages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center shadow-sm">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <PackageIcon className="h-6 w-6" />
          </span>
          <h3 className="mt-3 text-sm font-semibold text-slate-800">No inpatient packages yet</h3>
          <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
            Packages created for this branch will appear here for review and pricing updates.
          </p>
          <button
            type="button"
            onClick={() => void load('refresh')}
            disabled={refreshing}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Check again
          </button>
        </div>
      ) : filteredPackages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
          <Search className="mx-auto h-6 w-6 text-slate-300" />
          <h3 className="mt-3 text-sm font-semibold text-slate-800">No matching packages</h3>
          <p className="mt-1 text-xs text-slate-500">
            Adjust the search or status filter to see more of the catalogue.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredPackages.map((pkg) => (
            <PackageCard
              key={pkg.name}
              pkg={pkg}
              meta={meta as PackageManagementMeta}
              onEdit={() => setEditing(pkg)}
            />
          ))}
        </div>
      )}

      {editing && meta ? (
        <PackageEditModal
          open
          pkg={editing}
          meta={meta}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  )
}

