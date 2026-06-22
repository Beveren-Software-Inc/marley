import { useCallback, useEffect, useState } from 'react'
import { Pill } from 'lucide-react'
import {
  getDischargePrescriptionSections,
  getDischargeTransferRows,
  stopMedicationOnDischarge,
  type DischargePrescriptionMedication,
  type DischargePrescriptionSections,
  type DischargeTransferRow,
} from '../../services/medicineGiven'
import { CreatePrescriptionModal } from '../prescriptions/CreatePrescriptionModal'
import { toast } from '../../hooks/useToast'

function formatStartDate(value?: string | null): string {
  if (!value) return '—'
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

function MedicationList({
  items,
  emptyText,
  selectable,
  selected,
  onToggle,
  showReason,
}: {
  items: DischargePrescriptionMedication[]
  emptyText: string
  selectable?: boolean
  selected?: Set<string>
  onToggle?: (name: string) => void
  showReason?: boolean
}) {
  if (!items.length) {
    return <p className="text-sm text-slate-500 py-2">{emptyText}</p>
  }

  return (
    <ul className="divide-y divide-slate-100">
      {items.map((med, index) => (
        <li key={med.name || `${med.drug_name}-${index}`} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
          {selectable && onToggle ? (
            <button
              type="button"
              onClick={() => med.name && onToggle(med.name)}
              disabled={!med.name}
              className="mt-0.5 shrink-0 text-slate-500 hover:text-primary"
              aria-label={med.name && selected?.has(med.name) ? 'Deselect' : 'Select'}
            >
              {med.name && selected?.has(med.name) ? '✓' : '○'}
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900">{med.drug_name || med.drug || 'Medication'}</p>
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
      ))}
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
}: {
  currentMedications?: DischargePrescriptionMedication[]
  dischargedMedications?: DischargePrescriptionMedication[]
  stoppedMedications?: DischargePrescriptionMedication[]
  alwaysShow?: boolean
}) {
  const hasAny =
    currentMedications.length > 0 ||
    dischargedMedications.length > 0 ||
    stoppedMedications.length > 0
  if (!hasAny && !alwaysShow) return null

  return (
    <div className="space-y-4">
      <PrescriptionCard
        title="Current medicine"
        subtitle="Active inpatient prescriptions"
        accent="slate"
      >
        <MedicationList items={currentMedications} emptyText="No current medicines on record." />
      </PrescriptionCard>
      <PrescriptionCard
        title="Discharged medication"
        subtitle="Medicines prescribed to continue at home"
        accent="emerald"
      >
        <MedicationList items={dischargedMedications} emptyText="No discharged medicines recorded." />
      </PrescriptionCard>
      <PrescriptionCard
        title="Stopped medication"
        subtitle="Medicines stopped during this admission"
        accent="rose"
      >
        <MedicationList
          items={stoppedMedications}
          emptyText="No stopped medicines recorded."
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
  onChanged?: () => void
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
  const [stopModalOpen, setStopModalOpen] = useState(false)
  const [stopReason, setStopReason] = useState('')
  const [stopSaving, setStopSaving] = useState(false)
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
      setSelectedCurrent((prev) => {
        const valid = new Set(
          nextSections.current_medications.map((m) => m.name).filter((n): n is string => Boolean(n))
        )
        const kept = new Set([...prev].filter((id) => valid.has(id)))
        return kept.size
          ? kept
          : new Set(
              nextSections.current_medications.map((m) => m.name).filter((n): n is string => Boolean(n))
            )
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
    onChanged?.()
  }

  const confirmStop = async () => {
    const names = [...selectedCurrent].filter(Boolean)
    if (!names.length) {
      toast.error('Select at least one current medicine to stop')
      return
    }
    if (!stopReason.trim()) {
      toast.error('Enter a reason for stopping')
      return
    }
    setStopSaving(true)
    try {
      for (const orderEntryName of names) {
        await stopMedicationOnDischarge(admission, orderEntryName, stopReason.trim())
      }
      toast.success(names.length === 1 ? 'Medicine stopped' : `${names.length} medicines stopped`)
      setStopModalOpen(false)
      setStopReason('')
      setSelectedCurrent(new Set())
      await load()
      onChanged?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to stop medicine')
    } finally {
      setStopSaving(false)
    }
  }

  const selectedTransferRows = transferRows.filter(
    (row) => row.name && selectedCurrent.has(row.name)
  )

  if (loading) {
    return <div className="text-sm text-slate-600">Loading prescriptions…</div>
  }

  return (
    <div className="space-y-4">
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
        subtitle="Select medicines to discharge or stop"
        accent="slate"
        actions={
          <>
            <button
              type="button"
              disabled={selectedCurrent.size === 0}
              onClick={() => setStopModalOpen(true)}
              className="px-3 py-1.5 text-xs rounded-md border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Stop selected ({selectedCurrent.size})
            </button>
            <button
              type="button"
              disabled={selectedCurrent.size === 0 || selectedTransferRows.length === 0}
              onClick={() => setDischargeModalOpen(true)}
              className="px-3 py-1.5 text-xs rounded-md border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Discharge medication ({selectedCurrent.size})
            </button>
          </>
        }
      >
        <MedicationList
          items={sections.current_medications}
          emptyText="No current medicines on this admission."
          selectable
          selected={selectedCurrent}
          onToggle={toggleCurrent}
        />
      </PrescriptionCard>

      <PrescriptionCard
        title="Discharged medication"
        subtitle="Created when you discharge medicines for home use"
        accent="emerald"
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
          emptyText="No stopped medicines recorded."
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

      {stopModalOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl border border-slate-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-800">Stop selected medicines</h3>
            <p className="text-xs text-slate-600">
              {selectedCurrent.size} medicine{selectedCurrent.size === 1 ? '' : 's'} will be moved to stopped.
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Reason stopped <span className="text-red-500">*</span>
              </label>
              <textarea
                value={stopReason}
                onChange={(e) => setStopReason(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Why is this medicine being stopped?"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setStopModalOpen(false)
                  setStopReason('')
                }}
                className="px-3 py-1.5 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={stopSaving}
                onClick={() => void confirmStop()}
                className="px-3 py-1.5 text-sm rounded-md bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {stopSaving ? 'Stopping…' : 'Stop medicines'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
