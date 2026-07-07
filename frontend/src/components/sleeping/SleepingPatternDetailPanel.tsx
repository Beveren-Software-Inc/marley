import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Calendar, FileText, Link2, Moon, User } from 'lucide-react'
import {
  fetchSleepingPattern,
  type SleepingPattern,
  type SleepingPatternDoc,
} from '../../services/sleepingPattern'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'

interface SleepingPatternDetailPanelProps {
  name: string
  onClose: () => void
  preview?: SleepingPattern
  onPatientClick?: (patient: string) => void
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

function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('en-GB')
  } catch {
    return value
  }
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (value == null || value === '') return 0
  const n = parseFloat(String(value))
  return Number.isFinite(n) ? n : 0
}

function PeriodBlock({
  title,
  colorClass,
  from,
  to,
  total,
}: {
  title: string
  colorClass: string
  from?: string | null
  to?: string | null
  total?: number | string | null
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${colorClass}`} />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">{title}</span>
        {total != null && total !== '' ? (
          <span className="ml-auto text-xs font-medium text-slate-600">{toNumber(total).toFixed(2)}h</span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-[10px] font-semibold uppercase text-slate-500">From</div>
          <div className="text-slate-800">{formatDateTime(from)}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase text-slate-500">To</div>
          <div className="text-slate-800">{formatDateTime(to)}</div>
        </div>
      </div>
    </div>
  )
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

export function SleepingPatternDetailPanel({
  name,
  onClose,
  preview,
  onPatientClick,
}: SleepingPatternDetailPanelProps) {
  const [doc, setDoc] = useState<SleepingPatternDoc | null>(preview ? { ...preview, name } : null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchSleepingPattern(name)
      .then((data) => {
        if (!cancelled) setDoc(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load sleeping pattern')
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

  const totalHours = useMemo(() => {
    if (!source) return null
    if (source.total_hours != null) return toNumber(source.total_hours)
    const sum =
      toNumber(source.morning_total) + toNumber(source.evening_total) + toNumber(source.night_total)
    return sum > 0 ? sum : null
  }, [source])

  const headerSubtitle = useMemo(() => {
    if (!source) return name
    const parts = [
      source.patient_name || source.file_no,
      source.date ? formatDate(source.date) : null,
      totalHours != null ? `${totalHours.toFixed(2)}h total` : null,
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : name
  }, [source, name, totalHours])

  const m = toNumber(source?.morning_total)
  const e = toNumber(source?.evening_total)
  const n = toNumber(source?.night_total)
  const barTotal = m + e + n || 1

  return (
    <DetailSlideOver
      title="Sleeping Pattern"
      subtitle={headerSubtitle}
      icon={<Moon className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      headerActions={
        <PrintFormatDropdown
          doctype="Sleeping Pattern"
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
          <span className="text-sm text-slate-500">Loading sleeping pattern…</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {source && !error ? (
        <div className="flex flex-col gap-5 pb-2">
          {totalHours != null ? (
            <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
              <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-3">
                <Moon className="h-5 w-5 text-emerald-600" strokeWidth={2} />
                <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">Sleep overview</h3>
                <span className="ml-auto text-sm font-semibold text-emerald-800">{totalHours.toFixed(2)}h total</span>
              </div>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
                {m > 0 ? (
                  <div className="h-full bg-sky-400" style={{ flex: m / barTotal }} title={`Morning: ${m.toFixed(2)}h`} />
                ) : null}
                {e > 0 ? (
                  <div
                    className="h-full bg-emerald-400"
                    style={{ flex: e / barTotal }}
                    title={`Evening: ${e.toFixed(2)}h`}
                  />
                ) : null}
                {n > 0 ? (
                  <div className="h-full bg-indigo-500" style={{ flex: n / barTotal }} title={`Night: ${n.toFixed(2)}h`} />
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-sky-400" /> Morning
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" /> Evening
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-indigo-500" /> Night
                </span>
              </div>
            </section>
          ) : null}

          <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
            <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">Sleep periods</h3>
            </div>
            <div className="space-y-3">
              <PeriodBlock
                title="Morning"
                colorClass="bg-sky-400"
                from={source.morning_from}
                to={source.morning_to}
                total={source.morning_total}
              />
              <PeriodBlock
                title="Evening"
                colorClass="bg-emerald-400"
                from={source.evening_from}
                to={source.evening_to}
                total={source.evening_total}
              />
              <PeriodBlock
                title="Night"
                colorClass="bg-indigo-500"
                from={source.night_from}
                to={source.night_to}
                total={source.night_total}
              />
            </div>
          </section>

          <section className={MODAL_SECTION_CLASS}>
            <h3 className={MODAL_SECTION_TITLE_CLASS}>
              <FileText className="h-4 w-4 text-emerald-600" strokeWidth={2} />
              Details
            </h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <InfoTile
                icon={<User className="h-4 w-4" strokeWidth={2} />}
                label="Patient"
                value={displayValue(doc?.patient_name || doc?.file_no || preview?.patient_name || preview?.file_no)}
                onClick={
                  (doc?.file_no || preview?.file_no) && onPatientClick
                    ? () => onPatientClick((doc?.file_no || preview?.file_no)!)
                    : undefined
                }
              />
              <InfoTile
                icon={<Link2 className="h-4 w-4" strokeWidth={2} />}
                label="Admission"
                value={displayValue(doc?.admission_no || preview?.admission_no)}
              />
              <InfoTile
                icon={<Calendar className="h-4 w-4" strokeWidth={2} />}
                label="Date"
                value={formatDate(doc?.date || preview?.date)}
              />
              <InfoTile
                icon={<FileText className="h-4 w-4" strokeWidth={2} />}
                label="Recorded by"
                value={displayValue(doc?.user || preview?.user)}
              />
              <InfoTile
                icon={<FileText className="h-4 w-4" strokeWidth={2} />}
                label="Branch"
                value={displayValue(doc?.branch || preview?.branch)}
              />
              <InfoTile
                icon={<FileText className="h-4 w-4" strokeWidth={2} />}
                label="Record ID"
                value={displayValue(doc?.name || preview?.name || name)}
              />
            </div>
          </section>
        </div>
      ) : null}
    </DetailSlideOver>
  )
}
