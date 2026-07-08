import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Building2,
  Calendar,
  ClipboardList,
  FileText,
  Lock,
  NotebookPen,
  Stethoscope,
  User,
} from 'lucide-react'
import { fetchClinicalNote, type ClinicalNote } from '../../services/clinicalNotes'
import { fetchActiveCareEpisodeStatus } from '../../services/careEpisode'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { CareModeBadges } from '../ui/CareModeBadges'
import type { CareMode } from '../../providers/CareContextProvider'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { RichTextContent } from '../ui/RichTextContent'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'

type ClinicalNoteDoc = ClinicalNote & Record<string, unknown>

interface ClinicalNoteDetailPanelProps {
  name: string
  onClose: () => void
  /** Slide-over title, e.g. "Doctor Progress Note" */
  title?: string
  /** List row for instant header context while the full note loads */
  preview?: ClinicalNote
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

function careContextLabel(doc: ClinicalNoteDoc, visitIsIOP = false): string {
  if (doc.inpatient_admission) {
    return `Inpatient · ${doc.inpatient_admission}`
  }
  if (doc.reference_doctype === 'Patient Visit' && doc.reference_document) {
    return `${visitIsIOP ? 'IOP visit' : 'Outpatient visit'} · ${doc.reference_document}`
  }
  if (doc.reference_doctype && doc.reference_document) {
    return `${doc.reference_doctype} · ${doc.reference_document}`
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

function mapClinicalNoteDoc(data: Record<string, unknown>): ClinicalNoteDoc {
  return {
    name: String(data.name ?? ''),
    patient: String(data.patient ?? ''),
    patient_name: data.patient_name ? String(data.patient_name) : undefined,
    posting_date: data.posting_date ? String(data.posting_date) : undefined,
    practitioner: data.practitioner ? String(data.practitioner) : undefined,
    practitioner_name: data.practitioner_name ? String(data.practitioner_name) : undefined,
    clinical_note_type: data.clinical_note_type ? String(data.clinical_note_type) : undefined,
    clinical_note_type_name: data.clinical_note_type_name
      ? String(data.clinical_note_type_name)
      : undefined,
    medical_role: data.medical_role ? String(data.medical_role) : undefined,
    medical_role_name: data.medical_role_name ? String(data.medical_role_name) : undefined,
    note: data.note ? String(data.note) : undefined,
    reference_doctype: data.reference_doctype ? String(data.reference_doctype) : undefined,
    reference_document: data.reference_document ? String(data.reference_document) : undefined,
    inpatient_admission: data.inpatient_admission ? String(data.inpatient_admission) : undefined,
    branch: data.branch ? String(data.branch) : undefined,
    trans_no: data.trans_no ? String(data.trans_no) : undefined,
    note_locked:
      data.note_locked === 1 || data.note_locked === true
        ? true
        : data.note_locked === 0 || data.note_locked === false
          ? false
          : undefined,
    locked_by: data.locked_by ? String(data.locked_by) : undefined,
    locked_on: data.locked_on ? String(data.locked_on) : undefined,
    creation: data.creation ? String(data.creation) : undefined,
    modified: data.modified ? String(data.modified) : undefined,
  }
}

export function ClinicalNoteDetailPanel({
  name,
  onClose,
  title = 'Clinical Note',
  preview,
  onPatientClick,
}: ClinicalNoteDetailPanelProps) {
  const [doc, setDoc] = useState<ClinicalNoteDoc | null>(preview ? { ...preview, name } : null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visitIsIOP, setVisitIsIOP] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchClinicalNote(name)
      .then((data) => {
        if (!cancelled) setDoc(mapClinicalNoteDoc(data))
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load clinical note')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [name])

  useEffect(() => {
    const source = doc ?? preview
    const visitName =
      source?.reference_doctype === 'Patient Visit' ? source.reference_document : undefined
    if (!visitName) {
      setVisitIsIOP(false)
      return
    }
    let cancelled = false
    fetchActiveCareEpisodeStatus(visitName)
      .then((status) => {
        if (!cancelled) setVisitIsIOP(Boolean(status.is_iop_visit))
      })
      .catch(() => {
        if (!cancelled) setVisitIsIOP(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    doc?.reference_doctype,
    doc?.reference_document,
    preview?.reference_doctype,
    preview?.reference_document,
  ])

  const headerSubtitle = useMemo(() => {
    const source = doc ?? preview
    if (!source) return name
    const parts = [
      source.patient_name || source.patient,
      source.posting_date ? formatDateTime(source.posting_date) : null,
      (source as ClinicalNoteDoc).trans_no || source.name,
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : name
  }, [doc, preview, name])

  const noteLabel =
    title === 'Doctor Progress Note' || doc?.clinical_note_type === 'Doctor Progress Note'
      ? 'Progress note'
      : 'Clinical note'

  const isLocked = doc?.note_locked === 1 || doc?.note_locked === true

  const noteBody = doc?.note ?? preview?.note

  const careMode: CareMode | null = useMemo(() => {
    const source = doc ?? preview
    if (!source) return null
    if ((source as ClinicalNoteDoc).inpatient_admission) return 'IP'
    if (
      (source as ClinicalNoteDoc).reference_doctype === 'Patient Visit' &&
      (source as ClinicalNoteDoc).reference_document
    ) {
      return 'OP'
    }
    return null
  }, [doc, preview])

  return (
    <DetailSlideOver
      title={title}
      subtitle={
        <>
          {careMode ? (
            <CareModeBadges
              mode={careMode}
              isIOPVisit={careMode === 'OP' && visitIsIOP}
              className="mr-2"
            />
          ) : null}
          {headerSubtitle}
        </>
      }
      icon={<NotebookPen className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      headerActions={
        <PrintFormatDropdown
          doctype="Clinical Note"
          docName={name}
          noLetterhead={0}
          triggerPrint={1}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200/80 bg-white/80 text-emerald-700 shadow-sm transition hover:bg-emerald-50"
        />
      }
    >
      {loading && !noteBody ? (
        <div className="flex items-center justify-center py-12">
          <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
          <span className="text-sm text-slate-500">Loading note…</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {(doc || preview) && !error ? (
        <div className="flex flex-col gap-5 pb-2">
          {isLocked ? (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <Lock className="h-4 w-4 shrink-0" strokeWidth={2} />
              <span>
                This note is locked
                {doc?.locked_on ? ` · ${formatDateTime(doc.locked_on)}` : ''}
              </span>
            </div>
          ) : null}

          <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
            <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-3">
              <FileText className="h-5 w-5 text-emerald-600" strokeWidth={2} />
              <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">{noteLabel}</h3>
            </div>
            <div className="min-h-[8rem] rounded-lg bg-slate-50/80 px-4 py-4 ring-1 ring-slate-100">
              {loading && noteBody ? (
                <p className="mb-3 text-xs text-slate-400">Refreshing full note…</p>
              ) : null}
              <RichTextContent
                value={noteBody || ''}
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
                  doc?.practitioner_name ||
                    doc?.practitioner ||
                    preview?.practitioner_name ||
                    preview?.practitioner ||
                    doc?.user ||
                    preview?.user,
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
                value={doc ? careContextLabel(doc, visitIsIOP) : careContextLabel((preview ?? {}) as ClinicalNoteDoc, visitIsIOP)}
              />
              {doc?.clinical_note_type || preview?.clinical_note_type ? (
                <InfoTile
                  icon={<NotebookPen className="h-4 w-4" strokeWidth={2} />}
                  label="Note type"
                  value={displayValue(
                    doc?.clinical_note_type_name ||
                      doc?.clinical_note_type ||
                      preview?.clinical_note_type_name ||
                      preview?.clinical_note_type,
                  )}
                />
              ) : null}
              <InfoTile
                icon={<FileText className="h-4 w-4" strokeWidth={2} />}
                label="Note ID"
                value={displayValue((doc as ClinicalNoteDoc)?.trans_no || doc?.name || preview?.name || name)}
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
