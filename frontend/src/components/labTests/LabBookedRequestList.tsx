import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  fetchServiceRequests,
  type ServiceRequest,
} from '../../services/serviceRequests'
import { useCareContext } from '../../providers/CareContextProvider'
import { useFormatMoney } from '../../hooks/useFormatMoney'
import { StatusPill } from '../ui/StatusPill'
import { PaginationControls, DEFAULT_PAGE_SIZE, type PageSize } from '../ui/PaginationControls'
import {
  CardRowMetaHint,
  dashboardCardRowHoverClass,
  formatDashboardDate,
} from '../ui/dashboardCardListing'
import {
  useCardFilters,
  useCardLeadingSlot,
  useInDashboardCard,
} from '../../contexts/CardFilterContext'
import { LabRequestReviewModal } from './LabRequestReviewModal'

interface LabBookedRequestListProps {
  patient?: string
  refreshKey?: string | number
  onPatientClick?: (patient: string) => void
  hideAmount?: boolean
}

const VIRTUAL_STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'booked', label: 'Booked' },
  { key: 'sample-collected', label: 'Sample Collected' },
  { key: 'partial-sample-collected', label: 'Partial Sample' },
  { key: 'partial-results', label: 'Partial Results' },
  { key: 'completed-tests', label: 'Completed Tests' },
] as const

type VirtualStatusKey = (typeof VIRTUAL_STATUS_TABS)[number]['key']

const VIRTUAL_STATUS_COLORS: Record<string, string> = {
  booked: 'default',
  'sample-collected': 'info',
  'partial-sample-collected': 'warning',
  'partial-results': 'warning',
  'completed-tests': 'success',
  'completed-request': 'success',
}

const VIRTUAL_STATUS_LABELS: Record<string, string> = {
  booked: 'Booked',
  'sample-collected': 'Sample Collected',
  'partial-sample-collected': 'Partial Sample Collected',
  'partial-results': 'Partial Results',
  'completed-tests': 'Completed Tests',
  'completed-request': 'Completed',
}

