import { useEffect, useRef, useState } from 'react'
import {
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import type { Prescription, MedicationOrderEntry } from '../../services/prescriptions'
import { fetchPrescriptions, fetchMedicationOrders, fetchPrescriptionByInpatientOrEncounter } from '../../services/prescriptions'
import { getPatientActiveAdmission, type InpatientRecord } from '../../services/inpatientRecords'
import { createMedicineGiven } from '../../services/medicineGiven'
import { toast } from '../../hooks/useToast'
import { fetchItems, fetchStandardUoms, type LinkFieldOption } from '../../services/common'
import {
  linkComboboxDropdownClass,
  linkComboboxInputWithClearClass,
  linkComboboxOptionClassCompact,
} from '../ui/linkComboboxStyles'
import { ChevronDown, X } from 'lucide-react'

interface CreateMedicineGivenModalProps {
  initialPatient?: string
  inpatientRecord?: string | null
  patientEncounter?: string | null
  onClose: () => void
  onSuccess: () => void
}

interface ComboboxProps {
  value: string
  displayValue: string
  placeholder: string
  options: LinkFieldOption[]
  loading?: boolean
  onQueryChange: (q: string) => void
  onSelect: (opt: LinkFieldOption) => void
  onOpen: () => void
  onClear?: () => void
}

const Combobox = ({
  displayValue,
  placeholder,
  options,
  loading,
  onQueryChange,
  onSelect,
  onOpen,
  onClear,
}: ComboboxProps) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <input
          type="text"
          value={displayValue}
          onChange={(e) => {
            onQueryChange(e.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            setOpen(true)
            onOpen()
          }}
          placeholder={placeholder}
          className={linkComboboxInputWithClearClass}
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {displayValue && onClear && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onClear()
                setOpen(false)
              }}
              className="text-slate-400 hover:text-slate-600 transition-colors p-0.5"
              title="Clear"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <ChevronDown className="w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {open && (
        <div className={linkComboboxDropdownClass}>
          {loading ? (
            <div className="px-3 py-2 text-xs text-slate-500">Loading...</div>
          ) : options.length ? (
            options.map((opt) => (
              <button
                key={opt.name}
                type="button"
                className={linkComboboxOptionClassCompact}
                onClick={() => {
                  onSelect(opt)
                  setOpen(false)
                }}
              >
                {opt.label || opt.name}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-slate-500">No results found</div>
          )}
        </div>
      )}
    </div>
  )
}

