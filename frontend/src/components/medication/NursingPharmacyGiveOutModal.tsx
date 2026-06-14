import { useEffect, useRef, useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_OVERLAY,
  CreateModalFooter,
  CreateModalHeader,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { fetchPrescriptionItems, fetchStandardUoms, type LinkFieldOption } from '../../services/common'
import {
  createNursingPharmacyGiveOut,
  fetchPrescriptionByInpatientOrEncounter,
  type MedicationOrderEntry,
  type MedicationOrderRow,
} from '../../services/prescriptions'
import { getPatientActiveAdmission } from '../../services/inpatientRecords'
import { toast } from '../../hooks/useToast'
import { useCareContext } from '../../providers/CareContextProvider'
import { useBlockIfActiveCareClosed } from '../../hooks/useBlockIfActiveCareClosed'
import {
  linkComboboxDropdownClass,
  linkComboboxInputWithClearClass,
  linkComboboxOptionClassCompact,
} from '../ui/linkComboboxStyles'
import { flagsFromPrescriptionType, normalizeMedicationOrderForSave } from '../../utils/prescriptionType'
import { Loader2, Pill, Plus, Trash2 } from 'lucide-react'

const PRESCRIPTION_TYPES = [
  'STAT',
  'PRN',
  'Regular - Psy (Active)',
  'Regular - Med (Active)',
  'Future Plan',
  'Long Acting Medicine',
] as const

interface NursingPharmacyGiveOutModalProps {
  onClose: () => void
  onSuccess: () => void
  initialPatient?: string
  inpatientRecord?: string
}

interface GiveOutRow extends MedicationOrderRow {
  rowKey: string
}

function nextRowKey() {
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function emptyRow(startDate: string): GiveOutRow {
  return {
    rowKey: nextRowKey(),
    drug: '',
    drug_name: '',
    dosage: '',
    uom: '',
    no_of_days: 1,
    dosage_form: '',
    instructions: '',
    date: startDate,
    end_date: startDate,
    time: '08:00:00',
    patient_frequency: '',
    quantity: 1,
  }
}

function mapEntryToRow(
  entry: MedicationOrderEntry & {
    quantity?: number
    qty?: number
    no_of_days?: number
    date?: string
    end_date?: string
    time?: string
    patient_frequency?: string
    route_of_administration?: string
    instructions?: string
  },
  startDate: string
): GiveOutRow {
  const qtyRaw = entry.quantity ?? entry.qty
  const qty = typeof qtyRaw === 'number' ? qtyRaw : parseFloat(String(qtyRaw || '1')) || 1
  return {
    rowKey: nextRowKey(),
    drug: entry.drug || '',
    drug_name: entry.drug_name || '',
    dosage: entry.dosage || '',
    uom: entry.uom || '',
    no_of_days: entry.no_of_days ?? 1,
    dosage_form: entry.dosage_form || '',
    instructions: entry.instructions || '',
    date: entry.date || startDate,
    end_date: entry.end_date || startDate,
    time: entry.time || '08:00:00',
    patient_frequency: entry.patient_frequency || '',
    route_of_administration: entry.route_of_administration || '',
    medication_type: entry.medication_type || '',
    is_prn: entry.is_prn === 1,
    quantity: qty > 0 ? qty : 1,
  }
}

interface SearchComboboxProps {
  value: string
  displayValue: string
  options: LinkFieldOption[]
  loading: boolean
  placeholder: string
  onQueryChange: (q: string) => void
  onOpen: () => void
  onSelect: (opt: LinkFieldOption) => void
  onClear?: () => void
  allowCustom?: boolean
  showCodeHint?: boolean
}

function SearchCombobox({
  value,
  displayValue,
  options,
  loading,
  placeholder,
  onQueryChange,
  onOpen,
  onSelect,
  onClear,
  allowCustom = false,
  showCodeHint = false,
}: SearchComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(displayValue)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(displayValue)
  }, [displayValue])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        className={linkComboboxInputWithClearClass}
        onFocus={() => {
          setOpen(true)
          onOpen()
        }}
        onChange={(e) => {
          const q = e.target.value
          setQuery(q)
          onQueryChange(q)
          if (allowCustom) {
            onSelect({ name: q, label: q })
          }
          setOpen(true)
        }}
      />
      {value && onClear && (
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
          onClick={() => {
            onClear()
            setQuery('')
            setOpen(false)
          }}
        >
          Clear
        </button>
      )}
      {open && (
        <div className={linkComboboxDropdownClass}>
          {loading ? (
            <div className="px-3 py-2 text-xs text-slate-500">Loading…</div>
          ) : options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">No options found</div>
          ) : (
            options.map((opt) => (
              <button
                key={opt.name}
                type="button"
                className={linkComboboxOptionClassCompact}
                onClick={() => {
                  onSelect(opt)
                  setQuery(opt.label || opt.name)
                  setOpen(false)
                }}
              >
                {opt.label || opt.name}
              </button>
            ))
          )}
        </div>
      )}
      {showCodeHint && value && !open && (
        <p className="text-[11px] text-slate-500 mt-0.5 truncate">{value}</p>
      )}
    </div>
  )
}

