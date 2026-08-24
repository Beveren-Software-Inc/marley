import { useEffect, useRef, useState } from 'react'
import {
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import type { Prescription, MedicationOrderEntry } from '../../services/prescriptions'
import { fetchPrescriptions, fetchMedicationOrders, fetchPrescriptionByInpatientOrEncounter } from '../../services/prescriptions'
import { prescriptionAllowsMedicineGiving } from '../../utils/prescriptionSigning'
import { getPatientActiveAdmission, type InpatientRecord } from '../../services/inpatientRecords'
import {
  createMedicineGiven,
  extractDoseNumeric,
  fetchMedicineGivenStockOptions,
  fetchMedicineGivenLots,
  fetchMedicineGivenItemLots,
  fetchMedicineGivenDispensingLots,
  previewMedicineGivenDoseValidation,
  updateMedicineGiven,
  type MedicineGivenDoseValidationPreview,
  type MedicineGivenRow,
  type MedicineGivenStockOptions,
  type MedicineGivenDispensingLotOption,
} from '../../services/medicineGiven'
import { toast } from '../../hooks/useToast'
import { useRejectEditModeWhenLocked } from '../../hooks/useRejectEditModeWhenLocked'
import { formatDate, localDateInputValue } from '../../utils/formatDate'
import { fetchStandardUoms, type LinkFieldOption } from '../../services/common'
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
  /** Pre-select Patient Medication Order (e.g. from Daily Medication Chart). */
  initialPrescription?: string
  /** Pre-select Inpatient Medication Order Entry row name. */
  initialOrderEntry?: string
  initialDate?: string
  initialTime?: string
  /** Pre-check PRN when opened from the Daily Chart PRN section. */
  initialIsPrn?: boolean
  /** When set, opens in edit mode for an existing given medicine row. */
  editRow?: MedicineGivenRow
  onClose: () => void
  onSuccess: () => void
}

function toTimeInputValue(time?: string | null): string {
  if (!time) return ''
  let value = time.trim()
  if (value.includes(' ')) {
    value = value.split(' ').pop() || value
  }
  if (value.includes('.')) {
    value = value.split('.')[0]
  }
  return value.length >= 5 ? value.slice(0, 5) : value
}

function pickInitialOrderEntry(
  orders: MedicationOrderEntry[],
  initialOrderEntry?: string
): string {
  if (initialOrderEntry && orders.some((o) => o.name === initialOrderEntry)) {
    return initialOrderEntry
  }
  return orders.length > 0 ? orders[0].name : ''
}

