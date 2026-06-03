import { useEffect, useMemo, useState } from 'react'
import { BookOpen, User, Building2, FileText } from 'lucide-react'
import { fetchDoc } from '../../services/common'
import { htmlToPlainText } from '../../utils/htmlToPlainText'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { CREATE_MODAL_BODY_GRADIENT, CreateModalHeader } from '../ui/CreateModalChrome'

export interface PatientHistoryDetailRow {
  attribute: string
  description: string
  field_1: string
  attrib_note_2: string
  is_mendatory: boolean
  order_no: number
}

export interface PatientHistoryDetail {
  name: string
  patient?: string
  inpatient_admission?: string
  patient_visit?: string
  template?: string
  cost_center?: string
  creation?: string
  history_detail: PatientHistoryDetailRow[]
}

function mapDetailRow(raw: Record<string, unknown>): PatientHistoryDetailRow {
  return {
    attribute: String(raw.attribute ?? '').trim(),
    description: htmlToPlainText(String(raw.description ?? '')),
    field_1: htmlToPlainText(String(raw.field_1 ?? '')),
    attrib_note_2: htmlToPlainText(String(raw.attrib_note_2 ?? '')),
    is_mendatory: raw.is_mendatory === 1 || raw.is_mendatory === true,
    order_no: Number(raw.order_no) || 0,
  }
}

function formatDate(val?: string) {
  if (!val) return '—'
  try {
    return new Date(val).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return val
  }
}

function rowHasContent(row: PatientHistoryDetailRow) {
  return Boolean(row.description || row.field_1 || row.attrib_note_2)
}

interface PatientHistoryDetailPanelProps {
  name: string
  onClose: () => void
}

