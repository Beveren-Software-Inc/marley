import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { fetchInpatientRecord, fetchServiceUnits, fetchBedNumbers, admitPatient, calculatePackagePrice, type ServiceUnit, type BedNoRecord, type InpatientPackage, createAdmissionQuotation, checkAdmissionQuotation, fetchCaseManagementTemplates, fetchAdmissionBillingSettings } from '../../services/inpatientRecords'
import { uploadPatientFile, type PatientDocumentRow } from '../../services/patients'
import { fetchDocumentTypes, fetchServiceUnitTypes, createDocumentType, type LinkFieldOption } from '../../services/common'
import { DocumentTypeSelect } from '../ui/DocumentTypeSelect'
import { SignaturePad, attachFileDisplayUrl } from '../ui/SignaturePad'
import { toast } from '../../hooks/useToast'
import { PenLine, X, BedDouble, Check } from 'lucide-react'
import { toDatetimeLocalValue } from '../../utils/datetimeLocal'

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
  disabled?: boolean
  disabledPlaceholder?: string
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
  disabled = false,
  disabledPlaceholder = 'Select a room type first…',
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
        Room <span className="text-slate-400 font-normal">(optional)</span>
      </label>

      {/* Search input */}
      <div className="relative">
        <BedDouble className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => { onQueryChange(e.target.value); onOpenChange(true) }}
          onFocus={() => !disabled && onOpenChange(true)}
          disabled={disabled}
          placeholder={disabled ? disabledPlaceholder : 'Search rooms…'}
          className="w-full rounded-md border border-slate-300 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
        />
        {selectedServiceUnits.length > 0 && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold">
            {selectedServiceUnits.length}
          </span>
        )}
      </div>

      {/* Dropdown */}
      {!disabled && open && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-52 overflow-auto">
          {serviceUnits.length === 0 ? (
            <div className="px-3 py-3 text-xs text-slate-400 text-center">
              {query ? 'No rooms match your search' : 'No vacant rooms found'}
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
                      <div className="font-medium truncate">
                        {unit.healthcare_service_unit_name || unit.name}
                      </div>
                      {unit.service_unit_type ? (
                        <div className="text-xs text-slate-500 truncate">
                          {unit.service_unit_type}
                          {unit.occupancy_status ? ` · ${unit.occupancy_status}` : ''}
                          {unit.room_multiplier != null ? ` · ×${unit.room_multiplier}` : ''}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 truncate">
                          {unit.occupancy_status || 'No room type'}
                        </div>
                      )}
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

type Tab = 'admission' | 'case_management' | 'documents' | 'signatures' | 'relatives'

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

/** Patient relation on e-signature rows (Patient Upload Document.patient_relation) */
const SIGNATURE_RELATION_OPTIONS = [
  'Self',
  'Father',
  'Mother',
  'Spouse',
  'Siblings',
  'Family',
  'Guardian',
  'Other',
] as const

const DEFAULT_SIGNATURE_DOC_TYPE = 'Signature'

function resolveSignatureDocumentType(
  types: { name: string; document_name?: string }[],
): string {
  // Prefer exact "Signature" — never pick "Legacy Signature" (old-system imports).
  const exact = types.find((t) => {
    const name = (t.name || '').trim().toLowerCase()
    const label = (t.document_name || '').trim().toLowerCase()
    return name === 'signature' || label === 'signature'
  })
  return exact?.name || DEFAULT_SIGNATURE_DOC_TYPE
}

export const AdmissionFormModal = ({
  admissionNo,
  selectedPackage,
  onComplete,
  onClose
}: AdmissionFormModalProps) => {
  const [activeTab, setActiveTab] = useState<Tab>('admission')
  const [record, setRecord] = useState<any>(null)
  const [roomTypes, setRoomTypes] = useState<LinkFieldOption[]>([])
  const [roomTypeQuery, setRoomTypeQuery] = useState('')
  const [roomTypeOpen, setRoomTypeOpen] = useState(false)
  const [selectedRoomType, setSelectedRoomType] = useState<LinkFieldOption | null>(null)
  const roomTypePickerRef = useRef<HTMLDivElement>(null)
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
  const [daysInput, setDaysInput] = useState<string>(() =>
    selectedPackage.name !== '__custom__' && selectedPackage.no_of_days > 0
      ? String(selectedPackage.no_of_days)
      : ''
  )
  const [days, setDays] = useState<number>(() =>
    selectedPackage.name !== '__custom__' && selectedPackage.no_of_days > 0
      ? selectedPackage.no_of_days
      : 0
  )
  const [calculatedPrice, setCalculatedPrice] = useState<number | null>(null)
  const [priceBreakdown, setPriceBreakdown] = useState<{
    program_price?: number
    room_multiplier?: number
    service_unit_type?: string | null
  } | null>(null)
  const [discountPercentInput, setDiscountPercentInput] = useState<string>('0')
  const [calculatingPrice, setCalculatingPrice] = useState(false)
  const [creatingSalesOrder, setCreatingSalesOrder] = useState(false)
  const [salesOrderCreated, setSalesOrderCreated] = useState<string | null>(null)
  const [existingQuotation, setExistingQuotation] = useState<string | null>(null)
  const [checkingQuotation, setCheckingQuotation] = useState(false)

  // Documents + signatures (separate tabs; both saved to e_signatures)
  const [documents, setDocuments] = useState<PatientDocumentRow[]>([])
  const [signatures, setSignatures] = useState<PatientDocumentRow[]>([])
  const [documentTypes, setDocumentTypes] = useState<{ name: string; document_name?: string }[]>([])
  const [documentUploading, setDocumentUploading] = useState<number | null>(null)
  const [signatureUploading, setSignatureUploading] = useState<number | null>(null)
  const signatureDocType = useMemo(
    () => resolveSignatureDocumentType(documentTypes),
    [documentTypes],
  )

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

  const activeRoomType =
    selectedRoomType?.name || selectedServiceUnits[0]?.service_unit_type || null
  const activeRoomMultiplier =
    selectedRoomType?.room_multiplier ??
    selectedServiceUnits[0]?.room_multiplier ??
    1

  const packageProgramDays = useMemo(() => {
    if (selectedPackage.name === '__custom__') return 0
    return Number(selectedPackage.no_of_days) || 0
  }, [selectedPackage.name, selectedPackage.no_of_days])

  const calculateExpectedDischarge = useCallback((numDays: number, checkInValue?: string) => {
    if (numDays <= 0) return ''
    const base = checkInValue ? new Date(checkInValue) : new Date()
    if (Number.isNaN(base.getTime())) return ''
    const expectedDate = new Date(base)
    expectedDate.setDate(expectedDate.getDate() + numDays - 1)
    // Local YYYY-MM-DD (avoid UTC off-by-one)
    const y = expectedDate.getFullYear()
    const m = String(expectedDate.getMonth() + 1).padStart(2, '0')
    const d = String(expectedDate.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }, [])

  const [formData, setFormData] = useState({
    serviceUnit: '',           // primary bed name
    checkIn: toDatetimeLocalValue(),
    expectedDischarge: '' as string,
    ipCaseManagement: 0 as 0 | 1,
  })
  const [caseManagementTemplates, setCaseManagementTemplates] = useState<
    Array<{ name: string; service_name?: string; item_code?: string; rate: number }>
  >([])
  const [caseManagementServices, setCaseManagementServices] = useState<
    Array<{ template: string; amount: number; label: string; code: string }>
  >([])
  const [serviceDropdownOpen, setServiceDropdownOpen] = useState(false)
  const serviceDropdownRef = useRef<HTMLDivElement>(null)
  const [combineAdmissionAndCaseManagement, setCombineAdmissionAndCaseManagement] = useState(0)

  const caseManagementTotal = useMemo(
    () => caseManagementServices.reduce((sum, s) => sum + (Number(s.amount) || 0), 0),
    [caseManagementServices]
  )

  const availableCaseManagementTemplates = useMemo(
    () =>
      caseManagementTemplates.filter(
        (t) => !caseManagementServices.some((s) => s.template === t.name)
      ),
    [caseManagementTemplates, caseManagementServices]
  )

  const addCaseManagementService = (t: {
    name: string
    service_name?: string
    item_code?: string
    rate: number
  }) => {
    setCaseManagementServices((prev) => {
      if (prev.some((s) => s.template === t.name)) return prev
      return [
        ...prev,
        {
          template: t.name,
          amount: Number(t.rate) || 0,
          label: t.service_name || t.name,
          code: t.item_code || t.name,
        },
      ]
    })
    setServiceDropdownOpen(false)
  }

  const removeCaseManagementService = (template: string) => {
    setCaseManagementServices((prev) => prev.filter((s) => s.template !== template))
  }

  const updateCaseManagementServiceAmount = (template: string, amount: number) => {
    setCaseManagementServices((prev) =>
      prev.map((s) => (s.template === template ? { ...s, amount } : s))
    )
  }

  useEffect(() => {
    if (!serviceDropdownOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (serviceDropdownRef.current && !serviceDropdownRef.current.contains(e.target as Node)) {
        setServiceDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [serviceDropdownOpen])

  // Admit defaults must come from the package program days — never the
  // admission's scheduled expected_length_of_stay / expected_discharge.
  useEffect(() => {
    if (packageProgramDays <= 0) return
    setDaysInput(String(packageProgramDays))
    setDays(packageProgramDays)
    setFormData((prev) => ({
      ...prev,
      expectedDischarge: calculateExpectedDischarge(packageProgramDays, prev.checkIn),
    }))
  }, [packageProgramDays, calculateExpectedDischarge])

  // ── Days → price ──────────────────────────────────────────────────────────

  useEffect(() => {
    const numValue = parseInt(daysInput, 10) || 0
    if (numValue > 0 && numValue !== days) setDays(numValue)
    else if (daysInput === '' || numValue === 0) setDays(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typed days input
  }, [daysInput])

  // Keep expected discharge in sync with days + check-in (package/user days)
  useEffect(() => {
    if (days <= 0) return
    setFormData((prev) => {
      const next = calculateExpectedDischarge(days, prev.checkIn)
      if (prev.expectedDischarge === next) return prev
      return { ...prev, expectedDischarge: next }
    })
  }, [days, formData.checkIn, calculateExpectedDischarge])

  useEffect(() => {
    const calculatePrice = async () => {
      if (days > 0 && selectedPackage.name) {
        // For custom packages, compute directly from the entered rate × room multiplier
        if (selectedPackage.name === '__custom__') {
          // Quotation rate comes from package/custom rate only; room type picks Item
          const programPrice = selectedPackage.package_rate * days
          setCalculatedPrice(programPrice)
          setPriceBreakdown({
            program_price: programPrice,
            room_multiplier: activeRoomMultiplier || 1,
            service_unit_type: activeRoomType,
          })
          return
        }
        try {
          setCalculatingPrice(true)
          const result = await calculatePackagePrice(selectedPackage.name, days, {
            serviceUnitType: activeRoomType || undefined,
            serviceUnit: selectedServiceUnits[0]?.name,
            roomMultiplier: activeRoomMultiplier,
          })
          // Use program (package) price for quotation — not room-multiplied total
          const programPrice = result.program_price ?? result.total_price
          setCalculatedPrice(programPrice)
          setPriceBreakdown({
            program_price: programPrice,
            room_multiplier: result.room_multiplier ?? activeRoomMultiplier,
            service_unit_type: result.service_unit_type || activeRoomType,
          })
        } catch (err) {
          console.error('Failed to calculate price:', err)
          setCalculatedPrice(null)
          setPriceBreakdown(null)
        } finally {
          setCalculatingPrice(false)
        }
      } else {
        setCalculatedPrice(null)
        setPriceBreakdown(null)
      }
    }
    calculatePrice()
  }, [days, selectedPackage.name, selectedPackage.package_rate, activeRoomType, activeRoomMultiplier, selectedServiceUnits])

  // ── Service unit search (any room type; cost center optional on room) ─────

  useEffect(() => {
    if (!serviceUnitOpen) return
    const search = async () => {
      try {
        // Do not filter by room type — user can pick any vacant room.
        // Backend still includes rooms with blank cost center for any branch.
        const results = await fetchServiceUnits(
          undefined,
          'Vacant',
          serviceUnitQuery || undefined,
          undefined,
          record?.cost_center || undefined,
        )
        setServiceUnits(results)
      } catch (err) {
        console.error('Failed to search service units:', err)
        setServiceUnits([])
      }
    }
    const timeoutId = setTimeout(() => { search() }, serviceUnitQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(timeoutId)
  }, [serviceUnitQuery, serviceUnitOpen, record?.cost_center])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (roomTypePickerRef.current && !roomTypePickerRef.current.contains(e.target as Node)) {
        setRoomTypeOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Room type only drives pricing multiplier — never clears or filters selected rooms.
  useEffect(() => {
    if (!selectedRoomType?.name) return
    setServiceUnitQuery('')
  }, [selectedRoomType?.name])

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

        const [recordData, fetchedDocTypes, cmTemplates, billingSettings] = await Promise.all([
          fetchInpatientRecord(admissionNo),
          fetchDocumentTypes(),
          fetchCaseManagementTemplates(),
          fetchAdmissionBillingSettings(),
        ])

        setRecord(recordData)
        let docTypes = fetchedDocTypes
        const hasSignatureType = docTypes.some((t) => {
          const name = (t.name || '').trim().toLowerCase()
          const label = (t.document_name || '').trim().toLowerCase()
          return name === 'signature' || label === 'signature'
        })
        if (!hasSignatureType) {
          try {
            const created = await createDocumentType(DEFAULT_SIGNATURE_DOC_TYPE)
            docTypes = [...docTypes, created]
          } catch {
            // Document Type may already exist under another name; form still works
          }
        }
        setDocumentTypes(docTypes)

        const sigType = resolveSignatureDocumentType(docTypes)
        setSignatures([
          {
            patient_relation: '',
            signee_name: '',
            document_type: sigType,
            upload_remarks: '',
            document: '',
          },
        ])
        setCaseManagementTemplates(cmTemplates)
        setCombineAdmissionAndCaseManagement(
          Number(billingSettings.combine_admission_fee_and_case_management || 0)
        )

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

        // Do NOT seed days / expected discharge from admission.expected_length_of_stay
        // or admission.expected_discharge — package program days own those defaults.

        const [unitsData, roomTypeOptions] = await Promise.all([
          fetchServiceUnits(
            undefined,
            'Vacant',
            undefined,
            undefined,
            recordData?.cost_center || undefined,
          ),
          fetchServiceUnitTypes(),
        ])
        setServiceUnits(unitsData)
        setRoomTypes(roomTypeOptions)
        setBedNumbers([])
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load data'))
      } finally {
        setLoading(false)
        // After async load, force package days once more so nothing from schedule stays behind
        if (packageProgramDays > 0) {
          setDays(packageProgramDays)
          setDaysInput(String(packageProgramDays))
          setFormData((prev) => ({
            ...prev,
            expectedDischarge: calculateExpectedDischarge(packageProgramDays, prev.checkIn),
          }))
        }
      }
    }
    loadData()
  }, [admissionNo, packageProgramDays, calculateExpectedDischarge])

  // Keep room type list searchable
  useEffect(() => {
    if (!roomTypeOpen) return
    const search = async () => {
      try {
        const results = await fetchServiceUnitTypes(roomTypeQuery || undefined)
        setRoomTypes(results)
      } catch (err) {
        console.error('Failed to search room types:', err)
        setRoomTypes([])
      }
    }
    const timeoutId = setTimeout(() => { search() }, roomTypeQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(timeoutId)
  }, [roomTypeQuery, roomTypeOpen])

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

  // ── Document / signature helpers ──────────────────────────────────────────

  const addDocumentRow = () =>
    setDocuments((prev) => [
      ...prev,
      { file_name: '', document_type: '', transaction_no: '', upload_remarks: '' },
    ])
  const removeDocumentRow = (idx: number) =>
    setDocuments((prev) => prev.filter((_, i) => i !== idx))
  const updateDocumentRow = (idx: number, field: keyof PatientDocumentRow, value: string) => {
    setDocuments((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  const addSignatureRow = () =>
    setSignatures((prev) => [
      ...prev,
      {
        patient_relation: '',
        signee_name: '',
        document_type: signatureDocType,
        upload_remarks: '',
        document: '',
      },
    ])
  const removeSignatureRow = (idx: number) =>
    setSignatures((prev) => prev.filter((_, i) => i !== idx))
  const updateSignatureRow = (idx: number, field: keyof PatientDocumentRow, value: string) => {
    setSignatures((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  const handleDocumentFile = async (idx: number, file: File | null) => {
    if (!file) return
    setDocumentUploading(idx)
    try {
      const file_url = await uploadPatientFile(file)
      if (!file_url) throw new Error('No URL returned from upload')
      setDocuments((prev) => {
        const next = [...prev]
        next[idx] = {
          ...next[idx],
          document: file_url,
          file_name: next[idx].file_name?.trim() || file.name,
        }
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
      setSignatures((prev) => {
        const next = [...prev]
        next[idx] = {
          ...next[idx],
          document: file_url,
          document_type: next[idx].document_type || signatureDocType,
        }
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
    if (!selectedRoomType?.name) {
      setError(new Error('Room Type is required'))
      setActiveTab('admission')
      return
    }
    if (formData.ipCaseManagement === 1 && caseManagementServices.length === 0) {
      setError(new Error('Select at least one Admission Assessment Fee service on the Admission Assessment Fee tab'))
      setActiveTab('case_management')
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
        quotationSu,
        formData.ipCaseManagement === 1 && combineAdmissionAndCaseManagement
          ? {
              services: caseManagementServices.map((s) => ({
                template: s.template,
                amount: s.amount,
              })),
              template: caseManagementServices[0]?.template,
              amount: caseManagementTotal,
            }
          : undefined
      )
      const quotationName = (result as any).quotation_name || (result as any).sales_order_name || null
      if (quotationName) {
        setSalesOrderCreated(quotationName)
        setExistingQuotation(quotationName)
      }
      const includedCm = Boolean((result as any).case_management_included)
      toast.success(
        includedCm
          ? 'Quotation drafted (admission + assessment fee)'
          : 'Quotation drafted for approval',
        4000
      )
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to create Quotation'))
    } finally {
      setCreatingSalesOrder(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!salesOrderCreated && !existingQuotation) {
      setError(new Error('Create a quotation first before admitting the patient'))
      setActiveTab('admission')
      return
    }

    if (days <= 0) {
      setError(new Error('Number of days must be greater than 0'))
      return
    }

    if (!selectedRoomType?.name) {
      setError(new Error('Room Type is required'))
      setActiveTab('admission')
      return
    }

    if (formData.ipCaseManagement === 1 && caseManagementServices.length === 0) {
      setError(new Error('Select at least one Admission Assessment Fee service'))
      setActiveTab('case_management')
      return
    }

    const incompleteSignature = signatures.find(
      (r) =>
        !(r.patient_relation || '').trim() ||
        !(r.signee_name || '').trim() ||
        !(r.document || '').trim(),
    )
    if (signatures.length === 0 || incompleteSignature) {
      setError(
        new Error(
          'At least one signature is required with Patient Relation, Signee Name, and a drawn or uploaded signature',
        ),
      )
      setActiveTab('signatures')
      return
    }

    try {
      setSubmitting(true)
      setError(null)

      const documentRows = documents
        .filter((r) => (r.file_name || '').trim() || (r.document || '').trim())
        .map((r) => ({
          file_name: (r.file_name || '').trim() || undefined,
          document_type: (r.document_type || '').trim() || undefined,
          transaction_no: (r.transaction_no || '').trim() || undefined,
          upload_remarks: (r.upload_remarks || '').trim() || undefined,
          document: (r.document || '').trim() || undefined,
        }))

      const signatureRows = signatures.map((r) => ({
        patient_relation: (r.patient_relation || '').trim() || undefined,
        signee_name: (r.signee_name || '').trim() || undefined,
        document_type: (r.document_type || signatureDocType).trim() || DEFAULT_SIGNATURE_DOC_TYPE,
        upload_remarks: (r.upload_remarks || '').trim() || undefined,
        document: (r.document || '').trim() || undefined,
        file_name: (r.signee_name || '').trim() || undefined,
      }))

      const patientDocuments = [...documentRows, ...signatureRows]

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

      const wantCm = formData.ipCaseManagement === 1
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
        selectedBedNo?.name ?? null,
        wantCm ? 1 : 0,
        wantCm ? 1 : 0,
        wantCm ? caseManagementServices[0]?.template ?? null : null,
        wantCm ? caseManagementTotal : null,
        wantCm
          ? caseManagementServices.map((s) => ({ template: s.template, amount: s.amount }))
          : null,
        selectedRoomType.name,
      )

      onComplete()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to admit patient'
      setError(new Error(message))
      if (/phone/i.test(message)) {
        setActiveTab('relatives')
      }
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
    { id: 'case_management', label: 'Admission Assessment Fee' },
    { id: 'documents', label: 'Documents', badge: documents.length || undefined },
    { id: 'signatures', label: 'Signatures', badge: signatures.length || undefined },
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
                  <div className="mb-2 flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-slate-900">{selectedPackage.package_name}</p>
                    {selectedPackage.name === '__custom__' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Custom</span>
                    )}
                    {selectedPackage.is_daily_default ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-700">Daily default</span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                    <div>
                      <span className="text-slate-600">Base Rate:</span>{' '}
                      <span className="font-medium">{selectedPackage.package_rate.toLocaleString()} BHD / day</span>
                    </div>
                    {selectedPackage.base_total != null && selectedPackage.base_total > 0 && (
                      <div>
                        <span className="text-slate-600">Base Total (Triple Sharing):</span>{' '}
                        <span className="font-medium">{selectedPackage.base_total.toLocaleString()} BHD</span>
                      </div>
                    )}
                    {selectedPackage.no_of_days > 0 && (
                      <div>
                        <span className="text-slate-600">Program Days:</span>{' '}
                        <span className="font-medium">{selectedPackage.no_of_days}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">Final Price = Program Price × Room Multiplier (from Service Unit Type)</p>
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
                    {selectedPackage.name !== '__custom__' && selectedPackage.no_of_days > 0 && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        Program default: {selectedPackage.no_of_days} day{selectedPackage.no_of_days === 1 ? '' : 's'}
                      </p>
                    )}
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

                {/* Room Type + Room */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div ref={roomTypePickerRef} className="relative">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Room Type <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={selectedRoomType ? (selectedRoomType.label || selectedRoomType.name) : roomTypeQuery}
                      onChange={(e) => {
                        setSelectedRoomType(null)
                        setRoomTypeQuery(e.target.value)
                        setRoomTypeOpen(true)
                      }}
                      onFocus={() => setRoomTypeOpen(true)}
                      placeholder="Select room type…"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {selectedRoomType?.room_multiplier != null && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        Multiplier × {selectedRoomType.room_multiplier}
                      </p>
                    )}
                    {roomTypeOpen && (
                      <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-52 overflow-auto">
                        {roomTypes.length === 0 ? (
                          <div className="px-3 py-3 text-xs text-slate-400 text-center">
                            {roomTypeQuery ? 'No room types match' : 'No room types found'}
                          </div>
                        ) : (
                          roomTypes.map((rt) => (
                            <button
                              key={rt.name}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedRoomType(rt)
                                setRoomTypeQuery('')
                                setRoomTypeOpen(false)
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                            >
                              <div className="font-medium">{rt.label || rt.name}</div>
                              <div className="text-xs text-slate-500">
                                Multiplier × {rt.room_multiplier ?? 1}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

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
                    disabled={false}
                    disabledPlaceholder="Search rooms…"
                  />
                </div>

                {/* Bed No */}
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
                    {priceBreakdown && (
                      <p className="text-xs text-green-800 mt-1">
                        Package rate (quotation): {priceBreakdown.program_price?.toLocaleString() ?? '—'} BD
                        {priceBreakdown.service_unit_type
                          ? ` · Room type ${priceBreakdown.service_unit_type} (item only)`
                          : ''}
                        {priceBreakdown.room_multiplier != null && priceBreakdown.room_multiplier !== 1
                          ? ` · room ×${priceBreakdown.room_multiplier} not applied to rate`
                          : ''}
                      </p>
                    )}
                    {discountPercent > 0 && (
                      <p className="text-xs text-green-800 mt-1">
                        Discount {discountPercent}% applied (original {calculatedPrice.toLocaleString()} BHD)
                      </p>
                    )}
                    <p className="text-xs text-green-700 mt-1">For {days} {days === 1 ? 'day' : 'days'} (rate = package / day)</p>
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

                {salesOrderCreated && (
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800">
                    <p className="font-medium">Quotation drafted for approval.</p>
                    <p className="text-xs mt-1">Quotation: {salesOrderCreated}</p>
                  </div>
                )}
              </>
            )}

            {/* ── TAB: ADMISSION ASSESSMENT FEE ── */}
            {activeTab === 'case_management' && (
              <div className="space-y-5">
                <YesNoField
                  label="Admission Assessment Fee?"
                  value={formData.ipCaseManagement === 1 ? 'Yes' : 'No'}
                  onChange={(v) => {
                    const enabled = v === 'Yes'
                    setFormData((prev) => ({ ...prev, ipCaseManagement: enabled ? 1 : 0 }))
                    if (!enabled) {
                      setCaseManagementServices([])
                    }
                  }}
                />

                {formData.ipCaseManagement === 1 && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Services <span className="text-red-500">*</span>
                      </label>
                      {caseManagementServices.length > 0 && (
                        <div className="mb-2 space-y-2">
                          {caseManagementServices.map((s) => (
                            <div
                              key={s.template}
                              className="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-slate-900 truncate">{s.code}</div>
                                <div className="text-xs text-slate-500 truncate">{s.label}</div>
                                <div className="mt-2 flex items-center gap-2">
                                  <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500 shrink-0">
                                    Amount
                                  </label>
                                  <div className="relative flex-1 max-w-[10rem]">
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.001"
                                      value={Number.isFinite(s.amount) ? s.amount : ''}
                                      onChange={(e) => {
                                        const raw = e.target.value
                                        updateCaseManagementServiceAmount(
                                          s.template,
                                          raw === '' ? 0 : Math.max(0, parseFloat(raw) || 0)
                                        )
                                      }}
                                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
                                      BHD
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeCaseManagementService(s.template)}
                                className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                title="Remove service"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div ref={serviceDropdownRef} className="relative">
                        <button
                          type="button"
                          onClick={() => setServiceDropdownOpen((o) => !o)}
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <span className="text-slate-500">
                            {caseManagementServices.length > 0
                              ? 'Add another service…'
                              : 'Select service…'}
                          </span>
                        </button>
                        {serviceDropdownOpen && (
                          <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                            {availableCaseManagementTemplates.length === 0 ? (
                              <div className="px-3 py-2 text-xs text-amber-700">
                                {caseManagementTemplates.length === 0
                                  ? 'No templates found. Mark a Healthcare Service Template with “Is Case Management”.'
                                  : 'All available services are already selected.'}
                              </div>
                            ) : (
                              availableCaseManagementTemplates.map((t) => {
                                const code = t.item_code || t.name
                                const label = t.service_name || t.name
                                return (
                                  <button
                                    key={t.name}
                                    type="button"
                                    onClick={() => addCaseManagementService(t)}
                                    className="w-full px-3 py-2 text-left hover:bg-emerald-50"
                                  >
                                    <span className="block text-sm font-medium text-slate-900 truncate">
                                      {code}
                                    </span>
                                    <span className="block text-xs text-slate-500 truncate">
                                      {label}
                                      {t.rate != null
                                        ? ` · ${Number(t.rate).toLocaleString()} BHD`
                                        : ''}
                                    </span>
                                  </button>
                                )
                              })
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Total Amount (IP)
                      </label>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                        {caseManagementServices.length > 0
                          ? `${Number(caseManagementTotal).toLocaleString()} BHD`
                          : '—'}
                      </div>
                    </div>
                  </>
                )}

                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
                  {combineAdmissionAndCaseManagement ? (
                    <p>
                      Healthcare Settings: <strong>Combine Admission Fee and Admission Assessment Fee</strong> is on.
                      Create Quotation will include the assessment fee on the same quotation. On admit, a Service Request is created (no separate Sales Order).
                    </p>
                  ) : (
                    <p>
                      Healthcare Settings: combine is off. Create Quotation is admission/package only.
                      On admit, Admission Assessment Fee creates a Service Request that is billed with its own Sales Order.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── TAB: DOCUMENTS ── */}
            {activeTab === 'documents' && (
              <div>
                <p className="text-sm text-slate-500 mb-4">
                  Attach admission documents (photo, PDF, etc.). Use the Signatures tab for digital signing.
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
                          {row.document && documentUploading !== idx && (
                            <span className="text-xs text-green-600 mt-0.5 block truncate" title={row.document}>
                              ✓ File attached
                            </span>
                          )}
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

            {/* ── TAB: SIGNATURES ── */}
            {activeTab === 'signatures' && (
              <div>
                <p className="text-sm text-slate-500 mb-4">
                  Capture admission e-signatures (draw on screen or upload an image from phone / files).
                  Patient Relation and Signee Name are required for each signature.
                </p>
                <div className="space-y-4">
                  {signatures.length === 0 && (
                    <div className="text-center py-10 rounded-lg border-2 border-dashed border-slate-200 text-slate-400 text-sm">
                      No signatures yet. Click below to add one.
                    </div>
                  )}

                  {signatures.map((row, idx) => (
                    <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50/50 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-white">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          Signature #{idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeSignatureRow(idx)}
                          className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Remove"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
                        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-0.5">
                              Patient Relation <span className="text-red-500">*</span>
                            </label>
                            <select
                              value={row.patient_relation || ''}
                              onChange={(e) => updateSignatureRow(idx, 'patient_relation', e.target.value)}
                              required
                              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                            >
                              <option value="">Select relation</option>
                              {SIGNATURE_RELATION_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-0.5">
                              Signee Name <span className="text-red-500">*</span>
                            </label>
                            <input
                              value={row.signee_name || ''}
                              onChange={(e) => updateSignatureRow(idx, 'signee_name', e.target.value)}
                              placeholder="Full name of person signing"
                              required
                              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-0.5">Document Type</label>
                            <DocumentTypeSelect
                              value={row.document_type || signatureDocType}
                              onChange={(v) => updateSignatureRow(idx, 'document_type', v)}
                              types={documentTypes}
                              onTypesUpdated={setDocumentTypes}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-0.5">Upload Remarks</label>
                            <input
                              value={row.upload_remarks || ''}
                              onChange={(e) => updateSignatureRow(idx, 'upload_remarks', e.target.value)}
                              placeholder="Remarks"
                              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                          </div>
                        </div>

                        <div className="p-4 flex flex-col gap-2">
                          <div className="flex items-center gap-1.5 mb-1">
                            <PenLine className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-xs font-medium text-slate-600">
                              Signature <span className="text-red-500">*</span>
                            </span>
                          </div>
                          <div className="flex-1">
                            <SignaturePad
                              onSave={(file) => handleSignatureFile(idx, file)}
                              onClear={() => updateSignatureRow(idx, 'document', '')}
                              existingUrl={attachFileDisplayUrl(row.document)}
                              uploading={signatureUploading === idx}
                            />
                          </div>
                          {signatureUploading === idx && (
                            <p className="text-xs text-slate-500 text-center">Uploading signature...</p>
                          )}
                          <p className="text-xs text-slate-400 leading-relaxed">
                            Draw and save, or upload a signature image.
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addSignatureRow}
                    className="flex items-center gap-1.5 text-sm text-primary font-medium hover:underline"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add signature
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
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 whitespace-pre-wrap break-words">
                {error.message.includes('Traceback')
                  ? 'Something went wrong while admitting the patient. Please check phone numbers and try again.'
                  : error.message}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-slate-200 px-6 py-4 flex justify-between items-center bg-white gap-3">
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

            <div className="flex flex-col items-end gap-1 ml-auto">
              {!salesOrderCreated && !existingQuotation && !checkingQuotation && (
                <p className="text-[11px] text-amber-700">Create a quotation to enable Admit Patient</p>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    submitting ||
                    checkingQuotation ||
                    (!salesOrderCreated && !existingQuotation)
                  }
                  title={
                    !salesOrderCreated && !existingQuotation
                      ? 'Create a quotation first'
                      : undefined
                  }
                  className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Admitting...' : 'Admit Patient'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}