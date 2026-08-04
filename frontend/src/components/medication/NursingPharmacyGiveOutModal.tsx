import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import { fetchPrescriptionItems, fetchStandardUoms, filterItemsInStock, fetchHealthcarePractitioners, getCurrentUserPractitioner, type LinkFieldOption } from '../../services/common'
import {
  createNursingPharmacyGiveOut,
  fetchPrescriptionByInpatientOrEncounter,
  type MedicationOrderEntry,
  type MedicationOrderRow,
  type PharmacyGiveOutServiceRow,
} from '../../services/prescriptions'
import { getPatientActiveAdmission } from '../../services/inpatientRecords'
import {
  fetchPharmacyGiveOutWarehouses,
  fetchItemRate,
  fetchPharmacyGiveOutServiceItems,
  type PharmacyGiveOutServiceItem,
} from '../../services/pharmacyGiveOut'
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
import { useFormatMoney } from '../../hooks/useFormatMoney'
import {
  linkComboboxInputWithClearClass,
  linkComboboxOptionClassCompact,
} from '../ui/linkComboboxStyles'
import { Loader2, Pill, Plus, Stethoscope, Trash2 } from 'lucide-react'

interface NursingPharmacyGiveOutModalProps {
  onClose: () => void
  onSuccess: () => void
  initialPatient?: string
  inpatientRecord?: string
}

interface GiveOutRow extends MedicationOrderRow {
  rowKey: string
}