function prescriptionNameFromOrder(order?: MedicationOrderEntry | null, fallback = ''): string {
  if (!order) return fallback
  return (order.parent || order._prescription_name || fallback).trim()
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
            <div className="px-3 py-2 text-xs text-slate-500">NO RESULTS FOUND</div>
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
  initialPrescription,
  initialOrderEntry,
  initialDate,
  initialTime,
  initialIsPrn = false,
  editRow,
  onClose,
  onSuccess,
}: CreateMedicineGivenModalProps) => {
  const isEdit = Boolean(editRow)
  useRejectEditModeWhenLocked(isEdit, onClose)
  const [admission, setAdmission] = useState<InpatientRecord | null>(null)
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [selectedPrescription, setSelectedPrescription] = useState<string>('')
  const [orders, setOrders] = useState<MedicationOrderEntry[]>([])
  const [selectedOrder, setSelectedOrder] = useState<string>('')
  const [uoms, setUoms] = useState<LinkFieldOption[]>([])
  const [uomQuery, setUomQuery] = useState('')
  const [loadingUoms, setLoadingUoms] = useState(false)
  const [qty, setQty] = useState<string>('1')
  const [dose, setDose] = useState<string>('')
  const [uom, setUom] = useState<string>('')
  const [date, setDate] = useState<string>('')
  const [time, setTime] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [overrideChecked, setOverrideChecked] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [doseWarning, setDoseWarning] = useState<MedicineGivenDoseValidationPreview | null>(null)
  const [checkingDose, setCheckingDose] = useState(false)
  const [isPrn, setIsPrn] = useState(Boolean(initialIsPrn))
  const [stockOptions, setStockOptions] = useState<MedicineGivenStockOptions | null>(null)
  const [loadingStock, setLoadingStock] = useState(false)
  const [batchNo, setBatchNo] = useState('')
  const [batchLabel, setBatchLabel] = useState('')
  const [lotNo, setLotNo] = useState('')
  const [lots, setLots] = useState<string[]>([])
  const [loadingLots, setLoadingLots] = useState(false)
  const [dispensingLot, setDispensingLot] = useState('')
  const [dispensingLots, setDispensingLots] = useState<MedicineGivenDispensingLotOption[]>([])
  const [loadingDispensingLots, setLoadingDispensingLots] = useState(false)
  const [mergedCurrentRx, setMergedCurrentRx] = useState(false)

  const prescriptionOrders = isPrn
    ? orders.filter((o) => o.is_prn === 1 || o.medication_type === 'PRN')
    : orders
  const selectedOrderLine = prescriptionOrders.find((o) => o.name === selectedOrder)
  const prescribedFrequency = (
    selectedOrderLine?.patient_frequency ||
    selectedOrderLine?.written_frequency ||
    selectedOrderLine?.frequency ||
    ''
  ).trim()
  const selectedRx = prescriptions.find((p) => p.name === selectedPrescription)
  const medicineFromDate = (selectedOrderLine?.date || selectedRx?.start_date || '').trim()
  const medicineToDate = (selectedOrderLine?.end_date || selectedRx?.end_date || '').trim()
  const medicineFieldLabel =
    selectedOrderLine && medicineFromDate && medicineToDate
      ? `${formatDate(medicineFromDate)} → ${formatDate(medicineToDate)}`
      : isPrn
        ? 'PRN Medicine'
        : 'Medicine'

  useEffect(() => {
    const now = new Date()
    const localToday = localDateInputValue(now)
    if (editRow) {
      setDate(editRow.date || initialDate || localToday)
      setTime(toTimeInputValue(editRow.time) || initialTime || now.toTimeString().slice(0, 5))
      setDose((editRow.dose || '').trim())
      setQty(editRow.qty != null ? String(editRow.qty) : '1')
      setUom((editRow.unit || '').trim())
      setUomQuery((editRow.unit || '').trim())
      setNotes((editRow.dose_notes || '').trim())
      setBatchNo(editRow.batch_no || '')
      setLotNo(editRow.lot_no || '')
      setDispensingLot(editRow.dispensing_lot || '')
      setSelectedPrescription(editRow.medication_order || editRow.patient_medication_order || '')
      setIsPrn(Boolean(editRow.is_prn))
      return
    }
    setDate(initialDate || localToday)
    setTime(initialTime || now.toTimeString().slice(0, 5))
  }, [initialDate, initialTime, editRow])

  useEffect(() => {
    const load = async () => {
      if (!initialPatient) {
        setError('Select a patient first')
        return
      }
      try {
        setLoading(true)
        setError(null)

        const adm = propInpatientRecord
          ? ({
              name: propInpatientRecord,
              patient: initialPatient,
              patient_name: '',
              status: 'Admitted' as const,
              scheduled_date: '',
            } satisfies InpatientRecord)
          : await getPatientActiveAdmission(initialPatient)
        if (!adm) {
          setError('No active inpatient admission found for this patient')
          return
        }
        setAdmission(adm)
        setLoadingUoms(true)
        const uomOptions = await fetchStandardUoms()
        setUoms(uomOptions)
        setLoadingUoms(false)

        const loadPrescriptionOrders = async (
          prescriptionName: string,
          embeddedOrders?: MedicationOrderEntry[]
        ) => {
          const ords =
            embeddedOrders?.length
              ? embeddedOrders
              : await fetchMedicationOrders(prescriptionName)
          setOrders(ords)
          setSelectedOrder(pickInitialOrderEntry(ords, initialOrderEntry))
        }

        if (isEdit && editRow?.medicine_code) {
          setPrescriptions([])
          setOrders([])
          setSelectedOrder('')
          setMergedCurrentRx(false)
          setLoadingStock(true)
          try {
            const stock = await fetchMedicineGivenStockOptions(adm.name, editRow.medicine_code)
            setStockOptions(stock)
          } finally {
            setLoadingStock(false)
          }
          return
        }

        const applyMergedCurrentRx = async (currentRx: Prescription) => {
          setMergedCurrentRx(true)
          const actives = (currentRx.active_prescriptions || []).filter((p) => p?.name)
          const byName = new Map(actives.map((p) => [p.name, p]))
          for (const line of currentRx.medication_orders || []) {
            const pmo = (line.parent || line._prescription_name || '').trim()
            if (pmo && !byName.has(pmo)) {
              byName.set(pmo, { name: pmo })
            }
          }
          if (!byName.size && currentRx.name) {
            byName.set(currentRx.name, { name: currentRx.name })
          }
          setPrescriptions(
            Array.from(byName.values()).map((p) => ({
              name: p.name,
              patient: currentRx.patient,
              patient_name: currentRx.patient_name,
              inpatient_record: currentRx.inpatient_record,
              status: p.status,
              practitioner: p.practitioner,
              healthcare_practitioner: p.healthcare_practitioner,
              healthcare_practitioner_name: p.healthcare_practitioner_name,
              user_name: p.user_name,
              start_date: p.start_date,
              end_date: p.end_date,
              creation: p.creation,
            }))
          )
          await loadPrescriptionOrders(currentRx.name, currentRx.medication_orders)
        }

        const admissionId = propInpatientRecord || adm.name
        try {
          const currentRx = await fetchPrescriptionByInpatientOrEncounter(
            admissionId,
            propPatientEncounter
          )
          if (currentRx && prescriptionAllowsMedicineGiving(currentRx)) {
            await applyMergedCurrentRx(currentRx)
            return
          }
          if (currentRx) {
            setMergedCurrentRx(false)
            setPrescriptions([])
            setSelectedPrescription('')
            setOrders([])
            setSelectedOrder('')
            setError('The current prescription must be signed before medicine can be given.')
            return
          }
        } catch {
          // Fall through to listing signed prescriptions
        }

        setMergedCurrentRx(false)
        const list = await fetchPrescriptions(50, 0, {
          patient: initialPatient,
          careContext: 'Inpatient Admission',
          inpatientRecord: admissionId,
        })
        const signedList = list.filter((p) => prescriptionAllowsMedicineGiving(p))
        if (signedList.length > 0) {
          setPrescriptions(signedList)
          const preferred =
            initialPrescription && signedList.some((p) => p.name === initialPrescription)
              ? initialPrescription
              : signedList[0].name
          setSelectedPrescription(preferred)
          await loadPrescriptionOrders(preferred)
        } else if (list.length > 0) {
          setPrescriptions([])
          setSelectedPrescription('')
          setOrders([])
          setSelectedOrder('')
          setError('No signed prescription found for this admission. Sign the prescription first.')
        } else {
          setPrescriptions([])
          setSelectedPrescription('')
          setOrders([])
          setSelectedOrder('')
          setError(
            `No submitted prescription (Patient Medication Order) for admission ${adm.name}. Add a prescription first.`
          )
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load data'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [
    initialPatient,
    propInpatientRecord,
    propPatientEncounter,
    initialPrescription,
    initialOrderEntry,
    editRow,
    isEdit,
  ])

  useEffect(() => {
    if (isEdit) return
    const selected = prescriptionOrders.find((o) => o.name === selectedOrder)
    setUom((selected?.uom || '').trim())
    setUomQuery((selected?.uom || '').trim())
    // Dose = clinical amount from the prescription line; quantity given is always units dispensed
    setDose((selected?.dosage || '').trim())
    setQty('1')
    const pmo = prescriptionNameFromOrder(selected, '')
    if (pmo) setSelectedPrescription(pmo)
  }, [selectedOrder, prescriptionOrders, isEdit])

  useEffect(() => {
    const resetBatchLot = () => {
      setStockOptions(null)
      setBatchNo('')
      setBatchLabel('')
      setLotNo('')
      setLots([])
      setDispensingLot('')
      setDispensingLots([])
    }

    const selected = prescriptionOrders.find((o) => o.name === selectedOrder)
    const drugCode = isEdit
      ? (editRow?.medicine_code || '').trim()
      : (selected?.drug || '').trim()
    const admissionName = admission?.name
    if (!admissionName || !drugCode) {
      if (!isEdit) resetBatchLot()
      return
    }

    let cancelled = false
    const load = async () => {
      setLoadingStock(true)
      if (!isEdit) resetBatchLot()
      try {
        const opts = await fetchMedicineGivenStockOptions(admissionName, drugCode)
        if (cancelled) return
        setStockOptions(opts)

        // Edit keeps saved batch/lot; create auto-picks FIFO values (still editable).
        if (isEdit) {
          if (opts.requires_dispensing_lot) {
            const editBatch = (editRow?.batch_no || '').trim()
            setLoadingDispensingLots(true)
            try {
              const dlRows = await fetchMedicineGivenDispensingLots(
                admissionName,
                drugCode,
                editBatch || undefined,
              )
              if (!cancelled) setDispensingLots(dlRows)
            } catch {
              if (!cancelled) setDispensingLots(opts.dispensing_lots || [])
            } finally {
              if (!cancelled) setLoadingDispensingLots(false)
            }
          } else if (opts.has_serial_no && !opts.has_batch_no) {
            setLoadingLots(true)
            const itemLots = await fetchMedicineGivenItemLots(admissionName, drugCode)
            if (!cancelled) setLots(itemLots)
          }
          return
        }

        const batches = opts.batches || []
        let pickedBatch = ''
        if ((opts.has_batch_no || opts.requires_dispensing_lot) && batches.length > 0) {
          const first = batches[0]
          pickedBatch = (first.batch_name || first.batch_id || '').trim()
          if (pickedBatch) {
            setBatchNo(pickedBatch)
            setBatchLabel(first.batch_id || pickedBatch)
          }
        }

        if (opts.requires_dispensing_lot) {
          setLoadingDispensingLots(true)
          try {
            let dlRows = opts.dispensing_lots || []
            if (pickedBatch) {
              dlRows = await fetchMedicineGivenDispensingLots(
                admissionName,
                drugCode,
                pickedBatch,
              )
            }
            if (cancelled) return
            setDispensingLots(dlRows)
            if (dlRows.length > 0) {
              const firstLot = dlRows[0]
              setDispensingLot(firstLot.name)
              setLotNo(firstLot.serial_no || firstLot.name)
            }
          } catch {
            if (!cancelled) setDispensingLots([])
          } finally {
            if (!cancelled) setLoadingDispensingLots(false)
          }
        } else if (opts.has_serial_no && !opts.has_batch_no) {
          setLoadingLots(true)
          const itemLots = await fetchMedicineGivenItemLots(admissionName, drugCode)
          if (!cancelled) {
            setLots(itemLots)
            if (itemLots.length > 0) setLotNo(itemLots[0])
          }
        } else if (pickedBatch && !opts.has_serial_no) {
          const batch = batches.find(
            (b) => b.batch_name === pickedBatch || b.batch_id === pickedBatch,
          )
          if (batch?.batch_id) setLotNo(batch.batch_id)
        }
      } catch {
        if (!cancelled) setStockOptions(null)
      } finally {
        if (!cancelled) {
          setLoadingStock(false)
          setLoadingLots(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [selectedOrder, prescriptionOrders, admission?.name, isEdit, editRow?.medicine_code, editRow?.batch_no])

  useEffect(() => {
    const selected = prescriptionOrders.find((o) => o.name === selectedOrder)
    const drugCode = (isEdit ? editRow?.medicine_code ?? '' : selected?.drug ?? '').trim()
    const admissionName = admission?.name
    const parsedDose = extractDoseNumeric(dose)

    if (!admissionName || !drugCode || !dose.trim() || parsedDose == null || parsedDose <= 0 || !date) {
      setDoseWarning(null)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      setCheckingDose(true)
      previewMedicineGivenDoseValidation({
        admission: admissionName,
        medicine_code: drugCode,
        dose,
        date,
        time,
      })
        .then((preview) => {
          if (!cancelled) {
            setDoseWarning(preview.has_limit && !preview.ok ? preview : null)
          }
        })
        .catch(() => {
          if (!cancelled) setDoseWarning(null)
        })
        .finally(() => {
          if (!cancelled) setCheckingDose(false)
        })
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [dose, date, time, selectedOrder, prescriptionOrders, admission?.name, isEdit, editRow?.medicine_code])

  const handleBatchChange = async (batchName: string) => {
    setBatchNo(batchName)
    const batch = stockOptions?.batches.find(
      (b) => b.batch_name === batchName || b.batch_id === batchName
    )
    setBatchLabel(batch?.batch_id || batchName)
    setLotNo('')
    setDispensingLot('')

    const selected = prescriptionOrders.find((o) => o.name === selectedOrder)
    const drugCode = (
      isEdit ? editRow?.medicine_code || '' : selected?.drug || ''
    ).trim()
    const admissionName = admission?.name
    if (!admissionName || !drugCode) {
      setLots([])
      setDispensingLots([])
      return
    }

    if (stockOptions?.requires_dispensing_lot) {
      setLoadingDispensingLots(true)
      try {
        const dlRows = await fetchMedicineGivenDispensingLots(
          admissionName,
          drugCode,
          batchName || undefined
        )
        setDispensingLots(dlRows)
        if (dlRows.length > 0) {
          const firstLot = dlRows[0]
          setDispensingLot(firstLot.name)
          setLotNo(firstLot.serial_no || firstLot.name)
        }
      } catch {
        setDispensingLots([])
      } finally {
        setLoadingDispensingLots(false)
      }
      return
    }

    if (!batchName) {
      setLots([])
      return
    }

    if (!stockOptions?.has_serial_no) {
      setLots([])
      if (batch?.batch_id) setLotNo(batch.batch_id)
      return
    }

    setLoadingLots(true)
    try {
      const lotRows = await fetchMedicineGivenLots(batchName, admissionName)
      const lotValues = lotRows.map((r) => r.lot_no).filter(Boolean)
      setLots(lotValues)
      if (lotValues.length > 0) setLotNo(lotValues[0])
    } catch {
      setLots([])
    } finally {
      setLoadingLots(false)
    }
  }

  const handleDispensingLotChange = (lotName: string) => {
    setDispensingLot(lotName)
    const lot = dispensingLots.find((l) => l.name === lotName)
    setLotNo(lot?.serial_no || lotName)
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
    // When all current signed PMOs are already in the medicine list, keep that list
    // and only update the displayed prescription id. Auto-select still follows the medicine.
    if (mergedCurrentRx || !name) return
    setOrders([])
    setSelectedOrder('')
    try {
      const ords = await fetchMedicationOrders(name)
      setOrders(ords)
      const entryHint = name === initialPrescription ? initialOrderEntry : undefined
      setSelectedOrder(pickInitialOrderEntry(ords, entryHint))
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
      toast.error('NO ACTIVE ADMISSION FOUND')
      return
    }
    if (!isEdit) {
      if (!selectedOrder) {
        toast.error('Select a medicine from the current prescriptions')
        return
      }
    }
    const parsedDose = extractDoseNumeric(dose)
    if (!dose.trim() || parsedDose == null || parsedDose <= 0) {
      toast.error('Enter a valid dose (e.g. 50 or 50mg)')
      return
    }

    const parsedQty = Number(qty)
    if (!qty.trim() || Number.isNaN(parsedQty) || parsedQty <= 0) {
      toast.error('Enter a valid quantity')
      return
    }

    if (doseWarning && !overrideChecked) {
      const proceed = window.confirm(
        `${doseWarning.message || 'Entered dose exceeds recommended maximum daily dose.'}\n\n`
          + 'To continue, enable Override below and enter a mandatory reason. Open override section now?'
      )
      if (proceed) {
        setOverrideChecked(true)
      }
      return
    }

    try {
      setLoading(true)
      setError(null)

      if (overrideChecked && !overrideReason.trim()) {
        const msg =
          'Please enter a justification for overriding the prescribed frequency or maximum dose limit.'
        setError(msg)
        toast.error(msg)
        return
      }

      if (isEdit && editRow) {
        await updateMedicineGiven({
          name: editRow.name,
          unit: uom || undefined,
          allow_override: overrideChecked || undefined,
          override_reason: overrideChecked ? overrideReason.trim() : undefined,
          dose: dose.trim(),
          qty: parsedQty,
          date,
          time,
          dose_notes: notes || undefined,
          batch_no: batchNo || undefined,
          lot_no: lotNo || undefined,
          dispensing_lot: dispensingLot || undefined,
        })
        toast.success(overrideChecked ? 'Given medicine updated with override' : 'Given medicine updated')
      } else {
        const selectedLine = orders.find((o) => o.name === selectedOrder)
        const selectedRx = prescriptions.find((p) => p.name === selectedPrescription)
        const medicationOrder = prescriptionNameFromOrder(selectedLine, selectedPrescription)
        const admissionName = selectedRx?.inpatient_record || propInpatientRecord || admission.name

        if (!medicationOrder) {
          toast.error('Could not determine which prescription this medicine belongs to')
          return
        }

        await createMedicineGiven({
          admission: admissionName,
          medication_order: medicationOrder,
          order_entry: selectedOrder,
          unit: uom || undefined,
          allow_override: overrideChecked || undefined,
          override_reason: overrideChecked ? overrideReason.trim() : undefined,
          dose: dose.trim(),
          qty: parsedQty,
          date,
          time,
          dose_notes: notes || undefined,
          is_prn: isPrn || undefined,
          batch_no: batchNo || undefined,
          lot_no: lotNo || undefined,
          dispensing_lot: dispensingLot || undefined,
        })

        toast.success(overrideChecked ? 'Given medicine recorded with override' : 'Given medicine recorded')
      }
      onSuccess()
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : isEdit ? 'Failed to update given medicine' : 'Failed to record given medicine'
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
                <h2 className="text-xl font-semibold tracking-tight text-emerald-950">
                  {isEdit ? 'Edit Given Medicine' : 'Record Given Medicine'}
                </h2>
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
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-4 space-y-3">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-semibold text-amber-800">Override limits (optional)</span>
              </div>
              <p className="text-xs text-amber-700">
                Use when an extra dose, higher dose, or dose above the 24-hour ceiling is clinically justified
                (e.g. ICU, consultant order). All overrides are logged with user, reason, and timestamp.
              </p>
              <label className="flex items-center gap-2 text-sm text-amber-800">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  checked={overrideChecked}
                  onChange={(e) => setOverrideChecked(e.target.checked)}
                />
                I need to override the prescribed frequency or maximum dose limit for this dose.
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

          {/* PRN filter */}
          {isEdit ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Medicine</span>
              <p className="mt-1 font-medium">
                {editRow?.medicine_name || editRow?.medicine_code || '—'}
              </p>
              {editRow?.medication_order || editRow?.patient_medication_order ? (
                <p className="mt-0.5 text-xs text-slate-500">
                  Prescription: {editRow.medication_order || editRow.patient_medication_order}
                </p>
              ) : null}
            </div>
          ) : (
          <>
          <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-slate-600 border-b border-slate-200 pb-3">
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
          </div>

          {isPrn && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Showing only PRN (as-needed) medications from current prescriptions.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                {medicineFieldLabel}
              </label>
              <select
                value={selectedOrder}
                onChange={(e) => setSelectedOrder(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                disabled={loading || !orders.length}
              >
                <option value="">
                  {isPrn && orders.filter((o) => o.is_prn === 1 || o.medication_type === 'PRN').length === 0
                    ? 'No PRN medicines on current prescriptions'
                    : 'Select medicine...'}
                </option>
                {prescriptionOrders.map((o) => {
                  const held = o.medication_status === 'On Hold'
                  const discontinued = o.medication_status === 'Discontinued'
                  const stopped = Boolean(o.stopped) || Boolean(o.reason_stopped)
                  const pmo = prescriptionNameFromOrder(o, '')
                  return (
                    <option key={o.name} value={o.name} disabled={held || discontinued || stopped}>
                      {o.drug_name || o.drug} – {o.dosage}
                      {o.patient_frequency || o.written_frequency || o.frequency
                        ? ` · ${o.patient_frequency || o.written_frequency || o.frequency}`
                        : ''}
                      {pmo ? ` · ${pmo}` : ''}
                      {o.is_prn === 1 ? ' (PRN)' : ''}
                      {held
                        ? ' — On Hold (cannot give)'
                        : discontinued
                          ? ' — Discontinued (cannot give)'
                          : stopped
                            ? ' — Stopped (cannot give)'
                            : ''}
                    </option>
                  )
                })}
              </select>
            </div>
          </div>
          </>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Frequency
              </label>
              <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800">
                {prescribedFrequency || (selectedOrder ? '—' : 'Select a medicine')}
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Dose</label>
              <input
                type="text"
                value={dose}
                onChange={(e) => setDose(e.target.value)}
                placeholder="e.g. 50mg"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
              {checkingDose ? (
                <p className="text-xs text-slate-500">Checking dose limit…</p>
              ) : doseWarning ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 whitespace-pre-line">
                  {doseWarning.message}
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Quantity</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
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
          </div>

          {(loadingStock ||
            stockOptions?.has_batch_no ||
            stockOptions?.requires_dispensing_lot ||
            (stockOptions?.has_serial_no && lots.length > 0)) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(stockOptions?.has_batch_no || stockOptions?.requires_dispensing_lot) && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Batch
                  </label>
                  {loadingStock ? (
                    <div className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-500">Loading batches…</div>
                  ) : stockOptions.batches.length > 0 ? (
                    <select
                      value={batchNo}
                      onChange={(e) => handleBatchChange(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="">Auto / none</option>
                      {stockOptions.batches.map((b) => (
                        <option key={b.batch_name || b.batch_id} value={b.batch_name || b.batch_id}>
                          {b.batch_id || b.batch_name}
                          {b.qty != null ? ` (Qty: ${b.qty})` : ''}
                          {b.expiry_date ? ` · Exp: ${b.expiry_date}` : ''}
                        </option>
                      ))}
                    </select>
                  ) : stockOptions.requires_dispensing_lot ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      NO BATCHES IN STOCK. SELECT BATCH AFTER STOCK IS AVAILABLE.
                    </div>
                  ) : (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      No batches in stock for this medicine at the admission warehouse.
                    </div>
                  )}
                </div>
              )}

              {stockOptions?.requires_dispensing_lot && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Dispensing Lot
                  </label>
                  {loadingDispensingLots ? (
                    <div className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-500">Loading dispensing lots…</div>
                  ) : dispensingLots.length > 0 ? (
                    <select
                      value={dispensingLot}
                      onChange={(e) => handleDispensingLotChange(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="">Auto / none</option>
                      {dispensingLots.map((lot) => (
                        <option key={lot.name} value={lot.name}>
                          {lot.label || lot.serial_no || lot.name}
                        </option>
                      ))}
                    </select>
                  ) : batchNo || !stockOptions.has_batch_no ? (
                    <div className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500">
                      No dispensing lots available for this selection.
                    </div>
                  ) : (
                    <div className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500">
                      Select a batch first to load dispensing lots.
                    </div>
                  )}
                </div>
              )}

              {!stockOptions?.requires_dispensing_lot &&
                stockOptions?.has_serial_no &&
                (lots.length > 0 || loadingLots) && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Lot No
                  </label>
                  {loadingLots ? (
                    <div className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-500">Loading lots…</div>
                  ) : lots.length > 0 ? (
                    <select
                      value={lotNo}
                      onChange={(e) => setLotNo(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="">Auto / none</option>
                      {lots.map((lot) => (
                        <option key={lot} value={lot}>
                          {lot}
                        </option>
                      ))}
                    </select>
                  ) : batchNo ? (
                    <div className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500">
                      No lots found for the selected batch.
                    </div>
                  ) : null}
                </div>
              )}

              {!stockOptions?.requires_dispensing_lot &&
                stockOptions?.has_batch_no &&
                batchLabel &&
                !stockOptions.has_serial_no &&
                lotNo && (
                <div className="space-y-2 sm:col-span-2">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Lot / batch label: <span className="font-medium text-slate-800">{lotNo}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            disabled={loading || !admission || (!isEdit && (!selectedPrescription || !selectedOrder))}
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
            ) : isEdit ? (
              'Save Changes'
            ) : (
              'Save Medicine Record'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
