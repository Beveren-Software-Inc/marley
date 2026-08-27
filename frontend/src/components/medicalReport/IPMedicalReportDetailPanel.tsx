import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Building2,
  Calendar,
  ClipboardList,
  FileText,
  Hash,
  IdCard,
  Pencil,
  Stethoscope,
  Trash2,
  User,
} from 'lucide-react'
import { fetchDoc } from '../../services/common'
import { deleteDoctypeRow } from '../../services/doctypeResource'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'
import { CreateIPMedicalReportModal } from './CreateIPMedicalReportModal'
import { isEditableWithin24hFromCreation, DAILY_ROUTINE_EDIT_LOCKED_MESSAGE } from '../../constants/nursingShift'
import { useCareContext } from '../../providers/CareContextProvider'
import { toast } from '../../hooks/useToast'

type IPMedicalReportDoc = Record<string, unknown>

interface IPMedicalReportDetailPanelProps {
  name: string
  onClose: () => void
  preview?: Record<string, unknown>
  onPatientClick?: (patient: string) => void
  onChanged?: () => void
}

function displayValue(value: unknown): string {
  if (value == null || value === '') return '—'
  return String(value)
}

function formatDate(value?: unknown): string {
  if (value == null || value === '') return '—'
  const s = String(value)
  try {
    return new Date(s.includes('T') || s.includes(' ') ? s : `${s}T00:00:00`).toLocaleDateString('en-GB')
  } catch {
    return s
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
  return (
    <div className="flex min-w-0 items-start gap-2.5 rounded-lg border border-emerald-100/70 bg-white/80 px-3 py-2.5 shadow-sm ring-1 ring-emerald-50/80">
      <div className="mt-0.5 shrink-0 text-emerald-600/80">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/65">{label}</p>
        {onClick && value !== '—' ? (
          <button
            type="button"
            onClick={onClick}
            className="mt-0.5 text-left text-sm font-medium text-primary hover:underline break-words"
          >
            {value}
          </button>
        ) : (
          <p className="mt-0.5 text-sm font-medium leading-snug break-words text-emerald-950">{value}</p>
        )}
      </div>
    </div>
  )
}

function TextBlock({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null
  return (
    <div className="rounded-lg border border-emerald-100/70 bg-white/90 px-4 py-3 shadow-sm ring-1 ring-emerald-50/80">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/60">{label}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{value}</p>
    </div>
  )
}

const STATUS_TONE: Record<string, string> = {
  Draft: 'bg-slate-100 text-slate-700 border-slate-200',
  Issued: 'bg-green-100 text-green-800 border-green-200',
  Cancelled: 'bg-red-100 text-red-800 border-red-200',
}

export function IPMedicalReportDetailPanel({
  name,
  onClose,
  preview,
  onPatientClick,
  onChanged,
}: IPMedicalReportDetailPanelProps) {
  const { guardClinicalEdit, lockEditingData } = useCareContext()
  const [doc, setDoc] = useState<IPMedicalReportDoc | null>(preview ? { ...preview, name } : null)
  const [patientMeta, setPatientMeta] = useState<{
    patient_name?: string
    /** Patient document name / ID (shown as File Number). */
    patient_id?: string
    id_number?: string
  }>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchDoc('IP Medical Report', name)
      .then(async (data) => {
        if (cancelled) return
        setDoc(data)
        const patientId = String(data.patient || '').trim()
        if (!patientId) {
          setPatientMeta({
            patient_name: String(data.patient_name || ''),
          })
          return
        }
        try {
          const patient = await fetchDoc('Patient', patientId)
          if (cancelled) return
          setPatientMeta({
            patient_name: String(patient.patient_name || data.patient_name || ''),
            patient_id: String(patient.name || patientId),
            id_number: String(patient.id_number || ''),
          })
        } catch {
          if (!cancelled) {
            setPatientMeta({
              patient_name: String(data.patient_name || ''),
              patient_id: patientId,
            })
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load IP Medical Report')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [name, reloadKey])

  const source = doc ?? preview
  // Always enforce 24h window for medical report edit/delete.
  const canMutate =
    Boolean(source?.creation) &&
    isEditableWithin24hFromCreation(String(source?.creation || ''), true) &&
    !lockEditingData

  const headerSubtitle = useMemo(() => {
    if (!source) return name
    const fileNo = patientMeta.patient_id || String(source.patient || '').trim()
    const parts = [
      patientMeta.patient_name || displayValue(source.patient_name || source.patient),
      fileNo ? `File ${fileNo}` : null,
      patientMeta.id_number ? `CPR ${patientMeta.id_number}` : null,
      source.report_status ? String(source.report_status) : null,
    ].filter((p) => p && p !== '—')
    return parts.length ? parts.join(' · ') : name
  }, [source, name, patientMeta])

  const status = String(source?.report_status || '')
  const statusTone = STATUS_TONE[status] || 'bg-slate-100 text-slate-700 border-slate-200'
  const text = (key: string) => String(source?.[key] ?? '').trim()
  const patientName = patientMeta.patient_name || displayValue(source?.patient_name || source?.patient)
  const fileNumber = patientMeta.patient_id || displayValue(source?.patient)

  const openEdit = () => {
    if (!canMutate) {
      toast.error(
        lockEditingData
          ? 'Editing is locked in Healthcare Settings.'
          : DAILY_ROUTINE_EDIT_LOCKED_MESSAGE,
      )
      return
    }
    guardClinicalEdit(() => setShowEdit(true))
  }

  const openDelete = () => {
    if (!canMutate) {
      toast.error(
        lockEditingData
          ? 'Editing is locked in Healthcare Settings.'
          : DAILY_ROUTINE_EDIT_LOCKED_MESSAGE,
      )
      return
    }
    guardClinicalEdit(() => setShowDelete(true))
  }

  const confirmDelete = async () => {
    setDeleting(true)
    try {
      await deleteDoctypeRow('IP Medical Report', name)
      toast.success('IP Medical Report deleted')
      setShowDelete(false)
      onChanged?.()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete report')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <DetailSlideOver
        title="IP Medical Report"
        subtitle={headerSubtitle}
        icon={<FileText className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
        onClose={onClose}
        maxWidthClass="max-w-2xl"
        headerActions={
          <div className="flex items-center gap-1.5">
            {status ? (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusTone}`}>
                {status}
              </span>
            ) : null}
            {canMutate ? (
              <>
                <button
                  type="button"
                  onClick={openEdit}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-emerald-200/80 bg-white/80 px-2.5 text-xs font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-50"
                  title="Edit (within 24 hours of creation)"
                >
                  <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={openDelete}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-red-200 bg-white/80 px-2.5 text-xs font-semibold text-red-700 shadow-sm transition hover:bg-red-50"
                  title="Delete (within 24 hours of creation)"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                  Delete
                </button>
              </>
            ) : null}
            <PrintFormatDropdown
              doctype="IP Medical Report"
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
            <span className="text-sm text-slate-500">Loading medical report…</span>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        ) : null}

        {source && !error ? (
          <div className="flex flex-col gap-5 pb-2">
            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>
                <ClipboardList className="h-4 w-4 text-emerald-600" strokeWidth={2} />
                Patient
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <InfoTile
                  icon={<User className="h-4 w-4" strokeWidth={2} />}
                  label="Name"
                  value={patientName}
                  onClick={
                    source.patient && onPatientClick
                      ? () => onPatientClick(String(source.patient))
                      : undefined
                  }
                />
                <InfoTile
                  icon={<Hash className="h-4 w-4" strokeWidth={2} />}
                  label="File Number"
                  value={fileNumber}
                />
                <InfoTile
                  icon={<IdCard className="h-4 w-4" strokeWidth={2} />}
                  label="CPR"
                  value={displayValue(patientMeta.id_number)}
                />
                <InfoTile
                  icon={<FileText className="h-4 w-4" strokeWidth={2} />}
                  label="Report"
                  value={displayValue(source.name)}
                />
              </div>
            </section>

            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>
                <Building2 className="h-4 w-4 text-emerald-600" strokeWidth={2} />
                Admission
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <InfoTile
                  icon={<Building2 className="h-4 w-4" strokeWidth={2} />}
                  label="Admission"
                  value={displayValue(source.inpatient_admission || source.case_no)}
                />
                <InfoTile
                  icon={<Stethoscope className="h-4 w-4" strokeWidth={2} />}
                  label="Consultant"
                  value={displayValue(source.practitioner || source.consultation_doctor_name)}
                />
                <InfoTile
                  icon={<Calendar className="h-4 w-4" strokeWidth={2} />}
                  label="Admission Date"
                  value={formatDate(source.admission_date)}
                />
                <InfoTile
                  icon={<Calendar className="h-4 w-4" strokeWidth={2} />}
                  label="Discharge Date"
                  value={formatDate(source.discharge_date)}
                />
                {source.letter_issue_date ? (
                  <InfoTile
                    icon={<Calendar className="h-4 w-4" strokeWidth={2} />}
                    label="Letter Issue Date"
                    value={formatDate(source.letter_issue_date)}
                  />
                ) : null}
                {source.transaction_no ? (
                  <InfoTile
                    icon={<FileText className="h-4 w-4" strokeWidth={2} />}
                    label="Transaction No"
                    value={displayValue(source.transaction_no)}
                  />
                ) : null}
              </div>
              {!canMutate && source.creation ? (
                <p className="mt-3 text-[11px] text-slate-500">
                  Edit and delete are available for 24 hours after creation.
                </p>
              ) : null}
            </section>

            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>
                <FileText className="h-4 w-4 text-emerald-600" strokeWidth={2} />
                Report
              </h3>
              <div className="space-y-3">
                <TextBlock label="Reason for Admission" value={text('reason_for_admission')} />
                <TextBlock label="Diagnosis" value={text('diagnosis')} />
                <TextBlock label="Clinical Course" value={text('clinical_course')} />
                <TextBlock label="Treatment Given" value={text('treatment_given')} />
                <TextBlock label="Condition on Discharge" value={text('condition_on_discharge')} />
                <TextBlock label="Recommendations" value={text('recommendations')} />
                {!text('reason_for_admission') &&
                !text('diagnosis') &&
                !text('clinical_course') &&
                !text('treatment_given') &&
                !text('condition_on_discharge') &&
                !text('recommendations') ? (
                  <p className="text-sm text-slate-500">No report narrative recorded.</p>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}
      </DetailSlideOver>

      {showEdit && (
        <CreateIPMedicalReportModal
          editName={name}
          onClose={() => setShowEdit(false)}
          onSuccess={() => {
            setShowEdit(false)
            setReloadKey((k) => k + 1)
            onChanged?.()
          }}
        />
      )}

      {showDelete && (
        <ConfirmDialog
          open
          title="Delete IP Medical Report?"
          message={`Delete ${name}? This cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          loading={deleting}
          onCancel={() => setShowDelete(false)}
          onConfirm={confirmDelete}
        />
      )}
    </>
  )
}