export function PatientHistoryDetailPanel({ name, onClose }: PatientHistoryDetailPanelProps) {
  const [detail, setDetail] = useState<PatientHistoryDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showEmpty, setShowEmpty] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchDoc('Patient History', name)
      .then((data) => {
        if (cancelled) return
        const rows = Array.isArray(data.history_detail)
          ? (data.history_detail as Record<string, unknown>[]).map(mapDetailRow)
          : []
        rows.sort((a, b) => {
          if (a.order_no !== b.order_no) return a.order_no - b.order_no
          return a.attribute.localeCompare(b.attribute)
        })
        setDetail({
          name: String(data.name ?? name),
          patient: data.patient ? String(data.patient) : undefined,
          inpatient_admission: data.inpatient_admission
            ? String(data.inpatient_admission)
            : undefined,
          patient_visit: data.patient_visit ? String(data.patient_visit) : undefined,
          template: data.template ? String(data.template) : undefined,
          cost_center: data.cost_center ? String(data.cost_center) : undefined,
          creation: data.creation ? String(data.creation) : undefined,
          history_detail: rows,
        })
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load patient history')
          setDetail(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [name])

  const visibleRows = useMemo(() => {
    if (!detail) return []
    if (showEmpty) return detail.history_detail
    return detail.history_detail.filter(rowHasContent)
  }, [detail, showEmpty])

  const filledCount = detail?.history_detail.filter(rowHasContent).length ?? 0
  const emptyCount = (detail?.history_detail.length ?? 0) - filledCount

  const headerSubtitle = detail?.creation
    ? formatDate(detail.creation)
    : loading
      ? 'Loading…'
      : undefined

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-primary/10 p-2 sm:p-3 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="relative z-10 flex h-full w-full max-w-2xl flex-col overflow-hidden rounded-none border border-emerald-200/60 bg-white shadow-2xl shadow-emerald-600/10 ring-1 ring-emerald-100/80 sm:rounded-l-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative shrink-0 border-b border-emerald-100/60">
          <CreateModalHeader
            title="Patient History"
            subtitle={
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-medium text-emerald-950">{name}</span>
                {headerSubtitle ? (
                  <>
                    <span className="text-emerald-700/40">·</span>
                    <span>{headerSubtitle}</span>
                  </>
                ) : null}
              </span>
            }
            icon={<BookOpen className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
            onClose={onClose}
          />
          <div className="absolute right-14 top-1/2 z-10 -translate-y-1/2 sm:right-16">
            <PrintFormatDropdown
              doctype="Patient History"
              docName={name}
              noLetterhead={0}
              triggerPrint={1}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200/80 bg-white/80 text-emerald-700 shadow-sm transition hover:bg-emerald-50"
            />
          </div>
        </div>

        {detail && !loading && (
          <div className="shrink-0 border-b border-emerald-100/80 bg-emerald-50/40 px-5 py-3 sm:px-6">
            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              {detail.patient && (
                <div className="flex min-w-0 items-center gap-2 rounded-lg border border-emerald-100/60 bg-white/70 px-3 py-2">
                  <User className="h-4 w-4 shrink-0 text-emerald-600/70" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-800/60">Patient</p>
                    <p className="truncate font-medium text-emerald-950">{detail.patient}</p>
                  </div>
                </div>
              )}
              {detail.inpatient_admission && (
                <div className="flex min-w-0 items-center gap-2 rounded-lg border border-emerald-100/60 bg-white/70 px-3 py-2">
                  <FileText className="h-4 w-4 shrink-0 text-emerald-600/70" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-800/60">Admission</p>
                    <p className="truncate font-medium text-emerald-950">{detail.inpatient_admission}</p>
                  </div>
                </div>
              )}
              {detail.patient_visit && (
                <div className="flex min-w-0 items-center gap-2 rounded-lg border border-emerald-100/60 bg-white/70 px-3 py-2">
                  <FileText className="h-4 w-4 shrink-0 text-emerald-600/70" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-800/60">Visit</p>
                    <p className="truncate font-medium text-emerald-950">{detail.patient_visit}</p>
                  </div>
                </div>
              )}
              {detail.template && (
                <div className="flex min-w-0 items-center gap-2 rounded-lg border border-emerald-100/60 bg-white/70 px-3 py-2">
                  <BookOpen className="h-4 w-4 shrink-0 text-emerald-600/70" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-800/60">Form</p>
                    <p className="truncate font-medium text-emerald-950">{detail.template}</p>
                  </div>
                </div>
              )}
              {detail.cost_center && (
                <div className="flex min-w-0 items-center gap-2 rounded-lg border border-emerald-100/60 bg-white/70 px-3 py-2 sm:col-span-2">
                  <Building2 className="h-4 w-4 shrink-0 text-emerald-600/70" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-800/60">Cost center</p>
                    <p className="truncate font-medium text-emerald-950">{detail.cost_center}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-emerald-100/80 bg-gradient-to-r from-white via-emerald-50/30 to-teal-50/20 px-5 py-2.5 sm:px-6">
          <p className="text-xs text-emerald-900/70">
            <span className="font-semibold text-emerald-950">{filledCount}</span> section
            {filledCount !== 1 ? 's' : ''} documented
            {emptyCount > 0 && (
              <span className="text-emerald-700/50"> · {emptyCount} empty</span>
            )}
          </p>
          {emptyCount > 0 && (
            <button
              type="button"
              onClick={() => setShowEmpty((v) => !v)}
              className="text-xs font-medium text-emerald-700 transition hover:text-emerald-900 hover:underline"
            >
              {showEmpty ? 'Hide empty sections' : 'Show empty sections'}
            </button>
          )}
        </div>

        <div className={`${CREATE_MODAL_BODY_GRADIENT} min-h-0 flex-1`}>
          {loading && (
            <div className="flex items-center justify-center py-16 text-sm text-emerald-800/60">
              <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
              Loading history…
            </div>
          )}
          {!loading && error && (
            <div className="m-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}
          {!loading && detail && visibleRows.length === 0 && (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100/80 ring-1 ring-emerald-200/60">
                <BookOpen className="h-6 w-6 text-emerald-600/70" />
              </div>
              <p className="text-sm text-emerald-900/70">No history sections have been filled in yet.</p>
            </div>
          )}
          {!loading && detail && visibleRows.length > 0 && (
            <ul className="space-y-3 p-4 sm:p-5">
              {visibleRows.map((row, index) => {
                const filled = rowHasContent(row)
                return (
                  <li
                    key={`${row.attribute}-${index}`}
                    className={`rounded-xl border px-4 py-3.5 shadow-sm ${
                      filled
                        ? 'border-emerald-100/90 bg-white/90 shadow-emerald-900/5'
                        : 'border-emerald-50 bg-white/50'
                    }`}
                  >
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold leading-snug text-emerald-950">
                        {row.attribute || 'Untitled section'}
                      </h3>
                      {row.is_mendatory && (
                        <span className="inline-flex shrink-0 items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                          Required
                        </span>
                      )}
                    </div>
                    {row.description ? (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                        {row.description}
                      </p>
                    ) : (
                      <p className="text-sm italic text-slate-400">No description</p>
                    )}
                    {row.field_1 && (
                      <p className="mt-2 whitespace-pre-wrap border-l-2 border-emerald-200/80 pl-3 text-xs text-slate-600">
                        {row.field_1}
                      </p>
                    )}
                    {row.attrib_note_2 && (
                      <p className="mt-2 whitespace-pre-wrap border-l-2 border-teal-300/60 pl-3 text-xs text-slate-500">
                        {row.attrib_note_2}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
