import { useMemo, useState } from 'react'
import { X, CalendarClock } from 'lucide-react'
import { toast } from '../../hooks/useToast'
import {
  createSubscriptionMedicationPlan,
  type MedicationOrderEntry,
  type SubscriptionPlanMedicationInput,
} from '../../services/prescriptions'
import { CREATE_MODAL_OVERLAY, createModalShellClass } from '../ui/CreateModalChrome'
import {
  displayMedicationDrugCode,
  displayMedicationDrugName,
} from '../../utils/medicationOrderDisplayUtils'
import { DateFilterInput } from '../ui/DateFilterInput'

const FREQUENCIES = ['Monthly', 'Every 2 Months', 'Every 3 Months'] as const

type Frequency = (typeof FREQUENCIES)[number]

type PlanRow = {
  key: string
  medication_order_entry?: string
  drug: string
  drug_name: string
  dosage?: string | number
  dosage_form?: string
  instructions?: string
  patient_frequency?: string
  date?: string
  time?: string
  qty_per_cycle: number
  include: boolean
}

function toPlanRows(orders: MedicationOrderEntry[]): PlanRow[] {
  return (orders || [])
    .map((order, idx) => {
      const drug = displayMedicationDrugCode(order) || (order.drug || '').trim()
      if (!drug) return null
      const qty = Number(order.quantity)
      return {
        key: order.name || `${drug}-${idx}`,
        medication_order_entry: order.name,
        drug,
        drug_name: displayMedicationDrugName(order) || order.drug_name || drug,
        dosage: order.dosage,
        dosage_form: order.dosage_form,
        instructions: order.instructions,
        patient_frequency: order.patient_frequency,
        date: order.date,
        time: (order as { time?: string }).time,
        qty_per_cycle: Number.isFinite(qty) && qty > 0 ? qty : 1,
        include: true,
      } satisfies PlanRow
    })
    .filter(Boolean) as PlanRow[]
}

interface CreateSubscriptionPlanModalProps {
  prescriptionName: string
  patientName?: string
  startDate?: string
  medicationOrders: MedicationOrderEntry[]
  onClose: () => void
  onCreated?: (planName: string) => void
}

export const CreateSubscriptionPlanModal = ({
  prescriptionName,
  patientName,
  startDate,
  medicationOrders,
  onClose,
  onCreated,
}: CreateSubscriptionPlanModalProps) => {
  const initialRows = useMemo(() => toPlanRows(medicationOrders), [medicationOrders])
  const [rows, setRows] = useState<PlanRow[]>(initialRows)
  const [frequency, setFrequency] = useState<Frequency>('Monthly')
  const [planStartDate, setPlanStartDate] = useState(
    startDate || new Date().toISOString().slice(0, 10),
  )
  const [endDate, setEndDate] = useState('')
  const [saving, setSaving] = useState(false)

  const includedCount = rows.filter((r) => r.include && r.drug).length

  const updateRow = (key: string, patch: Partial<PlanRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const handleCreate = async () => {
    const medications: SubscriptionPlanMedicationInput[] = rows
      .filter((r) => r.include && r.drug)
      .map((r) => ({
        medication_order_entry: r.medication_order_entry,
        drug: r.drug,
        drug_name: r.drug_name,
        dosage: r.dosage,
        dosage_form: r.dosage_form,
        instructions: r.instructions,
        patient_frequency: r.patient_frequency,
        date: r.date,
        time: r.time,
        qty_per_cycle: r.qty_per_cycle,
        is_active: 1,
      }))

    if (!medications.length) {
      toast.error('Select at least one medication to include')
      return
    }
    if (!planStartDate) {
      toast.error('Start date is required')
      return
    }

    setSaving(true)
    try {
      const result = await createSubscriptionMedicationPlan({
        prescription: prescriptionName,
        medications,
        frequency,
        start_date: planStartDate,
        end_date: endDate || undefined,
      })
      toast.success(
        `Subscription plan ${result.name} created${
          result.next_run_date ? ` · next run ${result.next_run_date}` : ''
        }`,
      )
      onCreated?.(result.name)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create subscription plan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY} onClick={onClose} role="presentation">
      <div
        className={createModalShellClass('max-w-3xl w-full max-h-[min(90dvh,calc(100vh-1.5rem))]')}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscription-plan-title"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <h2
              id="subscription-plan-title"
              className="text-base font-semibold text-slate-900 flex items-center gap-2"
            >
              <CalendarClock className="h-4 w-4 text-teal-700 shrink-0" aria-hidden />
              Medication Subscription Plan
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {patientName ? `${patientName} · ` : ''}
              <span className="font-mono">{prescriptionName}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
          <p className="text-sm text-slate-600">
            Select medications to include. Frequency controls how often a new medication order is
            generated from this plan (same as desk).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Frequency <span className="text-red-500">*</span>
              </label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as Frequency)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Start Date <span className="text-red-500">*</span>
              </label>
              <DateFilterInput
                value={planStartDate}
                onChange={(e) => setPlanStartDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">End Date</label>
              <DateFilterInput
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Medications
              </span>
              <span className="text-xs text-slate-500">{includedCount} selected</span>
            </div>
            {rows.length === 0 ? (
              <div className="px-3 py-6 text-sm text-slate-500 text-center">
                No medications on this prescription.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[40vh]">
                <table className="w-full text-sm">
                  <thead className="bg-white sticky top-0 border-b border-slate-100">
                    <tr className="text-left text-xs text-slate-500">
                      <th className="px-3 py-2 font-medium">Include</th>
                      <th className="px-3 py-2 font-medium">Drug</th>
                      <th className="px-3 py-2 font-medium">Dosage form</th>
                      <th className="px-3 py-2 font-medium">Qty / cycle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => (
                      <tr key={row.key} className={row.include ? 'bg-white' : 'bg-slate-50/80'}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={row.include}
                            onChange={(e) => updateRow(row.key, { include: e.target.checked })}
                            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-800">{row.drug_name}</div>
                          <div className="text-xs text-slate-400 font-mono">{row.drug}</div>
                        </td>
                        <td className="px-3 py-2 text-slate-600">{row.dosage_form || '—'}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0.01}
                            step="any"
                            disabled={!row.include}
                            value={row.qty_per_cycle}
                            onChange={(e) =>
                              updateRow(row.key, {
                                qty_per_cycle: Math.max(0.01, Number(e.target.value) || 1),
                              })
                            }
                            className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 bg-slate-50/80">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={saving || includedCount === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-md hover:bg-teal-800 disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create Plan'}
          </button>
        </div>
      </div>
    </div>
  )
}
