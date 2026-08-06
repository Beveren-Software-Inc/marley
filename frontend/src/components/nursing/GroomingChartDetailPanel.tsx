import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Building2, Calendar, FileText, Link2, Sparkles, User } from 'lucide-react'
import {
  fetchGroomingChart,
  type GroomingChartDoc,
  type GroomingChartRow,
} from '../../services/groomingCharts'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'

interface GroomingChartDetailPanelProps {
  name: string
  onClose: () => void
  preview?: GroomingChartRow
  onPatientClick?: (patient: string) => void
}

const CheckIcon = ({ checked }: { checked: boolean }) =>
  checked ? (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
      ✓
    </span>
  ) : (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-400">
      —
    </span>
  )

const SectionLabel = ({ label }: { label: string }) => (
  <div className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
)

const CheckRow = ({ label, value }: { label: string; value: 0 | 1 | undefined | null }) => (
  <div className="flex items-center justify-between border-b border-slate-100 py-1 last:border-0">
    <span className="text-xs text-slate-600">{label}</span>
    <CheckIcon checked={!!value} />
  </div>
)

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

export function GroomingChartDetailPanel({
  name,
  onClose,
  preview,
  onPatientClick,
}: GroomingChartDetailPanelProps) {
  const [doc, setDoc] = useState<GroomingChartDoc | null>(preview ? { ...preview, name } : null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchGroomingChart(name)
      .then((data) => {
        if (!cancelled) setDoc(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load grooming chart')
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
      source.patient_name || source.file_no,
      source.date ? formatDate(source.date) : null,
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : name
  }, [source, name])

  return (
    <DetailSlideOver
      title="Grooming Chart"
      subtitle={headerSubtitle}
      icon={<Sparkles className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      headerActions={
        <PrintFormatDropdown
          doctype="IP Grooming Chart"
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
          <span className="text-sm text-slate-500">Loading grooming chart…</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {source && !error ? (
        <div className="flex flex-col gap-5 pb-2">
          <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
            <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-3">
              <Sparkles className="h-5 w-5 text-emerald-600" strokeWidth={2} />
              <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">Hygiene & Care</h3>
            </div>
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <div>
                <SectionLabel label="Morning" />
                <CheckRow label="Brush Teeth" value={source.brush_teeth_morning} />
                <CheckRow label="Change Clothes" value={source.change_clothes_morning} />
              </div>
              <div>
                <SectionLabel label="Noon" />
                <CheckRow label="Brush Teeth" value={source.brush_teeth_noon} />
                <CheckRow label="Change Clothes" value={source.change_clothes_noon} />
              </div>
              <div className="mt-1 sm:col-span-2">
                <SectionLabel label="General" />
                <div className="grid grid-cols-3 gap-x-4">
                  <CheckRow label="Shower" value={source.shower} />
                  <CheckRow label="Bowel" value={source.bowel} />
                  <CheckRow label="Bed Wetting" value={source.bed_wetting} />
                </div>
              </div>
            </div>
            {source.hygiene_comment ? (
              <div className="mt-3 rounded-md border border-emerald-100 bg-emerald-50/50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Comment</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{source.hygiene_comment}</p>
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
            <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">Meals</h3>
            </div>
            <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
              <CheckRow label="Breakfast" value={source.breakfast} />
              <CheckRow label="Snack 1" value={source.snack_1} />
              <CheckRow label="Lunch" value={source.lunch} />
              <CheckRow label="Snack 2" value={source.snack_2} />
              <CheckRow label="Dinner" value={source.dinner} />
              <CheckRow label="Snack 3" value={source.snack_3} />
            </div>
            {source.meal_comment ? (
              <div className="mt-3 rounded-md border border-emerald-100 bg-emerald-50/50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Comment</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{source.meal_comment}</p>
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
            <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">Measurements</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Weight</div>
                <div className="text-sm font-semibold text-slate-800">
                  {source.weight != null ? `${source.weight} kg` : '—'}
                </div>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">LMP</div>
                <div className="text-sm font-semibold text-slate-800">
                  {source.lmp ? formatDate(source.lmp) : '—'}
                </div>
              </div>
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
                label="Chart date"
                value={formatDate(doc?.date || preview?.date)}
              />
              <InfoTile
                icon={<Building2 className="h-4 w-4" strokeWidth={2} />}
                label="Branch"
                value={displayValue(doc?.cost_center || preview?.cost_center)}
              />
              <InfoTile
                icon={<FileText className="h-4 w-4" strokeWidth={2} />}
                label="Record ID"
                value={displayValue(doc?.name || preview?.name || name)}
              />
            </div>
          </section>

          {doc?.creation ? (
            <p className="text-center text-xs text-slate-400">
              Recorded {formatDateTime(doc.creation)}
              {doc.modified && doc.modified !== doc.creation ? ` · Updated ${formatDateTime(doc.modified)}` : ''}
            </p>
          ) : null}
        </div>
      ) : null}
    </DetailSlideOver>
  )
}
