import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Building2,
  Calendar,
  ClipboardList,
  Droplet,
  FileText,
  Link2,
  Stethoscope,
  User,
  Users,
} from 'lucide-react'
import { fetchWarningMessage, type WarningMessage } from '../../services/warningMessages'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { RichTextContent } from '../ui/RichTextContent'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'

type WarningMessageDoc = WarningMessage & Record<string, unknown>

interface WarningMessageDetailPanelProps {
  name: string
  onClose: () => void
  /** List row for instant header context while the full record loads */
  preview?: WarningMessage
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

function mapWarningMessageDoc(data: Record<string, unknown>): WarningMessageDoc {
  return {
    name: String(data.name ?? ''),
    patient: data.patient ? String(data.patient) : undefined,
    patient_name: data.patient_name ? String(data.patient_name) : undefined,
    posting_date: data.posting_date ? String(data.posting_date) : undefined,
    practitioner: data.practitioner ? String(data.practitioner) : undefined,
    practitioner_name: data.practitioner_name ? String(data.practitioner_name) : undefined,
    warning: data.warning ? String(data.warning) : undefined,
    reference_doc: data.reference_doc ? String(data.reference_doc) : undefined,
    reference_name: data.reference_name ? String(data.reference_name) : undefined,
    medical_role: data.medical_role ? String(data.medical_role) : undefined,
    type_of_warning: data.type_of_warning ? String(data.type_of_warning) : undefined,
    gender: data.gender ? String(data.gender) : undefined,
    blood_group: data.blood_group ? String(data.blood_group) : undefined,
    trans_id: data.trans_id ? String(data.trans_id) : undefined,
    high_risk_text: data.high_risk_text ? String(data.high_risk_text) : undefined,
    clinical_note_type: data.clinical_note_type ? String(data.clinical_note_type) : undefined,
    cost_center: data.cost_center ? String(data.cost_center) : undefined,
    warning_message_type: data.warning_message_type ? String(data.warning_message_type) : undefined,
    warning_message_class: data.warning_message_class ? String(data.warning_message_class) : undefined,
    creation: data.creation ? String(data.creation) : undefined,
    modified: data.modified ? String(data.modified) : undefined,
  }
}

export function WarningMessageDetailPanel({
  name,
  onClose,
  preview,
  onPatientClick,
}: WarningMessageDetailPanelProps) {
  const [doc, setDoc] = useState<WarningMessageDoc | null>(preview ? { ...preview, name } : null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchWarningMessage(name)
      .then((data) => {
        if (!cancelled) setDoc(mapWarningMessageDoc(data))
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load warning message')
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
  const warningType = source?.type_of_warning || 'Medical'
  const isOrganisation = warningType === 'Organisation'

  const headerSubtitle = useMemo(() => {
    if (!source) return name
    const parts = [
      isOrganisation ? 'Organisation notice' : source.patient_name || source.patient,
      source.posting_date ? formatDateTime(source.posting_date) : null,
      source.trans_id || source.name,
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : name
  }, [source, name, isOrganisation])

  const warningBody = doc?.warning ?? preview?.warning
  const highRiskText = doc?.high_risk_text

  const referenceLabel =
    source?.reference_doc && source?.reference_name
      ? `${source.reference_doc} · ${source.reference_name}`
      : source?.reference_name || source?.reference_doc || '—'

  return (
    <DetailSlideOver
      title={isOrganisation ? 'Organisation Warning' : 'Warning & Allergy'}
      subtitle={headerSubtitle}
      icon={<AlertTriangle className="h-5 w-5 text-amber-600" strokeWidth={2} />}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      headerActions={
        <PrintFormatDropdown
          doctype="Warning Message"
          docName={name}
          noLetterhead={0}
          triggerPrint={1}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200/80 bg-white/80 text-emerald-700 shadow-sm transition hover:bg-emerald-50"
        />
      }
    >
      {loading && !warningBody ? (
        <div className="flex items-center justify-center py-12">
          <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
          <span className="text-sm text-slate-500">Loading warning…</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {source && !error ? (
        <div className="flex flex-col gap-5 pb-2">
          {highRiskText ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-red-800/80">High risk</p>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed">{highRiskText}</p>
              </div>
            </div>
          ) : null}

          <section className="rounded-xl border border-amber-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-amber-100/80 sm:px-5 sm:py-5">
            <div className="mb-3 flex items-center gap-2 border-b border-amber-100 pb-3">
              <FileText className="h-5 w-5 text-amber-600" strokeWidth={2} />
              <h3 className="text-sm font-bold uppercase tracking-wide text-amber-950">Warning</h3>
            </div>
            <div className="min-h-[8rem] rounded-lg bg-slate-50/80 px-4 py-4 ring-1 ring-slate-100">
              {loading && warningBody ? (
                <p className="mb-3 text-xs text-slate-400">Refreshing full record…</p>
              ) : null}
              <RichTextContent
                value={warningBody || ''}
                className="text-[15px] leading-relaxed text-slate-800"
              />
            </div>
          </section>

          <section className={MODAL_SECTION_CLASS}>
            <h3 className={MODAL_SECTION_TITLE_CLASS}>
              <ClipboardList className="h-4 w-4 text-emerald-600" strokeWidth={2} />
              Details
            </h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <InfoTile
                icon={<AlertTriangle className="h-4 w-4" strokeWidth={2} />}
                label="Type"
                value={displayValue(warningType)}
              />
              {!isOrganisation ? (
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
              ) : (
                <InfoTile
                  icon={<Users className="h-4 w-4" strokeWidth={2} />}
                  label="Scope"
                  value="Organisation-wide"
                />
              )}
              <InfoTile
                icon={<Stethoscope className="h-4 w-4" strokeWidth={2} />}
                label="Practitioner"
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
              {!isOrganisation && (doc?.gender || preview?.gender) ? (
                <InfoTile
                  icon={<User className="h-4 w-4" strokeWidth={2} />}
                  label="Gender"
                  value={displayValue(doc?.gender || preview?.gender)}
                />
              ) : null}
              {!isOrganisation && (doc?.blood_group || preview?.blood_group) ? (
                <InfoTile
                  icon={<Droplet className="h-4 w-4" strokeWidth={2} />}
                  label="Blood group"
                  value={displayValue(doc?.blood_group || preview?.blood_group)}
                />
              ) : null}
              {doc?.medical_role || preview?.medical_role ? (
                <InfoTile
                  icon={<Stethoscope className="h-4 w-4" strokeWidth={2} />}
                  label="Medical role"
                  value={displayValue(doc?.medical_role || preview?.medical_role)}
                />
              ) : null}
              {referenceLabel !== '—' ? (
                <InfoTile
                  icon={<Link2 className="h-4 w-4" strokeWidth={2} />}
                  label="Reference"
                  value={referenceLabel}
                />
              ) : null}
              {doc?.clinical_note_type ? (
                <InfoTile
                  icon={<FileText className="h-4 w-4" strokeWidth={2} />}
                  label="Clinical note type"
                  value={displayValue(doc.clinical_note_type)}
                />
              ) : null}
              {doc?.cost_center ? (
                <InfoTile
                  icon={<Building2 className="h-4 w-4" strokeWidth={2} />}
                  label="Branch"
                  value={displayValue(doc.cost_center)}
                />
              ) : null}
              <InfoTile
                icon={<FileText className="h-4 w-4" strokeWidth={2} />}
                label="Warning ID"
                value={displayValue(doc?.trans_id || doc?.name || preview?.name || name)}
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
