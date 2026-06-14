import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
import { fetchPharmacyGiveOutWarehouses } from '../../services/pharmacyGiveOut'
import {
  fetchMedicineGivenDispensingLots,
  fetchMedicineGivenStockOptions,
  type MedicineGivenBatchOption,
  type MedicineGivenDispensingLotOption,
  type MedicineGivenStockOptions,
} from '../../services/medicineGiven'
import { toast } from '../../hooks/useToast'
import { useCareContext } from '../../providers/CareContextProvider'
import { useBlockIfActiveCareClosed } from '../../hooks/useBlockIfActiveCareClosed'
import {
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

interface RowStockState {
  options: MedicineGivenStockOptions | null
  loading: boolean
  dispensingLots: MedicineGivenDispensingLotOption[]
  loadingDispensingLots: boolean
}

function shiftIndexMap<T>(prev: Record<number, T>, removedIndex: number): Record<number, T> {
  const next: Record<number, T> = {}
  Object.entries(prev).forEach(([k, v]) => {
    const i = Number(k)
    if (i < removedIndex) next[i] = v
    else if (i > removedIndex) next[i - 1] = v
  })
  return next
}

function filterStockOptions(options: LinkFieldOption[], query: string): LinkFieldOption[] {
  const q = query.trim().toLowerCase()
  if (!q) return options
  return options.filter(
    (o) =>
      o.name.toLowerCase().includes(q) || (o.label || '').toLowerCase().includes(q)
  )
}

function batchToOptions(batches: MedicineGivenBatchOption[]): LinkFieldOption[] {
  return batches.map((b) => {
    // SO batch_no uses Batch document name; label shows human batch_id.
    const value = b.batch_name || b.batch_id
    const label = [
      b.batch_id || b.batch_name,
      b.qty != null ? `Qty: ${b.qty}` : '',
      b.expiry_date ? `Exp: ${b.expiry_date}` : '',
    ]
      .filter(Boolean)
      .join(' · ')
    return { name: value, label }
  })
}

function findBatchMeta(
  batches: MedicineGivenBatchOption[],
  selectedValue: string
): MedicineGivenBatchOption | undefined {
  return batches.find(
    (b) =>
      b.batch_name === selectedValue ||
      b.batch_id === selectedValue ||
      (b.batch_name || b.batch_id) === selectedValue
  )
}

function filterDispensingLotsByBatch(
  lots: MedicineGivenDispensingLotOption[],
  batchMeta: MedicineGivenBatchOption | undefined,
  batchValue: string
): MedicineGivenDispensingLotOption[] {
  if (!batchValue) return lots
  const keys = new Set(
    [batchMeta?.batch_name, batchMeta?.batch_id, batchValue].filter(Boolean) as string[]
  )
  return lots.filter((lot) => !lot.batch_no || keys.has(lot.batch_no))
}

function dispensingLotToOptions(lots: MedicineGivenDispensingLotOption[]): LinkFieldOption[] {
  return lots.map((lot) => ({
    name: lot.name,
    label: lot.label || lot.serial_no || lot.name,
  }))
}

function findOptionLabel(options: LinkFieldOption[], value: string): string {
  const match = options.find((o) => o.name === value)
  return match?.label || value
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
    batch_no: '',
    dispensing_lot: '',
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

const COMBOBOX_DROPDOWN_MAX_HEIGHT = 224

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
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(displayValue)
  }, [displayValue])

  const updateDropdownPosition = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom - 8
    const spaceAbove = rect.top - 8
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow
    const maxHeight = Math.min(
      COMBOBOX_DROPDOWN_MAX_HEIGHT,
      Math.max(openUp ? spaceAbove : spaceBelow, 120)
    )

    setDropdownStyle({
      position: 'fixed',
      top: openUp ? undefined : rect.bottom + 4,
      bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
      left: rect.left,
      width: rect.width,
      maxHeight,
      zIndex: 10000,
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setDropdownStyle(null)
      return
    }
    const id = requestAnimationFrame(updateDropdownPosition)
    const onScrollOrResize = () => updateDropdownPosition()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open, options.length, loading, updateDropdownPosition])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node
      const inWrap = wrapRef.current?.contains(target)
      const inDropdown = dropdownRef.current?.contains(target)
      if (!inWrap && !inDropdown) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const dropdownPanel =
    open && dropdownStyle ? (
      <div
        ref={dropdownRef}
        style={dropdownStyle}
        className="overflow-y-auto rounded-xl border border-emerald-200/80 bg-white py-1 text-slate-900 shadow-lg ring-1 ring-emerald-300/40"
      >
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
              onMouseDown={(e) => e.preventDefault()}
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
    ) : null

  return (
    <>
      <div ref={wrapRef} className="relative">
        <input
          ref={inputRef}
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
        {showCodeHint && value && !open && (
          <p className="text-[11px] text-slate-500 mt-0.5 truncate">{value}</p>
        )}
      </div>
      {typeof document !== 'undefined' && dropdownPanel
        ? createPortal(dropdownPanel, document.body)
        : null}
    </>
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
  const [rowStock, setRowStock] = useState<Record<number, RowStockState>>({})
  const [batchQueries, setBatchQueries] = useState<Record<number, string>>({})
  const [dispensingLotQueries, setDispensingLotQueries] = useState<Record<number, string>>({})
  const [giveOutWarehouses, setGiveOutWarehouses] = useState<{ name: string; label: string }[]>([])
  const [selectedWarehouse, setSelectedWarehouse] = useState('')
  const [miniWarehouse, setMiniWarehouse] = useState<string | undefined>()
  const [loadingWarehouses, setLoadingWarehouses] = useState(false)

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

        setLoadingWarehouses(true)
        try {
          const whOpts = await fetchPharmacyGiveOutWarehouses(admission)
          if (cancelled) return
          setGiveOutWarehouses(whOpts.warehouses)
          setMiniWarehouse(whOpts.mini_warehouse)
          setSelectedWarehouse(whOpts.default_warehouse || whOpts.warehouses[0]?.name || '')
          if (whOpts.warehouses.length === 0) {
            setError(
              'No Pharmacy Give Out warehouses configured. Add warehouses in Healthcare Settings → Stock → Pharmacy Give Out.'
            )
            setRows([])
            return
          }
        } catch (whErr) {
          if (!cancelled) {
            setError(
              whErr instanceof Error
                ? whErr.message
                : 'Failed to load pharmacy give-out warehouses from Healthcare Settings'
            )
            setRows([])
            return
          }
        } finally {
          if (!cancelled) setLoadingWarehouses(false)
        }

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

  const loadRowStock = async (
    index: number,
    drugCode: string,
    admission: string,
    warehouse: string
  ) => {
    const drug = drugCode.trim()
    if (!drug || !admission || !warehouse) {
      setRowStock((prev) => {
        const next = { ...prev }
        delete next[index]
        return next
      })
      return
    }

    setRowStock((prev) => ({
      ...prev,
      [index]: {
        options: prev[index]?.options ?? null,
        loading: true,
        dispensingLots: [],
        loadingDispensingLots: false,
      },
    }))

    try {
      const opts = await fetchMedicineGivenStockOptions(admission, drug, warehouse)
      setRowStock((prev) => ({
        ...prev,
        [index]: {
          options: opts,
          loading: false,
          dispensingLots: opts.requires_dispensing_lot ? opts.dispensing_lots || [] : [],
          loadingDispensingLots: false,
        },
      }))
    } catch {
      setRowStock((prev) => ({
        ...prev,
        [index]: {
          options: null,
          loading: false,
          dispensingLots: [],
          loadingDispensingLots: false,
        },
      }))
    }
  }

  useEffect(() => {
    if (!admissionId || !selectedWarehouse || rows.length === 0) return
    rows.forEach((row, index) => {
      if (row.drug?.trim()) {
        void loadRowStock(index, row.drug, admissionId, selectedWarehouse)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when warehouse or drugs change
  }, [admissionId, selectedWarehouse, rows.map((r) => r.drug).join('\0')])

  const handleWarehouseChange = (warehouse: string) => {
    setSelectedWarehouse(warehouse)
    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        batch_no: '',
        dispensing_lot: '',
      }))
    )
    setRowStock({})
    setBatchQueries({})
    setDispensingLotQueries({})
  }

  const handleRowBatchChange = async (
    index: number,
    batchValue: string,
    batchMeta?: MedicineGivenBatchOption
  ) => {
    const row = rows[index]
    if (!row) return

    const soBatchNo = batchMeta?.batch_name || batchValue
    const dispensingBatchFilter =
      batchMeta?.batch_id || batchMeta?.batch_name || batchValue

    updateRow(index, { batch_no: soBatchNo, dispensing_lot: '' })

    const stock = rowStock[index]?.options
    const admission = admissionId
    const drugCode = (row.drug || '').trim()
    if (!admission || !drugCode) {
      setRowStock((prev) => ({
        ...prev,
        [index]: {
          ...prev[index],
          dispensingLots: [],
          loadingDispensingLots: false,
        },
      }))
      return
    }

    if (!stock?.requires_dispensing_lot) {
      setRowStock((prev) => ({
        ...prev,
        [index]: {
          ...prev[index],
          dispensingLots: [],
          loadingDispensingLots: false,
        },
      }))
      return
    }

    if (!dispensingBatchFilter) {
      setRowStock((prev) => ({
        ...prev,
        [index]: {
          ...prev[index],
          dispensingLots: stock.dispensing_lots || [],
          loadingDispensingLots: false,
        },
      }))
      return
    }

    setRowStock((prev) => ({
      ...prev,
      [index]: { ...prev[index], loadingDispensingLots: true, dispensingLots: [] },
    }))
    try {
      let dlRows = await fetchMedicineGivenDispensingLots(
        admission,
        drugCode,
        dispensingBatchFilter,
        selectedWarehouse || undefined
      )
      if (dlRows.length === 0) {
        const fallbackPool = [
          ...(rowStock[index]?.dispensingLots || []),
          ...(stock.dispensing_lots || []),
        ]
        dlRows = filterDispensingLotsByBatch(fallbackPool, batchMeta, dispensingBatchFilter)
      }
      setRowStock((prev) => ({
        ...prev,
        [index]: { ...prev[index], dispensingLots: dlRows, loadingDispensingLots: false },
      }))
    } catch {
      const fallbackPool = stock.dispensing_lots || []
      setRowStock((prev) => ({
        ...prev,
        [index]: {
          ...prev[index],
          dispensingLots: filterDispensingLotsByBatch(
            fallbackPool,
            batchMeta,
            dispensingBatchFilter
          ),
          loadingDispensingLots: false,
        },
      }))
    }
  }

  const handleRowDispensingLotChange = (index: number, lotName: string) => {
    updateRow(index, { dispensing_lot: lotName })
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
      batch_no: '',
      dispensing_lot: '',
    })
    setDrugQueries((prev) => ({ ...prev, [index]: opt.label || opt.name }))
    setBatchQueries((prev) => ({ ...prev, [index]: '' }))
    setDispensingLotQueries((prev) => ({ ...prev, [index]: '' }))
    if (stockUom) {
      setUomQueries((prev) => ({ ...prev, [index]: stockUom }))
    }
    setDrugOptions((prev) => ({ ...prev, [index]: [] }))
    if (admissionId && selectedWarehouse) {
      void loadRowStock(index, opt.name, admissionId, selectedWarehouse)
    }
  }

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index))
    setDrugQueries((prev) => shiftIndexMap(prev, index))
    setUomQueries((prev) => shiftIndexMap(prev, index))
    setRowStock((prev) => shiftIndexMap(prev, index))
    setBatchQueries((prev) => shiftIndexMap(prev, index))
    setDispensingLotQueries((prev) => shiftIndexMap(prev, index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const validRows = rows.filter((r) => r.drug.trim())
    if (validRows.length === 0) {
      setError('Add at least one medication with a drug selected')
      return
    }
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index]
      if (!row.drug.trim()) continue
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
      const stockState = rowStock[index]
      const stockOpts = stockState?.options
      if (stockOpts) {
        const showBatchPicker = Boolean(
          (stockOpts.has_batch_no || stockOpts.requires_dispensing_lot) &&
            stockOpts.batches.length > 0
        )
        if (showBatchPicker && !row.batch_no?.trim()) {
          setError(`Please select a batch for ${row.drug_name || row.drug}`)
          return
        }
        if (stockOpts.requires_dispensing_lot) {
          const availableLots =
            (stockState?.dispensingLots?.length
              ? stockState.dispensingLots
              : stockOpts.dispensing_lots) || []
          if (availableLots.length > 0 && !row.dispensing_lot?.trim()) {
            setError(`Please select a dispensing lot for ${row.drug_name || row.drug}`)
            return
          }
        }
      }
    }
    if (!admissionId) {
      setError('Inpatient admission is required')
      return
    }
    if (!selectedWarehouse) {
      setError('Select a give-out warehouse')
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
        warehouse: selectedWarehouse,
      })
      toast.success(
        `Pharmacy give-out submitted. Sales Order ${result.sales_order} created${
          result.delivery_note ? ` · Delivery Note ${result.delivery_note}` : ''
        }.`
      )
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

                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-emerald-800 mb-1.5">
                    Give-out warehouse <span className="text-red-500">*</span>
                  </label>
                  {loadingWarehouses ? (
                    <div className="text-sm text-slate-600">Loading warehouses…</div>
                  ) : giveOutWarehouses.length > 0 ? (
                    <>
                      <select
                        value={selectedWarehouse}
                        onChange={(e) => handleWarehouseChange(e.target.value)}
                        className="w-full rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        {giveOutWarehouses.map((wh) => (
                          <option key={wh.name} value={wh.name}>
                            {wh.label || wh.name}
                            {miniWarehouse && wh.name === miniWarehouse ? ' (nurse mini warehouse)' : ''}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-emerald-800/80 mt-1.5">
                        Stock, batches, and dispensing lots are loaded from{' '}
                        <span className="font-medium">{selectedWarehouse || 'the selected warehouse'}</span>.
                        {miniWarehouse && selectedWarehouse === miniWarehouse
                          ? ' Auto-selected your ward mini warehouse.'
                          : miniWarehouse
                            ? ` Ward mini warehouse: ${miniWarehouse}.`
                            : null}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-amber-800">
                      No give-out warehouses configured. Add them in Healthcare Settings → Stock → Pharmacy Give Out.
                    </p>
                  )}
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                    {error}
                  </div>
                )}

                <div className="space-y-3">
                  {rows.map((row, index) => {
                    const stockState = rowStock[index]
                    const stockOpts = stockState?.options
                    const showStockFields = Boolean(
                      stockState?.loading ||
                        stockOpts?.has_batch_no ||
                        stockOpts?.requires_dispensing_lot
                    )
                    const batchOptionList = batchToOptions(stockOpts?.batches || [])
                    const batchSearch = batchQueries[index] ?? ''
                    const filteredBatchOptions = filterStockOptions(batchOptionList, batchSearch)
                    const batchDisplay =
                      batchQueries[index] ??
                      (row.batch_no ? findOptionLabel(batchOptionList, row.batch_no) : '')
                    const allDispensingLots =
                      stockState?.dispensingLots?.length
                        ? stockState.dispensingLots
                        : stockOpts?.dispensing_lots || []
                    const lotOptionList = dispensingLotToOptions(allDispensingLots)
                    const lotSearch = dispensingLotQueries[index] ?? ''
                    const filteredLotOptions = filterStockOptions(lotOptionList, lotSearch)
                    const lotDisplay =
                      dispensingLotQueries[index] ??
                      (row.dispensing_lot
                        ? findOptionLabel(lotOptionList, row.dispensing_lot)
                        : '')

                    return (
                    <div
                      key={row.rowKey}
                      className="border border-slate-200 rounded-lg bg-white shadow-sm overflow-visible"
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
                              value={row.quantity ?? ''}
                              onChange={(e) => {
                                const raw = e.target.value
                                if (raw === '') {
                                  updateRow(index, { quantity: undefined })
                                  return
                                }
                                const parsed = parseFloat(raw)
                                if (!Number.isNaN(parsed)) {
                                  updateRow(index, { quantity: parsed })
                                }
                              }}
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

                        {showStockFields && (
                          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {(stockOpts?.has_batch_no || stockOpts?.requires_dispensing_lot) && (
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">
                                  Batch{' '}
                                  {stockOpts?.requires_dispensing_lot ||
                                  (stockOpts?.batches.length ?? 0) > 0 ? (
                                    <span className="text-red-500">*</span>
                                  ) : null}
                                </label>
                                {stockState?.loading ? (
                                  <div className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-500">
                                    Loading batches…
                                  </div>
                                ) : (stockOpts?.batches.length ?? 0) > 0 ? (
                                  <SearchCombobox
                                    value={row.batch_no || ''}
                                    displayValue={batchDisplay}
                                    options={filteredBatchOptions}
                                    loading={!!stockState?.loading}
                                    placeholder="Search batch…"
                                    onQueryChange={(q) =>
                                      setBatchQueries((prev) => ({ ...prev, [index]: q }))
                                    }
                                    onOpen={() => {
                                      if (!batchQueries[index] && row.batch_no) {
                                        setBatchQueries((prev) => ({
                                          ...prev,
                                          [index]: findOptionLabel(batchOptionList, row.batch_no || ''),
                                        }))
                                      }
                                    }}
                                    onSelect={(opt) => {
                                      const batchMeta = findBatchMeta(stockOpts?.batches || [], opt.name)
                                      void handleRowBatchChange(index, opt.name, batchMeta)
                                      setBatchQueries((prev) => ({
                                        ...prev,
                                        [index]: opt.label || opt.name,
                                      }))
                                      setDispensingLotQueries((prev) => ({ ...prev, [index]: '' }))
                                    }}
                                    onClear={() => {
                                      void handleRowBatchChange(index, '')
                                      setBatchQueries((prev) => ({ ...prev, [index]: '' }))
                                      setDispensingLotQueries((prev) => ({ ...prev, [index]: '' }))
                                    }}
                                  />
                                ) : stockOpts?.requires_dispensing_lot ? (
                                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                    No batches in stock at{' '}
                                    <span className="font-medium">{selectedWarehouse}</span>.
                                  </div>
                                ) : null}
                              </div>
                            )}

                            {stockOpts?.requires_dispensing_lot && (
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">
                                  Dispensing Lot{' '}
                                  {allDispensingLots.length > 0 ? (
                                    <span className="text-red-500">*</span>
                                  ) : null}
                                </label>
                                {stockState?.loadingDispensingLots ? (
                                  <div className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-500">
                                    Loading dispensing lots…
                                  </div>
                                ) : allDispensingLots.length > 0 ? (
                                  <SearchCombobox
                                    value={row.dispensing_lot || ''}
                                    displayValue={lotDisplay}
                                    options={filteredLotOptions}
                                    loading={!!stockState?.loadingDispensingLots}
                                    placeholder="Search dispensing lot…"
                                    onQueryChange={(q) =>
                                      setDispensingLotQueries((prev) => ({ ...prev, [index]: q }))
                                    }
                                    onOpen={() => {
                                      if (!dispensingLotQueries[index] && row.dispensing_lot) {
                                        setDispensingLotQueries((prev) => ({
                                          ...prev,
                                          [index]: findOptionLabel(
                                            lotOptionList,
                                            row.dispensing_lot || ''
                                          ),
                                        }))
                                      }
                                    }}
                                    onSelect={(opt) => {
                                      handleRowDispensingLotChange(index, opt.name)
                                      setDispensingLotQueries((prev) => ({
                                        ...prev,
                                        [index]: opt.label || opt.name,
                                      }))
                                    }}
                                    onClear={() => {
                                      handleRowDispensingLotChange(index, '')
                                      setDispensingLotQueries((prev) => ({ ...prev, [index]: '' }))
                                    }}
                                  />
                                ) : row.batch_no || !stockOpts.has_batch_no ? (
                                  <div className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-500">
                                    No dispensing lots for batch{' '}
                                    <span className="font-medium">{row.batch_no}</span> at{' '}
                                    <span className="font-medium">{selectedWarehouse}</span>.
                                  </div>
                                ) : (
                                  <div className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-500">
                                    Select a batch first to load dispensing lots.
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    )
                  })}
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
              disabled={
                loading || submitting || loadingWarehouses || rows.length === 0 || !selectedWarehouse
              }
            >
              {submitting ? 'Submitting…' : 'Submit & bill patient'}
            </button>
          </CreateModalFooter>
        </form>
      </div>
    </div>
  )
}
