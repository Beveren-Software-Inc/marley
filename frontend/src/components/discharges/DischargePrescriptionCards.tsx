import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Pill, Trash2 } from 'lucide-react'
import {
  getDischargePrescriptionSections,
  getDischargeTransferRows,
  stopMedicationOnDischarge,
  type DischargePrescriptionMedication,
  type DischargePrescriptionSections,
  type DischargeTransferRow,
} from '../../services/medicineGiven'
import {
  fetchPrescription,
  saveMedicationOrderEntryStopReason,
  type MedicationOrderRow,
  type Prescription,
} from '../../services/prescriptions'
import { CreatePrescriptionModal } from '../prescriptions/CreatePrescriptionModal'
import { toast } from '../../hooks/useToast'

function uniquePrescriptionIds(items: DischargePrescriptionMedication[]): string[] {
  const ids = new Set<string>()
  for (const med of items) {
    const id = (med.prescription || '').trim()
    if (id) ids.add(id)
  }
  return [...ids].sort()
}

function mapTransferRowToMedication(row: DischargeTransferRow): MedicationOrderRow {
  const start = row.date || new Date().toISOString().split('T')[0]
  const days = row.no_of_days || 1
  const dosage =
    (row.dosage || '').trim() ||
    (row.instructions || '').trim() ||
    (row.strength || '').trim() ||
    ''
  const frequency =
    (row.patient_frequency || '').trim() ||
    (row.written_frequency || '').trim() ||
    ''
  return {
    drug: row.drug || '',
    drug_name:
      row.drug_name ||
      row.medication ||
      row.old_medicine_name ||
      row.drug ||
      '',
    dosage,
    no_of_days: days,
    dosage_form: row.dosage_form || '',
    instructions: row.instructions || '',
    date: start,
    end_date: row.end_date || addDaysToIsoDate(start, days),
    time: row.time || '08:00:00',
    patient_frequency: frequency,
    is_pink: Boolean(row.is_pink),
    is_prn: false,
    reference_no: row.reference_no || '',
    route_of_administration: row.route_of_administration || '',
    is_long_acting: Boolean(row.is_long_acting_medicine),
    long_acting_frequency: 'Weekly',
    medication_type: row.medication_type || '',
    // Keep legacy codes so CreatePrescriptionModal can resolve ITEM_00_01 → Item.
    old_medicine_code: row.old_medicine_code || '',
    old_medicine_name: row.old_medicine_name || '',
    medicine_no: row.medicine_no || '',
    medication: row.medication || '',
  }
}

function dischargeMedicationTitle(med: DischargePrescriptionMedication): string {
  const mapped = (med.mapped_drug_name || '').trim()
  const current = (med.drug_name || '').trim()
  const legacy = (med.old_medicine_name || med.medication || '').trim()
  // Backend may already format "New (legacy: Old)"; prefer that when present.
  if (current && current !== '-' && current.toLowerCase().includes('legacy:')) {
    return current
  }
  if (mapped && legacy && mapped.toLowerCase() !== legacy.toLowerCase()) {
    return `${mapped} (legacy: ${legacy})`
  }
  if (current && current !== '-') return current
  if (mapped) return mapped
  if (legacy) return legacy
  return med.drug || med.old_medicine_code || med.medicine_no || 'Medication'
}

