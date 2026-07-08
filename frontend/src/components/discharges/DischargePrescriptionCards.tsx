import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Pill } from 'lucide-react'
import {
  getDischargePrescriptionSections,
  getDischargeTransferRows,
  type DischargePrescriptionMedication,
  type DischargePrescriptionSections,
  type DischargeTransferRow,
} from '../../services/medicineGiven'
import { fetchPrescription, type Prescription } from '../../services/prescriptions'
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
}: {
  items: DischargePrescriptionMedication[]
  emptyText: string
  selectable?: boolean
  selected?: Set<string>
  onToggle?: (name: string) => void
  showReason?: boolean
  /** When set, only these entry names can be selected (e.g. not yet discharged). */
  selectableIds?: Set<string>
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
              <p className="text-sm font-medium text-slate-900">{med.drug_name || med.drug || 'Medication'}</p>
              {isTransferred ? (
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
                  Discharged for home
                </span>
              ) : null}
            </div>
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
  onDischargedChanged,
}: {
  currentMedications?: DischargePrescriptionMedication[]
  dischargedMedications?: DischargePrescriptionMedication[]
  stoppedMedications?: DischargePrescriptionMedication[]
  alwaysShow?: boolean
  allowEditDischarged?: boolean
  patient?: string
  onDischargedChanged?: () => void | Promise<void>
}) {
  const { openEdit, editLoadingId, editModal } = useDischargePrescriptionEditor(
    patient,
    onDischargedChanged,
  )
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

  if (loading) {
    return <div className="text-sm text-slate-600">Loading prescriptions…</div>
  }

  return (
    <div className="space-y-4">
      {editModal}
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
        />
      </PrescriptionCard>

      {dischargeModalOpen ? (
        <CreatePrescriptionModal
          onClose={() => setDischargeModalOpen(false)}
          onSuccess={handleDischargeCreated}
          initialPatient={patient}
          initialCareContext="Patient Visit"
          initialMedications={selectedTransferRows.map((row) => ({
            drug: row.drug,
            drug_name: row.drug_name,
            dosage: row.dosage || '',
            no_of_days: row.no_of_days || 1,
            dosage_form: row.dosage_form || '',
            instructions: row.instructions || '',
            date: row.date || new Date().toISOString().split('T')[0],
            end_date:
              row.end_date ||
              addDaysToIsoDate(row.date || new Date().toISOString().split('T')[0], row.no_of_days || 1),
            time: row.time || '08:00:00',
            patient_frequency: row.patient_frequency || '',
            is_pink: Boolean(row.is_pink),
            is_prn: false,
            reference_no: row.reference_no || '',
            route_of_administration: row.route_of_administration || '',
            is_long_acting: Boolean(row.is_long_acting_medicine),
            long_acting_frequency: 'Weekly',
            medication_type: row.medication_type || '',
          }))}
          transferAdmission={admission}
          transferOrderEntryNames={selectedTransferRows.map((row) => row.name)}
        />
      ) : null}
    </div>
  )
}
