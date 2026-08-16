import { useEffect, useState } from 'react'
import {
  fetchServiceRequests,
  isLabRequestTestsCompletedUi,
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
import { LabRequestReviewModal } from './LabRequestReviewModal'

interface LabBookedRequestListProps {
  patient?: string
  refreshKey?: string | number
  onPatientClick?: (patient: string) => void
  hideAmount?: boolean
}

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

  const careType = mode === 'OP' || mode === 'IP' ? mode : undefined
  const patientVisit = mode === 'OP' ? activeVisit || undefined : undefined
  const inpatientRecord = mode === 'IP' ? activeAdmission || undefined : undefined

  useEffect(() => {
    setPage(1)
  }, [patient, refreshKey, careType, patientVisit, inpatientRecord])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
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
  }, [patient, page, pageSize, refreshKey, listTick, careType, patientVisit, inpatientRecord])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
            const testsCompleted = isLabRequestTestsCompletedUi(sr)
            const statusLabel = testsCompleted ? 'Completed tests' : 'Booked'
            const metaFields = [
              ['Request', sr.name],
              ['Patient', sr.patient_name || sr.patient],
              ['Ordered', formatDashboardDate(sr.order_date)],
              ['Practitioner', sr.practitioner_name || sr.practitioner],
              ['Status', statusLabel],
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
                        <StatusPill status="Booked" color="success" />
                        {testsCompleted ? (
                          <StatusPill status="Completed tests" color="info" />
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