interface DrugComboboxProps {
  value: string
  displayValue: string
  options: LinkFieldOption[]
  loading: boolean
  onQueryChange: (q: string) => void
  onOpen: () => void
  onSelect: (opt: LinkFieldOption) => void
}

function DrugCombobox(props: DrugComboboxProps) {
  return (
    <SearchCombobox
      {...props}
      placeholder="Search drug..."
      showCodeHint
    />
  )
}

export function NursingPharmacyGiveOutModal({
  onClose,
  onSuccess,
  initialPatient,
  inpatientRecord: propInpatientRecord,
}: NursingPharmacyGiveOutModalProps) {
  const { activeAdmission, selectedPatient: contextPatient } = useCareContext()
  const blockIfClosed = useBlockIfActiveCareClosed()
  const patient = initialPatient || contextPatient || ''
  const startDate = todayStr()

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [admissionId, setAdmissionId] = useState(propInpatientRecord || activeAdmission || '')
  const [sourcePrescription, setSourcePrescription] = useState('')
  const [practitioner, setPractitioner] = useState('')
  const [rows, setRows] = useState<GiveOutRow[]>([])
  const [drugQueries, setDrugQueries] = useState<Record<number, string>>({})
  const [drugOptions, setDrugOptions] = useState<Record<number, LinkFieldOption[]>>({})
  const [drugLoading, setDrugLoading] = useState<Record<number, boolean>>({})
  const [uomOptions, setUomOptions] = useState<LinkFieldOption[]>([])
  const [uomQueries, setUomQueries] = useState<Record<number, string>>({})
  const [loadingUom, setLoadingUom] = useState(false)

  useEffect(() => {
    fetchStandardUoms()
      .then(setUomOptions)
      .catch(() => setUomOptions([]))
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (!patient) {
        setError('Select a patient first')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        let admission = propInpatientRecord || activeAdmission || ''
        if (!admission) {
          const adm = await getPatientActiveAdmission(patient)
          admission = adm?.name || ''
        }
        if (!admission) {
          setError('No active inpatient admission found for this patient')
          return
        }
        if (cancelled) return
        setAdmissionId(admission)

        const currentRx = await fetchPrescriptionByInpatientOrEncounter(admission, null)
        if (cancelled) return

        if (!currentRx) {
          setError('No current prescription found for this admission. Create a prescription first.')
          setRows([])
          return
        }

        setSourcePrescription(currentRx.name)
        setPractitioner(currentRx.practitioner || '')

        const entries = currentRx.medication_orders || []
        const activeEntries = entries.filter((e) => !e.reason_stopped)
        if (activeEntries.length === 0) {
          setError('Current prescription has no active medications.')
          setRows([])
          return
        }

        const mapped = activeEntries.map((e) => mapEntryToRow(e, startDate))
        setRows(mapped)
        const queries: Record<number, string> = {}
        const uomLabels: Record<number, string> = {}
        mapped.forEach((r, i) => {
          queries[i] = r.drug_name || r.drug
          uomLabels[i] = r.uom || ''
        })
        setDrugQueries(queries)
        setUomQueries(uomLabels)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load current prescription')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [patient, propInpatientRecord, activeAdmission, startDate])

  const loadDrugOptions = async (index: number, query: string) => {
    setDrugLoading((prev) => ({ ...prev, [index]: true }))
    try {
      const opts = await fetchPrescriptionItems(query)
      setDrugOptions((prev) => ({ ...prev, [index]: opts }))
    } catch {
      setDrugOptions((prev) => ({ ...prev, [index]: [] }))
    } finally {
      setDrugLoading((prev) => ({ ...prev, [index]: false }))
    }
  }

  const updateRow = (index: number, patch: Partial<GiveOutRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const searchUoms = async (query: string) => {
    setLoadingUom(true)
    try {
      setUomOptions(await fetchStandardUoms(query || undefined))
    } catch {
      setUomOptions([])
    } finally {
      setLoadingUom(false)
    }
  }

  const applyDrugSelection = (index: number, opt: LinkFieldOption) => {
    const stockUom = (opt.stock_uom || '').trim()
    updateRow(index, {
      drug: opt.name,
      drug_name: opt.label || opt.name,
      uom: stockUom || undefined,
    })
    setDrugQueries((prev) => ({ ...prev, [index]: opt.label || opt.name }))
    if (stockUom) {
      setUomQueries((prev) => ({ ...prev, [index]: stockUom }))
    }
    setDrugOptions((prev) => ({ ...prev, [index]: [] }))
  }

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index))
    setDrugQueries((prev) => {
      const next: Record<number, string> = {}
      Object.entries(prev).forEach(([k, v]) => {
        const i = Number(k)
        if (i < index) next[i] = v
        else if (i > index) next[i - 1] = v
      })
      return next
    })
    setUomQueries((prev) => {
      const next: Record<number, string> = {}
      Object.entries(prev).forEach(([k, v]) => {
        const i = Number(k)
        if (i < index) next[i] = v
        else if (i > index) next[i - 1] = v
      })
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const validRows = rows.filter((r) => r.drug.trim())
    if (validRows.length === 0) {
      setError('Add at least one medication with a drug selected')
      return
    }
    for (const row of validRows) {
      if (!row.dosage?.trim()) {
        setError('Dosage is required for each medication')
        return
      }
      if (!row.medication_type?.trim()) {
        setError('Prescription type is required for each medication')
        return
      }
      if (!row.uom?.trim()) {
        setError('Unit of measure is required for each medication')
        return
      }
      const qty = Number(row.quantity)
      if (!qty || qty <= 0) {
        setError('Quantity must be greater than zero for each medication')
        return
      }
    }
    if (!admissionId) {
      setError('Inpatient admission is required')
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      blockIfClosed()
      const payload: MedicationOrderRow[] = validRows.map(({ rowKey: _rk, ...rest }) =>
        normalizeMedicationOrderForSave(rest)
      )
      const result = await createNursingPharmacyGiveOut({
        patient,
        inpatient_record: admissionId,
        medication_orders: payload,
        source_prescription: sourcePrescription || undefined,
        practitioner: practitioner || undefined,
      })
      toast.success(`Pharmacy give-out submitted. Sales Order ${result.sales_order} created.`)
      onSuccess()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to submit pharmacy give-out'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-4xl w-full max-h-[90vh] min-h-[600px]')}>
        <CreateModalHeader
          title="Pharmacy Give Out"
          icon={<Pill className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          onClose={onClose}
        />

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className={`${CREATE_MODAL_BODY_GRADIENT} flex-1 overflow-y-auto px-6 py-4 space-y-4`}>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-slate-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading current prescription…
              </div>
            ) : (
              <>
                {sourcePrescription && (
                  <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
                    <span className="text-slate-500">Pre-filled from current prescription: </span>
                    <span className="font-medium text-slate-800">{sourcePrescription}</span>
                    <p className="text-xs text-slate-500 mt-1">
                      This creates a new Patient Medication Order marked as nursing pharmacy give-out. Adjust
                      medications below, then submit to bill the patient automatically.
                    </p>
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                    {error}
                  </div>
                )}

                <div className="space-y-3">
                  {rows.map((row, index) => (
                    <div
                      key={row.rowKey}
                      className="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden"
                    >
                      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                          <Pill className="w-4 h-4 text-primary" />
                          <span>Medication {index + 1}</span>
                          {row.drug && drugQueries[index] && (
                            <span className="text-slate-400 font-normal truncate max-w-[200px]">
                              — {drugQueries[index]}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeRow(index)}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Drug <span className="text-red-500">*</span>
                          </label>
                          <DrugCombobox
                            value={row.drug}
                            displayValue={drugQueries[index] ?? row.drug_name ?? row.drug}
                            options={drugOptions[index] || []}
                            loading={!!drugLoading[index]}
                            onQueryChange={(q) => {
                              setDrugQueries((prev) => ({ ...prev, [index]: q }))
                              void loadDrugOptions(index, q)
                            }}
                            onOpen={() => loadDrugOptions(index, drugQueries[index] || row.drug || '')}
                            onSelect={(opt) => applyDrugSelection(index, opt)}
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Prescription Type <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={row.medication_type || ''}
                            onChange={(e) => {
                              const medication_type = e.target.value
                              updateRow(index, {
                                medication_type,
                                ...flagsFromPrescriptionType(medication_type),
                              })
                            }}
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                          >
                            <option value="">Select…</option>
                            {PRESCRIPTION_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Dosage <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={row.dosage}
                            onChange={(e) => updateRow(index, { dosage: e.target.value })}
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                          />
                        </div>

                        <div className="md:col-span-2 grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Quantity to bill <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              min={0.01}
                              step="any"
                              value={row.quantity ?? 1}
                              onChange={(e) =>
                                updateRow(index, { quantity: parseFloat(e.target.value) || 0 })
                              }
                              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Unit of Measure <span className="text-red-500">*</span>
                            </label>
                            <SearchCombobox
                              value={row.uom ?? ''}
                              displayValue={uomQueries[index] ?? row.uom ?? ''}
                              options={uomOptions}
                              loading={loadingUom}
                              placeholder="Type or select unit of measure…"
                              allowCustom
                              onQueryChange={(q) => {
                                setUomQueries((prev) => ({ ...prev, [index]: q }))
                                void searchUoms(q)
                              }}
                              onOpen={() => {
                                if (uomOptions.length === 0) void searchUoms('')
                              }}
                              onSelect={(opt) => {
                                updateRow(index, { uom: opt.name })
                                setUomQueries((prev) => ({ ...prev, [index]: opt.label || opt.name }))
                              }}
                              onClear={() => {
                                updateRow(index, { uom: '' })
                                setUomQueries((prev) => ({ ...prev, [index]: '' }))
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setRows((prev) => [...prev, emptyRow(startDate)])
                  }}
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Add medication
                </button>
              </>
            )}
          </div>

          <CreateModalFooter>
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL} disabled={submitting}>
              Cancel
            </button>
            <button
              type="submit"
              className={CM_BTN_PRIMARY}
              disabled={loading || submitting || rows.length === 0}
            >
              {submitting ? 'Submitting…' : 'Submit & bill patient'}
            </button>
          </CreateModalFooter>
        </form>
      </div>
    </div>
  )
}
