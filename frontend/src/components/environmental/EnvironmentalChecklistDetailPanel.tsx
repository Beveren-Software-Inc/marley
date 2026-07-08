import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Building2,
  Calendar,
  Check,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Link2,
  Stethoscope,
  User,
  X,
} from 'lucide-react'
import {
  fetchEnvironmentalChecklist,
  type EnvironmentalChecklistRecord,
} from '../../services/environmentalChecklist'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'

interface EnvironmentalChecklistDetailPanelProps {
  name: string
  onClose: () => void
  preview?: EnvironmentalChecklistRecord
  onPatientClick?: (patient: string) => void
  onEdit?: (name: string) => void
}

function displayValue(value: unknown): string {
  if (value == null || value === '') return '—'
  return String(value)
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('en-GB')
  } catch {
    return value
  }
}

function careContextLabel(doc: EnvironmentalChecklistRecord): string {
  if (doc.inpatient_admission) return `Inpatient · ${doc.inpatient_admission}`
  if (doc.patient_visit) return `Outpatient visit · ${doc.patient_visit}`
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

export function EnvironmentalChecklistDetailPanel({
  name,
  onClose,
  preview,
  onPatientClick,
  onEdit,
}: EnvironmentalChecklistDetailPanelProps) {
  const [doc, setDoc] = useState<EnvironmentalChecklistRecord | null>(
    preview ? { ...preview, name } : null
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchEnvironmentalChecklist(name)
      .then((data) => {
        if (!cancelled) setDoc(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load environmental checklist')
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
  const details = doc?.details ?? []
  const completed = doc?.completed_count ?? preview?.completed_count ?? 0
  const total = doc?.total_count ?? preview?.total_count ?? details.length
  const pct = total > 0 ? Math.round((completed / total) * 100) : null

  const headerSubtitle = useMemo(() => {
    if (!source) return name
    const parts = [
      source.patient_name || source.patient,
      source.creation ? formatDateTime(source.creation) : null,
      source.environmental_checklist_template,
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : name
  }, [source, name])

  return (
    <DetailSlideOver
      title="Environmental Checklist"
      subtitle={headerSubtitle}
      icon={<ClipboardCheck className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      headerActions={
        <div className="flex items-center gap-2">
          {onEdit ? (
            <button
              type="button"
              onClick={() => onEdit(name)}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-200/50 border border-emerald-200"
            >
              Edit
            </button>
          ) : null}
          <PrintFormatDropdown
            doctype="Environmental Checklist"
            docName={name}
            noLetterhead={0}
            triggerPrint={1}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200/80 bg-white/80 text-emerald-700 shadow-sm transition hover:bg-emerald-50"
          />
        </div>
      }
    >
      {loading && details.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
          <span className="text-sm text-slate-500">Loading checklist…</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {source && !error ? (
        <div className="flex flex-col gap-5 pb-2">
          {total > 0 ? (
            <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
              <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-3">
                <ClipboardCheck className="h-5 w-5 text-emerald-600" strokeWidth={2} />
                <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">Progress</h3>
                {pct != null ? (
                  <span
                    className={`ml-auto text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                      pct >= 100
                        ? 'bg-emerald-100 text-emerald-800'
                        : pct >= 50
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {completed} / {total} ({pct}%)
                  </span>
                ) : null}
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${pct ?? 0}%` }}
                />
              </div>
            </section>
          ) : null}

          <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
            <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-3">
              <ClipboardList className="h-5 w-5 text-emerald-600" strokeWidth={2} />
              <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">Checklist</h3>
            </div>

            {loading && details.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">Loading items…</p>
            ) : details.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">No checklist items.</p>
            ) : (
              <ul className="space-y-2">
                {details.map((item) => (
                  <li
                    key={item.name}
                    className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 ${
                      item.checked
                        ? 'border-green-200 bg-green-50/60'
                        : 'border-slate-200 bg-slate-50/50'
                    }`}
                  >
                    {item.checked ? (
                      <Check className="w-4 h-4 text-green-600 shrink-0 mt-0.5" strokeWidth={2.5} />
                    ) : (
                      <X className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" strokeWidth={2.5} />
                    )}
                    <span
                      className={`text-sm leading-snug ${
                        item.checked ? 'text-slate-800' : 'text-slate-600'
                      }`}
                    >
                      {item.item_name || '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={MODAL_SECTION_CLASS}>
            <h3 className={MODAL_SECTION_TITLE_CLASS}>
              <ClipboardList className="h-4 w-4 text-emerald-600" strokeWidth={2} />
              Details
            </h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <InfoTile
                icon={<User className="h-4 w-4" strokeWidth={2} />}
                label="Patient"
                value={displayValue(doc?.patient_name || doc?.patient || preview?.patient_name || preview?.patient)}
                onClick={
                  (doc?.patient || preview?.patient) && onPatientClick
                    ? () => onPatientClick((doc?.patient || preview?.patient)!)
                    : undefined
                }
              />
              <InfoTile
                icon={<Stethoscope className="h-4 w-4" strokeWidth={2} />}
                label="Doctor Name"
                value={displayValue(
                  doc?.practitioner_name || doc?.practitioner || preview?.practitioner_name || preview?.practitioner
                )}
              />
              <InfoTile
                icon={<Calendar className="h-4 w-4" strokeWidth={2} />}
                label="Created"
                value={formatDateTime(doc?.creation || preview?.creation)}
              />
              <InfoTile
                icon={<FileText className="h-4 w-4" strokeWidth={2} />}
                label="Template"
                value={displayValue(
                  doc?.environmental_checklist_template || preview?.environmental_checklist_template
                )}
              />
              {(() => {
                const contextSource = doc ?? preview
                const careContext = contextSource ? careContextLabel(contextSource) : '—'
                return careContext !== '—' ? (
                  <InfoTile
                    icon={<Link2 className="h-4 w-4" strokeWidth={2} />}
                    label="Care context"
                    value={careContext}
                  />
                ) : null
              })()}
              {doc?.cost_center || preview?.cost_center ? (
                <InfoTile
                  icon={<Building2 className="h-4 w-4" strokeWidth={2} />}
                  label="Branch"
                  value={displayValue(doc?.cost_center || preview?.cost_center)}
                />
              ) : null}
              <InfoTile
                icon={<FileText className="h-4 w-4" strokeWidth={2} />}
                label="Checklist ID"
                value={displayValue(doc?.name || preview?.name || name)}
              />
            </div>
          </section>

          {doc?.creation ? (
            <p className="text-center text-xs text-slate-400">
              Recorded {formatDateTime(doc.creation)}
              {doc.modified && doc.modified !== doc.creation
                ? ` · Updated ${formatDateTime(doc.modified)}`
                : ''}
            </p>
          ) : null}
        </div>
      ) : null}
    </DetailSlideOver>
  )
}
