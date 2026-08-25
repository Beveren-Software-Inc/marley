import { useEffect, useState } from 'react'
import { StatusPill } from '../ui/StatusPill'
import { PaginationControls, DEFAULT_PAGE_SIZE, type PageSize } from '../ui/PaginationControls'
import { useDashboardCompactClinical } from '../../contexts/CardFilterContext'
import { toast } from '../../hooks/useToast'
import {
  completeReportRequest,
  fetchReportRequest,
  fetchReportRequests,
  rejectReportRequest,
  reopenReportRequest,
  updateReportRequest,
  type ReportRequestRow,
} from '../../services/reportRequests'
import { viewPatientDocument } from '../ui/PatientDocumentAttachmentPreview'
import { DashboardCard } from '../ui/DashboardCard'
import { CreateReportRequestModal } from './CreateReportRequestModal'

const statusColor: Record<string, string> = {
  Pending: 'warning',
  Done: 'success',
  Rejected: 'danger',
  Archived: 'default',
}

const TABS = [
  { id: 'Pending', label: 'Pending' },
  { id: 'Done', label: 'Done' },
  { id: 'Rejected', label: 'Rejected' },
  { id: 'Archived', label: 'Archived' },
] as const

export function ReportRequestList({
  patient,
  refreshKey,
  onPatientClick,
}: {
  patient?: string
  refreshKey?: number
  onPatientClick?: (patient: string) => void
}) {
  const compact = useDashboardCompactClinical()
  const [tab, setTab] = useState<string>('Pending')
  const [rows, setRows] = useState<ReportRequestRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE)
  const [detail, setDetail] = useState<ReportRequestRow | null>(null)
  const [remarks, setRemarks] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    setLoading(true)
    fetchReportRequests({
      status: tab,
      patient,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    })
      .then((res) => {
        setRows(res.data || [])
        setTotal(res.total_count || 0)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load report requests'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    setPage(1)
  }, [tab, patient, refreshKey])

  useEffect(() => {
    load()
  }, [tab, patient, page, pageSize, refreshKey])

  const openDetail = async (name: string) => {
    try {
      const doc = await fetchReportRequest(name)
      setDetail(doc)
      setRemarks(doc.remarks || '')
      setRejectReason('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load request')
    }
  }

  const run = async (fn: () => Promise<ReportRequestRow>, ok: string) => {
    setBusy(true)
    try {
      const doc = await fn()
      toast.success(ok)
      setDetail(doc)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              tab === t.id ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className={`w-full ${compact ? 'table-fixed' : 'min-w-[720px]'}`}>
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Date', 'Patient', 'Requester', 'Urgency', 'Recipient', 'Status'].map((h) => (
                <th key={h} className="px-2 py-2 text-left text-[10px] font-semibold uppercase text-slate-600">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-400">
                  NO REPORT REQUESTS
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.name}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => openDetail(row.name)}
                >
                  <td className="px-2 py-2 text-xs text-slate-700 whitespace-nowrap">
                    {row.request_date ? new Date(row.request_date).toLocaleDateString('en-GB') : '—'}
                  </td>
                  <td className="px-2 py-2 text-xs">
                    <button
                      type="button"
                      className="truncate font-medium text-primary hover:underline"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (row.patient) onPatientClick?.(row.patient)
                      }}
                    >
                      {row.patient_name || row.patient}
                    </button>
                    <p className="truncate text-[10px] text-slate-400">
                      {row.file_no || row.id_number || ''}
                    </p>
                  </td>
                  <td className="px-2 py-2 text-xs text-slate-700">
                    <p className="truncate">{row.requester_name || row.requester}</p>
                    <p className="truncate text-[10px] text-slate-400">{row.requester_role}</p>
                  </td>
                  <td className="px-2 py-2 text-xs">
                    <span className={row.urgency === 'Urgent' ? 'font-semibold text-amber-700' : 'text-slate-600'}>
                      {row.urgency}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-xs text-slate-700 truncate">{row.recipient}</td>
                  <td className="px-2 py-2">
                    <StatusPill compact={compact} status={row.status} color={statusColor[row.status] || 'default'} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <PaginationControls
        page={page}
        pageSize={pageSize}
        totalCount={total}
        loading={loading}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
      />

      {detail && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-primary/15 p-4" onClick={() => setDetail(null)}>
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-emerald-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{detail.name}</p>
                <h3 className="text-lg font-semibold text-slate-900">{detail.patient_name}</h3>
                <p className="text-xs text-slate-500">
                  {detail.file_no || '—'} · {detail.id_number || '—'}
                </p>
              </div>
              <StatusPill status={detail.status} color={statusColor[detail.status] || 'default'} />
            </div>
            <dl className="mb-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-slate-400">Request date</dt>
                <dd>{detail.request_date ? new Date(detail.request_date).toLocaleDateString('en-GB') : '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Urgency</dt>
                <dd className={detail.urgency === 'Urgent' ? 'font-semibold text-amber-700' : ''}>{detail.urgency}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Requester</dt>
                <dd>
                  {detail.requester_name} ({detail.requester_role})
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Recipient</dt>
                <dd>{detail.recipient}</dd>
              </div>
            </dl>
            {detail.signed_request ? (
              <button
                type="button"
                className="mb-3 text-sm font-medium text-primary hover:underline"
                onClick={() => viewPatientDocument(detail.signed_request)}
              >
                View signed request
              </button>
            ) : (
              <p className="mb-3 text-xs text-slate-400">No signed copy attached</p>
            )}
            <label className="mb-0.5 block text-xs font-medium text-slate-600">Remarks</label>
            <textarea
              rows={2}
              className="mb-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
            <button
              type="button"
              disabled={busy}
              className="mb-3 text-xs font-medium text-primary hover:underline"
              onClick={() => run(() => updateReportRequest(detail.name, { remarks }), 'Remarks saved')}
            >
              Save remarks
            </button>
            {detail.status === 'Pending' && (
              <div className="mb-3">
                <label className="mb-0.5 block text-xs font-medium text-slate-600">Reject reason</label>
                <input
                  className="mb-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
              </div>
            )}
            {detail.reject_reason ? (
              <p className="mb-3 text-xs text-red-700">Rejected: {detail.reject_reason}</p>
            ) : null}
            {detail.completed_on ? (
              <p className="mb-3 text-xs text-slate-500">
                Completed by {detail.completed_by_name} on{' '}
                {new Date(detail.completed_on).toLocaleString('en-GB')}
              </p>
            ) : null}
            <div className="mb-4 flex flex-wrap gap-2">
              {detail.status === 'Pending' && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                    onClick={() => run(() => completeReportRequest(detail.name), 'Marked Done')}
                  >
                    Done / Completed
                  </button>
                  <button
                    type="button"
                    disabled={busy || !rejectReason.trim()}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                    onClick={() => run(() => rejectReportRequest(detail.name, rejectReason.trim()), 'Rejected')}
                  >
                    Reject
                  </button>
                </>
              )}
              {(detail.status === 'Done' || detail.status === 'Rejected' || detail.status === 'Archived') && (
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => run(() => reopenReportRequest(detail.name), 'Reopened as Pending')}
                >
                  Reverse to Pending
                </button>
              )}
              <button
                type="button"
                className="ml-auto rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600"
                onClick={() => setDetail(null)}
              >
                Close
              </button>
            </div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Audit trail</p>
            <ul className="max-h-40 space-y-1 overflow-y-auto text-[11px] text-slate-600">
              {(detail.audit_trail || []).length === 0 ? (
                <li className="text-slate-400">No actions recorded yet</li>
              ) : (
                [...(detail.audit_trail || [])].reverse().map((a, i) => (
                  <li key={`${a.action_on}-${i}`} className="rounded bg-slate-50 px-2 py-1">
                    <span className="font-medium">{a.action}</span>
                    {' · '}
                    {a.user_full_name || a.user}
                    {a.action_on ? ` · ${new Date(a.action_on).toLocaleString('en-GB')}` : ''}
                    {a.details ? <span className="block text-slate-400">{a.details}</span> : null}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

export function ReportRequestsCard({
  patient,
  onPatientSelect,
  listingScreen,
  fullScreen = false,
}: {
  patient?: string
  onPatientSelect?: (patient: string) => void
  listingScreen?: string
  fullScreen?: boolean
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  return (
    <>
      <DashboardCard
        title="Report Requests"
        fixedHeight={!fullScreen}
        noHeightLimit={fullScreen}
        onAdd={() => setShowCreate(true)}
        addButtonTitle="New Report Request"
        listingScreen={listingScreen}
        allowCreateOnClosedEpisode
      >
        <ReportRequestList
          patient={patient}
          refreshKey={refreshKey}
          onPatientClick={onPatientSelect}
        />
      </DashboardCard>
      {showCreate && (
        <CreateReportRequestModal
          initialPatient={patient}
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false)
            setRefreshKey((k) => k + 1)
          }}
        />
      )}
    </>
  )
}