export const CreateMedicineGivenModal = ({
  initialPatient,
  inpatientRecord: propInpatientRecord,
  patientEncounter: propPatientEncounter,
  onClose,
  onSuccess,
}: CreateMedicineGivenModalProps) => {
  const [admission, setAdmission] = useState<InpatientRecord | null>(null)
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [selectedPrescription, setSelectedPrescription] = useState<string>('')
  const [orders, setOrders] = useState<MedicationOrderEntry[]>([])
  const [selectedOrder, setSelectedOrder] = useState<string>('')
  const [items, setItems] = useState<LinkFieldOption[]>([])
  const [uoms, setUoms] = useState<LinkFieldOption[]>([])
  const [itemQuery, setItemQuery] = useState('')
  const [uomQuery, setUomQuery] = useState('')
  const [loadingItems, setLoadingItems] = useState(false)
  const [loadingUoms, setLoadingUoms] = useState(false)
  const [selectedItem, setSelectedItem] = useState<string>('')
  const [mode, setMode] = useState<'prescription' | 'direct'>('prescription')
  const [qty, setQty] = useState<number>(1)
  const [uom, setUom] = useState<string>('')
  const [date, setDate] = useState<string>('')
  const [time, setTime] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [overrideChecked, setOverrideChecked] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [isPrn, setIsPrn] = useState(false)

  const prescriptionOrders = isPrn
    ? orders.filter((o) => o.is_prn === 1 || o.medication_type === 'PRN')
    : orders

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
        setLoadingUoms(true)
        const uomOptions = await fetchStandardUoms()
        setUoms(uomOptions)
        setLoadingUoms(false)

        if (mode === 'prescription') {
          const hasContext = propInpatientRecord || propPatientEncounter
          if (hasContext) {
            try {
              const currentRx = await fetchPrescriptionByInpatientOrEncounter(
                propInpatientRecord,
                propPatientEncounter
              )
              if (currentRx) {
                setPrescriptions([currentRx])
                setSelectedPrescription(currentRx.name)
                const ords = await fetchMedicationOrders(currentRx.name)
                setOrders(ords)
                setSelectedOrder(ords.length > 0 ? ords[0].name : '')
              } else {
                setPrescriptions([])
                setSelectedPrescription('')
                setOrders([])
                setSelectedOrder('')
                setError(
                  'No current prescription found. Use "Direct Medicine" to record a dose, or create a prescription first.'
                )
              }
            } catch {
              setPrescriptions([])
              setSelectedPrescription('')
              setOrders([])
              setSelectedOrder('')
              setError('Failed to load current prescription.')
            }
          } else {
            const list = await fetchPrescriptions(50, 0, {
              patient: initialPatient,
              careContext: 'Inpatient Admission',
              inpatientRecord: adm.name,
            })
            setPrescriptions(list)
            if (list.length > 0) {
              const first = list[0].name
              setSelectedPrescription(first)
              const ords = await fetchMedicationOrders(first)
              setOrders(ords)
              setSelectedOrder(ords.length > 0 ? ords[0].name : '')
            } else {
              setSelectedPrescription('')
              setOrders([])
              setSelectedOrder('')
              setError(
                `No submitted prescription (Patient Medication Order) for admission ${adm.name}. Use "Direct Medicine" to record a dose, or add a prescription for this admission.`
              )
            }
          }
        } else {
          const opts = await fetchItems()
          setItems(opts)
          if (opts.length > 0) {
            setSelectedItem(opts[0].name)
            setItemQuery(opts[0].label || opts[0].name)
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
  }, [initialPatient, mode, propInpatientRecord, propPatientEncounter])

  useEffect(() => {
    if (mode === 'prescription') {
      const selected = prescriptionOrders.find((o) => o.name === selectedOrder)
      setUom((selected?.uom || '').trim())
      setUomQuery((selected?.uom || '').trim())
      return
    }
    const selected = items.find((it) => it.name === selectedItem)
    setUom((selected?.stock_uom || '').trim())
    setUomQuery((selected?.stock_uom || '').trim())
  }, [mode, selectedOrder, selectedItem, prescriptionOrders, items])

  const searchItems = async (query: string) => {
    setLoadingItems(true)
    try {
      const opts = await fetchItems(query || undefined)
      setItems(opts)
    } finally {
      setLoadingItems(false)
    }
  }

  const searchUomOptions = async (query: string) => {
    setLoadingUoms(true)
    try {
      const opts = await fetchStandardUoms(query || undefined)
      setUoms(opts)
    } finally {
      setLoadingUoms(false)
    }
  }

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

      if (overrideChecked && !overrideReason.trim()) {
        const msg = 'Please enter a justification for overriding the prescribed frequency.'
        setError(msg)
        toast.error(msg)
        return
      }

      const selectedRx = prescriptions.find(p => p.name === selectedPrescription)
      const admissionName = (mode === 'prescription' && selectedRx?.inpatient_record)
        ? selectedRx.inpatient_record
        : (propInpatientRecord || admission.name)

      await createMedicineGiven({
        admission: admissionName,
        medication_order: mode === 'prescription' ? selectedPrescription : '',
        order_entry: mode === 'prescription' ? selectedOrder : undefined,
        item_code: mode === 'direct' ? selectedItem : undefined,
        unit: uom || undefined,
        allow_override: overrideChecked || undefined,
        override_reason: overrideChecked ? overrideReason.trim() : undefined,
        qty: qty || 1,
        date,
        time,
        dose_notes: notes || undefined,
        is_prn: isPrn || undefined,
      })

      toast.success(overrideChecked ? 'Given medicine recorded with override' : 'Given medicine recorded')
      onSuccess()
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to record given medicine'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('w-full max-w-2xl max-h-[90vh] overflow-hidden')}>
        {/* Enhanced Header */}
        <div className="relative bg-gradient-to-r from-emerald-100 via-teal-50 to-sky-100 px-6 py-5 border-b border-emerald-200/60">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.12),transparent_55%)]" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 ring-1 ring-emerald-400/40">
                <svg className="h-5 w-5 text-emerald-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M20 12V8H4v4M12 4v16M8 8h8M4 12h16M4 12v4a2 2 0 002 2h12a2 2 0 002-2v-4" />
                  <path d="M9 12h6" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-emerald-950">Record Given Medicine</h2>
                {admission && (
                  <p className="mt-1 text-sm text-emerald-800/80">
                    Admission: <span className="font-medium">{admission.name}</span>
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-2 text-emerald-800/70 transition hover:bg-emerald-200/50 hover:text-emerald-950"
              aria-label="Close"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && (
            <div className="rounded-xl border border-red-200/80 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm">
              {error}
            </div>
          )}

          {/* Override section */}
          {mode === 'prescription' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-4 space-y-3">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-semibold text-amber-800">Override prescribed frequency (optional)</span>
              </div>
              <p className="text-xs text-amber-700">
                Use this only when an extra dose is clinically justified (e.g. ICU, high-risk treatment, explicit
                consultant order). All overrides are logged with user and reason.
              </p>
              <label className="flex items-center gap-2 text-sm text-amber-800">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  checked={overrideChecked}
                  onChange={(e) => setOverrideChecked(e.target.checked)}
                />
                I need to override the prescribed daily frequency for this dose.
              </label>
              {overrideChecked && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-amber-900">
                    Override justification <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    className="w-full rounded-lg border border-amber-300 px-3 py-2 text-sm bg-amber-50/50 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    placeholder="e.g. ICU patient, consultant order to give extra dose now…"
                  />
                </div>
              )}
            </div>
          )}

          {/* Mode toggle + PRN filter */}
          <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-slate-600 border-b border-slate-200 pb-3">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                className="h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                checked={mode === 'prescription'}
                onChange={() => setMode('prescription')}
              />
              From Prescription
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                className="h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                checked={mode === 'direct'}
                onChange={() => setMode('direct')}
              />
              Direct Medicine
            </label>
            {mode === 'prescription' && (
              <label className="inline-flex items-center gap-2 ml-auto cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  checked={isPrn}
                  onChange={(e) => {
                    setIsPrn(e.target.checked)
                    setSelectedOrder('')
                  }}
                />
                <span className="text-amber-700 font-semibold">PRN only</span>
                <span className="text-slate-400 text-xs">(as-needed)</span>
              </label>
            )}
          </div>

          {mode === 'prescription' && (
            <>
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Current Prescription
                </label>
                <select
                  value={selectedPrescription}
                  onChange={(e) => handleChangePrescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  disabled={loading || !prescriptions.length}
                >
                  {prescriptions.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} – {p.patient_name || p.patient}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {isPrn ? 'PRN Medicine from Prescription' : 'Medicine from Prescription'}
                </label>
                {isPrn && (
                  <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Showing only PRN (as-needed) medications from this prescription.
                  </div>
                )}
                <select
                  value={selectedOrder}
                  onChange={(e) => setSelectedOrder(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  disabled={loading || !orders.length}
                >
                  <option value="">
                    {isPrn && orders.filter((o) => o.is_prn === 1 || o.medication_type === 'PRN').length === 0
                      ? 'No PRN medicines on this prescription'
                      : 'Select medicine...'}
                  </option>
                  {prescriptionOrders.map((o) => (
                    <option key={o.name} value={o.name}>
                      {o.drug_name || o.drug} – {o.dosage}
                      {o.is_prn === 1 ? ' (PRN)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {mode === 'direct' && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Medicine Item
              </label>
              <Combobox
                value={selectedItem}
                displayValue={itemQuery}
                placeholder="Search medicine item..."
                options={items}
                loading={loadingItems}
                onQueryChange={(q) => {
                  setItemQuery(q)
                  setSelectedItem('')
                  searchItems(q)
                }}
                onOpen={() => {
                  if (items.length === 0) {
                    searchItems('')
                  }
                }}
                onSelect={(opt) => {
                  setSelectedItem(opt.name)
                  setItemQuery(opt.label || opt.name)
                  const nextUom = (opt.stock_uom || '').trim()
                  setUom(nextUom)
                  setUomQuery(nextUom)
                }}
                onClear={() => {
                  setSelectedItem('')
                  setItemQuery('')
                }}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Quantity</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={qty}
              onChange={(e) => setQty(parseFloat(e.target.value) || 0)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">UOM</label>
            <Combobox
              value={uom}
              displayValue={uomQuery}
              placeholder="Search UOM..."
              options={uoms}
              loading={loadingUoms}
              onQueryChange={(q) => {
                setUomQuery(q)
                setUom('')
                searchUomOptions(q)
              }}
              onOpen={() => {
                if (uoms.length === 0) {
                  searchUomOptions('')
                }
              }}
              onSelect={(opt) => {
                setUom(opt.name)
                setUomQuery(opt.label || opt.name)
              }}
              onClear={() => {
                setUom('')
                setUomQuery('')
              }}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              placeholder="Additional notes or observations..."
            />
          </div>
        </form>

        {/* Enhanced Footer */}
        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-emerald-100 bg-gradient-to-r from-white via-emerald-50/50 to-teal-50/40 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={loading || !admission || (mode === 'prescription' && (!selectedPrescription || !selectedOrder)) || (mode === 'direct' && !selectedItem)}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/30 hover:from-emerald-500 hover:to-teal-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Saving...
              </span>
            ) : (
              'Save Medicine Record'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
