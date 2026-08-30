import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Building2, Calendar, Clock, FileText, Stethoscope, User } from 'lucide-react'
import {
  fetchSessionSchedule,
  resolveSessionPractitionerName,
  type SessionSchedule,
} from '../../services/sessionSchedule'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { StatusPill } from '../ui/StatusPill'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'

interface SessionScheduleDetailPanelProps {
  name: string
  onClose: () => void
  preview?: SessionSchedule
  onEdit?: () => void
}

function displayValue(value: unknown): string {
  if (value == null || value === '') return '—'
  return String(value)
}

function formatDate(value?: string | null): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('en-GB')
  } catch {
    return value
  }
}

function formatTimeRange(fromTime?: string, toTime?: string): string {
  if (!fromTime && !toTime) return '—'
  if (fromTime && toTime) return `${fromTime} – ${toTime}`
  return fromTime || toTime || '—'
}

function formatAmount(value?: number): string {
  if (value == null || Number.isNaN(value)) return '—'
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function InfoTile({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5 rounded-lg border border-emerald-100/70 bg-white/80 px-3 py-2.5 shadow-sm ring-1 ring-emerald-50/80">
      <div className="mt-0.5 shrink-0 text-emerald-600/80">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/65">{label}</p>
        <p className="mt-0.5 text-sm font-medium leading-snug break-words text-emerald-950">{value}</p>
      </div>
    </div>
  )
}

const statusColors: Record<string, string> = {
  Draft: 'warning',
  'In Progress': 'info',
  Completed: 'success',
  Submitted: 'success',
  Cancelled: 'danger',
}

export function SessionScheduleDetailPanel({
  name,
  onClose,
  preview,
  onEdit,
}: SessionScheduleDetailPanelProps) {
  const [doc, setDoc] = useState<SessionSchedule | null>(preview ? { ...preview, name } : null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [username, setUsername] = useState(
    preview?.practitioner_name || preview?.practitioner || '',
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchSessionSchedule(name)
      .then(async (data) => {
        const practitionerLabel = await resolveSessionPractitionerName(
          data.practitioner,
          data.practitioner_name,
        )
        if (!cancelled) {
          setDoc(data)
          setUsername(practitionerLabel)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load session schedule')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [name])

  const source = doc ?? preview

  const headerSubtitle = useMemo(() => {
    if (!source) return name
    const parts = [
      source.session_name || source.session_type,
      source.date ? formatDate(source.date) : null,
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : name
  }, [source, name])

  return (
    <DetailSlideOver
      title="Session Schedule"
      subtitle={headerSubtitle}
      icon={<Calendar className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      headerActions={
        <div className="flex items-center gap-2">
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex h-9 items-center rounded-lg border border-emerald-200/80 bg-white/80 px-3 text-xs font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-50"
            >
              Edit
            </button>
          ) : null}
          <PrintFormatDropdown
            doctype="Session Schedule"
            docName={name}
            noLetterhead={0}
            triggerPrint={1}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200/80 bg-white/80 text-emerald-700 shadow-sm transition hover:bg-emerald-50"
          />
        </div>
      }
    >
      {loading && !source ? (
        <div className="flex items-center justify-center py-12">
          <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
          <span className="text-sm text-slate-500">Loading session schedule…</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {source && !error ? (
        <div className="flex flex-col gap-5 pb-2">
          <section className={MODAL_SECTION_CLASS}>
            <h3 className={MODAL_SECTION_TITLE_CLASS}>
              <FileText className="h-4 w-4 text-emerald-600" strokeWidth={2} />
              Details
            </h3>
            <div className="mb-3">
              {source.transaction_status ? (
                <StatusPill
                  status={source.transaction_status}
                  color={statusColors[source.transaction_status] || 'default'}
                />
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <InfoTile
                icon={<User className="h-4 w-4" strokeWidth={2} />}
                label="Username"
                value={displayValue(username)}
              />
              <InfoTile
                icon={<Calendar className="h-4 w-4" strokeWidth={2} />}
                label="Date"
                value={formatDate(source.date)}
              />
              <InfoTile
                icon={<Clock className="h-4 w-4" strokeWidth={2} />}
                label="Time"
                value={formatTimeRange(source.from_time, source.to_time)}
              />
              <InfoTile
                icon={<FileText className="h-4 w-4" strokeWidth={2} />}
                label="Session"
                value={displayValue(source.session_name || source.session_type)}
              />
              <InfoTile
                icon={<FileText className="h-4 w-4" strokeWidth={2} />}
                label="Service template"
                value={displayValue(source.session_type)}
              />
              <InfoTile
                icon={<Stethoscope className="h-4 w-4" strokeWidth={2} />}
                label="Doctor"
                value={displayValue(source.doctor_name || source.doctor)}
              />
              <InfoTile
                icon={<Building2 className="h-4 w-4" strokeWidth={2} />}
                label="Branch"
                value={displayValue(source.cost_center)}
              />
              <InfoTile
                icon={<FileText className="h-4 w-4" strokeWidth={2} />}
                label="Amount"
                value={formatAmount(source.amount)}
              />
              <InfoTile
                icon={<FileText className="h-4 w-4" strokeWidth={2} />}
                label="Admission"
                value={displayValue(source.admission_number)}
              />
              <InfoTile
                icon={<FileText className="h-4 w-4" strokeWidth={2} />}
                label="Patient visit"
                value={displayValue(source.patient_visit)}
              />
              {source.sales_order ? (
                <InfoTile
                  icon={<FileText className="h-4 w-4" strokeWidth={2} />}
                  label="Sales order"
                  value={displayValue(source.sales_order)}
                />
              ) : null}
            </div>
          </section>

          {source.doc_remarks?.trim() ? (
            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>Remarks</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{source.doc_remarks}</p>
            </section>
          ) : null}

          {source.feedback_remarks?.trim() ? (
            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>Feedback</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{source.feedback_remarks}</p>
            </section>
          ) : null}
        </div>
      ) : null}
    </DetailSlideOver>
  )
}