const FilterToggleButton = ({
  active,
  onClick,
}: {
  active: boolean
  onClick: () => void
}) => (
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

/**
 * Lab page → Lab Request tab only.
 * Lists booked Lab Test Template Service Requests (one row per request).
 * Click opens a read-only review modal (no edit).
 * Scoped by header OP/IP: OP hides inpatient requests; active visit/admission narrows further.
 */
export function LabBookedRequestList({
  patient,
  refreshKey,
  onPatientClick,
  hideAmount = false,
}: LabBookedRequestListProps) {
  const { mode, activeVisit, activeAdmission } = useCareContext()
  const formatMoney = useFormatMoney()
  const [rows, setRows] = useState<ServiceRequest[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [listTick, setListTick] = useState(0)
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)

  // Virtual status filter (UI-only) — backend computes from linked Lab Tests
  const [virtualStatus, setVirtualStatus] = useState<VirtualStatusKey>('all')

  const inDashboardCard = useInDashboardCard()
  const cardFilters = useCardFilters()
  const leadingSlot = useCardLeadingSlot()

  const showFilters = cardFilters !== undefined ? cardFilters : showFiltersInternal
  const showFilterBar = showFilters && virtualStatus !== 'all'

  const careType = mode === 'OP' || mode === 'IP' ? mode : undefined
  const patientVisit = mode === 'OP' ? activeVisit || undefined : undefined
  const inpatientRecord = mode === 'IP' ? activeAdmission || undefined : undefined

  useEffect(() => {
    let cancelled = false
    fetchServiceRequests(
      pageSize,
      (page - 1) * pageSize,
      patient,
      'Lab Test Template',
      undefined,
      undefined,
      undefined,
      undefined,
      patientVisit,
      inpatientRecord,
      1, // booked only
      careType,
      virtualStatus === 'all' ? undefined : virtualStatus,
    )
      .then((res) => {
        if (cancelled) return
        setRows(res.data || [])
        setTotalCount(res.total_count || 0)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.message || 'Failed to load Lab Requests')
        setRows([])
        setTotalCount(0)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [patient, page, pageSize, refreshKey, listTick, careType, patientVisit, inpatientRecord, virtualStatus])

  const virtualStatusLabel = (sr: ServiceRequest): string => {
    return VIRTUAL_STATUS_LABELS[sr.virtual_status || 'booked'] || 'Booked'
  }

  const virtualStatusColor = (sr: ServiceRequest): string => {
    return VIRTUAL_STATUS_COLORS[sr.virtual_status || 'booked'] || 'default'
  }

  // Status tabs + filter toggle — portal into the DashboardCard header (next to the ↗ arrow)
  const statusTabsMarkup = (
    <div className="flex flex-wrap items-center gap-1.5">
      {VIRTUAL_STATUS_TABS.map((tab) => {
        const active = virtualStatus === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setVirtualStatus(tab.key)
              setPage(1)
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              active
                ? 'bg-primary text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
      <FilterToggleButton
        active={Boolean(showFilters)}
        onClick={() => setShowFiltersInternal((prev) => !prev)}
      />
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {inDashboardCard && leadingSlot
        ? createPortal(statusTabsMarkup, leadingSlot)
        : (
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-1 pb-2 border-b border-slate-100 mb-2">
              {statusTabsMarkup}
            </div>
          )}

      {/* Optional active-status summary bar shown when a specific virtual status is selected */}
      {showFilterBar && (
        <div className="flex shrink-0 items-center gap-2 px-1 pb-2 border-b border-slate-100 mb-2">
          <span className="text-xs font-medium text-slate-600">
            Showing: <span className="font-semibold text-slate-800">{VIRTUAL_STATUS_TABS.find(t => t.key === virtualStatus)?.label}</span>
          </span>
          <span className="text-xs text-slate-400">
            ({totalCount} request{totalCount === 1 ? '' : 's'})
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-1">
        {loading && (
          <div className="px-3 py-8 text-center text-sm text-slate-500">Loading booked Lab Requests…</div>
        )}
        {error && !loading && (
          <div className="mx-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {!loading && !error && rows.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-slate-500">
            No booked Lab Requests
            {patient ? ' for this patient' : ''}
            {careType === 'OP' && patientVisit
              ? ' for this OP visit'
              : careType === 'OP'
                ? ' (OP only)'
                : careType === 'IP' && inpatientRecord
                  ? ' for this admission'
                  : careType === 'IP'
                    ? ' (IP only)'
                    : ''}
            .
          </div>
        )}
        <ul className="space-y-2">
          {rows.map((sr) => {
            const groupCount = sr.lab_request_groups?.length || 0
            const childCount =
              sr.lab_request_groups?.reduce((n, g) => n + (g.children?.length || 0), 0) || 0
            const amount = Number(sr.grand_total ?? sr.amount ?? sr.cost ?? 0)
            const vs = sr.virtual_status || 'booked'
            const vLabel = virtualStatusLabel(sr)
            const vColor = virtualStatusColor(sr)
            const isMinorBooked = vs !== 'booked'
            const metaFields = [
              ['Request', sr.name],
              ['Patient', sr.patient_name || sr.patient],
              ['Ordered', formatDashboardDate(sr.order_date)],
              ['Practitioner', sr.practitioner_name || sr.practitioner],
              ['Status', vLabel],
              ['Tests', childCount || groupCount || '—'],
              !hideAmount ? (['Total', formatMoney(amount)] as const) : null,
            ].filter(Boolean) as Array<readonly [string, string | number | null | undefined]>

            return (
              <li key={sr.name}>
                <button
                  type="button"
                  onClick={() => setSelectedName(sr.name)}
                  className={`w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm ${dashboardCardRowHoverClass}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900">
                          {sr.template_name || sr.template_dn || 'Lab Request'}
                        </span>
                        {/* Minor "Booked" pill always present when the row is still a booked request */}
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                          Booked
                        </span>
                        {/* Major virtual status pill shows the lab-test progress */}
                        <StatusPill status={vLabel} color={vColor} />
                        {isMinorBooked && vs === 'completed-request' ? (
                          <StatusPill status="Completed" color="success" />
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                        <span className="font-mono text-slate-600">{sr.name}</span>
                        <span>·</span>
                        {onPatientClick && sr.patient ? (
                          <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={(e) => {
                              e.stopPropagation()
                              onPatientClick(sr.patient)
                            }}
                          >
                            {sr.patient_name || sr.patient}
                          </button>
                        ) : (
                          <span>{sr.patient_name || sr.patient}</span>
                        )}
                        {sr.order_date ? (
                          <>
                            <span>·</span>
                            <span>{formatDashboardDate(sr.order_date)}</span>
                          </>
                        ) : null}
                        {(childCount > 0 || groupCount > 0) && (
                          <>
                            <span>·</span>
                            <span>
                              {groupCount > 0 ? `${groupCount} group${groupCount === 1 ? '' : 's'}` : ''}
                              {groupCount > 0 && childCount > 0 ? ', ' : ''}
                              {childCount > 0 ? `${childCount} test${childCount === 1 ? '' : 's'}` : ''}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {!hideAmount && (
                        <span className="text-sm font-semibold tabular-nums text-emerald-700">
                          {formatMoney(amount)}
                        </span>
                      )}
                      <CardRowMetaHint fields={metaFields} />
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <PaginationControls
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
      />

      {selectedName && (
        <LabRequestReviewModal
          serviceRequestName={selectedName}
          onClose={() => {
            setSelectedName(null)
            setListTick((n) => n + 1)
          }}
        />
      )}
    </div>
  )
}