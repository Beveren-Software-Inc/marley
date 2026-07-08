import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Building2,
  Calendar,
  ClipboardList,
  FileText,
  Stethoscope,
  User,
} from 'lucide-react'
import {
  fetchMedicalDiagnosisEntry,
  type MedicalDiagnosisEntryAggRow,
} from '../../services/medicalDiagnosisEntry'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { RichTextContent } from '../ui/RichTextContent'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'

interface MedicalDiagnosisDetailPanelProps {
  name: string
  onClose: () => void
  /** List row for instant header context while the full entry loads */
  preview?: MedicalDiagnosisEntryAggRow
  onPatientClick?: (patient: string) => void
}

function displayValue(value: unknown): string {
  if (value == null || value === '') return '—'
  return String(value)
}

function formatDateTime(value?: string): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('en-GB')
  } catch {
    return value
  }
}

function careContextLabel(doc?: Pick<MedicalDiagnosisEntryAggRow, 'inpatient_admission' | 'visit_num'>): string {
  if (doc?.inpatient_admission) {
    return `Inpatient · ${doc.inpatient_admission}`
  }
  if (doc?.visit_num) {
    return `Outpatient visit · ${doc.visit_num}`
  }
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

export function MedicalDiagnosisDetailPanel({
  name,
  onClose,
  preview,
  onPatientClick,
}: MedicalDiagnosisDetailPanelProps) {
  const [doc, setDoc] = useState<MedicalDiagnosisEntryAggRow | null>(
    preview ? { ...preview, name } : null,
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchMedicalDiagnosisEntry(name)
      .then((data) => {
        if (!cancelled) setDoc(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load diagnosis entry')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [name])

  const headerSubtitle = useMemo(() => {
    const source = doc ?? preview
    if (!source) return name
    const diagnosisLabel =
      source.diagnosis_name?.trim() || source.diagnosis_label || source.diagnosis || ''
    const parts = [
      source.patient_name || source.patient,
      diagnosisLabel,
      source.posting_date ? formatDateTime(source.posting_date) : null,
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : name
  }, [doc, preview, name])

  const detailsBody = doc?.details ?? preview?.details
  const diagnosisTitle =
    doc?.diagnosis_name?.trim() ||
    preview?.diagnosis_name?.trim() ||
    doc?.diagnosis_label ||
    preview?.diagnosis_label ||
    doc?.diagnosis ||
    preview?.diagnosis ||
    'Diagnosis'

  return (
    <DetailSlideOver
      title="Medical Diagnosis"
      subtitle={headerSubtitle}
      icon={<Stethoscope className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      headerActions={
        <PrintFormatDropdown
          doctype="Medical Diagnosis Entry"
          docName={name}
          noLetterhead={0}
          triggerPrint={1}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200/80 bg-white/80 text-emerald-700 shadow-sm transition hover:bg-emerald-50"
        />
      }
    >
      {loading && !detailsBody ? (
        <div className="flex items-center justify-center py-12">
          <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
          <span className="text-sm text-slate-500">Loading diagnosis…</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {(doc || preview) && !error ? (
        <div className="flex flex-col gap-5 pb-2">
          <section className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/70">
              Diagnosis
            </p>
            <h3 className="mt-1 text-lg font-semibold text-emerald-950">{diagnosisTitle}</h3>
            {(doc?.disease_no || preview?.disease_no || doc?.diagnosis || preview?.diagnosis) ? (
              <p className="mt-1 font-mono text-sm text-slate-600">
                {doc?.disease_no || preview?.disease_no || doc?.diagnosis || preview?.diagnosis}
              </p>
            ) : null}
            {(doc?.diagnosis_group_name || preview?.diagnosis_group_name) ? (
              <p className="mt-2 text-sm text-slate-600">
                Group: {doc?.diagnosis_group_name || preview?.diagnosis_group_name}
              </p>
            ) : null}
          </section>

          <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
            <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-3">
              <FileText className="h-5 w-5 text-emerald-600" strokeWidth={2} />
              <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">Remarks</h3>
            </div>
            <div className="min-h-[6rem] rounded-lg bg-slate-50/80 px-4 py-4 ring-1 ring-slate-100">
              {loading && detailsBody ? (
                <p className="mb-3 text-xs text-slate-400">Refreshing full entry…</p>
              ) : null}
              <RichTextContent
                value={detailsBody || ''}
                className="text-[15px] leading-relaxed text-slate-800"
              />
            </div>
          </section>

          <section className={MODAL_SECTION_CLASS}>
            <h3 className={MODAL_SECTION_TITLE_CLASS}>
              <ClipboardList className="h-4 w-4 text-emerald-600" strokeWidth={2} />
              Record info
            </h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <InfoTile
                icon={<User className="h-4 w-4" strokeWidth={2} />}
                label="Patient"
                value={displayValue(
                  doc?.patient_name || doc?.patient || preview?.patient_name || preview?.patient,
                )}
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
                  doc?.practitioner_name ||
                    doc?.practitioner ||
                    preview?.practitioner_name ||
                    preview?.practitioner,
                )}
              />
              <InfoTile
                icon={<Calendar className="h-4 w-4" strokeWidth={2} />}
                label="Posted"
                value={formatDateTime(doc?.posting_date || preview?.posting_date)}
              />
              <InfoTile
                icon={<Building2 className="h-4 w-4" strokeWidth={2} />}
                label="Care context"
                value={careContextLabel(doc ?? preview)}
              />
              <InfoTile
                icon={<Building2 className="h-4 w-4" strokeWidth={2} />}
                label="Branch"
                value={displayValue(doc?.cost_center || preview?.cost_center)}
              />
              <InfoTile
                icon={<FileText className="h-4 w-4" strokeWidth={2} />}
                label="Entry ID"
                value={displayValue(doc?.name || preview?.name || name)}
              />
            </div>
          </section>
        </div>
      ) : null}
    </DetailSlideOver>
  )
}
