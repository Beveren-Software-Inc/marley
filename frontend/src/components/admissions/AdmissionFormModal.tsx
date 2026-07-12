import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { fetchInpatientRecord, fetchServiceUnits, fetchBedNumbers, admitPatient, calculatePackagePrice, type ServiceUnit, type BedNoRecord, type InpatientPackage, createAdmissionQuotation, checkAdmissionQuotation } from '../../services/inpatientRecords'
import { uploadPatientFile, type PatientDocumentRow } from '../../services/patients'
import { fetchDocumentTypes } from '../../services/common'
import { DocumentTypeSelect } from '../ui/DocumentTypeSelect'
import { toast } from '../../hooks/useToast'
import { PenLine, Trash2, Check, X, BedDouble } from 'lucide-react'

function YesNoField({
  label,
  value,
  onChange,
}: {
  label: string
  value: 'Yes' | 'No' | ''
  onChange: (v: 'Yes' | 'No') => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-2">{label}</label>
      <div className="flex items-center gap-4">
        <label className="inline-flex items-center gap-1.5 text-sm text-slate-700">
          <input
            type="radio"
            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
            checked={value === 'Yes'}
            onChange={() => onChange('Yes')}
          />
          Yes
        </label>
        <label className="inline-flex items-center gap-1.5 text-sm text-slate-700">
          <input
            type="radio"
            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
            checked={value === 'No'}
            onChange={() => onChange('No')}
          />
          No
        </label>
      </div>
    </div>
  )
}

// ─── Signature Pad ────────────────────────────────────────────────────────────

interface SignaturePadProps {
  onSave: (file: File) => void
  onClear?: () => void
  existingUrl?: string
  uploading?: boolean
}

const SignaturePad = ({ onSave, onClear, existingUrl, uploading }: SignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const [hasStrokes, setHasStrokes] = useState(false)
  const [mode, setMode] = useState<'idle' | 'drawing' | 'done'>(existingUrl ? 'done' : 'idle')

  const initCtx = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    return ctx
  }, [])

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const t = e.touches[0]
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = initCtx()
    if (!ctx) return
    isDrawing.current = true
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!isDrawing.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = initCtx()
    if (!ctx) return
    const pos = getPos(e, canvas)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    setHasStrokes(true)
  }

  const endDraw = () => { isDrawing.current = false }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasStrokes(false)
    onClear?.()
  }

  const saveSignature = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const file = new File([blob], `signature_${Date.now()}.png`, { type: 'image/png' })
      onSave(file)
      setMode('done')
    }, 'image/png')
  }

  useEffect(() => {
    if (mode !== 'drawing') return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * window.devicePixelRatio
    canvas.height = rect.height * window.devicePixelRatio
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    setHasStrokes(false)
  }, [mode])

  if (mode === 'idle') {
    return (
      <button
        type="button"
        onClick={() => setMode('drawing')}
        className="w-full h-full min-h-[96px] flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 text-slate-400 hover:border-primary hover:text-primary hover:bg-blue-50/50 transition-all group"
      >
        <PenLine className="w-5 h-5 group-hover:scale-110 transition-transform" />
        <span className="text-xs font-medium">Add Signature</span>
      </button>
    )
  }

  if (mode === 'done' && existingUrl) {
    return (
      <div className="w-full h-full min-h-[96px] flex flex-col items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-50 p-2">
        <img src={existingUrl} alt="Signature" className="max-h-16 object-contain" />
        <button
          type="button"
          onClick={() => { setMode('drawing'); clearCanvas() }}
          className="text-xs text-slate-500 hover:text-red-500 flex items-center gap-1 transition-colors"
        >
          <Trash2 className="w-3 h-3" /> Re-sign
        </button>
      </div>
    )
  }

  return (
    <div className="w-full rounded-lg border border-slate-300 bg-white overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-100 bg-slate-50">
        <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
          <PenLine className="w-3 h-3" /> Draw signature
        </span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={clearCanvas} disabled={!hasStrokes}
            className="text-xs text-slate-400 hover:text-red-500 disabled:opacity-30 flex items-center gap-0.5 transition-colors px-1.5 py-0.5 rounded hover:bg-red-50">
            <Trash2 className="w-3 h-3" /> Clear
          </button>
          <button type="button" onClick={() => { setMode('idle'); clearCanvas() }}
            className="text-xs text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors">
            Cancel
          </button>
        </div>
      </div>
      <div className="relative" style={{ touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '96px', display: 'block', cursor: 'crosshair' }}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
        />
        {!hasStrokes && (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-slate-300 pointer-events-none select-none">
            Sign here
          </span>
        )}
      </div>
      <div className="px-2.5 py-2 border-t border-slate-100 flex justify-end">
        <button type="button" onClick={saveSignature} disabled={!hasStrokes || uploading}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {uploading ? (
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Saving…
            </span>
          ) : (
            <><Check className="w-3 h-3" /> Save Signature</>
          )}
        </button>
      </div>
    </div>
  )
}

