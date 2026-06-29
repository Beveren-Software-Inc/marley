import { useState, useEffect, useRef } from 'react'
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
import { searchPatients, fetchPatients, uploadPatientFile, type PatientListItem } from '../../services/patients'
import {
  fetchCompanies,
  resolveDefaultCompany,
  fetchHealthcarePractitioners,
  getCurrentUserPractitioner,
  fetchPatientVisits,
  fetchInpatientAdmissions,
  fetchPrescriptionItems,
  fetchStandardUoms,
  fetchDosageForms,
  fetchPrescriptionFrequencies,
  fetchLongActingFrequencies,
  fetchRouteOfAdministrationList,
  type LinkFieldOption,
} from '../../services/common'
import {
  createPrescription,
  updatePrescription,
  type CreatePrescriptionData,
  type MedicationOrderRow,
  type Prescription,
  checkPrescriptionDrugStock,
  type PrescriptionDrugStockCheck,
} from '../../services/prescriptions'
import { createVisitAndPrescriptionOnDischarge } from '../../services/medicineGiven'
import { bulkCreateNurseTasks, type CreateNurseTaskData } from '../../services/nurseTask'
import { toast } from '../../hooks/useToast'
import {
  flagsFromPrescriptionType,
  isLongActingPrescriptionType,
  isPrnPrescriptionType,
} from '../../utils/prescriptionType'
import { X, Plus, Trash2, Pill, ChevronDown, ChevronUp, PenLine } from 'lucide-react'
import { SignaturePad, attachFileDisplayUrl } from '../ui/SignaturePad'
import { useCareContext } from '../../providers/CareContextProvider'
import { useBlockIfActiveCareClosed } from '../../hooks/useBlockIfActiveCareClosed'
import { useRejectEditModeWhenLocked } from '../../hooks/useRejectEditModeWhenLocked'
import {
  linkComboboxDropdownClass,
  linkComboboxInputWithClearClass,
  linkComboboxOptionClassCompact,
} from '../ui/linkComboboxStyles'
import {
  CreateFrequencyMiniModal,
  type CreateFrequencyKind,
} from './CreateFrequencyMiniModal'

interface CreatePrescriptionModalProps {
  onClose: () => void
  onSuccess: (result?: { patient_visit: string; patient_medication_order: string }) => void
  initialPatient?: string
  initialMedications?: MedicationOrderRow[]
  initialCareContext?: 'Patient Visit' | 'Inpatient Admission'
  initialPatientEncounter?: string
  initialInpatientRecord?: string
  initialStartDate?: string
  transferAdmission?: string
  transferOrderEntryNames?: string[]
  editMode?: boolean
  prescriptionData?: Prescription | null
}

type TabId = 'details' | 'medications' | 'signature'

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + Math.round(days))
  return d.toISOString().split('T')[0]
}

function daysBetween(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 0
  const start = new Date(startStr)
  const end = new Date(endStr)
  const diff = end.getTime() - start.getTime()
  return Math.round(diff / (24 * 60 * 60 * 1000))
}

const PRESCRIPTION_TYPES = [
  'STAT',
  'PRN',
  'Regular - Psy (Active)',
  'Regular - Med (Active)',
  'Future Plan',
  'Long Acting Medicine',
] as const

const emptyMedicationRow = (startDate: string): MedicationOrderRow => ({
  drug: '',
  drug_name: '',
  dosage: '',
  uom: '',
  no_of_days: 1,
  dosage_form: '',
  instructions: '',
  date: startDate,
  end_date: addDays(startDate, 1),
  time: '',
  patient_frequency: '',
  is_pink: false,
  is_prn: false,
  is_long_acting: false,
  long_acting_frequency: 'Weekly',
  route_of_administration: '',
  medication_type: '',
})

function formatMedicationStockInline(stock: PrescriptionDrugStockCheck): string | null {
  if (!stock.warn || !stock.level) return null
  const qty = stock.actual_qty ?? 0
  if (stock.level === 'out_of_stock') return `Out of stock - ${qty}`
  return `Low stock - ${qty}`
}

// COMBOBOX WITH FIXED POSITIONING - DROPDOWNS ESCAPE MODAL
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
  label?: string
  required?: boolean
  renderOption?: (opt: LinkFieldOption) => React.ReactNode
  allowCustom?: boolean
  onCreateClick?: () => void
}

