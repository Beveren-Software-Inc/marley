import { useEffect, useState } from 'react'
import type { Prescription, MedicationOrderEntry } from '../../services/prescriptions'
import { fetchPrescriptions, fetchMedicationOrders } from '../../services/prescriptions'
import { getPatientActiveAdmission, type InpatientRecord } from '../../services/inpatientRecords'
import { createMedicineGiven } from '../../services/medicineGiven'
import { toast } from '../../hooks/useToast'
import { fetchItems, type LinkFieldOption } from '../../services/common'

interface CreateMedicineGivenModalProps {
  initialPatient?: string
  onClose: () => void
  onSuccess: () => void
}

export const CreateMedicineGivenModal = ({
  initialPatient,
  onClose,
  onSuccess,
}: CreateMedicineGivenModalProps) => {
  const [admission, setAdmission] = useState<InpatientRecord | null>(null)
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [selectedPrescription, setSelectedPrescription] = useState<string>('')
  const [orders, setOrders] = useState<MedicationOrderEntry[]>([])
  const [selectedOrder, setSelectedOrder] = useState<string>('')
  const [items, setItems] = useState<LinkFieldOption[]>([])
  const [selectedItem, setSelectedItem] = useState<string>('')
  const [mode, setMode] = useState<'prescription' | 'direct'>('prescription')
  const [qty, setQty] = useState<number>(1)
  const [date, setDate] = useState<string>('')
  const [time, setTime] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [overrideChecked, setOverrideChecked] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')

  useEffect(() => {
    const now = new Date()
    setDate(now.toISOString().slice(0, 10))
    setTime(now.toTimeString().slice(0, 5))
  }, [])

  useEffect(() => {
    const load = async () => {
      if (!initialPatient) {
        setError('Select a patient first')
        return
      }
      try {
        setLoading(true)
        setError(null)

        const adm = await getPatientActiveAdmission(initialPatient)
        if (!adm) {
          setError('No active inpatient admission found for this patient')
          return
        }
        setAdmission(adm)

        if (mode === 'prescription') {
          const list = await fetchPrescriptions(50, 0, {
            patient: initialPatient,
            careContext: 'Inpatient Admission',
          })
          setPrescriptions(list)
          if (list.length > 0) {
            const first = list[0].name
            setSelectedPrescription(first)
            const ords = await fetchMedicationOrders(first)
            setOrders(ords)
            if (ords.length > 0) {
              setSelectedOrder(ords[0].name)
            }
          } else {
            setError('No inpatient prescriptions found for this patient')
          }
        } else {
          // Direct medicine mode – load items list
          const opts = await fetchItems()
          setItems(opts)
          if (opts.length > 0) {
            setSelectedItem(opts[0].name)
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load data'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [initialPatient, mode])

  const handleChangePrescription = async (name: string) => {
    setSelectedPrescription(name)
    setOrders([])
    setSelectedOrder('')
    if (!name) return
    try {
      const ords = await fetchMedicationOrders(name)
      setOrders(ords)
      if (ords.length > 0) {
        setSelectedOrder(ords[0].name)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load medicines for this prescription'
      setError(msg)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!initialPatient) {
      toast.error('Select a patient first')
      return
    }
    if (!admission) {
      toast.error('No active admission found')
      return
    }
    if (mode === 'prescription') {
      if (!selectedPrescription) {
        toast.error('Select a prescription')
        return
      }
      if (!selectedOrder) {
        toast.error('Select a medicine from the prescription')
        return
      }
    } else {
      if (!selectedItem) {
        toast.error('Select a medicine item')
        return
      }
    }
    try {
      setLoading(true)
      setError(null)

      // Simple override flow: if override is checked, require justification and send to backend
      if (overrideChecked && !overrideReason.trim()) {
        const msg = 'Please enter a justification for overriding the prescribed frequency.'
        setError(msg)
        toast.error(msg)
        return
      }

      await createMedicineGiven({
        admission: admission.name,
        medication_order: mode === 'prescription' ? selectedPrescription : '',
        order_entry: mode === 'prescription' ? selectedOrder : undefined,
        item_code: mode === 'direct' ? selectedItem : undefined,
        allow_override: overrideChecked || undefined,
        override_reason: overrideChecked ? overrideReason.trim() : undefined,
        qty: qty || 1,
        date,
        time,
        dose_notes: notes || undefined,
      })

      toast.success(overrideChecked ? 'Given medicine recorded with override' : 'Given medicine recorded')
      onSuccess()
      onClose()
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : 'Failed to record given medicine'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Record Given Medicine</h2>
            {admission && (
              <p className="text-xs text-slate-600">
                Admission: <span className="font-medium">{admission.name}</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-4 py-3 space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {mode === 'prescription' && (
            <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-3 text-xs text-amber-800 space-y-2">
              <div className="font-semibold">Override prescribed frequency (optional)</div>
              <p className="text-[11px]">
                Use this only when an extra dose is clinically justified (e.g. ICU, high-risk treatment, explicit
                consultant order). All overrides are logged with user and reason.
              </p>
              <label className="flex items-center gap-2 text-[11px]">
                <input
                  type="checkbox"
                  className="h-3 w-3"
                  checked={overrideChecked}
                  onChange={(e) => setOverrideChecked(e.target.checked)}
                />
                I need to override the prescribed daily frequency for this dose.
              </label>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-amber-900">
                  Override justification
                </label>
                <textarea
                  rows={2}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full rounded-md border border-amber-300 px-2 py-1.5 text-xs bg-amber-50"
                  placeholder="e.g. ICU patient, consultant order to give extra dose now…"
                  disabled={!overrideChecked}
                />
              </div>
            </div>
          )}

          {/* Mode toggle */}
          <div className="flex gap-3 text-xs font-medium text-slate-600">
            <label className="inline-flex items-center gap-1">
              <input
                type="radio"
                className="h-3 w-3"
                checked={mode === 'prescription'}
                onChange={() => setMode('prescription')}
              />
              From Prescription
            </label>
            <label className="inline-flex items-center gap-1">
              <input
                type="radio"
                className="h-3 w-3"
                checked={mode === 'direct'}
                onChange={() => setMode('direct')}
              />
              Direct Medicine
            </label>
          </div>

          {mode === 'prescription' && (
            <>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-600">
              Prescription (Patient Medication Order)
            </label>
            <select
              value={selectedPrescription}
              onChange={(e) => handleChangePrescription(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
              disabled={loading || !prescriptions.length}
            >
              {prescriptions.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} – {p.patient_name || p.patient}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-600">
              Medicine from Prescription
            </label>
            <select
              value={selectedOrder}
              onChange={(e) => setSelectedOrder(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
              disabled={loading || !orders.length}
            >
              {orders.map((o) => (
                <option key={o.name} value={o.name}>
                  {o.drug_name || o.drug} – {o.dosage}
                </option>
              ))}
            </select>
          </div>
            </>
          )}

          {mode === 'direct' && (
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-600">
                Medicine Item
              </label>
              <select
                value={selectedItem}
                onChange={(e) => setSelectedItem(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
                disabled={loading || !items.length}
              >
                {items.map((it) => (
                  <option key={it.name} value={it.name}>
                    {it.label || it.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-600">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-600">Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-600">Quantity</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={qty}
              onChange={(e) => setQty(parseFloat(e.target.value) || 0)}
              className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-600">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !selectedPrescription || !admission}
              className="px-3 py-1.5 text-sm rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

