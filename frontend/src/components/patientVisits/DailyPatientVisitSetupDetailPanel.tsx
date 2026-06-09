import { useMemo, type ReactNode } from 'react'
import { CalendarClock, CalendarDays, Clock, DollarSign, Stethoscope, User } from 'lucide-react'
import { type DailyPatientVisitSetup } from '../../services/dailyPatientVisitSetup'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'

interface DailyPatientVisitSetupDetailPanelProps {
  row: DailyPatientVisitSetup
  sessionLabel?: string
  onClose: () => void
  onPatientClick?: (patient: string) => void
}

function displayValue(value: unknown): string {
  if (value == null || value === '') return '—'
  return String(value)
}

function formatDate(value?: string | null): string {
  if (!value) return '—'
  if (value === 'Today') {
    return new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  }
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

function formatDateTime(value?: string | null): string {
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
        onClick ? 'cursor-pointer text-primary hover:underline' : 'text-emerald-950'
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
          <button type="button" onClick={onClick} className="w-full text-left">
            {valueEl}
          </button>
        ) : (
          valueEl
        )}
      </div>
    </div>
  )
}

export function DailyPatientVisitSetupDetailPanel({
  row,
  sessionLabel,
  onClose,
  onPatientClick,
}: DailyPatientVisitSetupDetailPanelProps) {
  const headerSubtitle = useMemo(() => {
    const parts = [
      row.patient_name || row.patient,
      row.from_date ? formatDate(row.from_date) : null,
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : row.name
  }, [row])

  const statusLabel = row.is_active ? 'Active' : 'Stopped'

  return (
    <DetailSlideOver
      title="Daily Patient Visit Setup"
      subtitle={headerSubtitle}
      icon={<CalendarClock className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      headerActions={
        row.name ? (
          <a
            href={`/app/daily-patient-visit-setup/${encodeURIComponent(row.name)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-emerald-200/80 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-emerald-800 shadow-sm transition hover:bg-emerald-50"
          >
            Open in Frappe ↗
          </a>
        ) : null
      }
    >
      <div className="space-y-5">
        <section className={MODAL_SECTION_CLASS}>
          <h3 className={MODAL_SECTION_TITLE_CLASS}>Overview</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoTile icon={<CalendarDays className="h-4 w-4" />} label="Date" value={formatDate(row.posting_date)} />
            <InfoTile icon={<CalendarDays className="h-4 w-4" />} label="Entry Date" value={formatDateTime(row.creation)} />
            <InfoTile icon={<User className="h-4 w-4" />} label="File No." value={displayValue(row.file_no)} />
            <InfoTile
              icon={<User className="h-4 w-4" />}
              label="Patient Name"
              value={displayValue(row.patient_name || row.patient)}
              onClick={row.patient && onPatientClick ? () => onPatientClick(row.patient) : undefined}
            />
            <InfoTile icon={<Stethoscope className="h-4 w-4" />} label="Doctor" value={displayValue(row.practitioner_name || row.practioner)} />
            <InfoTile icon={<DollarSign className="h-4 w-4" />} label="Amount" value={(row.amount || 0).toFixed(2)} />
            <InfoTile icon={<CalendarDays className="h-4 w-4" />} label="Start Date" value={formatDate(row.from_date)} />
            <InfoTile icon={<CalendarDays className="h-4 w-4" />} label="End Date" value={formatDate(row.to_date)} />
            <InfoTile
              icon={<CalendarClock className="h-4 w-4" />}
              label="Status"
              value={statusLabel}
            />
          </div>
        </section>

        <section className={MODAL_SECTION_CLASS}>
          <h3 className={MODAL_SECTION_TITLE_CLASS}>Schedule</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoTile icon={<Clock className="h-4 w-4" />} label="Time" value={displayValue(row.time)} />
            <InfoTile icon={<CalendarClock className="h-4 w-4" />} label="Session" value={displayValue(sessionLabel || row.session)} />
          </div>
        </section>

        {(row.admission || row.discharge || row.name) && (
          <section className={MODAL_SECTION_CLASS}>
            <h3 className={MODAL_SECTION_TITLE_CLASS}>Reference</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InfoTile icon={<CalendarDays className="h-4 w-4" />} label="Setup No." value={displayValue(row.name)} />
              {row.admission ? (
                <InfoTile icon={<CalendarDays className="h-4 w-4" />} label="Admission" value={displayValue(row.admission)} />
              ) : null}
              {row.discharge ? (
                <InfoTile icon={<CalendarDays className="h-4 w-4" />} label="Discharge" value={displayValue(row.discharge)} />
              ) : null}
            </div>
          </section>
        )}
      </div>
    </DetailSlideOver>
  )
}