function EditStoppedReasonModal({
  drugName,
  initialReason,
  onClose,
  onConfirm,
}: {
  drugName?: string
  initialReason: string
  onClose: () => void
  onConfirm: (reason: string) => void | Promise<void>
}) {
  const [reason, setReason] = useState(initialReason)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    const trimmed = reason.trim()
    if (!trimmed) {
      toast.error('Stop reason is required')
      return
    }
    setSubmitting(true)
    try {
      await Promise.resolve(onConfirm(trimmed))
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-stop-reason-title"
    >
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 id="edit-stop-reason-title" className="mb-2 text-lg font-semibold text-slate-800">
          Edit stop reason
        </h2>
        <p className="mb-3 text-sm text-slate-600">
          {drugName ? (
            <>
              Update why <strong>{drugName}</strong> was stopped.
            </>
          ) : (
            <>Update the reason this medication was stopped.</>
          )}
        </p>
        <div className="space-y-4">
          <div>
            <label htmlFor="edit-reason-stopped" className="mb-1 block text-sm font-medium text-slate-700">
              Reason stopped <span className="text-red-500">*</span>
            </label>
            <textarea
              id="edit-reason-stopped"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[80px] w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleSubmit()}
              className="rounded bg-primary px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function useStoppedMedicationActions(
  admission: string | undefined,
  onChanged?: () => void | Promise<void>,
) {
  const [editTarget, setEditTarget] = useState<DischargePrescriptionMedication | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const handleEditReason = useCallback((med: DischargePrescriptionMedication) => {
    if (!med.name || !med.prescription) {
      toast.error('Missing prescription line to update')
      return
    }
    setEditTarget(med)
  }, [])

  const saveEditReason = useCallback(
    async (reason: string) => {
      if (!editTarget?.name) return
      if (admission) {
        await stopMedicationOnDischarge(admission, editTarget.name, reason)
      } else if (editTarget.prescription) {
        await saveMedicationOrderEntryStopReason(editTarget.prescription, editTarget.name, {
          reasonStopped: reason,
        })
      } else {
        throw new Error('Cannot update stop reason')
      }
      toast.success('Stop reason updated')
      await onChanged?.()
    },
    [admission, editTarget, onChanged],
  )

  const handleRemoveStopped = useCallback(
    async (med: DischargePrescriptionMedication) => {
      if (!med.name || !med.prescription) {
        toast.error('Missing prescription line to remove')
        return
      }
      if (
        !window.confirm(
          `Remove ${med.drug_name || med.drug || 'this medicine'} from stopped list? It will return to current medicines.`,
        )
      ) {
        return
      }
      setBusyId(med.name)
      try {
        await saveMedicationOrderEntryStopReason(med.prescription, med.name, { clear: true })
        toast.success('Removed from stopped list')
        await onChanged?.()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to remove stopped medicine')
      } finally {
        setBusyId(null)
      }
    },
    [onChanged],
  )

  const editModal = editTarget ? (
    <EditStoppedReasonModal
      drugName={editTarget.drug_name || editTarget.drug}
      initialReason={editTarget.reason_stopped || ''}
      onClose={() => setEditTarget(null)}
      onConfirm={saveEditReason}
    />
  ) : null

  return { handleEditReason, handleRemoveStopped, busyId, editModal }
}

function useDischargePrescriptionEditor(patient?: string, onChanged?: () => void | Promise<void>) {
  const [editOpen, setEditOpen] = useState(false)
  const [editPrescription, setEditPrescription] = useState<Prescription | null>(null)
  const [editLoadingId, setEditLoadingId] = useState<string | null>(null)

  const openEdit = useCallback(async (prescriptionName: string) => {
    if (!prescriptionName) return
    setEditLoadingId(prescriptionName)
    try {
      const rx = await fetchPrescription(prescriptionName)
      if (!rx) {
        toast.error('Prescription not found')
        return
      }
      setEditPrescription(rx)
      setEditOpen(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load prescription')
    } finally {
      setEditLoadingId(null)
    }
  }, [])

  const closeEdit = useCallback(() => {
    setEditOpen(false)
    setEditPrescription(null)
  }, [])

  const handleEditSuccess = useCallback(async () => {
    closeEdit()
    await onChanged?.()
  }, [closeEdit, onChanged])

  const editModal =
    editOpen && editPrescription && patient ? (
      <CreatePrescriptionModal
        editMode
        prescriptionData={editPrescription}
        initialPatient={patient}
        initialCareContext={
          editPrescription.patient_encounter || editPrescription.after_discharge
            ? 'Patient Visit'
            : editPrescription.care_context === 'Inpatient Admission'
              ? 'Inpatient Admission'
              : 'Patient Visit'
        }
        initialPatientEncounter={editPrescription.patient_encounter}
        onClose={closeEdit}
        onSuccess={handleEditSuccess}
      />
    ) : null

  return { openEdit, editLoadingId, editModal }
}

function formatStartDate(value?: string | null): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('en-GB')
  } catch {
    return value
  }
}