interface GiveOutServiceLine extends PharmacyGiveOutServiceRow {
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

function pickFifoBatch(batches: MedicineGivenBatchOption[]): MedicineGivenBatchOption | undefined {
  if (!batches.length) return undefined
  const sorted = [...batches].sort((a, b) => {
    const expA = a.expiry_date || '9999-99-99'
    const expB = b.expiry_date || '9999-99-99'
    if (expA !== expB) return expA.localeCompare(expB)
    const mfgA = a.manufacturing_date || '9999-99-99'
    const mfgB = b.manufacturing_date || '9999-99-99'
    if (mfgA !== mfgB) return mfgA.localeCompare(mfgB)
    return (a.batch_id || a.batch_name || '').localeCompare(b.batch_id || b.batch_name || '')
  })
  return sorted[0]
}

function pickFirstDispensingLot(
  lots: MedicineGivenDispensingLotOption[]
): MedicineGivenDispensingLotOption | undefined {
  return lots[0]
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

function currentTimeStr() {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`
}

function lineAmount(row: Pick<GiveOutRow, 'rate' | 'quantity'>): number {
  const qty = Number(row.quantity) || 0
  const rate = Number(row.rate) || 0
  return qty * rate
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
    time: currentTimeStr(),
    patient_frequency: '',
    quantity: 1,
    batch_no: '',
    dispensing_lot: '',
  }
}

function emptyServiceLine(): GiveOutServiceLine {
  return {
    rowKey: nextRowKey(),
    item_code: '',
    item_name: '',
    quantity: 1,
    rate: undefined,
    uom: '',
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
    time: entry.time || currentTimeStr(),
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
          <div className="px-3 py-2 text-xs text-slate-500">NO OPTIONS FOUND</div>
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
      placeholder="Search in-stock drugs..."
      showCodeHint
    />
  )
}

interface ServiceComboboxProps {
  value: string
  displayValue: string
  options: LinkFieldOption[]
  loading: boolean
  onQueryChange: (q: string) => void
  onOpen: () => void
  onSelect: (opt: LinkFieldOption) => void
}

function ServiceCombobox(props: ServiceComboboxProps) {
  return (
    <SearchCombobox
      {...props}
      placeholder="Search pharmacy / other services..."
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
  const { activeAdmission, activeVisit, mode, selectedPatient: contextPatient, userCostCenter } =
    useCareContext()
  const blockIfClosed = useBlockIfActiveCareClosed()
  const formatCurrency = useFormatMoney()
  const patient = initialPatient || contextPatient || ''
  const startDate = useMemo(() => todayStr(), [])
  const prescriptionLoadedRef = useRef(false)

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [admissionId, setAdmissionId] = useState(propInpatientRecord || activeAdmission || '')
  // OP give-outs run against the active Patient Visit instead of an admission.
  const [visitId, setVisitId] = useState('')
  const [sourcePrescription, setSourcePrescription] = useState('')
  const [practitioner, setPractitioner] = useState('')
  const [practQuery, setPractQuery] = useState('')
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerLoading, setPractitionerLoading] = useState(false)
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
  const [pharmacyWarehouse, setPharmacyWarehouse] = useState<string | undefined>()
  const [branchCostCenter, setBranchCostCenter] = useState<string | undefined>()
  const [loadingWarehouses, setLoadingWarehouses] = useState(false)
  const [displayBatchAndLot, setDisplayBatchAndLot] = useState(false)
  const [stockFilterNote, setStockFilterNote] = useState<string | null>(null)
  const [serviceRows, setServiceRows] = useState<GiveOutServiceLine[]>([])
  const [serviceQueries, setServiceQueries] = useState<Record<number, string>>({})
  const [serviceOptions, setServiceOptions] = useState<Record<number, LinkFieldOption[]>>({})
  const [serviceOptionsCache, setServiceOptionsCache] = useState<
    Record<number, PharmacyGiveOutServiceItem[]>
  >({})
  const [serviceLoading, setServiceLoading] = useState<Record<number, boolean>>({})
  const servicesSectionRef = useRef<HTMLDivElement>(null)
  /** full = 100%, none = 0% (ECT / included), percent = custom */
  const [chargeMode, setChargeMode] = useState<'full' | 'none' | 'percent'>('full')
  const [chargePercentInput, setChargePercentInput] = useState('50')

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
        if (!prescriptionLoadedRef.current) {
          setLoading(true)
        }
        setError(null)

        let admission = propInpatientRecord || activeAdmission || ''
        let visit = ''
        if (!admission && mode !== 'OP') {
          const adm = await getPatientActiveAdmission(patient)
          admission = adm?.name || ''
        }
        if (!admission) {
          // OP flow: give out against the active Patient Visit.
          visit = activeVisit || ''
        }
        if (!admission && !visit) {
          setError(
            mode === 'OP'
              ? 'No active patient visit selected. Select a visit first.'
              : 'No active inpatient admission found for this patient'
          )
          return
        }
        if (cancelled) return
        setAdmissionId(admission)
        setVisitId(visit)

        setLoadingWarehouses(true)
        let warehouseForStock = ''
        let costCenterForStock: string | undefined
        try {
          const whOpts = await fetchPharmacyGiveOutWarehouses(admission || undefined, visit || undefined)
          if (cancelled) return
          setGiveOutWarehouses(whOpts.warehouses)
          setMiniWarehouse(whOpts.mini_warehouse)
          setPharmacyWarehouse(whOpts.pharmacy_warehouse)
          costCenterForStock = whOpts.cost_center || userCostCenter
          setBranchCostCenter(costCenterForStock)
          setDisplayBatchAndLot(Boolean(whOpts.display_batch_and_lot_on_pharmacy_giveout))
          const preferred =
            (whOpts.pharmacy_warehouse &&
            whOpts.warehouses.some((w) => w.name === whOpts.pharmacy_warehouse)
              ? whOpts.pharmacy_warehouse
              : '') ||
            whOpts.default_warehouse ||
            whOpts.warehouses[0]?.name ||
            ''
          warehouseForStock = preferred
          setSelectedWarehouse(preferred)
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

        const currentRx = await fetchPrescriptionByInpatientOrEncounter(admission || null, visit || null)
        if (cancelled) return

        if (!currentRx) {
          setError('No current prescription found for this admission. Create a prescription first.')
          setRows([])
          return
        }

        setSourcePrescription(currentRx.name)
        const rxPractitioner = currentRx.practitioner || ''
        setPractitioner(rxPractitioner)
        setPractQuery(
          currentRx.healthcare_practitioner_name ||
            rxPractitioner ||
            ''
        )
        if (!rxPractitioner) {
          try {
            const currentUserPractitioner = await getCurrentUserPractitioner()
            if (currentUserPractitioner && !cancelled) {
              setPractitioner(currentUserPractitioner)
              setPractQuery(currentUserPractitioner)
            }
          } catch {
            // optional default
          }
        } else if (!currentRx.healthcare_practitioner_name) {
          try {
            const opts = await fetchHealthcarePractitioners(rxPractitioner)
            if (!cancelled) {
              const match = opts.find((opt) => opt.name === rxPractitioner)
              if (match) {
                setPractQuery(match.label || match.practitioner_name || match.name)
              }
            }
          } catch {
            // keep practitioner id as display fallback
          }
        }

        const entries = currentRx.medication_orders || []
        const activeEntries = entries.filter((e) => !e.reason_stopped)
        if (activeEntries.length === 0) {
          setError('Current prescription has no active medications.')
          setRows([])
          return
        }

        let stockEntries = activeEntries
        setStockFilterNote(null)
        if (warehouseForStock) {
          const drugCodes = Array.from(
            new Set(activeEntries.map((e) => (e.drug || '').trim()).filter(Boolean))
          )
          try {
            const stockResult = await filterItemsInStock(drugCodes, {
              warehouse: warehouseForStock,
              costCenter: costCenterForStock,
            })
            const inStock = new Set(stockResult.in_stock || [])
            stockEntries = activeEntries.filter((e) => e.drug && inStock.has(e.drug))
            const skipped = activeEntries.length - stockEntries.length
            if (skipped > 0) {
              setStockFilterNote(
                `Hidden ${skipped} medicine(s) with no stock at ${warehouseForStock}. Only in-stock items for this branch warehouse are shown.`
              )
            }
            if (stockEntries.length === 0) {
              setError(
                `None of the prescribed medicines have stock at ${warehouseForStock}. Check inventory or choose another give-out warehouse.`
              )
              setRows([])
              return
            }
          } catch {
            // If stock check fails, keep all lines and let submit/stock pickers surface issues.
            stockEntries = activeEntries
          }
        }

        const mapped = stockEntries.map((e) => mapEntryToRow(e, startDate))
        const withRates = await Promise.all(
          mapped.map(async (r) => ({
            ...r,
            rate: r.drug
              ? await fetchItemRate(r.drug, r.uom).catch(() => 0)
              : undefined,
          }))
        )
        setRows(withRates)
        const queries: Record<number, string> = {}
        const uomLabels: Record<number, string> = {}
        withRates.forEach((r, i) => {
          queries[i] = r.drug_name || r.drug
          uomLabels[i] = r.uom || ''
        })
        setDrugQueries(queries)
        setUomQueries(uomLabels)
        prescriptionLoadedRef.current = true
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
  }, [patient, propInpatientRecord, activeAdmission, activeVisit, mode, startDate, userCostCenter])

  const loadDrugOptions = async (index: number, query: string) => {
    setDrugLoading((prev) => ({ ...prev, [index]: true }))
    try {
      const opts = await fetchPrescriptionItems(query, {
        warehouse: selectedWarehouse || undefined,
        costCenter: branchCostCenter || userCostCenter,
        inStockOnly: true,
      })
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

  const loadRowRate = async (index: number, drug: string, uom?: string) => {
    const drugCode = drug.trim()
    if (!drugCode) return
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, rate: undefined } : r)))
    try {
      const rate = await fetchItemRate(drugCode, uom)
      setRows((prev) =>
        prev.map((r, i) => (i === index && r.drug === drugCode ? { ...r, rate } : r))
      )
    } catch {
      setRows((prev) =>
        prev.map((r, i) => (i === index && r.drug === drugCode ? { ...r, rate: 0 } : r))
      )
    }
  }

  const autoApplyStockSelection = async (
    index: number,
    opts: MedicineGivenStockOptions
  ) => {
    if (displayBatchAndLot) return

    const fifoBatch = pickFifoBatch(opts.batches || [])
    if ((opts.has_batch_no || opts.requires_dispensing_lot) && fifoBatch) {
      const batchValue = fifoBatch.batch_name || fifoBatch.batch_id
      await handleRowBatchChange(index, batchValue, fifoBatch, { autoMode: true, stockOpts: opts })
      return
    }

    if (opts.requires_dispensing_lot) {
      const lots = opts.dispensing_lots || []
      const firstLot = pickFirstDispensingLot(lots)
      if (firstLot) {
        updateRow(index, { dispensing_lot: firstLot.name })
      }
    }
  }

  const loadRowStock = async (
    index: number,
    drugCode: string,
    admission: string,
    warehouse: string
  ) => {
    const drug = drugCode.trim()
    if (!drug || !warehouse) {
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
      if (!displayBatchAndLot) {
        await autoApplyStockSelection(index, opts)
      }
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
    if (!selectedWarehouse || rows.length === 0) return
    rows.forEach((row, index) => {
      if (row.drug?.trim()) {
        void loadRowStock(index, row.drug, admissionId, selectedWarehouse)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when warehouse, setting, or drugs change
  }, [admissionId, selectedWarehouse, displayBatchAndLot, rows.map((r) => r.drug).join('\0')])

  const handleWarehouseChange = async (warehouse: string) => {
    setSelectedWarehouse(warehouse)
    setDrugOptions({})
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
    setStockFilterNote(null)

    const drugCodes = Array.from(
      new Set(rows.map((r) => (r.drug || '').trim()).filter(Boolean))
    )
    if (!warehouse || drugCodes.length === 0) return

    try {
      const stockResult = await filterItemsInStock(drugCodes, {
        warehouse,
        costCenter: branchCostCenter || userCostCenter,
      })
      const inStock = new Set(stockResult.in_stock || [])
      const kept = rows.filter((r) => r.drug && inStock.has(r.drug))
      const skipped = rows.length - kept.length
      if (skipped > 0) {
        setStockFilterNote(
          `Removed ${skipped} medicine(s) with no stock at ${warehouse}. Only in-stock items are shown.`
        )
        setRows(
          kept.map((row) => ({
            ...row,
            batch_no: '',
            dispensing_lot: '',
          }))
        )
        const queries: Record<number, string> = {}
        const uomLabels: Record<number, string> = {}
        kept.forEach((r, i) => {
          queries[i] = r.drug_name || r.drug
          uomLabels[i] = r.uom || ''
        })
        setDrugQueries(queries)
        setUomQueries(uomLabels)
      }
      if (kept.length === 0) {
        setError(
          `None of the selected medicines have stock at ${warehouse}. Choose another warehouse or add stock.`
        )
      } else {
        setError(null)
      }
    } catch {
      // Keep current rows if stock re-check fails.
    }
  }

  const handleRowBatchChange = async (
    index: number,
    batchValue: string,
    batchMeta?: MedicineGivenBatchOption,
    opts?: { autoMode?: boolean; stockOpts?: MedicineGivenStockOptions }
  ) => {
    const row = rows[index]
    if (!row) return

    const soBatchNo = batchMeta?.batch_name || batchValue
    const dispensingBatchFilter =
      batchMeta?.batch_id || batchMeta?.batch_name || batchValue

    updateRow(index, { batch_no: soBatchNo, dispensing_lot: '' })

    const stock = opts?.stockOpts ?? rowStock[index]?.options
    const admission = admissionId
    const drugCode = (row.drug || '').trim()
    if ((!admission && !selectedWarehouse) || !drugCode) {
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
      if (opts?.autoMode && !displayBatchAndLot) {
        const firstLot = pickFirstDispensingLot(dlRows)
        if (firstLot) {
          updateRow(index, { batch_no: soBatchNo, dispensing_lot: firstLot.name })
        }
      }
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
      rate: undefined,
    })
    setDrugQueries((prev) => ({ ...prev, [index]: opt.label || opt.name }))
    setBatchQueries((prev) => ({ ...prev, [index]: '' }))
    setDispensingLotQueries((prev) => ({ ...prev, [index]: '' }))
    if (stockUom) {
      setUomQueries((prev) => ({ ...prev, [index]: stockUom }))
    }
    setDrugOptions((prev) => ({ ...prev, [index]: [] }))
    void loadRowRate(index, opt.name, stockUom || undefined)
    if (selectedWarehouse) {
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
      if (displayBatchAndLot && stockOpts) {
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
    for (const svc of serviceRows) {
      const qty = Number(svc.quantity) || 0
      const rate = Number(svc.rate) || 0
      if (qty <= 0) continue
      if (!svc.item_code?.trim()) {
        setError('Select a service for each service line with quantity')
        return
      }
      if (rate <= 0) {
        setError(`Enter a price for service ${svc.item_name || svc.item_code}`)
        return
      }
    }
    const selectedServiceRows = serviceRows.filter(
      (s) => s.item_code?.trim() && (Number(s.quantity) || 0) > 0
    )
    if (selectedServiceRows.length > 0 && !practitioner?.trim()) {
      setError('Select a doctor / practitioner when billing services on this give-out')
      return
    }
    if (!admissionId && !visitId) {
      setError('Inpatient admission or patient visit is required')
      return
    }
    if (!selectedWarehouse) {
      setError('Select a give-out warehouse')
      return
    }

    let chargePercent = 100
    let noCharges = false
    if (chargeMode === 'none') {
      chargePercent = 0
      noCharges = true
    } else if (chargeMode === 'percent') {
      const parsed = Number(chargePercentInput)
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        setError('Charge percent must be between 0 and 100')
        return
      }
      chargePercent = parsed
      noCharges = parsed <= 0
    }

    try {
      setSubmitting(true)
      setError(null)
      blockIfClosed()
      const payload: MedicationOrderRow[] = validRows.map(({ rowKey: _rk, ...rest }) => ({
        ...rest,
        dosage: '',
        medication_type: '',
        is_prn: false,
        is_long_acting: false,
      }))
      const servicePayload: PharmacyGiveOutServiceRow[] = selectedServiceRows.map(
        ({ rowKey: _rk, ...rest }) => rest
      )
      const result = await createNursingPharmacyGiveOut({
        patient,
        inpatient_record: admissionId || undefined,
        patient_visit: visitId || undefined,
        medication_orders: payload,
        services: servicePayload.length ? servicePayload : undefined,
        source_prescription: sourcePrescription || undefined,
        practitioner: practitioner || undefined,
        warehouse: selectedWarehouse,
        no_charges: noCharges,
        charge_percent: chargePercent,
      })
      const srNote =
        result.service_requests && result.service_requests.length
          ? ` · ${result.service_requests.length} service request(s) completed`
          : ''
      const chargeNote =
        noCharges || chargePercent <= 0
          ? ' · medicines not charged'
          : chargePercent < 100
            ? ` · medicines billed at ${chargePercent}%`
            : ''
      toast.success(
        `Pharmacy give-out submitted. Sales Order ${result.sales_order} created${
          result.delivery_note ? ` · Delivery Note ${result.delivery_note}` : ''
        }${srNote}${chargeNote}.`
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

  const loadPractitionerOptions = async (query: string) => {
    setPractitionerLoading(true)
    try {
      const opts = await fetchHealthcarePractitioners(query || undefined)
      setPractitionerOptions(opts)
    } catch {
      setPractitionerOptions([])
    } finally {
      setPractitionerLoading(false)
    }
  }

  const loadServiceOptions = async (index: number, query: string) => {
    setServiceLoading((prev) => ({ ...prev, [index]: true }))
    try {
      const items = await fetchPharmacyGiveOutServiceItems(query, mode === 'OP' ? 'OP' : 'IP')
      setServiceOptionsCache((prev) => ({ ...prev, [index]: items }))
      setServiceOptions((prev) => ({
        ...prev,
        [index]: items.map((item) => ({
          name: item.id || item.item_code || '',
          label: item.name,
          description: item.id || item.item_code || '',
        })),
      }))
    } catch {
      setServiceOptionsCache((prev) => ({ ...prev, [index]: [] }))
      setServiceOptions((prev) => ({ ...prev, [index]: [] }))
    } finally {
      setServiceLoading((prev) => ({ ...prev, [index]: false }))
    }
  }

  const updateServiceRow = (index: number, patch: Partial<GiveOutServiceLine>) => {
    setServiceRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const applyServiceSelection = (index: number, opt: LinkFieldOption) => {
    const item = (serviceOptionsCache[index] || []).find(
      (row) => (row.id || row.item_code) === opt.name
    )
    if (!item) return
    const rate = Number(item.price ?? item.rate) || 0
    updateServiceRow(index, {
      item_code: item.id || item.item_code || opt.name,
      item_name: item.name || opt.label || opt.name,
      rate: rate > 0 ? rate : undefined,
      uom: item.uom || '',
      template_dn: item.template_dn || undefined,
      template_dt: item.template_dt || undefined,
    })
    setServiceQueries((prev) => ({ ...prev, [index]: item.name || opt.label || opt.name }))
    setServiceOptions((prev) => ({ ...prev, [index]: [] }))
  }

  const addEmptyServiceRow = () => {
    const nextIndex = serviceRows.length
    setServiceRows((prev) => [...prev, emptyServiceLine()])
    setServiceQueries((prev) => ({ ...prev, [nextIndex]: '' }))
    requestAnimationFrame(() => {
      servicesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  const removeServiceRow = (index: number) => {
    setServiceRows((prev) => prev.filter((_, i) => i !== index))
    setServiceQueries((prev) => shiftIndexMap(prev, index))
    setServiceOptions((prev) => shiftIndexMap(prev, index))
    setServiceOptionsCache((prev) => shiftIndexMap(prev, index))
    setServiceLoading((prev) => shiftIndexMap(prev, index))
  }

  const medicationTotal = rows
    .filter((r) => r.drug?.trim())
    .reduce((sum, r) => sum + lineAmount(r), 0)
  const serviceTotal = serviceRows.reduce((sum, r) => {
    const qty = Number(r.quantity) || 0
    if (qty <= 0) return sum
    return sum + qty * (Number(r.rate) || 0)
  }, 0)
  const selectedServiceCount = serviceRows.filter(
    (r) => r.item_code?.trim() && (Number(r.quantity) || 0) > 0
  ).length
  const resolvedChargePercent =
    chargeMode === 'none'
      ? 0
      : chargeMode === 'percent'
        ? Math.min(100, Math.max(0, Number(chargePercentInput) || 0))
        : 100
  const billedMedicationTotal = medicationTotal * (resolvedChargePercent / 100)
  const grandTotal = billedMedicationTotal + serviceTotal
  const submitLabel =
    resolvedChargePercent <= 0
      ? 'Submit (no medicine charges)'
      : resolvedChargePercent < 100
        ? `Submit & bill at ${resolvedChargePercent}%`
        : 'Submit & bill patient'

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

                <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5">
                        Give-out warehouse <span className="text-red-500">*</span>
                      </label>
                      {loadingWarehouses ? (
                        <div className="text-sm text-slate-600 py-2">Loading warehouses…</div>
                      ) : giveOutWarehouses.length > 0 ? (
                        <select
                          value={selectedWarehouse}
                          onChange={(e) => handleWarehouseChange(e.target.value)}
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          {giveOutWarehouses.map((wh) => (
                            <option key={wh.name} value={wh.name}>
                              {wh.label || wh.name}
                              {pharmacyWarehouse && wh.name === pharmacyWarehouse
                                ? ' (branch pharmacy warehouse)'
                                : miniWarehouse && wh.name === miniWarehouse
                                  ? ' (nurse mini warehouse)'
                                  : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-sm text-amber-800">
                          No give-out warehouses configured. Add them in Healthcare Settings → Stock →
                          Pharmacy Give Out.
                        </p>
                      )}
                    </div>
                    <div className="min-w-0">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5">
                        Doctor / Practitioner
                        {serviceRows.length > 0 ? <span className="text-red-500"> *</span> : null}
                      </label>
                      <SearchCombobox
                        value={practitioner}
                        displayValue={practQuery}
                        options={practitionerOptions}
                        loading={practitionerLoading}
                        placeholder="Search doctor..."
                        onQueryChange={(q) => {
                          setPractQuery(q)
                          if (!q.trim()) setPractitioner('')
                          void loadPractitionerOptions(q)
                        }}
                        onOpen={() => void loadPractitionerOptions(practQuery || practitioner)}
                        onSelect={(opt) => {
                          setPractitioner(opt.name)
                          setPractQuery(opt.label || opt.practitioner_name || opt.name)
                          setPractitionerOptions([])
                        }}
                        onClear={() => {
                          setPractitioner('')
                          setPractQuery('')
                        }}
                      />
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                    {error}
                  </div>
                )}

                {stockFilterNote && !error && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
                    {stockFilterNote}
                  </div>
                )}

                <div ref={servicesSectionRef} className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Stethoscope className="w-4 h-4 text-emerald-700" />
                      <h3 className="text-sm font-semibold text-emerald-900">Services</h3>
                      {selectedServiceCount > 0 ? (
                        <span className="text-xs font-medium text-emerald-800">
                          ({selectedServiceCount} to bill)
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={addEmptyServiceRow}
                      className="inline-flex items-center gap-1.5 text-sm text-emerald-700 hover:text-emerald-800 font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      Add service
                    </button>
                  </div>

                  {serviceRows.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-emerald-200 bg-emerald-50/40 px-4 py-5 text-center text-sm text-emerald-900/70">
                      Click <span className="font-medium">Add service</span> to add a service line on
                      this give-out, then pick the service and edit qty and price below.
                    </div>
                  ) : (
                    serviceRows.map((svc, index) => (
                      <div
                        key={svc.rowKey}
                        className="border border-emerald-200 rounded-lg bg-white shadow-sm overflow-visible"
                      >
                        <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-50 border-b border-emerald-200">
                          <div className="flex items-center gap-2 text-sm font-medium text-emerald-900">
                            <Stethoscope className="w-4 h-4 text-emerald-700" />
                            <span>Service {index + 1}</span>
                            {svc.item_name ? (
                              <span className="text-emerald-700/70 font-normal truncate max-w-[220px]">
                                — {svc.item_name}
                              </span>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeServiceRow(index)}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Remove service line"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Service <span className="text-red-500">*</span>
                            </label>
                            <ServiceCombobox
                              value={svc.item_code || ''}
                              displayValue={
                                serviceQueries[index] ?? svc.item_name ?? svc.item_code ?? ''
                              }
                              options={serviceOptions[index] || []}
                              loading={!!serviceLoading[index]}
                              onQueryChange={(q) => {
                                setServiceQueries((prev) => ({ ...prev, [index]: q }))
                                void loadServiceOptions(index, q)
                              }}
                              onOpen={() =>
                                void loadServiceOptions(
                                  index,
                                  serviceQueries[index] || svc.item_name || svc.item_code || ''
                                )
                              }
                              onSelect={(opt) => applyServiceSelection(index, opt)}
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Quantity <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              min={0.01}
                              step="any"
                              value={svc.quantity ?? ''}
                              onChange={(e) => {
                                const raw = e.target.value
                                updateServiceRow(index, {
                                  quantity: raw === '' ? undefined : Number(raw),
                                })
                              }}
                              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Price <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={svc.rate ?? ''}
                              placeholder="Enter price"
                              onChange={(e) => {
                                const raw = e.target.value
                                updateServiceRow(index, {
                                  rate: raw === '' ? undefined : Number(raw),
                                })
                              }}
                              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                            />
                          </div>

                          <div className="md:col-span-2 flex justify-end">
                            <div className="text-right">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                Line total
                              </p>
                              <p className="text-sm font-semibold text-slate-900">
                                {formatCurrency(
                                  (Number(svc.quantity) || 0) * (Number(svc.rate) || 0)
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-3">
                  {rows.map((row, index) => {
                    const stockState = rowStock[index]
                    const stockOpts = stockState?.options
                    const showStockFields = Boolean(
                      displayBatchAndLot &&
                        (stockState?.loading ||
                          stockOpts?.has_batch_no ||
                          stockOpts?.requires_dispensing_lot)
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

                        <div className="grid grid-cols-2 gap-3">
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
                                const nextUom = opt.name
                                updateRow(index, { uom: nextUom })
                                setUomQueries((prev) => ({ ...prev, [index]: opt.label || opt.name }))
                                if (row.drug) {
                                  void loadRowRate(index, row.drug, nextUom)
                                }
                              }}
                              onClear={() => {
                                updateRow(index, { uom: '' })
                                setUomQueries((prev) => ({ ...prev, [index]: '' }))
                                if (row.drug) {
                                  void loadRowRate(index, row.drug)
                                }
                              }}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Rate</label>
                            <div className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                              {row.drug
                                ? row.rate != null
                                  ? formatCurrency(row.rate)
                                  : '…'
                                : '—'}
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Amount</label>
                            <div className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900">
                              {row.drug && row.rate != null
                                ? formatCurrency(lineAmount(row))
                                : '—'}
                            </div>
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

                <div className="flex flex-wrap items-center gap-3">
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
                </div>

                {(rows.some((r) => r.drug?.trim()) || selectedServiceCount > 0) && (
                  <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 space-y-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Medicine charges
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Use no charges when medicines are included in another bill (e.g. ECT session).
                        Services below are always billed at the entered amount.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          { id: 'full' as const, label: 'Full charge' },
                          { id: 'none' as const, label: 'No charges' },
                          { id: 'percent' as const, label: 'Charge %' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setChargeMode(opt.id)}
                          className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                            chargeMode === opt.id
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                      {chargeMode === 'percent' ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={chargePercentInput}
                            onChange={(e) => setChargePercentInput(e.target.value)}
                            className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            aria-label="Charge percent"
                          />
                          <span className="text-sm text-slate-600">%</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}

                {rows.some((r) => r.drug?.trim()) || selectedServiceCount > 0 ? (
                  <div className="flex justify-end border-t border-slate-200 pt-3">
                    <div className="text-right space-y-0.5">
                      {selectedServiceCount > 0 || resolvedChargePercent < 100 ? (
                        <>
                          <p className="text-xs text-slate-500">
                            Medicines (list): {formatCurrency(medicationTotal)}
                          </p>
                          {resolvedChargePercent < 100 ? (
                            <p className="text-xs text-slate-500">
                              Medicines billed
                              {resolvedChargePercent <= 0
                                ? ' (no charge)'
                                : ` at ${resolvedChargePercent}%`}
                              : {formatCurrency(billedMedicationTotal)}
                            </p>
                          ) : null}
                          {selectedServiceCount > 0 ? (
                            <p className="text-xs text-slate-500">
                              Services: {formatCurrency(serviceTotal)}
                            </p>
                          ) : null}
                        </>
                      ) : null}
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Total to bill
                      </p>
                      <p className="text-base font-semibold text-slate-900">
                        {formatCurrency(grandTotal)}
                      </p>
                    </div>
                  </div>
                ) : null}
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
                loading ||
                submitting ||
                loadingWarehouses ||
                !selectedWarehouse ||
                !rows.some((r) => r.drug?.trim())
              }
            >
              {submitting ? 'Submitting…' : submitLabel}
            </button>
          </CreateModalFooter>
        </form>
      </div>
    </div>
  )
}
