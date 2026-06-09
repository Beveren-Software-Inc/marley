import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Building2,
  Calendar,
  ClipboardList,
  Eye,
  Stethoscope,
  User,
} from 'lucide-react'
import { fetchObservation, type Observation } from '../../services/observations'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { RichTextContent } from '../ui/RichTextContent'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'
import { useFormatMoney } from '../../hooks/useFormatMoney'

interface ObservationDetailPanelProps {
  name: string
  onClose: () => void
  preview?: Observation
  onPatientClick?: (patient: string) => void
}

function displayValue(value: unknown): string {
  if (value == null || value === '') return '—'
  return String(value)
}

function formatDate(value?: string): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return value
  }
}

function formatDateTime(value?: string): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return value
  }
}

function careContextLabel(doc: Observation): string {
  if (doc.admission_no) {
    return `Inpatient · ${doc.admission_no}`
  }
  if (doc.reference_doctype === 'Patient Visit' && doc.reference_docname) {
    return `Outpatient visit · ${doc.reference_docname}`
  }
  if (doc.reference_doctype && doc.reference_docname) {
    return `${doc.reference_doctype} · ${doc.reference_docname}`
  }
  return '—'
}

function getResultDisplay(obs: Observation): string {
  if (obs.result_text) return obs.result_text
  if (obs.result_float !== undefined && obs.result_float !== null) return String(obs.result_float)
  if (obs.result_select) return obs.result_select
  if (obs.result_boolean !== undefined && obs.result_boolean !== null) {
    return obs.result_boolean ? 'Yes' : 'No'
  }
  if (obs.result_datetime) return formatDateTime(obs.result_datetime)
  if (obs.result_time) return obs.result_time
  if (obs.result_data) return obs.result_data
  return '—'
}

function InfoTile({
  icon,
  label,
  value,
  onClick,
}: {
  icon: ReactNode
  label: string
  value: string
  onClick?: () => void
}) {
  const valueEl = (
    <p
      className={`mt-0.5 text-sm font-medium leading-snug break-words ${
        onClick ? 'text-primary hover:underline cursor-pointer' : 'text-emerald-950'
      }`}
    >
      {value}
    </p>
  )

  return (
    <div className="flex min-w-0 items-start gap-2.5 rounded-lg border border-emerald-100/70 bg-white/80 px-3 py-2.5 shadow-sm ring-1 ring-emerald-50/80">
      <div className="mt-0.5 shrink-0 text-emerald-600/80">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/65">{label}</p>
        {onClick ? (
          <button type="button" onClick={onClick} className="text-left w-full">
            {valueEl}
          </button>
        ) : (
          valueEl
        )}
      </div>
    </div>
  )
}

export function ObservationDetailPanel({
  name,
  onClose,
  preview,
  onPatientClick,
}: ObservationDetailPanelProps) {
  const formatCurrency = useFormatMoney()
  const [doc, setDoc] = useState<Observation | null>(preview ? { ...preview, name } : null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchObservation(name)
      .then((data) => {
        if (!cancelled) setDoc(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load observation')
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
      source.patient_name || source.patient,
      source.observation_level,
      source.start_date ? formatDate(source.start_date) : null,
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : name
  }, [source, name])

  const resultText = source ? getResultDisplay(source) : '—'
  const noteBody = source?.note

  return (
    <DetailSlideOver
      title="Observation"
      subtitle={headerSubtitle}
      icon={<Eye className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      headerActions={
        <PrintFormatDropdown
          doctype="Observation"
          docName={name}
          noLetterhead={0}
          triggerPrint={1}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200/80 bg-white/80 text-emerald-700 shadow-sm transition hover:bg-emerald-50"
        />
      }
    >
      {loading && !source ? (
        <div className="flex items-center justify-center py-12">
          <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
          <span className="text-sm text-slate-500">Loading observation…</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {source && !error ? (
        <div className="flex flex-col gap-5 pb-2">
          <section className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/70">Observation level</p>
            <h3 className="mt-1 text-lg font-semibold text-emerald-950">
              {displayValue(source.observation_level)}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Security: {displayValue(source.designated_security_personel)}
            </p>
          </section>

          <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
            <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-3">
              <ClipboardList className="h-5 w-5 text-emerald-600" strokeWidth={2} />
              <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">Result</h3>
            </div>
            <div className="min-h-[4rem] rounded-lg bg-slate-50/80 px-4 py-4 ring-1 ring-slate-100 text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap">
              {resultText}
            </div>
          </section>

          {noteBody ? (
            <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-emerald-900">Note</h3>
              <RichTextContent value={noteBody} className="text-[15px] leading-relaxed text-slate-800" />
            </section>
          ) : null}

          <section className={MODAL_SECTION_CLASS}>
            <h3 className={MODAL_SECTION_TITLE_CLASS}>
              <ClipboardList className="h-4 w-4 text-emerald-600" strokeWidth={2} />
              Details
            </h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <InfoTile
                icon={<User className="h-4 w-4" strokeWidth={2} />}
                label="Patient"
                value={displayValue(source.patient_name || source.patient)}
                onClick={
                  source.patient && onPatientClick ? () => onPatientClick(source.patient) : undefined
                }
              />
              <InfoTile
                icon={<Stethoscope className="h-4 w-4" strokeWidth={2} />}
                label="Practitioner"
                value={displayValue(source.practitioner_name || source.healthcare_practitioner)}
              />
              <InfoTile
                icon={<Calendar className="h-4 w-4" strokeWidth={2} />}
                label="Start date"
                value={formatDate(source.start_date)}
              />
              <InfoTile
                icon={<Calendar className="h-4 w-4" strokeWidth={2} />}
                label="DC date"
                value={formatDate(source.dc_date)}
              />
              <InfoTile
                icon={<Building2 className="h-4 w-4" strokeWidth={2} />}
                label="Room"
                value={displayValue(source.room_name || source.room)}
              />
              <InfoTile
                icon={<Calendar className="h-4 w-4" strokeWidth={2} />}
                label="Duration"
                value={displayValue(source.duration)}
              />
              <InfoTile
                icon={<Building2 className="h-4 w-4" strokeWidth={2} />}
                label="Amount"
                value={
                  source.amount != null
                    ? formatCurrency(Number(source.amount))
                    : '—'
                }
              />
              <InfoTile
                icon={<Building2 className="h-4 w-4" strokeWidth={2} />}
                label="Care context"
                value={careContextLabel(source)}
              />
              <InfoTile
                icon={<Eye className="h-4 w-4" strokeWidth={2} />}
                label="Observation ID"
                value={displayValue(source.trans_no || source.name || name)}
              />
            </div>
          </section>
        </div>
      ) : null}
    </DetailSlideOver>
  )
}