function MedicationList({
  items,
  emptyText,
  selectable,
  selected,
  onToggle,
  showReason,
  selectableIds,
  onEditReason,
  onRemoveStopped,
  actionBusyId,
}: {
  items: DischargePrescriptionMedication[]
  emptyText: string
  selectable?: boolean
  selected?: Set<string>
  onToggle?: (name: string) => void
  showReason?: boolean
  /** When set, only these entry names can be selected (e.g. not yet discharged). */
  selectableIds?: Set<string>
  onEditReason?: (med: DischargePrescriptionMedication) => void
  onRemoveStopped?: (med: DischargePrescriptionMedication) => void
  actionBusyId?: string | null
}) {
  if (!items.length) {
    return <p className="text-sm text-slate-500 py-2">{emptyText}</p>
  }

  return (
    <ul className="divide-y divide-slate-100">
      {items.map((med, index) => {
        const entryName = med.name ?? ''
        const canSelect =
          entryName !== '' && (!selectableIds || selectableIds.has(entryName))
        const isTransferred = Boolean(med.transferred_to_visit)
        const busy = Boolean(entryName && actionBusyId === entryName)
        return (
        <li key={med.name || `${med.drug_name}-${index}`} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
          {selectable && onToggle ? (
            <button
              type="button"
              onClick={() => med.name && canSelect && onToggle(med.name)}
              disabled={!canSelect}
              className={`mt-0.5 shrink-0 ${
                canSelect ? 'text-slate-500 hover:text-primary' : 'text-slate-300 cursor-not-allowed'
              }`}
              aria-label={
                !canSelect
                  ? 'Already discharged for home'
                  : med.name && selected?.has(med.name)
                    ? 'Deselect'
                    : 'Select'
              }
            >
              {!canSelect ? '✓' : med.name && selected?.has(med.name) ? '✓' : '○'}
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-slate-900">{dischargeMedicationTitle(med)}</p>
              {med.is_legacy || med.old_medicine_name || med.old_medicine_code ? (
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">
                  Legacy
                </span>
              ) : null}
              {isTransferred ? (
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
                  Discharged for home
                </span>
              ) : null}
              {showReason ? (
                <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 ring-1 ring-rose-200">
                  Stopped
                </span>
              ) : null}
            </div>
            {(med.mapped_drug_name || med.old_medicine_name) &&
            !(med.drug_name || '').toLowerCase().includes('legacy:') ? (
              <p className="mt-0.5 text-[11px] text-slate-500">
                {med.mapped_drug_name ? (
                  <>
                    Current: <span className="font-medium text-slate-700">{med.mapped_drug_name}</span>
                    {med.old_medicine_name ? (
                      <>
                        {' '}
                        · Legacy: <span className="font-medium text-slate-700">{med.old_medicine_name}</span>
                      </>
                    ) : null}
                  </>
                ) : med.old_medicine_name ? (
                  <>
                    Legacy name: <span className="font-medium text-slate-700">{med.old_medicine_name}</span>
                  </>
                ) : null}
              </p>
            ) : null}
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-600">
              <span>
                <span className="font-medium text-slate-500">Dosage:</span> {med.dosage || '—'}
              </span>
              <span>
                <span className="font-medium text-slate-500">Frequency:</span> {med.frequency || '—'}
              </span>
              <span>
                <span className="font-medium text-slate-500">Start:</span> {formatStartDate(med.start_date)}
              </span>
            </div>
            {showReason && med.reason_stopped ? (
              <p className="mt-1 text-xs text-rose-800">
                <span className="font-semibold uppercase tracking-wide text-rose-700/80">Reason stopped: </span>
                {med.reason_stopped}
              </p>
            ) : null}
            {med.prescription ? (
              <p className="mt-0.5 text-[10px] text-slate-400">Prescription: {med.prescription}</p>
            ) : null}
          </div>
          {(onEditReason || onRemoveStopped) && entryName ? (
            <div className="flex shrink-0 items-center gap-1">
              {onEditReason ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onEditReason(med)}
                  className="inline-flex items-center gap-1 rounded border border-rose-300 bg-white px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  title="Edit stop reason"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
              ) : null}
              {onRemoveStopped ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRemoveStopped(med)}
                  className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                  title="Remove from stopped list (clear stop reason)"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              ) : null}
            </div>
          ) : null}
        </li>
        )
      })}
    </ul>
  )
}