const Combobox = ({
  displayValue,
  placeholder,
  options,
  loading,
  onQueryChange,
  onSelect,
  onOpen,
  required,
  renderOption,
  onClear,
  allowCustom = false,
  onCreateClick,
}: ComboboxProps) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [customValue, setCustomValue] = useState('')

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelectCustom = () => {
    if (customValue.trim()) {
      onSelect({ name: customValue.trim(), label: customValue.trim() })
      setOpen(false)
      setCustomValue('')
    }
  }

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <input
          type="text"
          value={displayValue}
          onChange={(e) => {
            onQueryChange(e.target.value)
            if (allowCustom) {
              setCustomValue(e.target.value)
            }
            setOpen(true)
          }}
          onFocus={() => {
            setOpen(true)
            onOpen()
          }}
          placeholder={placeholder}
          required={required}
          className={linkComboboxInputWithClearClass}
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {onCreateClick && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onCreateClick()
              }}
              className="p-0.5 text-primary hover:text-primary/80 rounded"
              title="Create new"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
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
            <>
              {options.map((opt) => (
                <button
                  key={opt.name}
                  type="button"
                  className={linkComboboxOptionClassCompact}
                  onClick={() => {
                    onSelect(opt)
                    setOpen(false)
                  }}
                >
                  {renderOption ? renderOption(opt) : (opt.label || opt.name)}
                </button>
              ))}
              {allowCustom && customValue && !options.find(o => o.name === customValue || o.label === customValue) && (
                <button
                  type="button"
                  onClick={handleSelectCustom}
                  className="w-full text-left px-3 py-2 text-sm border-t border-slate-100 bg-slate-50 hover:bg-emerald-50/80 transition-colors text-primary font-medium"
                >
                  + Use "{customValue}"
                </button>
              )}
            </>
          ) : (
            <div className="px-3 py-2 text-xs text-slate-500">
              {allowCustom && customValue ? (
                <button
                  type="button"
                  onClick={handleSelectCustom}
                  className="w-full text-left text-primary font-medium hover:underline"
                >
                  + Use "{customValue}"
                </button>
              ) : (
                'No results found'
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export const CreatePrescriptionModal = ({
  onClose,
  onSuccess,
  initialPatient,
  initialMedications,
  initialCareContext,
  initialPatientEncounter,
  initialInpatientRecord,
  initialStartDate,
  transferAdmission,
  transferOrderEntryNames,
  editMode = false,
  prescriptionData = null,
}: CreatePrescriptionModalProps) => {
  const { mode, activeVisit, activeAdmission, costCenterCompany, userCostCenter } = useCareContext()
  const blockIfActiveCareClosed = useBlockIfActiveCareClosed()
  useRejectEditModeWhenLocked(editMode, onClose)
  const [activeTab, setActiveTab] = useState<TabId>('details')
  const [expandedMedications, setExpandedMedications] = useState<Set<number>>(new Set([0]))

  const [patientQuery, setPatientQuery] = useState('')
  const [selectedPatient, setSelectedPatient] = useState<PatientListItem | null>(null)
  const [patients, setPatients] = useState<PatientListItem[]>([])
  const [loadingPatients, setLoadingPatients] = useState(false)

  const [companies, setCompanies] = useState<LinkFieldOption[]>([])
  const [visits, setVisits] = useState<LinkFieldOption[]>([])
  const [admissions, setAdmissions] = useState<LinkFieldOption[]>([])
  const [practitioners, setPractitioners] = useState<LinkFieldOption[]>([])
  const [practQuery, setPractQuery] = useState('')

  const [formData, setFormData] = useState({
    care_context: 'Patient Visit' as 'Patient Visit' | 'Inpatient Admission',
    patient_encounter: '',
    inpatient_record: '',
    company: '',
    start_date: new Date().toISOString().split('T')[0],
    practitioner: '',
  })

  const [medications, setMedications] = useState<MedicationOrderRow[]>(() => [
    emptyMedicationRow(new Date().toISOString().split('T')[0]),
  ])

  const [drugQueries, setDrugQueries] = useState<Record<number, string>>({})
  const [drugOptions, setDrugOptions] = useState<Record<number, LinkFieldOption[]>>({})
  const [drugLoading, setDrugLoading] = useState<Record<number, boolean>>({})

  const [frequencyQueries, setFrequencyQueries] = useState<Record<number, string>>({})
  const [routeQueries, setRouteQueries] = useState<Record<number, string>>({})
  const [uomQueries, setUomQueries] = useState<Record<number, string>>({})

  const [dosageForms, setDosageForms] = useState<LinkFieldOption[]>([])
  const [frequencyOptions, setFrequencyOptions] = useState<LinkFieldOption[]>([])
  const [longActingFrequencyOptions, setLongActingFrequencyOptions] = useState<LinkFieldOption[]>([])
  const [routeOptions, setRouteOptions] = useState<LinkFieldOption[]>([])
  const [uomOptions, setUomOptions] = useState<LinkFieldOption[]>([])
  const [loadingFrequency, setLoadingFrequency] = useState(false)
  const [loadingLongActingFrequency, setLoadingLongActingFrequency] = useState(false)
  const [loadingRoute, setLoadingRoute] = useState(false)
  const [loadingUom, setLoadingUom] = useState(false)
  const [longActingFrequencyQueries, setLongActingFrequencyQueries] = useState<Record<number, string>>({})
  const [createFreqModal, setCreateFreqModal] = useState<{
    kind: CreateFrequencyKind
    rowIndex: number
    initialName?: string
  } | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [createNurseTasks, setCreateNurseTasks] = useState(false)
  const [nurseTaskRows, setNurseTaskRows] = useState<Record<number, boolean>>({})

  const [doctorsSignature, setDoctorsSignature] = useState<string | null>(null)
  const [signatureUploading, setSignatureUploading] = useState(false)
  const [medicationStock, setMedicationStock] = useState<Record<number, PrescriptionDrugStockCheck>>({})

  const isEditing = editMode

  const searchFrequencies = async (query: string) => {
    setLoadingFrequency(true)
    try {
      const allFrequencies = await fetchPrescriptionFrequencies(query || undefined)
      setFrequencyOptions(allFrequencies)
    } catch (error) {
      console.error('Failed to search frequencies:', error)
      setFrequencyOptions([])
    } finally {
      setLoadingFrequency(false)
    }
  }

  const searchLongActingFrequencies = async (query: string) => {
    setLoadingLongActingFrequency(true)
    try {
      const options = await fetchLongActingFrequencies(query || undefined)
      setLongActingFrequencyOptions(options)
    } catch (error) {
      console.error('Failed to search long acting frequencies:', error)
      setLongActingFrequencyOptions([])
    } finally {
      setLoadingLongActingFrequency(false)
    }
  }

  const searchRoutes = async (query: string) => {
    setLoadingRoute(true)
    try {
      const allRoutes = await fetchRouteOfAdministrationList()
      if (!query.trim()) {
        setRouteOptions(allRoutes)
      } else {
        const filtered = allRoutes.filter(r => 
          r.label?.toLowerCase().includes(query.toLowerCase()) || 
          r.name?.toLowerCase().includes(query.toLowerCase())
        )
        setRouteOptions(filtered)
      }
    } catch (error) {
      console.error('Failed to search routes:', error)
      setRouteOptions([])
    } finally {
      setLoadingRoute(false)
    }
  }

  const applyDrugSelection = async (index: number, opt: LinkFieldOption) => {
    const route = opt.default_route_of_administration?.trim()
    const stockUom = (opt.stock_uom || '').trim()
    setMedications((prev) => {
      const next = [...prev]
      if (!next[index]) return prev
      next[index] = {
        ...next[index],
        drug: opt.name,
        drug_name: opt.label || opt.name,
        uom: stockUom,
        ...(route ? { route_of_administration: route } : {}),
      }
      return next
    })
    setUomQueries((prev) => ({ ...prev, [index]: stockUom }))
    setDrugQueries((prev) => ({ ...prev, [index]: opt.label || opt.name }))
    if (route) {
      let routes = routeOptions
      if (!routes.length) {
        routes = await fetchRouteOfAdministrationList().catch(() => [])
        setRouteOptions(routes)
      }
      const match = routes.find((r) => r.name === route || r.label === route)
      setRouteQueries((prev) => ({
        ...prev,
        [index]: match?.label || match?.name || route,
      }))
    }
    setDrugOptions((prev) => ({ ...prev, [index]: [] }))

    try {
      const stock = await checkPrescriptionDrugStock(opt.name, userCostCenter, formData.company)
      setMedicationStock((prev) => {
        const next = { ...prev }
        if (stock.warn) {
          next[index] = stock
        } else {
          delete next[index]
        }
        return next
      })
    } catch {
      /* non-blocking */
    }
  }

  const searchUoms = async (query: string) => {
    setLoadingUom(true)
    try {
      const allUoms = await fetchStandardUoms(query || undefined)
      setUomOptions(allUoms)
    } catch (error) {
      console.error('Failed to search UOMs:', error)
      setUomOptions([])
    } finally {
      setLoadingUom(false)
    }
  }

  // Load initial data
  useEffect(() => {
    fetchPrescriptionFrequencies().then(setFrequencyOptions).catch(() => setFrequencyOptions([]))
    fetchRouteOfAdministrationList().then(setRouteOptions).catch(() => setRouteOptions([]))
    fetchStandardUoms().then(setUomOptions).catch(() => setUomOptions([]))
  }, [])

  useEffect(() => {
    if (editMode && prescriptionData) {
      setFormData({
        care_context: (prescriptionData.care_context === 'Inpatient Admission' ? 'Inpatient Admission' : 'Patient Visit'),
        patient_encounter: prescriptionData.patient_encounter || '',
        inpatient_record: prescriptionData.inpatient_record || '',
        company: prescriptionData.company || '',
        start_date: prescriptionData.start_date || new Date().toISOString().split('T')[0],
        practitioner: prescriptionData.practitioner || '',
      })
      
      if (prescriptionData.patient) {
        setSelectedPatient({ 
          name: prescriptionData.patient, 
          patient_name: prescriptionData.patient_name || prescriptionData.patient 
        } as PatientListItem)
        setPatientQuery(prescriptionData.patient_name || prescriptionData.patient)
      }
      
      if (prescriptionData.medication_orders && prescriptionData.medication_orders.length > 0) {
        const loadedMedications: MedicationOrderRow[] = prescriptionData.medication_orders.map((med: any) => ({
          drug: med.drug || '',
          drug_name: med.drug_name || med.drug || '',
          dosage: med.dosage || '',
          uom: med.uom || '',
          no_of_days: med.no_of_days || 1,
          dosage_form: med.dosage_form || '',
          instructions: med.instructions || '',
          date: med.date || formData.start_date,
          end_date: med.end_date || addDays(formData.start_date, 1),
          time: med.time || '',
          patient_frequency: med.patient_frequency || '',
          is_pink: med.is_pink || false,
          long_acting_frequency: med.long_acting_frequency || 'Weekly',
          route_of_administration: med.route_of_administration || '',
          medication_type:
            med.medication_type === 'Contraindicated' ? '' : (med.medication_type || ''),
          ...flagsFromPrescriptionType(
            med.medication_type === 'Contraindicated' ? '' : med.medication_type
          ),
        }))
        setMedications(loadedMedications)
        
        const queries: Record<number, string> = {}
        const nextUomQueries: Record<number, string> = {}
        loadedMedications.forEach((med, idx) => {
          if (med.drug) queries[idx] = med.drug_name || med.drug
          if (med.uom) nextUomQueries[idx] = med.uom
        })
        setDrugQueries(queries)
        setUomQueries(nextUomQueries)
      }

      if (prescriptionData.doctors_signature) {
        setDoctorsSignature(prescriptionData.doctors_signature)
      }
    }
  }, [editMode, prescriptionData, formData.start_date])

  useEffect(() => {
    if (initialCareContext) return
    setFormData((prev) => {
      const next = { ...prev }
      if (mode === 'IP') {
        next.care_context = 'Inpatient Admission'
      } else if (mode === 'OP') {
        next.care_context = 'Patient Visit'
      }
      return next
    })
  }, [mode, initialCareContext])

  useEffect(() => {
    fetchCompanies().then(setCompanies).catch(() => setCompanies([]))
    fetchHealthcarePractitioners().then(setPractitioners).catch(() => setPractitioners([]))
    fetchDosageForms().then(setDosageForms).catch(() => setDosageForms([]))
  }, [])

  // Auto-populate current user's practitioner (same approach as CreateClinicalNoteModal)
  useEffect(() => {
    const autoPopulatePractitioner = async () => {
      try {
        const practitioner = await getCurrentUserPractitioner()
        if (practitioner && !isEditing) { // Only auto-populate when creating new prescription
          setFormData(prev => ({ ...prev, practitioner }))
          // Find the practitioner option to set display label
          const practitionerOption = practitioners.find(p => p.name === practitioner)
          if (practitionerOption) {
            setPractQuery(practitionerOption.label || practitioner)
          } else {
            setPractQuery(practitioner)
          }
        }
      } catch (err) {
        console.error('Failed to auto-populate practitioner:', err)
      }
    }
    
    // Wait for practitioners to be loaded
    if (practitioners.length > 0 && !isEditing && !formData.practitioner) {
      autoPopulatePractitioner()
    }
  }, [practitioners, isEditing, formData.practitioner])

  useEffect(() => {
    if (initialPatient && !selectedPatient) {
      setPatientQuery(initialPatient)
      fetchPatients(20, 0, initialPatient)
        .then((list) => {
          const match = list.find((p) => p.name === initialPatient)
          setSelectedPatient(match || { name: initialPatient, patient_name: initialPatient } as PatientListItem)
        })
        .catch(() => setSelectedPatient({ name: initialPatient, patient_name: initialPatient } as PatientListItem))
    }
  }, [initialPatient])

  useEffect(() => {
    if (initialMedications && initialMedications.length > 0) {
      setMedications(initialMedications)
      const queries: Record<number, string> = {}
      initialMedications.forEach((med, idx) => {
        queries[idx] = med.drug_name || med.drug
      })
      setDrugQueries(queries)
    }
  }, [initialMedications])

  useEffect(() => {
    if (initialCareContext) {
      setFormData((prev) => ({
        ...prev,
        care_context: initialCareContext,
        patient_encounter: initialPatientEncounter || '',
        inpatient_record:
          initialCareContext === 'Patient Visit'
            ? ''
            : (initialInpatientRecord || prev.inpatient_record),
        start_date: initialStartDate || prev.start_date,
      }))
    }
  }, [initialCareContext, initialPatientEncounter, initialInpatientRecord, initialStartDate])

  useEffect(() => {
    if (!selectedPatient) {
      setVisits([])
      setAdmissions([])
      setFormData((p) => ({ ...p, patient_encounter: '', inpatient_record: '' }))
      return
    }
    fetchPatientVisits(selectedPatient.name).then(setVisits).catch(() => setVisits([]))
    fetchInpatientAdmissions(selectedPatient.name).then(setAdmissions).catch(() => setAdmissions([]))
  }, [selectedPatient?.name])

  useEffect(() => {
    setFormData((prev) => {
      const next = { ...prev }
      if (mode === 'OP' && activeVisit) {
        next.care_context = 'Patient Visit'
        next.patient_encounter = activeVisit
      }
      if (mode === 'IP' && activeAdmission) {
        next.care_context = 'Inpatient Admission'
        next.inpatient_record = activeAdmission
      }
      return next
    })
  }, [mode, activeVisit, activeAdmission])

  useEffect(() => {
    if (isEditing) return
    if (!companies.length) return
    setFormData((p) => {
      if (p.company) return p
      const company = resolveDefaultCompany(companies, costCenterCompany)
      return company ? { ...p, company } : p
    })
  }, [companies, costCenterCompany, isEditing])

  const loadDrugOptions = (index: number, query: string) => {
    if (!query || query.length < 1) {
      setDrugOptions((prev) => ({ ...prev, [index]: [] }))
      return
    }
    setDrugLoading((prev) => ({ ...prev, [index]: true }))
    fetchPrescriptionItems(query)
      .then((opts) => setDrugOptions((prev) => ({ ...prev, [index]: opts })))
      .catch(() => setDrugOptions((prev) => ({ ...prev, [index]: [] })))
      .finally(() => setDrugLoading((prev) => ({ ...prev, [index]: false })))
  }

  const addMedicationRow = () => {
    const newIndex = medications.length
    setMedications((prev) => [...prev, emptyMedicationRow(formData.start_date)])
    // Collapse previous rows and expand the newly added one (2nd medication onward).
    if (newIndex >= 1) {
      setExpandedMedications(new Set([newIndex]))
    }
  }

  const removeMedicationRow = (index: number) => {
    setMedications((prev) => prev.filter((_, i) => i !== index))
    setDrugQueries((prev) => { const n = { ...prev }; delete n[index]; return n })
    setDrugOptions((prev) => { const n = { ...prev }; delete n[index]; return n })
    setFrequencyQueries((prev) => { const n = { ...prev }; delete n[index]; return n })
    setRouteQueries((prev) => { const n = { ...prev }; delete n[index]; return n })
    setUomQueries((prev) => { const n = { ...prev }; delete n[index]; return n })
    setMedicationStock((prev) => {
      const next: Record<number, PrescriptionDrugStockCheck> = {}
      Object.entries(prev).forEach(([key, val]) => {
        const i = Number(key)
        if (i < index) next[i] = val
        else if (i > index) next[i - 1] = val
      })
      return next
    })
    setExpandedMedications((prev) => {
      const next = new Set(prev)
      next.delete(index)
      return next
    })
  }

  const toggleMedicationExpanded = (index: number) => {
    setExpandedMedications((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  const updateMedicationRow = (index: number, field: keyof MedicationOrderRow, value: string | number | boolean) => {
    setMedications((prev) => {
      const next = [...prev]
      if (!next[index]) return next
      const row = { ...next[index], [field]: value }
      if (field === 'medication_type') {
        Object.assign(row, flagsFromPrescriptionType(String(value)))
        if (isLongActingPrescriptionType(String(value))) {
          const lf = row.long_acting_frequency || 'Weekly'
          row.long_acting_frequency = lf
          row.patient_frequency = lf
        }
      }
      if (field === 'long_acting_frequency') {
        row.patient_frequency = String(value)
      }

      const isIP = mode === 'IP'
      if (!isIP && (field === 'date' || field === 'end_date' || field === 'no_of_days')) {
        const start = row.date || ''
        const end = (field === 'end_date' ? value : row.end_date) as string
        const days = (field === 'no_of_days' ? value : row.no_of_days) as number
        if (field === 'date' || field === 'end_date') {
          if (start && end) {
            row.no_of_days = daysBetween(start, end) || 1
          } else if (start && typeof days === 'number' && days > 0) {
            row.end_date = addDays(start, days)
          }
        } else if (field === 'no_of_days' && start && typeof days === 'number' && days > 0) {
          row.end_date = addDays(start, days)
        }
      }
      
      next[index] = row
      return next
    })
  }

  const validMedications = medications
    .filter((m) => m.drug && m.dosage && m.dosage_form && m.date)
    .map((m) => ({ ...m, ...flagsFromPrescriptionType(m.medication_type) }))

  const handleDoctorSignatureSave = async (file: File) => {
    setSignatureUploading(true)
    try {
      const fileUrl = await uploadPatientFile(file)
      if (!fileUrl) throw new Error('No URL returned from signature upload')
      setDoctorsSignature(fileUrl)
      toast.success('Signature saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Signature upload failed')
    } finally {
      setSignatureUploading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setError(null)
    try {
      blockIfActiveCareClosed()
    } catch {
      return
    }
    if (!selectedPatient) { setError('Please select a patient'); setActiveTab('details'); return }
    if (!formData.company) { setError('Please select a company'); setActiveTab('details'); return }
    if (!formData.start_date) { setError('Please set start date'); setActiveTab('details'); return }
    if (validMedications.length === 0) {
      setError('Please add at least one medication with Drug, Dosage, Dosage Form, and Date')
      setActiveTab('medications'); return
    }
    try {
      setSubmitting(true)
      let successResult: { patient_visit: string; patient_medication_order: string } | undefined
      
      if (initialCareContext === 'Patient Visit' && transferAdmission) {
        const result = await createVisitAndPrescriptionOnDischarge(
          transferAdmission,
          validMedications,
          formData.patient_encounter || undefined,
          true,
          doctorsSignature || undefined,
          transferOrderEntryNames,
        )
        const signedNote = doctorsSignature ? ' (signed)' : ''
        toast.success(
          `Created visit ${result.patient_visit} and prescription ${result.patient_medication_order}${signedNote}`,
        )
        successResult = result
      } else if (isEditing && prescriptionData) {
        const payload: any = {
          name: prescriptionData.name,
          patient: selectedPatient.name,
          care_context: formData.care_context,
          company: formData.company,
          start_date: formData.start_date,
          practitioner: formData.practitioner || undefined,
          medication_orders: validMedications,
        }
        if (formData.care_context === 'Patient Visit' && formData.patient_encounter) {
          payload.patient_encounter = formData.patient_encounter
        }
        if (formData.care_context === 'Inpatient Admission' && formData.inpatient_record) {
          payload.inpatient_record = formData.inpatient_record
        }
        payload.doctors_signature = doctorsSignature || ''

        await updatePrescription(payload)
        toast.success(
          doctorsSignature ? 'Prescription updated and signed' : 'Prescription updated successfully',
        )
      } else {
        const payload: CreatePrescriptionData = {
          patient: selectedPatient.name,
          care_context: formData.care_context,
          company: formData.company,
          start_date: formData.start_date,
          practitioner: formData.practitioner || undefined,
          medication_orders: validMedications,
        }
        if (formData.care_context === 'Patient Visit' && formData.patient_encounter) {
          payload.patient_encounter = formData.patient_encounter
        }
        if (formData.care_context === 'Inpatient Admission' && formData.inpatient_record) {
          payload.inpatient_record = formData.inpatient_record
        }
        if (doctorsSignature) {
          payload.doctors_signature = doctorsSignature
        }

        await createPrescription(payload)

        if (createNurseTasks) {
          const tasksToCreate: CreateNurseTaskData[] = validMedications.flatMap((med, idx) => {
            const shouldCreate = nurseTaskRows[idx] !== false
            if (!shouldCreate) return []
            const scheduledDatetime = med.date
              ? `${med.date} ${med.time ?? '08:00:00'}`
              : `${formData.start_date} 08:00:00`
            const task: CreateNurseTaskData = {
              patient: selectedPatient.name,
              task_type: 'Medication Administration',
              scheduled_time: scheduledDatetime,
              description: `${med.drug_name || med.drug} — ${med.dosage}${med.instructions ? `\n${med.instructions}` : ''}`,
              medication: med.drug,
              dosage: med.dosage,
              route: med.route_of_administration || undefined,
              is_prn: med.is_prn ?? false,
              medication_type: med.medication_type || undefined,
            }
            return [task]
          })

          const createdMsg = doctorsSignature
            ? 'Prescription created (signed)'
            : 'Prescription created'
          if (tasksToCreate.length > 0) {
            try {
              const result = await bulkCreateNurseTasks(tasksToCreate)
              toast.success(
                `${createdMsg} · ${result.count} nurse task${result.count !== 1 ? 's' : ''} created`,
              )
            } catch {
              toast.success(createdMsg)
              toast.error('Prescription saved but some nurse tasks could not be created.')
            }
          } else {
            toast.success(createdMsg)
          }
        } else {
          toast.success(doctorsSignature ? 'Prescription created (signed)' : 'Prescription created')
        }
      }

      onSuccess(successResult)
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Failed to ${isEditing ? 'update' : 'create'} prescription`
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const practitionerDisplay = formData.practitioner
    ? (practitioners.find((x) => x.name === formData.practitioner)?.label || formData.practitioner)
    : practQuery

  const isExpanded = (index: number) => expandedMedications.has(index)
  const shouldShowCollapse = medications.length >= 2
  const isIP = mode === 'IP'

  const modal = (
    <div
      className={CREATE_MODAL_OVERLAY}
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={createModalShellClass('max-w-4xl w-full max-h-[90vh] min-h-[600px]')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CreateModalHeader
          title={isEditing ? 'Edit Prescription' : 'Create Prescription'}
          icon={<Pill className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          onClose={onClose}
        />

        <div className="flex border-b border-slate-200 shrink-0 bg-slate-50">
          {(['details', 'medications', 'signature'] as TabId[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-primary text-primary bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              {tab === 'medications'
                ? `Medications (${validMedications.length})`
                : tab === 'signature'
                  ? doctorsSignature
                    ? 'Signature ✓'
                    : 'Signature'
                  : 'Details'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {error && (
            <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 shrink-0">
              {error}
            </div>
          )}

          <div className={`${CREATE_MODAL_BODY_GRADIENT} p-6`}>
            {/* ── DETAILS TAB ── */}
            {activeTab === 'details' && (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Patient <span className="text-red-500">*</span>
                  </label>
                  <Combobox
                    value={selectedPatient?.name || ''}
                    displayValue={selectedPatient ? (selectedPatient.patient_name || selectedPatient.name) : patientQuery}
                    placeholder="Search patient..."
                    options={patients.map((p) => ({ name: p.name, label: p.patient_name || p.name }))}
                    loading={loadingPatients}
                    onQueryChange={(q) => {
                      setPatientQuery(q)
                      setSelectedPatient(null)
                      if (q.length > 0) {
                        setLoadingPatients(true)
                        searchPatients(q, 20).then(setPatients).finally(() => setLoadingPatients(false))
                      }
                    }}
                    onOpen={() => {
                      if (patients.length === 0) {
                        setLoadingPatients(true)
                        fetchPatients(20, 0).then(setPatients).finally(() => setLoadingPatients(false))
                      }
                    }}
                    onSelect={(opt) => {
                      const p = patients.find((x) => x.name === opt.name)
                      if (p) {
                        setSelectedPatient(p)
                        setPatientQuery(p.patient_name || p.name)
                      }
                    }}
                    renderOption={(opt) => {
                      const p = patients.find((x) => x.name === opt.name)
                      return (
                        <div>
                          <div className="font-medium">{opt.label || opt.name}</div>
                          {p && (p.file_number || p.id_number) && (
                            <div className="text-xs text-slate-500 flex gap-x-3 mt-0.5">
                              {p.file_number && <span>File: {p.file_number}</span>}
                              {p.id_number && <span>ID: {p.id_number}</span>}
                            </div>
                          )}
                        </div>
                      )
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Care Context
                    </label>
                    <select
                      value={formData.care_context}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          care_context: e.target.value as 'Patient Visit' | 'Inpatient Admission',
                          patient_encounter: '',
                          inpatient_record: '',
                        }))
                      }
                      disabled={Boolean(transferAdmission)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white disabled:bg-slate-100 disabled:text-slate-500"
                    >
                      <option value="Patient Visit">Patient Visit</option>
                      {!transferAdmission && <option value="Inpatient Admission">Inpatient Admission</option>}
                    </select>
                  </div>

                  {formData.care_context === 'Patient Visit' ? (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Patient Visit
                      </label>
                      <select
                        value={formData.patient_encounter}
                        onChange={(e) => setFormData((p) => ({ ...p, patient_encounter: e.target.value }))}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                      >
                        <option value="">Select visit...</option>
                        {visits.map((v) => <option key={v.name} value={v.name}>{v.label || v.name}</option>)}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Inpatient Admission
                      </label>
                      <select
                        value={formData.inpatient_record}
                        onChange={(e) => setFormData((p) => ({ ...p, inpatient_record: e.target.value }))}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                      >
                        <option value="">Select admission...</option>
                        {admissions.map((a) => <option key={a.name} value={a.name}>{a.label || a.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Company <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.company}
                      onChange={(e) => setFormData((p) => ({ ...p, company: e.target.value }))}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    >
                      <option value="">Select company...</option>
                      {companies.map((c) => <option key={c.name} value={c.name}>{c.label || c.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Start Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => setFormData((p) => ({ ...p, start_date: e.target.value }))}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Practitioner</label>
                    <Combobox
                      value={formData.practitioner}
                      displayValue={practitionerDisplay}
                      placeholder="Search practitioner..."
                      options={practitioners}
                      onQueryChange={(q) => {
                        setPractQuery(q)
                        setFormData((p) => ({ ...p, practitioner: '' }))
                        fetchHealthcarePractitioners(q || undefined).then(setPractitioners).catch(() => {})
                      }}
                      onOpen={() => {
                        fetchHealthcarePractitioners(practQuery || undefined).then(setPractitioners).catch(() => {})
                      }}
                      onSelect={(opt) => {
                        setFormData((p) => ({ ...p, practitioner: opt.name }))
                        setPractQuery(opt.label || opt.name)
                      }}
                      renderOption={(opt) => (
                        <div>
                          <div className="font-medium">{opt.label || opt.name}</div>
                          <div className="text-xs text-slate-500">{opt.name}</div>
                        </div>
                      )}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── MEDICATIONS TAB ── */}
            {activeTab === 'medications' && (
              <div className="space-y-4">
                <div className="flex justify-end items-center">
                  <button
                    type="button"
                    onClick={addMedicationRow}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-md hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Add Medication
                  </button>
                </div>

                {formData.care_context === 'Inpatient Admission' && (
                  <div className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 flex items-center gap-2">
                    <input
                      id="create-nurse-tasks"
                      type="checkbox"
                      checked={createNurseTasks}
                      onChange={(e) => setCreateNurseTasks(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    <label htmlFor="create-nurse-tasks" className="text-xs font-medium text-teal-800 cursor-pointer select-none">
                      Create a Nurse Task (Medication Administration) for each medication
                    </label>
                  </div>
                )}

                <div className="space-y-3">
                  {medications.map((row, index) => {
                    const stockLabel = medicationStock[index]
                      ? formatMedicationStockInline(medicationStock[index])
                      : null
                    return (
                    <div
                      key={index}
                      className="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden transition-all"
                    >
                      <button
                        type="button"
                        onClick={() => toggleMedicationExpanded(index)}
                        disabled={!shouldShowCollapse}
                        className={`w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200 hover:bg-slate-100 transition-colors ${
                          !shouldShowCollapse ? 'cursor-default' : 'cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-700 min-w-0 flex-wrap">
                          <Pill className="w-4 h-4 text-primary shrink-0" />
                          <span className="shrink-0">Medication {index + 1}</span>
                          {row.drug && drugQueries[index] && (
                            <span className="text-slate-400 font-normal truncate">— {drugQueries[index]}</span>
                          )}
                          {stockLabel ? (
                            <span
                              className={`font-medium shrink-0 ${
                                medicationStock[index].level === 'out_of_stock'
                                  ? 'text-red-600'
                                  : 'text-amber-600'
                              }`}
                            >
                              {stockLabel}
                            </span>
                          ) : null}
                          {isPrnPrescriptionType(row.medication_type) && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                              PRN
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeMedicationRow(index)
                            }}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          {shouldShowCollapse && (
                            <div className="text-slate-400">
                              {isExpanded(index) ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </div>
                          )}
                        </div>
                      </button>

                      {createNurseTasks && formData.care_context === 'Inpatient Admission' && (
                        <div className="px-4 py-1.5 bg-teal-50 border-b border-teal-100 flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`nt-row-${index}`}
                            checked={nurseTaskRows[index] !== false}
                            onChange={(e) =>
                              setNurseTaskRows((prev) => ({ ...prev, [index]: e.target.checked }))
                            }
                            className="w-3.5 h-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                          />
                          <label
                            htmlFor={`nt-row-${index}`}
                            className="text-[11px] text-teal-700 cursor-pointer select-none"
                          >
                            Create nurse task for this medication
                          </label>
                        </div>
                      )}

                      {(isExpanded(index) || !shouldShowCollapse) && (
                        <div className="p-4 space-y-3 animate-in fade-in duration-200">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Drug <span className="text-red-500">*</span>
                            </label>
                            <Combobox
                              value={row.drug}
                              displayValue={drugQueries[index] ?? (row.drug ? (row.drug_name || row.drug) : '')}
                              placeholder="Search drug..."
                              options={drugOptions[index] || []}
                              loading={drugLoading[index]}
                              onQueryChange={(q) => {
                                setDrugQueries((prev) => ({ ...prev, [index]: q }))
                                loadDrugOptions(index, q)
                              }}
                              onOpen={() => loadDrugOptions(index, drugQueries[index] || row.drug || '')}
                              onSelect={(opt) => {
                                void applyDrugSelection(index, opt)
                              }}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Dosage <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={row.dosage}
                                onChange={(e) => updateMedicationRow(index, 'dosage', e.target.value)}
                                placeholder="e.g. 1-0-1"
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Unit of Measure
                              </label>
                              <Combobox
                                value={row.uom ?? ''}
                                displayValue={uomQueries[index] ?? row.uom ?? ''}
                                placeholder="Type or select unit of measure…"
                                options={uomOptions}
                                loading={loadingUom}
                                allowCustom={true}
                                onQueryChange={(q) => {
                                  setUomQueries((prev) => ({ ...prev, [index]: q }))
                                  searchUoms(q)
                                }}
                                onOpen={() => {
                                  if (uomOptions.length === 0) {
                                    searchUoms('')
                                  }
                                }}
                                onSelect={(opt) => {
                                  updateMedicationRow(index, 'uom', opt.name)
                                  setUomQueries((prev) => ({ ...prev, [index]: opt.label || opt.name }))
                                }}
                                onClear={() => {
                                  updateMedicationRow(index, 'uom', '')
                                  setUomQueries((prev) => ({ ...prev, [index]: '' }))
                                }}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              {isLongActingPrescriptionType(row.medication_type) ? (
                                <>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">
                                    Long Acting Frequency
                                  </label>
                                  <Combobox
                                    value={row.long_acting_frequency ?? ''}
                                    displayValue={
                                      longActingFrequencyQueries[index] ??
                                      (row.long_acting_frequency
                                        ? longActingFrequencyOptions.find((f) => f.name === row.long_acting_frequency)?.label ||
                                          row.long_acting_frequency
                                        : '')
                                    }
                                    placeholder="Select long acting frequency..."
                                    options={longActingFrequencyOptions}
                                    loading={loadingLongActingFrequency}
                                    onCreateClick={() =>
                                      setCreateFreqModal({
                                        kind: 'long_acting',
                                        rowIndex: index,
                                        initialName: longActingFrequencyQueries[index] || '',
                                      })
                                    }
                                    onQueryChange={(q) => {
                                      setLongActingFrequencyQueries((prev) => ({ ...prev, [index]: q }))
                                      searchLongActingFrequencies(q)
                                    }}
                                    onOpen={() => {
                                      if (longActingFrequencyOptions.length === 0) {
                                        searchLongActingFrequencies('')
                                      }
                                    }}
                                    onSelect={(opt) => {
                                      updateMedicationRow(index, 'long_acting_frequency', opt.name)
                                      updateMedicationRow(index, 'patient_frequency', opt.name)
                                      setLongActingFrequencyQueries((prev) => ({
                                        ...prev,
                                        [index]: opt.label || opt.name,
                                      }))
                                      setFrequencyQueries((prev) => ({
                                        ...prev,
                                        [index]: opt.label || opt.name,
                                      }))
                                    }}
                                    onClear={() => {
                                      updateMedicationRow(index, 'long_acting_frequency', 'Weekly')
                                      setLongActingFrequencyQueries((prev) => ({ ...prev, [index]: '' }))
                                    }}
                                  />
                                  <p className="text-[11px] text-slate-500 mt-1">
                                    A Long Acting Medicine record will be created for scheduling and reminders.
                                  </p>
                                </>
                              ) : (
                                <>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Frequency</label>
                                  <Combobox
                                    value={row.patient_frequency ?? ''}
                                    displayValue={
                                      frequencyQueries[index] ??
                                      (row.patient_frequency
                                        ? frequencyOptions.find((f) => f.name === row.patient_frequency)?.label ||
                                          row.patient_frequency
                                        : '')
                                    }
                                    placeholder="Type or select frequency..."
                                    options={frequencyOptions}
                                    loading={loadingFrequency}
                                    allowCustom={true}
                                    onCreateClick={() =>
                                      setCreateFreqModal({
                                        kind: 'regular',
                                        rowIndex: index,
                                        initialName: frequencyQueries[index] || '',
                                      })
                                    }
                                    onQueryChange={(q) => {
                                      setFrequencyQueries((prev) => ({ ...prev, [index]: q }))
                                      searchFrequencies(q)
                                    }}
                                    onOpen={() => {
                                      if (frequencyOptions.length === 0) {
                                        searchFrequencies('')
                                      }
                                    }}
                                    onSelect={(opt) => {
                                      updateMedicationRow(index, 'patient_frequency', opt.name)
                                      setFrequencyQueries((prev) => ({ ...prev, [index]: opt.label || opt.name }))
                                    }}
                                    onClear={() => {
                                      updateMedicationRow(index, 'patient_frequency', '')
                                      setFrequencyQueries((prev) => ({ ...prev, [index]: '' }))
                                    }}
                                  />
                                </>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Route of Administration</label>
                              <Combobox
                                value={row.route_of_administration ?? ''}
                                displayValue={routeQueries[index] ?? (row.route_of_administration ? (routeOptions.find((r) => r.name === row.route_of_administration)?.label || row.route_of_administration) : '')}
                                placeholder="Type or select route..."
                                options={routeOptions}
                                loading={loadingRoute}
                                allowCustom={true}
                                onQueryChange={(q) => {
                                  setRouteQueries((prev) => ({ ...prev, [index]: q }))
                                  searchRoutes(q)
                                }}
                                onOpen={() => {
                                  if (routeOptions.length === 0) {
                                    searchRoutes('')
                                  }
                                }}
                                onSelect={(opt) => {
                                  updateMedicationRow(index, 'route_of_administration', opt.name)
                                  setRouteQueries((prev) => ({ ...prev, [index]: opt.label || opt.name }))
                                }}
                                onClear={() => {
                                  updateMedicationRow(index, 'route_of_administration', '')
                                  setRouteQueries((prev) => ({ ...prev, [index]: '' }))
                                }}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Dosage Form <span className="text-red-500">*</span>
                              </label>
                              <select
                                value={row.dosage_form}
                                onChange={(e) => updateMedicationRow(index, 'dosage_form', e.target.value)}
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                              >
                                <option value="">Select...</option>
                                {dosageForms.map((df) => (
                                  <option key={df.name} value={df.name}>
                                    {df.label || df.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Prescription Type <span className="text-red-500">*</span>
                              </label>
                              <select
                                value={row.medication_type || ''}
                                onChange={(e) => updateMedicationRow(index, 'medication_type', e.target.value)}
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                              >
                                <option value="">Select...</option>
                                {PRESCRIPTION_TYPES.map((type) => (
                                  <option key={type} value={type}>
                                    {type}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className={`grid ${isIP ? 'grid-cols-2' : 'grid-cols-3'} gap-3`}>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Start Date <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="date"
                                value={row.date ?? formData.start_date}
                                onChange={(e) => updateMedicationRow(index, 'date', e.target.value)}
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">End Date</label>
                              <input
                                type="date"
                                value={row.end_date ?? ''}
                                onChange={(e) => updateMedicationRow(index, 'end_date', e.target.value)}
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                              />
                            </div>
                            {!isIP && (
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Days</label>
                                <input
                                  type="number"
                                  min={1}
                                  step={1}
                                  value={row.no_of_days ?? ''}
                                  onChange={(e) => updateMedicationRow(index, 'no_of_days', e.target.value ? Number(e.target.value) : 1)}
                                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                                />
                              </div>
                            )}
                          </div>
                          {!isIP && (
                            <p className="text-[11px] text-slate-500">Start + End Date → Days; or Start Date + Days → End Date</p>
                          )}

                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-2">Is Pink</label>
                            <label className="inline-flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!row.is_pink}
                                onChange={(e) => updateMedicationRow(index, 'is_pink', e.target.checked)}
                                className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                              />
                              <span className="text-sm text-slate-600">Yes</span>
                            </label>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Instructions</label>
                            <textarea
                              value={row.instructions ?? ''}
                              onChange={(e) => updateMedicationRow(index, 'instructions', e.target.value)}
                              placeholder="Add any special instructions or notes for this medication..."
                              rows={3}
                              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white resize-none"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )})}

                  {medications.length === 0 && (
                    <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
                      <Pill className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No medications added yet</p>
                      <button
                        type="button"
                        onClick={addMedicationRow}
                        className="mt-3 text-sm text-primary hover:underline"
                      >
                        Add first medication
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'signature' && (
              <div className="space-y-4 max-w-lg">
                <p className="text-sm text-slate-600">
                  Capture the prescribing clinician&apos;s digital signature. When you save with a
                  signature, the prescription status is set to <strong>Signed</strong> instead of
                  Draft.
                </p>
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <PenLine className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-medium text-slate-600">Doctor&apos;s signature</span>
                  </div>
                  <SignaturePad
                    onSave={handleDoctorSignatureSave}
                    onClear={() => setDoctorsSignature(null)}
                    existingUrl={attachFileDisplayUrl(doctorsSignature)}
                    uploading={signatureUploading}
                  />
                  {signatureUploading && (
                    <p className="text-xs text-slate-500 text-center mt-2">Uploading signature…</p>
                  )}
                  <p className="text-xs text-slate-400 leading-relaxed mt-3">
                    Draw your signature, then tap <strong>Save signature</strong>. The image is stored on
                    the Patient Medication Order.
                  </p>
                </div>
              </div>
            )}
          </div>

          <CreateModalFooter>
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} className={CM_BTN_PRIMARY}>
              {submitting ? 'Saving…' : 'Save Prescription'}
            </button>
          </CreateModalFooter>
        </form>
      </div>

      {createFreqModal && (
        <CreateFrequencyMiniModal
          kind={createFreqModal.kind}
          initialName={createFreqModal.initialName}
          onClose={() => setCreateFreqModal(null)}
          onCreated={(opt) => {
            const { kind, rowIndex } = createFreqModal
            if (kind === 'long_acting') {
              setLongActingFrequencyOptions((prev) => {
                if (prev.some((p) => p.name === opt.name)) return prev
                return [...prev, opt]
              })
              setFrequencyOptions((prev) => {
                if (prev.some((p) => p.name === opt.name)) return prev
                return [...prev, opt]
              })
              updateMedicationRow(rowIndex, 'long_acting_frequency', opt.name)
              setLongActingFrequencyQueries((prev) => ({
                ...prev,
                [rowIndex]: opt.label || opt.name,
              }))
              updateMedicationRow(rowIndex, 'patient_frequency', opt.name)
              setFrequencyQueries((prev) => ({
                ...prev,
                [rowIndex]: opt.label || opt.name,
              }))
            } else {
              setFrequencyOptions((prev) => {
                if (prev.some((p) => p.name === opt.name)) return prev
                return [...prev, opt]
              })
              updateMedicationRow(rowIndex, 'patient_frequency', opt.name)
              setFrequencyQueries((prev) => ({
                ...prev,
                [rowIndex]: opt.label || opt.name,
              }))
            }
            setCreateFreqModal(null)
          }}
        />
      )}
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(modal, document.body)
}