// ─── Service Unit Multi-Select ────────────────────────────────────────────────

interface ServiceUnitSelectProps {
  serviceUnits: ServiceUnit[]
  selectedServiceUnits: ServiceUnit[]
  onToggle: (unit: ServiceUnit) => void
  query: string
  onQueryChange: (q: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  primaryUnit: string
  onSetPrimary: (name: string) => void
}

const ServiceUnitSelect = ({
  serviceUnits,
  selectedServiceUnits,
  onToggle,
  query,
  onQueryChange,
  open,
  onOpenChange,
  primaryUnit,
  onSetPrimary,
}: ServiceUnitSelectProps) => {
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onOpenChange(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onOpenChange])

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium text-slate-700 mb-1">
        Room <span className="text-slate-400 font-normal">(optional, multi-select)</span>
      </label>

      {/* Search input */}
      <div className="relative">
        <BedDouble className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => { onQueryChange(e.target.value); onOpenChange(true) }}
          onFocus={() => onOpenChange(true)}
          placeholder="Search beds / rooms…"
          className="w-full rounded-md border border-slate-300 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {selectedServiceUnits.length > 0 && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold">
            {selectedServiceUnits.length}
          </span>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-52 overflow-auto">
          {serviceUnits.length === 0 ? (
            <div className="px-3 py-3 text-xs text-slate-400 text-center">
              {query ? 'No beds match your search' : 'NO VACANT BEDS AVAILABLE'}
            </div>
          ) : (
            serviceUnits.map((unit) => {
              const isSelected = selectedServiceUnits.some(su => su.name === unit.name)
              return (
                <button
                  key={unit.name}
                  type="button"
                  // FIX: stopPropagation prevents the form's onClick from closing the dropdown
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggle(unit)
                  }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'bg-blue-50 hover:bg-blue-100'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Checkbox indicator */}
                    <span className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                      isSelected ? 'bg-primary border-primary' : 'border-slate-300'
                    }`}>
                      {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                    </span>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{unit.healthcare_service_unit_name}</div>
                      <div className="text-xs text-slate-500">
                        {unit.occupancy_status}
                        {unit.service_unit_type ? ` • ${unit.service_unit_type}` : ''}
                      </div>
                    </div>
                  </div>
                  {isSelected && (
                    <span className="flex-shrink-0 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      Selected
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      )}

      {/* Selected bed chips */}
      {selectedServiceUnits.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selectedServiceUnits.map((unit) => {
            const isPrimary = unit.name === primaryUnit
            return (
              <span
                key={unit.name}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                  isPrimary
                    ? 'bg-primary text-white border-primary'
                    : 'bg-blue-50 text-blue-800 border-blue-200 hover:border-blue-400 cursor-pointer'
                }`}
                title={isPrimary ? 'Primary bed' : 'Click to set as primary'}
                onClick={() => !isPrimary && onSetPrimary(unit.name)}
              >
                {isPrimary && <BedDouble className="w-3 h-3" />}
                {unit.healthcare_service_unit_name}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onToggle(unit) }}
                  className={`ml-0.5 rounded-full p-0.5 transition-colors ${
                    isPrimary ? 'hover:bg-white/20' : 'hover:bg-blue-200'
                  }`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )
          })}
          {selectedServiceUnits.length > 1 && (
            <p className="w-full text-[10px] text-slate-400 mt-0.5">
              Solid blue = primary bed. Click another chip to change it.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface AdmissionFormModalProps {
  admissionNo: string
  selectedPackage: InpatientPackage
  onComplete: () => void
  onClose: () => void
}

type Tab = 'admission' | 'documents' | 'relatives'

// Relationship options – must match IP Patient Relative doctype (same as Discharge)
const RELATION_OPTIONS = [
  'Father',
  'Mother',
  'Brother',
  'Sister',
  'Husband',
  'Wife',
  'Son',
  'Daughter',
] as const

export const AdmissionFormModal = ({
  admissionNo,
  selectedPackage,
  onComplete,
  onClose
}: AdmissionFormModalProps) => {
  const [activeTab, setActiveTab] = useState<Tab>('admission')
  const [record, setRecord] = useState<any>(null)
  const [serviceUnits, setServiceUnits] = useState<ServiceUnit[]>([])
  const [serviceUnitQuery, setServiceUnitQuery] = useState('')
  const [serviceUnitOpen, setServiceUnitOpen] = useState(false)
  const [selectedServiceUnits, setSelectedServiceUnits] = useState<ServiceUnit[]>([])
  const [bedNumbers, setBedNumbers] = useState<BedNoRecord[]>([])
  const [bedNoQuery, setBedNoQuery] = useState('')
  const [bedNoOpen, setBedNoOpen] = useState(false)
  const [selectedBedNo, setSelectedBedNo] = useState<BedNoRecord | null>(null)
  const bedPickerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [daysInput, setDaysInput] = useState<string>('')
  const [days, setDays] = useState<number>(0)
  const [calculatedPrice, setCalculatedPrice] = useState<number | null>(null)
  const [discountPercentInput, setDiscountPercentInput] = useState<string>('0')
  const [calculatingPrice, setCalculatingPrice] = useState(false)
  const [creatingSalesOrder, setCreatingSalesOrder] = useState(false)
  const [salesOrderCreated, setSalesOrderCreated] = useState<string | null>(null)
  const [existingQuotation, setExistingQuotation] = useState<string | null>(null)
  const [checkingQuotation, setCheckingQuotation] = useState(false)

  // Documents state
  const [documents, setDocuments] = useState<PatientDocumentRow[]>([])
  const [documentTypes, setDocumentTypes] = useState<{ name: string; document_name?: string }[]>([])
  const [documentUploading, setDocumentUploading] = useState<number | null>(null)
  const [signatureUploading, setSignatureUploading] = useState<number | null>(null)

  // Relatives / guardians
  const [relatives, setRelatives] = useState<
    { relative_relation: string; relative_name: string; relative_id_num: string; any_remarks: string; relative_phone_no: string; relative_alternative_phone_no: string; relative_alternative_phone_no_2: string }[]
  >([])

  const discountPercent = Math.min(100, Math.max(0, parseFloat(discountPercentInput || '0') || 0))
  const discountedPrice = calculatedPrice !== null ? calculatedPrice * (1 - discountPercent / 100) : null

  const selectedServiceUnitNames = useMemo(
    () => selectedServiceUnits.map((su) => su.name).filter(Boolean),
    [selectedServiceUnits],
  )

  const calculateExpectedDischarge = (numDays: number) => {
    if (numDays > 0) {
      const expectedDate = new Date()
      expectedDate.setDate(expectedDate.getDate() + numDays - 1)
      return expectedDate.toISOString().split('T')[0]
    }
    return ''
  }

  const [formData, setFormData] = useState({
    serviceUnit: '',           // primary bed name
    checkIn: new Date().toISOString().slice(0, 16),
    expectedDischarge: '' as string,
    ipCaseManagement: 0 as 0 | 1,
    ipCaseManagementFee: 0 as 0 | 1,
  })

  // ── Days → price ──────────────────────────────────────────────────────────

  useEffect(() => {
    const numValue = parseInt(daysInput) || 0
    if (numValue > 0 && numValue !== days) setDays(numValue)
    else if (daysInput === '' || numValue === 0) setDays(0)
  }, [daysInput])

  useEffect(() => {
    const calculatePrice = async () => {
      if (days > 0 && selectedPackage.name) {
        // For custom packages, compute directly from the entered rate
        if (selectedPackage.name === '__custom__') {
          setCalculatedPrice(selectedPackage.package_rate * days)
          setFormData(prev => ({ ...prev, expectedDischarge: calculateExpectedDischarge(days) }))
          return
        }
        try {
          setCalculatingPrice(true)
          const result = await calculatePackagePrice(selectedPackage.name, days)
          setCalculatedPrice(result.total_price)
          setFormData(prev => ({ ...prev, expectedDischarge: calculateExpectedDischarge(days) }))
        } catch (err) {
          console.error('Failed to calculate price:', err)
          setCalculatedPrice(null)
        } finally {
          setCalculatingPrice(false)
        }
      } else {
        setCalculatedPrice(null)
      }
    }
    calculatePrice()
  }, [days, selectedPackage.name])

  // ── Service unit search ───────────────────────────────────────────────────

  useEffect(() => {
    if (!serviceUnitOpen) return
    const search = async () => {
      try {
        const serviceUnitType = record?.admission_service_unit_type
        const roomCategory = selectedPackage.package_category
        const results = await fetchServiceUnits(serviceUnitType, 'Vacant', serviceUnitQuery || undefined, roomCategory)
        setServiceUnits(results)
      } catch (err) {
        console.error('Failed to search service units:', err)
        setServiceUnits([])
      }
    }
    const timeoutId = setTimeout(() => { search() }, serviceUnitQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(timeoutId)
  }, [serviceUnitQuery, serviceUnitOpen, record?.admission_service_unit_type, selectedPackage.package_category])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bedPickerRef.current && !bedPickerRef.current.contains(e.target as Node)) {
        setBedNoOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (selectedServiceUnitNames.length === 0 && bedNoOpen) {
      setBedNoOpen(false)
    }
  }, [selectedServiceUnitNames.length, bedNoOpen])

  useEffect(() => {
    if (!bedNoOpen) return
    if (selectedServiceUnitNames.length === 0) {
      setBedNumbers([])
      return
    }
    const search = async () => {
      try {
        const results = await fetchBedNumbers({
          occupancyStatus: 'Vacant',
          search: bedNoQuery || undefined,
          costCenter: record?.cost_center || undefined,
          serviceUnitNames: selectedServiceUnitNames,
        })
        setBedNumbers(results)
      } catch (err) {
        console.error('Failed to search bed numbers:', err)
        setBedNumbers([])
      }
    }
    const timeoutId = setTimeout(() => { search() }, bedNoQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(timeoutId)
  }, [bedNoQuery, bedNoOpen, record?.cost_center, selectedServiceUnitNames])

  /** Drop bed if its room is no longer in the multiselect. */
  useEffect(() => {
    setSelectedBedNo((prev) => {
      if (!prev) return prev
      if (selectedServiceUnitNames.length === 0) return null
      if (prev.service_unit && !selectedServiceUnitNames.includes(prev.service_unit)) return null
      return prev
    })
  }, [selectedServiceUnitNames])

  // ── Initial data load ─────────────────────────────────────────────────────

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        setError(null)

        const [recordData, docTypes] = await Promise.all([
          fetchInpatientRecord(admissionNo),
          fetchDocumentTypes(),
        ])

        setRecord(recordData)
        setDocumentTypes(docTypes)

        const existingRelatives = (recordData as any).patient_relatives || []
        if (Array.isArray(existingRelatives) && existingRelatives.length > 0) {
          setRelatives(existingRelatives.map((r: any) => ({
            relative_relation: r.relative_relation || '',
            relative_name: r.relative_name || '',

            relative_id_num: r.relative_id_num || '',
            relative_phone_no: r.relative_phone_no || '',
            relative_alternative_phone_no: r.relative_alternative_phone_no || '',
            relative_alternative_phone_no_2: r.relative_alternative_phone_no_2 || '',
            any_remarks: r.any_remarks || '',
          })))
        } else {
          setRelatives([{ relative_relation: '', relative_name: '', relative_id_num: '', relative_phone_no: '', relative_alternative_phone_no: '', relative_alternative_phone_no_2: '', any_remarks: '' }])
        }

        const rawExpected = (recordData as any)?.expected_length_of_stay
        const expectedDays = typeof rawExpected === 'number'
          ? rawExpected
          : rawExpected ? parseInt(String(rawExpected), 10) : 0

        if (expectedDays && expectedDays > 0) {
          setDays(expectedDays)
          setDaysInput(String(expectedDays))
          setFormData(prev => ({ ...prev, expectedDischarge: calculateExpectedDischarge(expectedDays) }))
        } else {
          setDays(0)
          setDaysInput('')
          setFormData(prev => ({ ...prev, expectedDischarge: '' }))
        }

        const serviceUnitType = recordData?.admission_service_unit_type
        const roomCategory = selectedPackage.package_category
        const unitsData = await fetchServiceUnits(serviceUnitType, 'Vacant', undefined, roomCategory)
        setServiceUnits(unitsData)
        setBedNumbers([])
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load data'))
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [admissionNo])

  useEffect(() => {
    const checkQuotation = async () => {
      if (selectedPackage.name === '__custom__') return
      try {
        setCheckingQuotation(true)
        const result = await checkAdmissionQuotation(admissionNo, selectedPackage.name)
        if (result.exists && result.quotation_name) {
          setExistingQuotation(result.quotation_name)
          setSalesOrderCreated(result.quotation_name)
        }
      } catch (err) {
        console.error('Failed to check quotation:', err)
      } finally {
        setCheckingQuotation(false)
      }
    }
    if (admissionNo && selectedPackage.name) checkQuotation()
  }, [admissionNo, selectedPackage.name])

  // ── Service unit toggle (FIX: no longer replaces query on select) ─────────

  const handleToggleServiceUnit = (unit: ServiceUnit) => {
    setSelectedServiceUnits(prev => {
      const already = prev.some(su => su.name === unit.name)
      if (already) {
        const updated = prev.filter(su => su.name !== unit.name)
        // If we removed the primary, promote next in list
        setFormData(current => ({
          ...current,
          serviceUnit: current.serviceUnit === unit.name
            ? (updated[0]?.name ?? '')
            : current.serviceUnit,
        }))
        return updated
      } else {
        const updated = [...prev, unit]
        // First selection becomes primary automatically
        setFormData(current => ({
          ...current,
          serviceUnit: current.serviceUnit || unit.name,
        }))
        // NOTE: we deliberately do NOT update serviceUnitQuery here — that was the bug
        return updated
      }
    })
  }

  const handleSetPrimaryUnit = (name: string) => {
    setFormData(prev => ({ ...prev, serviceUnit: name }))
  }

  // ── Document helpers ──────────────────────────────────────────────────────

  const addDocumentRow = () => setDocuments(prev => [...prev, { file_name: '', document_type: '', transaction_no: '', upload_remarks: '' }])
  const removeDocumentRow = (idx: number) => setDocuments(prev => prev.filter((_, i) => i !== idx))
  const updateDocumentRow = (idx: number, field: keyof PatientDocumentRow, value: string) => {
    setDocuments(prev => { const next = [...prev]; next[idx] = { ...next[idx], [field]: value }; return next })
  }

  const handleDocumentFile = async (idx: number, file: File | null) => {
    if (!file) return
    setDocumentUploading(idx)
    try {
      const file_url = await uploadPatientFile(file)
      if (!file_url) throw new Error('No URL returned from upload')
      setDocuments(prev => {
        const next = [...prev]
        next[idx] = { ...next[idx], document: file_url, file_name: next[idx].file_name?.trim() || file.name }
        return next
      })
      toast.success('File uploaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'File upload failed')
    } finally {
      setDocumentUploading(null)
    }
  }

  const handleSignatureFile = async (idx: number, file: File) => {
    setSignatureUploading(idx)
    try {
      const file_url = await uploadPatientFile(file)
      if (!file_url) throw new Error('No URL returned from signature upload')
      setDocuments(prev => {
        const next = [...prev]
        next[idx] = { ...next[idx], document: file_url, file_name: next[idx].file_name?.trim() || `Signature ${idx + 1}` }
        return next
      })
      toast.success('Signature saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Signature upload failed')
    } finally {
      setSignatureUploading(null)
    }
  }

  // ── Quotation + Admit ─────────────────────────────────────────────────────

  const resolveQuotationServiceUnit = () =>
    formData.serviceUnit ||
    selectedServiceUnits[0]?.name ||
    selectedBedNo?.service_unit ||
    ''

  const handleCreateSalesOrder = async () => {
    if (!discountedPrice || discountedPrice <= 0) {
      setError(new Error('Please calculate price first by entering number of days'))
      return
    }
    const quotationSu = resolveQuotationServiceUnit()
    if (!quotationSu) {
      setError(new Error('Select at least one room or a bed (with a room) to create a quotation'))
      return
    }
    try {
      setCreatingSalesOrder(true)
      setError(null)
      const result = await createAdmissionQuotation(
        admissionNo,
        selectedPackage.name,
        days,
        discountedPrice,
        quotationSu
      )
      const quotationName = (result as any).quotation_name || (result as any).sales_order_name || null
      if (quotationName) setSalesOrderCreated(quotationName)
      toast.success('Quotation drafted for approval', 4000)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to create Quotation'))
    } finally {
      setCreatingSalesOrder(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (days <= 0) {
      setError(new Error('Number of days must be greater than 0'))
      return
    }

    try {
      setSubmitting(true)
      setError(null)

      const patientDocuments = documents
        .filter(r => (r.file_name || '').trim() || (r.document || '').trim())
        .map(r => ({
          file_name: (r.file_name || '').trim() || undefined,
          document_type: (r.document_type || '').trim() || undefined,
          transaction_no: (r.transaction_no || '').trim() || undefined,
          upload_remarks: (r.upload_remarks || '').trim() || undefined,
          document: (r.document || '').trim() || undefined,
        }))

      const patientRelatives = relatives
        .map(r => ({
          relative_relation: r.relative_relation?.trim() || '',
          relative_name: r.relative_name?.trim() || '',
          relative_id_num: r.relative_id_num?.trim() || '',
          relative_phone_no: r.relative_phone_no?.trim() || '',
          relative_alternative_phone_no: r.relative_alternative_phone_no?.trim() || '',
          relative_alternative_phone_no_2: r.relative_alternative_phone_no_2?.trim() || '',
          any_remarks: r.any_remarks?.trim() || '',
        }))
        .filter(r => r.relative_relation || r.relative_name || r.relative_id_num || r.any_remarks || r.relative_phone_no || r.relative_alternative_phone_no || r.relative_alternative_phone_no_2)

      await admitPatient(
        admissionNo,
        formData.serviceUnit || undefined,
        formData.checkIn,
        formData.expectedDischarge || undefined,
        patientDocuments.length > 0 ? patientDocuments : undefined,
        patientRelatives.length > 0 ? patientRelatives : undefined,
        selectedServiceUnits.map(su => su.name),
        selectedPackage.name,
        selectedPackage.package_rate,
        selectedPackage.name === '__custom__' ? 0 : 1,
        selectedBedNo?.name ?? null,
        null,
        formData.ipCaseManagement,
        formData.ipCaseManagementFee,
      )

      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to admit patient'))
    } finally {
      setSubmitting(false)
    }
  }

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl p-6">
          <div className="text-slate-600">Loading...</div>
        </div>
      </div>
    )
  }

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'admission', label: 'Admission Details' },
    { id: 'documents', label: 'Documents', badge: documents.length || undefined },
    { id: 'relatives', label: 'Relatives', badge: relatives.length || undefined },
  ]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="p-6 border-b border-slate-200 shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Admit Patient</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex mt-4 border-b border-slate-200 -mb-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
                {tab.badge !== undefined && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    activeTab === tab.id ? 'bg-blue-100 text-primary' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto p-6 space-y-4 flex-1">

            {/* ── TAB: ADMISSION DETAILS ── */}
            {activeTab === 'admission' && (
              <>
                {/* Package Info */}
                <div className={`rounded-lg p-4 ${selectedPackage.name === '__custom__' ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'}`}>
                  <h3 className="font-semibold text-slate-900 mb-2">Selected Package</h3>
                  <div className="mb-2 flex items-center gap-2">
                    <p className="font-medium text-slate-900">{selectedPackage.package_name}</p>
                    {selectedPackage.name === '__custom__' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Custom</span>
                    )}
                    {selectedPackage.category_name && (
                      <p className="text-xs text-slate-500">
                        <span className="font-medium">Room Category:</span> {selectedPackage.category_name}
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                    <div>
                      <span className="text-slate-600">Rate Per Day:</span>{' '}
                      <span className="font-medium">{selectedPackage.package_rate.toLocaleString()} BHD / day</span>
                    </div>
                  </div>
                  {selectedPackage.name !== '__custom__' && selectedPackage.duration_pricing && selectedPackage.duration_pricing.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-300">
                      <p className="text-xs font-medium text-slate-700 mb-1">Duration Pricing:</p>
                      <div className="space-y-1">
                        {selectedPackage.duration_pricing.map((dp, idx) => (
                          <div key={idx} className="text-xs text-slate-600">
                            <span className="font-medium">{dp.duration_name || 'Duration'}:</span>{' '}
                            Day {dp.from_day}{dp.to_day ? ` - ${dp.to_day}` : '+'} = {dp.amount.toLocaleString()} BHD
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Days + Discount */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Number of Days <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number" min="1" value={daysInput}
                      onChange={(e) => setDaysInput(e.target.value)}
                      onBlur={(e) => {
                        const numValue = parseInt(e.target.value)
                        if (!numValue || numValue < 1) { setDaysInput('1'); setDays(1) }
                      }}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Discount (%)</label>
                    <input
                      type="number" min="0" max="100" step="0.01"
                      value={discountPercentInput}
                      onChange={(e) => setDiscountPercentInput(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                {/* Calculated Price */}
                {calculatingPrice ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-700">
                    Calculating price...
                  </div>
                ) : calculatedPrice !== null ? (
                  <div className="bg-green-50 border border-green-200 rounded-md p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-green-900">Total Price:</span>
                      <span className="text-lg font-bold text-green-900">
                        {(discountedPrice ?? calculatedPrice).toLocaleString()} BHD
                      </span>
                    </div>
                    {discountPercent > 0 && (
                      <p className="text-xs text-green-800 mt-1">
                        Discount {discountPercent}% applied (original {calculatedPrice.toLocaleString()} BHD)
                      </p>
                    )}
                    <p className="text-xs text-green-700 mt-1">For {days} {days === 1 ? 'day' : 'days'}</p>
                  </div>
                ) : null}

                {/* Patient Info */}
                {record && (
                  <div className="bg-slate-50 rounded-lg p-4">
                    <h3 className="font-semibold text-slate-900 mb-2">Patient Information</h3>
                    <div className="text-sm text-slate-700">
                      <p><span className="font-medium">Name:</span> {record.patient_name || record.patient}</p>
                      {record.medical_department && (
                        <p><span className="font-medium">Department:</span> {record.medical_department}</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ServiceUnitSelect
                    serviceUnits={serviceUnits}
                    selectedServiceUnits={selectedServiceUnits}
                    onToggle={handleToggleServiceUnit}
                    query={serviceUnitQuery}
                    onQueryChange={setServiceUnitQuery}
                    open={serviceUnitOpen}
                    onOpenChange={setServiceUnitOpen}
                    primaryUnit={formData.serviceUnit}
                    onSetPrimary={handleSetPrimaryUnit}
                  />

                  <div ref={bedPickerRef} className="relative">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Bed No <span className="text-slate-400 font-normal">(optional)</span>
                    </label>
                    <div className="relative">
                      <BedDouble className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={selectedBedNo ? (selectedBedNo.bed_no || selectedBedNo.name) : bedNoQuery}
                        onChange={(e) => {
                          setSelectedBedNo(null)
                          setBedNoQuery(e.target.value)
                          setBedNoOpen(true)
                        }}
                        onFocus={() => selectedServiceUnitNames.length > 0 && setBedNoOpen(true)}
                        disabled={selectedServiceUnitNames.length === 0}
                        placeholder={
                          selectedServiceUnitNames.length === 0
                            ? 'Select a room first…'
                            : 'Search vacant beds in selected rooms…'
                        }
                        className="w-full rounded-md border border-slate-300 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Only vacant beds linked to the selected room(s) are listed.
                    </p>
                    {bedNoOpen && selectedServiceUnitNames.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-52 overflow-auto">
                        {bedNumbers.length === 0 ? (
                          <div className="px-3 py-3 text-xs text-slate-400 text-center">
                            {bedNoQuery.trim() !== '' ? 'No beds match your search' : 'No vacant beds in these rooms'}
                          </div>
                        ) : (
                          bedNumbers.map((bed) => (
                            <button
                              key={bed.name}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedBedNo(bed)
                                setBedNoQuery('')
                                setBedNoOpen(false)
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex flex-col gap-0.5"
                            >
                              <span className="font-medium">{bed.bed_no || bed.name}</span>
                              <span className="text-xs text-slate-500">
                                {bed.service_unit ? `Room: ${bed.service_unit}` : 'No room'}
                                {bed.occupancy_status ? ` · ${bed.occupancy_status}` : ''}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                    {selectedBedNo && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium bg-emerald-50 text-emerald-900 border border-emerald-200">
                          <BedDouble className="w-3 h-3" />
                          {selectedBedNo.bed_no || selectedBedNo.name}
                          <button
                            type="button"
                            onClick={() => setSelectedBedNo(null)}
                            className="ml-0.5 rounded-full p-0.5 hover:bg-emerald-200"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Check In */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Check In Date & Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local" value={formData.checkIn}
                    onChange={(e) => setFormData({ ...formData, checkIn: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                </div>

                {/* Expected Discharge */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Expected Discharge Date</label>
                  <input
                    type="date" value={formData.expectedDischarge}
                    onChange={(e) => setFormData({ ...formData, expectedDischarge: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-slate-200 pt-4 md:col-span-2">
                  <YesNoField
                    label="IP Case Management?"
                    value={formData.ipCaseManagement === 1 ? 'Yes' : 'No'}
                    onChange={(v) =>
                      setFormData((prev) => ({ ...prev, ipCaseManagement: v === 'Yes' ? 1 : 0 }))
                    }
                  />
                  <YesNoField
                    label="IP Case Management Fee?"
                    value={formData.ipCaseManagementFee === 1 ? 'Yes' : 'No'}
                    onChange={(v) =>
                      setFormData((prev) => ({ ...prev, ipCaseManagementFee: v === 'Yes' ? 1 : 0 }))
                    }
                  />
                </div>

                {salesOrderCreated && (
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800">
                    <p className="font-medium">Quotation drafted for approval.</p>
                    <p className="text-xs mt-1">Quotation: {salesOrderCreated}</p>
                  </div>
                )}
              </>
            )}

            {/* ── TAB: DOCUMENTS ── */}
            {activeTab === 'documents' && (
              <div>
                <p className="text-sm text-slate-500 mb-4">
                  Attach admission documents or capture digital signatures. Upload a file <em>or</em> draw a signature directly on-screen.
                </p>
                <div className="space-y-4">
                  {documents.length === 0 && (
                    <div className="text-center py-10 rounded-lg border-2 border-dashed border-slate-200 text-slate-400 text-sm">
                      No documents added yet. Click below to add one.
                    </div>
                  )}

                  {documents.map((row, idx) => (
                    <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50/50 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-white">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          Document #{idx + 1}
                        </span>
                        <button type="button" onClick={() => removeDocumentRow(idx)}
                          className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Remove">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
                        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-0.5">File Name</label>
                            <input value={row.file_name} onChange={(e) => updateDocumentRow(idx, 'file_name', e.target.value)}
                              placeholder="File name"
                              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-0.5">Document Type</label>
                            <DocumentTypeSelect
                              value={row.document_type || ''}
                              onChange={(v) => updateDocumentRow(idx, 'document_type', v)}
                              types={documentTypes}
                              onTypesUpdated={setDocumentTypes}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-0.5">Transaction No</label>
                            <input value={row.transaction_no || ''} onChange={(e) => updateDocumentRow(idx, 'transaction_no', e.target.value)}
                              placeholder="Transaction number"
                              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-0.5">Upload Remarks</label>
                            <input value={row.upload_remarks || ''} onChange={(e) => updateDocumentRow(idx, 'upload_remarks', e.target.value)}
                              placeholder="Remarks"
                              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-slate-600 mb-0.5">
                              File Attachment
                              <span className="ml-1 font-normal text-slate-400">(photo, PDF, etc.)</span>
                            </label>
                            <input type="file" disabled={documentUploading === idx}
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocumentFile(idx, f); e.target.value = '' }}
                              className="w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-white file:text-sm" />
                            {documentUploading === idx && (
                              <span className="text-xs text-slate-500 mt-0.5 block">Uploading...</span>
                            )}
                            {row.document && documentUploading !== idx && signatureUploading !== idx && (
                              <span className="text-xs text-green-600 mt-0.5 block truncate" title={row.document}>
                                ✓ File attached
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="p-4 flex flex-col gap-2">
                          <div className="flex items-center gap-1.5 mb-1">
                            <PenLine className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-xs font-medium text-slate-600">Digital Signature</span>
                            <span className="text-xs text-slate-400 ml-1">— draw &amp; save as file</span>
                          </div>
                          <div className="flex-1">
                            <SignaturePad
                              onSave={(file) => handleSignatureFile(idx, file)}
                              existingUrl={row.document?.includes('signature_') ? row.document : undefined}
                              uploading={signatureUploading === idx}
                            />
                          </div>
                          {signatureUploading === idx && (
                            <p className="text-xs text-slate-500 text-center">Uploading signature...</p>
                          )}
                          <p className="text-xs text-slate-400 leading-relaxed">
                            Draw above, then tap <strong>Save Signature</strong> — stored as a PNG attached to this row.
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button type="button" onClick={addDocumentRow}
                    className="flex items-center gap-1.5 text-sm text-primary font-medium hover:underline">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add document
                  </button>
                </div>
              </div>
            )}

            {/* ── TAB: RELATIVES ── */}
            {activeTab === 'relatives' && (
              <div>
                <p className="text-sm text-slate-500 mb-4">
                  Add relatives / guardians who are responsible for the patient during this admission.
                </p>
                <div className="border border-slate-200 rounded-md">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-slate-50">
                    <h3 className="text-sm font-semibold text-slate-800">Relatives / Guardians</h3>
                    <button
                      type="button"
                      className="text-xs px-2 py-1 rounded-full bg-primary text-white hover:bg-primary/90"
                      onClick={() =>
                        setRelatives(prev => [
                          ...prev,
                          { relative_relation: '', relative_name: '', relative_id_num: '', relative_phone_no: '', relative_alternative_phone_no: '', relative_alternative_phone_no_2: '', any_remarks: '' },
                        ])
                      }
                    >
                      + Add Relative
                    </button>
                  </div>
                  <div className="divide-y divide-slate-200">
                    {relatives.map((row, idx) => (
                      <div key={idx} className="px-3 py-3 space-y-2">
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Relation</label>
                            <select
                              value={row.relative_relation}
                              onChange={(e) => {
                                const value = e.target.value
                                setRelatives(prev => prev.map((r, i) => i === idx ? { ...r, relative_relation: value } : r))
                              }}
                              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                              <option value="">Select relation</option>
                              {RELATION_OPTIONS.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Name</label>
                            <input
                              type="text"
                              value={row.relative_name}
                              onChange={(e) => {
                                const value = e.target.value
                                setRelatives(prev => prev.map((r, i) => i === idx ? { ...r, relative_name: value } : r))
                              }}
                              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                              placeholder="Relative full name"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">ID Number</label>
                            <input
                              type="text"
                              value={row.relative_id_num}
                              onChange={(e) => {
                                const value = e.target.value
                                setRelatives(prev => prev.map((r, i) => i === idx ? { ...r, relative_id_num: value } : r))
                              }}
                              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                              placeholder="CPR / ID"
                            />
                          </div>
                        </div>

                          <div className="grid grid-cols-3 gap-3">
                         <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Phone No
                          </label>
                          <input
                            type="text"
                            value={row.relative_phone_no}
                            onChange={(e) => {
                              const value = e.target.value
                              setRelatives(prev => prev.map((r, i) =>
                                i === idx ? { ...r, relative_phone_no: value } : r
                              ))
                            }}
                            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Phone NO"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Alternative Phone No
                          </label>
                          <input
                            type="text"
                            value={row.relative_alternative_phone_no}
                            onChange={(e) => {
                              const value = e.target.value
                              setRelatives(prev => prev.map((r, i) =>
                                i === idx ? { ...r, relative_alternative_phone_no: value } : r
                              ))
                            }}
                            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="CPR / ID"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Alternative Phone No 2
                          </label>
                          <input
                            type="text"
                            value={row.relative_alternative_phone_no_2}
                            onChange={(e) => {
                              const value = e.target.value
                              setRelatives(prev => prev.map((r, i) =>
                                i === idx ? { ...r, relative_alternative_phone_no_2: value } : r
                              ))
                            }}
                            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="CPR / ID"
                          />
                        </div>
                      </div>

                        <div className="flex items-start gap-2">
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-slate-700 mb-1">Remarks</label>
                            <textarea
                              value={row.any_remarks}
                              onChange={(e) => {
                                const value = e.target.value
                                setRelatives(prev => prev.map((r, i) => i === idx ? { ...r, any_remarks: value } : r))
                              }}
                              rows={2}
                              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                              placeholder="Any notes about this relative / guardian"
                            />
                          </div>
                          {relatives.length > 1 && (
                            <button
                              type="button"
                              className="mt-5 text-xs text-red-600 hover:text-red-700"
                              onClick={() => setRelatives(prev => prev.filter((_, i) => i !== idx))}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
                {error.message}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-slate-200 px-6 py-4 flex justify-between items-center bg-white">
            {activeTab === 'admission' && !existingQuotation && !salesOrderCreated && (
              <button
                type="button"
                onClick={handleCreateSalesOrder}
                disabled={creatingSalesOrder || checkingQuotation || !calculatedPrice || calculatedPrice <= 0}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingSalesOrder ? 'Creating Quotation...' : checkingQuotation ? 'Checking...' : 'Create Quotation'}
              </button>
            )}

            <div className="flex gap-3 ml-auto">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50">
                {submitting ? 'Admitting...' : 'Admit Patient'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}