function PrescriptionCard({
  title,
  subtitle,
  accent,
  children,
  actions,
}: {
  title: string
  subtitle?: string
  accent: 'slate' | 'emerald' | 'rose'
  children: React.ReactNode
  actions?: React.ReactNode
}) {
  const border =
    accent === 'emerald'
      ? 'border-emerald-200 ring-emerald-100/80'
      : accent === 'rose'
        ? 'border-rose-200 ring-rose-100/80'
        : 'border-slate-200 ring-slate-100/80'
  const iconColor =
    accent === 'emerald' ? 'text-emerald-600' : accent === 'rose' ? 'text-rose-600' : 'text-slate-600'

  return (
    <section className={`rounded-xl border bg-white px-4 py-4 shadow-sm ring-1 sm:px-5 ${border}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Pill className={`h-5 w-5 ${iconColor}`} strokeWidth={2} />
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wide text-slate-800">{title}</h4>
            {subtitle ? <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}

function addDaysToIsoDate(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export function DischargePrescriptionCardsReadonly({
  currentMedications = [],
  dischargedMedications = [],
  stoppedMedications = [],
  alwaysShow = false,
  allowEditDischarged = false,
  patient,
  admission,
  onDischargedChanged,
}: {
  currentMedications?: DischargePrescriptionMedication[]
  dischargedMedications?: DischargePrescriptionMedication[]
  stoppedMedications?: DischargePrescriptionMedication[]
  alwaysShow?: boolean
  allowEditDischarged?: boolean
  patient?: string
  admission?: string
  onDischargedChanged?: () => void | Promise<void>
}) {
  const { openEdit, editLoadingId, editModal } = useDischargePrescriptionEditor(
    patient,
    onDischargedChanged,
  )
  const {
    handleEditReason,
    handleRemoveStopped,
    busyId: stoppedBusyId,
    editModal: stoppedEditModal,
  } = useStoppedMedicationActions(admission, onDischargedChanged)
  const dischargedPrescriptionIds = useMemo(
    () => uniquePrescriptionIds(dischargedMedications),
    [dischargedMedications],
  )

  const hasAny =
    currentMedications.length > 0 ||
    dischargedMedications.length > 0 ||
    stoppedMedications.length > 0
  if (!hasAny && !alwaysShow) return null

  return (
    <div className="space-y-4">
      {editModal}
      {stoppedEditModal}
      <PrescriptionCard
        title="Current medicine"
        subtitle="Medicines used during this admission"
        accent="slate"
      >
        <MedicationList items={currentMedications} emptyText="NO CURRENT MEDICINES ON RECORD." />
      </PrescriptionCard>
      <PrescriptionCard
        title="Discharged medication"
        subtitle="Medicines prescribed to continue at home"
        accent="emerald"
        actions={
          allowEditDischarged && dischargedPrescriptionIds.length > 0 ? (
            <>
              {dischargedPrescriptionIds.map((prescriptionId) => (
                <button
                  key={prescriptionId}
                  type="button"
                  disabled={editLoadingId === prescriptionId}
                  onClick={() => void openEdit(prescriptionId)}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-600 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Pencil className="h-3 w-3" />
                  {editLoadingId === prescriptionId ? 'Opening…' : `Edit ${prescriptionId}`}
                </button>
              ))}
            </>
          ) : null
        }
      >
        <MedicationList items={dischargedMedications} emptyText="NO DISCHARGED MEDICINES RECORDED." />
      </PrescriptionCard>
      <PrescriptionCard
        title="Stopped medication"
        subtitle="Medicines stopped during this admission"
        accent="rose"
      >
        <MedicationList
          items={stoppedMedications}
          emptyText="NO STOPPED MEDICINES RECORDED."
          showReason
          onEditReason={handleEditReason}
          onRemoveStopped={(med) => void handleRemoveStopped(med)}
          actionBusyId={stoppedBusyId}
        />
      </PrescriptionCard>
    </div>
  )
}

export function DischargePrescriptionCardsEditable({
  admission,
  patient,
  onChanged,
}: {
  admission: string
  patient: string
  onChanged?: (result?: { patient_visit: string; patient_medication_order: string }) => void | Promise<void>
}) {
  const [sections, setSections] = useState<DischargePrescriptionSections>({
    current_medications: [],
    discharged_medications: [],
    stopped_medications: [],
  })
  const [transferRows, setTransferRows] = useState<DischargeTransferRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCurrent, setSelectedCurrent] = useState<Set<string>>(new Set())
  const [dischargeModalOpen, setDischargeModalOpen] = useState(false)
  const [transferPrescription, setTransferPrescription] = useState<{
    name: string
    patient_visit?: string
  } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextSections, rows] = await Promise.all([
        getDischargePrescriptionSections(admission),
        getDischargeTransferRows(admission),
      ])
      setSections(nextSections)
      setTransferRows(rows)
      const transferableIds = new Set(rows.map((r) => r.name).filter((n): n is string => Boolean(n)))
      setSelectedCurrent((prev) => {
        const kept = new Set([...prev].filter((id) => transferableIds.has(id)))
        if (kept.size) return kept
        return transferableIds
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prescriptions')
    } finally {
      setLoading(false)
    }
  }, [admission])

  useEffect(() => {
    void load()
  }, [load])

  const handleAfterPrescriptionEdit = useCallback(async () => {
    await load()
    await onChanged?.()
  }, [load, onChanged])

  const { openEdit, editLoadingId, editModal } = useDischargePrescriptionEditor(
    patient,
    handleAfterPrescriptionEdit,
  )
  const {
    handleEditReason,
    handleRemoveStopped,
    busyId: stoppedBusyId,
    editModal: stoppedEditModal,
  } = useStoppedMedicationActions(admission, handleAfterPrescriptionEdit)
  const dischargedPrescriptionIds = useMemo(
    () => uniquePrescriptionIds(sections.discharged_medications),
    [sections.discharged_medications],
  )

  const toggleCurrent = (name: string) => {
    setSelectedCurrent((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const handleDischargeCreated = async (result?: {
    patient_visit: string
    patient_medication_order: string
  }) => {
    setDischargeModalOpen(false)
    setSelectedCurrent(new Set())
    if (result?.patient_medication_order) {
      setTransferPrescription({
        name: result.patient_medication_order,
        patient_visit: result.patient_visit,
      })
      toast.success(`Discharged prescription ${result.patient_medication_order} created`)
    }
    await load()
    await onChanged?.(result)
  }

  const selectedTransferRows = transferRows.filter(
    (row) => row.name && selectedCurrent.has(row.name)
  )
  const transferableIds = new Set(transferRows.map((r) => r.name).filter((n): n is string => Boolean(n)))
  const dischargeInitialMedications = useMemo(
    () => selectedTransferRows.map(mapTransferRowToMedication),
    // selectedTransferRows identity changes each render; depend on selection + source data
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedCurrent, transferRows],
  )

  if (loading) {
    return <div className="text-sm text-slate-600">Loading prescriptions…</div>
  }

  return (
    <div className="space-y-4">
      {editModal}
      {stoppedEditModal}
      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {transferPrescription ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Discharged prescription: <strong>{transferPrescription.name}</strong>
          {transferPrescription.patient_visit ? ` · Visit ${transferPrescription.patient_visit}` : ''}
        </div>
      ) : null}

      <PrescriptionCard
        title="Current medicine"
        subtitle="Medicines used on this admission — select remaining items to discharge for home"
        accent="slate"
        actions={
          <button
            type="button"
            disabled={selectedCurrent.size === 0 || selectedTransferRows.length === 0}
            onClick={() => setDischargeModalOpen(true)}
            className="px-3 py-1.5 text-xs rounded-md border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Discharge medication ({selectedCurrent.size})
          </button>
        }
      >
        <MedicationList
          items={sections.current_medications}
          emptyText="No current medicines on this admission."
          selectable
          selected={selectedCurrent}
          onToggle={toggleCurrent}
          selectableIds={transferableIds}
        />
      </PrescriptionCard>

      <PrescriptionCard
        title="Discharged medication"
        subtitle="Created when you discharge medicines for home use"
        accent="emerald"
        actions={
          dischargedPrescriptionIds.length > 0 ? (
            <>
              {dischargedPrescriptionIds.map((prescriptionId) => (
                <button
                  key={prescriptionId}
                  type="button"
                  disabled={editLoadingId === prescriptionId}
                  onClick={() => void openEdit(prescriptionId)}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-600 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Pencil className="h-3 w-3" />
                  {editLoadingId === prescriptionId ? 'Opening…' : `Edit ${prescriptionId}`}
                </button>
              ))}
            </>
          ) : null
        }
      >
        <MedicationList
          items={sections.discharged_medications}
          emptyText="No discharged medicines yet. Use “Discharge medication” on current medicines."
        />
      </PrescriptionCard>

      <PrescriptionCard
        title="Stopped medication"
        subtitle="Stopped from current medicines during discharge"
        accent="rose"
      >
        <MedicationList
          items={sections.stopped_medications}
          emptyText="NO STOPPED MEDICINES RECORDED."
          showReason
          onEditReason={handleEditReason}
          onRemoveStopped={(med) => void handleRemoveStopped(med)}
          actionBusyId={stoppedBusyId}
        />
      </PrescriptionCard>

      {dischargeModalOpen ? (
        <CreatePrescriptionModal
          onClose={() => setDischargeModalOpen(false)}
          onSuccess={handleDischargeCreated}
          initialPatient={patient}
          initialCareContext="Patient Visit"
          initialMedications={dischargeInitialMedications}
          transferAdmission={admission}
          transferOrderEntryNames={selectedTransferRows.map((row) => row.name)}
        />
      ) : null}
    </div>
  )
}
