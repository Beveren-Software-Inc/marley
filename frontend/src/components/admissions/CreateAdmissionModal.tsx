import { useState, useEffect } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_OVERLAY,
  CreateModalFooter,
  CreateModalHeader,
  createModalShellClass,
  createModalTabButtonClass,
} from '../ui/CreateModalChrome'
import { SignaturePad, attachFileDisplayUrl } from '../ui/SignaturePad'
import { PatientDocumentAttachmentPreview } from '../ui/PatientDocumentAttachmentPreview'
import { Check } from 'lucide-react'
import { searchPatients, fetchPatients, fetchPatientDoc, uploadPatientFile, type PatientListItem, type PatientDocumentRow } from '../../services/patients'
import { toast } from '../../hooks/useToast'
import { apiRequest } from '../../services/apiClient'
import { useCareContext } from '../../providers/CareContextProvider'
import { isDoctorRole } from '../../config/permissions'
import {
  fetchInpatientRecord,
  updateInpatientAdmission,
  fetchNextCaseNumber,
  getPatientBlockingAdmission,
  type BlockingAdmission,
} from '../../services/inpatientRecords'
import {
  fetchHealthcarePractitioners,
  fetchCompanies,
  resolveDefaultCompany,
  fetchCostCenters,
  getCurrentUserPractitioner,
  fetchMedicalDepartments,
  fetchObservationLevels,
  fetchDocumentTypes,
  type LinkFieldOption,
} from '../../services/common'
import { DocumentTypeSelect } from '../ui/DocumentTypeSelect'
import {
  createObservation,
  createObservationSalesOrder,
  fetchObservationLevelDetails,
} from '../../services/observations'
import { CreatePatientModal } from '../patients/CreatePatientModal'
import { CreatePractitionerModal } from '../practitioners/CreatePractitionerModal'

interface Company {
  name: string
  company_name: string
}

type EditTab = 'details' | 'relatives' | 'visitors' | 'documents'
type CreateTab = 'admission' | 'observation'

type ObservationFormState = {
  addObservation: 'Yes' | 'No' | ''
  chargesStartToday: 'Yes' | 'No' | ''
  observation_level: string
  practitioner: string
  department: string
  designated_security_personel: string
  note: string
  amount: number
  duration: string
  start_date: string
  room: string
}

type RelativeRow = {
  relative_relation: string
  relative_name: string
  relative_id_num: string
  relative_phone_no: string
  relative_alternative_phone_no: string
  relative_alternative_phone_no_2: string
  any_remarks: string
}

type VisitorEditRow = {
  visitors_name: string
  relationship_with_patient: string
  cpr__id_no: string
  any_remarks: string
  entered_by?: string
  entered_date?: string
}

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

const EMPTY_RELATIVE: RelativeRow = {
  relative_relation: '',
  relative_name: '',
  relative_id_num: '',
  relative_phone_no: '',
  relative_alternative_phone_no: '',
  relative_alternative_phone_no_2: '',
  any_remarks: '',
}

const EMPTY_VISITOR: VisitorEditRow = {
  visitors_name: '',
  relationship_with_patient: '',
  cpr__id_no: '',
  any_remarks: '',
}

function resolveSignatureUrl(sig?: string | null): string | undefined {
  if (!sig?.trim()) return undefined
  if (sig.startsWith('data:') || sig.startsWith('http')) return sig
  if (sig.startsWith('/')) return attachFileDisplayUrl(sig)
  return `data:image/png;base64,${sig}`
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function YesNoField({
  label,
  value,
  onChange,
  required,
}: {
  label: string
  value: 'Yes' | 'No' | ''
  onChange: (v: 'Yes' | 'No') => void
  required?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-2 uppercase">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </label>
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

interface CreateAdmissionModalProps {
  onClose: () => void
  onSuccess: (admissionName: string) => void
  patientName?: string
  encounterName?: string
  editAdmissionName?: string
}

export const CreateAdmissionModal = ({ onClose, onSuccess, patientName, encounterName, editAdmissionName }: CreateAdmissionModalProps) => {
  const isEditMode = Boolean(editAdmissionName)
  const [patientQuery, setPatientQuery] = useState(patientName || '')
  const [selectedPatient, setSelectedPatient] = useState<PatientListItem | null>(
    patientName ? { name: patientName, patient_name: patientName } as PatientListItem : null
  )
  const [patients, setPatients] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingRecord, setLoadingRecord] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blockingAdmission, setBlockingAdmission] = useState<BlockingAdmission | null>(null)
  const [checkingBlockingAdmission, setCheckingBlockingAdmission] = useState(false)
  const { userRole, userCostCenter } = useCareContext()
  const [showCreatePatient, setShowCreatePatient] = useState(false)
  const [showCreatePractitioner, setShowCreatePractitioner] = useState(false)
  const [practitionerFieldType, setPractitionerFieldType] = useState<'consultant' | 'psychologist' | 'resident' | null>(null)

  // Company state — company itself is auto-set (no visible field on the form)
  const [, setCompanies] = useState<Company[]>([])
  const [isSingleCompany, setIsSingleCompany] = useState(false)
  const [, setCompanyQuery] = useState('')

  // Branch state
  const [costCenters, setCostCenters] = useState<LinkFieldOption[]>([])
  const [costCenterOpen, setCostCenterOpen] = useState(false)
  const [costCenterQuery, setCostCenterQuery] = useState('')
  
  // Link field options
  const [consultantOptions, setConsultantOptions] = useState<LinkFieldOption[]>([])
  const [psychologistOptions, setPsychologistOptions] = useState<LinkFieldOption[]>([])
  const [residentOptions, setResidentOptions] = useState<LinkFieldOption[]>([])

  // Dropdown open states
  const [consultantOpen, setConsultantOpen] = useState(false)
  const [psychologistOpen, setPsychologistOpen] = useState(false)
  const [residentOpen, setResidentOpen] = useState(false)
  
  // Search queries for link fields
  const [consultantQuery, setConsultantQuery] = useState('')
  const [psychologistQuery, setPsychologistQuery] = useState('')
  const [residentQuery, setResidentQuery] = useState('')

  const [formData, setFormData] = useState({
    case_no: '',
    company: '',
    cost_center: '',
    medical_department: '',
    consultant_doctor: '',
    psychologist_doctor: '',
    residents_doctor: '',
    admission_ordered_for: new Date().toISOString().split('T')[0],
    expected_length_of_stay: '1',
    admission_instruction: '',
    admission_nursing_checklist_template: ''
  })

  const [activeTab, setActiveTab] = useState<EditTab>('details')
  const [activeCreateTab, setActiveCreateTab] = useState<CreateTab>('admission')
  const [relatives, setRelatives] = useState<RelativeRow[]>([])
  const [visitors, setVisitors] = useState<VisitorEditRow[]>([])
  const [signature, setSignature] = useState('')
  const [signatureUploading, setSignatureUploading] = useState(false)
  const [documents, setDocuments] = useState<PatientDocumentRow[]>([])
  const [documentTypes, setDocumentTypes] = useState<{ name: string; document_name?: string }[]>([])
  const [documentUploading, setDocumentUploading] = useState<number | null>(null)

  const [observationForm, setObservationForm] = useState<ObservationFormState>(() => ({
    addObservation: '',
    chargesStartToday: '',
    observation_level: '',
    practitioner: '',
    department: '',
    designated_security_personel: '',
    note: '',
    amount: 0,
    duration: '',
    start_date: new Date().toISOString().split('T')[0],
    room: '',
  }))
  const [observationLevelOptions, setObservationLevelOptions] = useState<LinkFieldOption[]>([])
  const [observationLevelOpen, setObservationLevelOpen] = useState(false)
  const [observationLevelQuery, setObservationLevelQuery] = useState('')
  const [selectedObservationLevel, setSelectedObservationLevel] = useState<LinkFieldOption | null>(null)
  const [observationLevelLoading, setObservationLevelLoading] = useState(false)
  const [obsDepartmentOptions, setObsDepartmentOptions] = useState<LinkFieldOption[]>([])
  const [obsDepartmentOpen, setObsDepartmentOpen] = useState(false)
  const [obsDepartmentQuery, setObsDepartmentQuery] = useState('')
  const [selectedObsDepartment, setSelectedObsDepartment] = useState<LinkFieldOption | null>(null)
  const [obsPractitionerOptions, setObsPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [obsPractitionerOpen, setObsPractitionerOpen] = useState(false)
  const [obsPractitionerQuery, setObsPractitionerQuery] = useState('')
  const [selectedObsPractitioner, setSelectedObsPractitioner] = useState<LinkFieldOption | null>(null)

  // When patientName prop is provided, resolve the real display name
  useEffect(() => {
    if (!patientName || isEditMode) return
    fetchPatientDoc(patientName)
      .then(doc => {
        const displayName = doc.patient_name || patientName
        setSelectedPatient({ name: patientName, patient_name: displayName } as PatientListItem)
        setPatientQuery(displayName)
      })
      .catch(() => {
        // fallback — keep the ID as display name
      })
  }, [patientName, isEditMode])

  // Block create/schedule when the patient already has an open admission
  useEffect(() => {
    if (isEditMode) {
      setBlockingAdmission(null)
      setCheckingBlockingAdmission(false)
      return
    }
    const patientId = selectedPatient?.name
    if (!patientId) {
      setBlockingAdmission(null)
      setCheckingBlockingAdmission(false)
      return
    }

    let cancelled = false
    setCheckingBlockingAdmission(true)
    getPatientBlockingAdmission(patientId)
      .then((existing) => {
        if (!cancelled) setBlockingAdmission(existing)
      })
      .catch(() => {
        if (!cancelled) setBlockingAdmission(null)
      })
      .finally(() => {
        if (!cancelled) setCheckingBlockingAdmission(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedPatient?.name, isEditMode])

  // Load existing admission when editing
  useEffect(() => {
    if (!editAdmissionName) return

    let cancelled = false
    const loadAdmission = async () => {
      setLoadingRecord(true)
      setError(null)
      try {
        const record = await fetchInpatientRecord(editAdmissionName)
        if (cancelled) return

        setSelectedPatient({
          name: record.patient,
          patient_name: record.patient_name || record.patient,
        } as PatientListItem)
        setPatientQuery(record.patient_name || record.patient)

        setFormData({
          case_no: record.case_no || record.name || '',
          company: record.company || '',
          cost_center: record.cost_center || '',
          medical_department: record.medical_department || '',
          consultant_doctor: record.primary_practitioner || record.admission_by_doctor || '',
          psychologist_doctor: record.psychologist_doctor || '',
          residents_doctor: record.residents_doctor_no || '',
          admission_ordered_for: record.admission_ordered_for || new Date().toISOString().split('T')[0],
          expected_length_of_stay: record.expected_length_of_stay != null
            ? String(record.expected_length_of_stay)
            : '1',
          admission_instruction: record.admission_instruction || '',
          admission_nursing_checklist_template: record.admission_nursing_checklist_template || '',
        })

        if (record.admission_doctor_name || record.primary_practitioner) {
          setConsultantQuery(record.admission_doctor_name || record.primary_practitioner || '')
        }
        if (record.psychologist_doctor_name || record.psychologist_doctor) {
          setPsychologistQuery(record.psychologist_doctor_name || record.psychologist_doctor || '')
        }
        if (record.resident_doctor_name || record.residents_doctor_no) {
          setResidentQuery(record.resident_doctor_name || record.residents_doctor_no || '')
        }
        if (record.company) {
          const companyLabel = await fetchCompanies().then((list) =>
            list.find((c) => c.name === record.company)?.label || record.company
          )
          setCompanyQuery(companyLabel || record.company)
          loadCostCenters(record.company)
        }
        if (record.cost_center) {
          setCostCenterQuery(record.cost_center)
        }

        const existingRelatives = record.patient_relatives || []
        if (existingRelatives.length > 0) {
          setRelatives(existingRelatives.map((r) => ({
            relative_relation: r.relative_relation || r.relationship_with_patient || '',
            relative_name: r.relative_name || '',
            relative_id_num: r.relative_id_num || r.cpr__id_no || '',
            relative_phone_no: r.relative_phone_no || '',
            relative_alternative_phone_no: r.relative_alternative_phone_no || '',
            relative_alternative_phone_no_2: r.relative_alternative_phone_no_2 || '',
            any_remarks: r.any_remarks || '',
          })))
        } else {
          setRelatives([])
        }

        const existingVisitors = record.patient_visitors || []
        if (existingVisitors.length > 0) {
          setVisitors(existingVisitors.map((v) => ({
            visitors_name: v.visitors_name || '',
            relationship_with_patient: v.relationship_with_patient || '',
            cpr__id_no: v.cpr__id_no || '',
            any_remarks: v.any_remarks || '',
            entered_by: v.entered_by,
            entered_date: v.entered_date,
          })))
        } else {
          setVisitors([])
        }

        if (record.signature) {
          setSignature(record.signature)
        }

        const existingDocs = record.e_signatures || record.patient_documents || []
        if (existingDocs.length > 0) {
          setDocuments(existingDocs.map((d) => ({
            file_name: d.file_name || '',
            document_type: d.document_type || '',
            transaction_no: d.transaction_no || '',
            upload_remarks: d.upload_remarks || '',
            document: d.document || '',
          })))
        } else {
          setDocuments([])
        }

        fetchDocumentTypes().then(setDocumentTypes).catch(() => setDocumentTypes([]))
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load admission'
          setError(msg)
          toast.error(msg, 5000)
        }
      } finally {
        if (!cancelled) setLoadingRecord(false)
      }
    }

    loadAdmission()
    return () => { cancelled = true }
  }, [editAdmissionName])

  // Load companies on mount
  useEffect(() => {
    const loadCompanies = async () => {
      try {
        const list = await fetchCompanies()
        // fetchCompanies returns LinkFieldOption[] — map to Company shape
        const mapped: Company[] = list.map(c => ({ name: c.name, company_name: c.label }))
        setCompanies(mapped)

        if (mapped.length >= 1) {
          const defaultCompany = resolveDefaultCompany(
            mapped.map((c) => ({ name: c.name, label: c.company_name }))
          )
          const defaultRow = mapped.find((c) => c.name === defaultCompany) || mapped[0]
          if (mapped.length === 1) {
            setIsSingleCompany(true)
          }
          setFormData((prev) => (prev.company ? prev : { ...prev, company: defaultRow.name }))
          setCompanyQuery(defaultRow.company_name)
          loadCostCenters(defaultRow.name)
        }
      } catch (err) {
        console.error('Failed to load companies:', err)
      }
    }
    loadCompanies()
  }, [])

  // Load branches filtered by selected company
  const loadCostCenters = async (companyName?: string, query?: string) => {
    try {
      const list = await fetchCostCenters(companyName, query)
      setCostCenters(list)
    } catch (err) {
      console.error('Failed to load branches:', err)
    }
  }

  // Re-fetch branches when company changes or search query changes
  useEffect(() => {
    if (!formData.company && !isSingleCompany) return
    const timeoutId = setTimeout(() => {
      loadCostCenters(formData.company || undefined, costCenterQuery || undefined)
    }, 300)
    return () => clearTimeout(timeoutId)
  }, [formData.company, costCenterQuery, costCenterOpen])

  // Global branch auto-applies on new admissions (edit keeps the record's own branch).
  useEffect(() => {
    if (editAdmissionName || !userCostCenter) return
    setFormData((prev) => (prev.cost_center ? prev : { ...prev, cost_center: userCostCenter }))
  }, [editAdmissionName, userCostCenter])

  // Search/fetch patients
  useEffect(() => {
    if (!patientOpen) return

    const search = async () => {
      setLoading(true)
      try {
        let results: PatientListItem[] = []
        if (patientQuery.trim() === '') {
          results = await fetchPatients(20, 0)
        } else {
          results = await searchPatients(patientQuery, 20)
        }
        setPatients(results)
      } catch (err) {
        console.error('Failed to fetch/search patients:', err)
        setPatients([])
      } finally {
        setLoading(false)
      }
    }

    const timeoutId = setTimeout(() => {
      search()
    }, patientQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [patientQuery, patientOpen])

  // Search practitioners (filtered by department if selected)
  // Consultant Doctor (primary)
  useEffect(() => {
    if (consultantOpen || consultantQuery || formData.medical_department) {
      const search = async () => {
        try {
          const results = await fetchHealthcarePractitioners(
            consultantQuery || undefined,
            formData.medical_department || undefined
          )
          setConsultantOptions(results)
        } catch (err) {
          console.error('Failed to search practitioners:', err)
        }
      }
      const timeoutId = setTimeout(search, 300)
      return () => clearTimeout(timeoutId)
    }
  }, [consultantQuery, consultantOpen, formData.medical_department])

  // Psychologist Doctor
  useEffect(() => {
    if (psychologistOpen || psychologistQuery || formData.medical_department) {
      const search = async () => {
        try {
          const results = await fetchHealthcarePractitioners(
            psychologistQuery || undefined,
            formData.medical_department || undefined
          )
          setPsychologistOptions(results)
        } catch (err) {
          console.error('Failed to search practitioners:', err)
        }
      }
      const timeoutId = setTimeout(search, 300)
      return () => clearTimeout(timeoutId)
    }
  }, [psychologistQuery, psychologistOpen, formData.medical_department])

  // Residents Doctor
  useEffect(() => {
    if (residentOpen || residentQuery || formData.medical_department) {
      const search = async () => {
        try {
          const results = await fetchHealthcarePractitioners(
            residentQuery || undefined,
            formData.medical_department || undefined
          )
          setResidentOptions(results)
        } catch (err) {
          console.error('Failed to search practitioners:', err)
        }
      }
      const timeoutId = setTimeout(search, 300)
      return () => clearTimeout(timeoutId)
    }
  }, [residentQuery, residentOpen, formData.medical_department])

  // Observation level search (create flow)
  useEffect(() => {
    if (isEditMode || !observationLevelOpen) return
    const timeoutId = setTimeout(async () => {
      try {
        setObservationLevelLoading(true)
        const results = await fetchObservationLevels(observationLevelQuery.trim() || undefined)
        setObservationLevelOptions(results)
      } catch (err) {
        console.error('Failed to search observation levels:', err)
      } finally {
        setObservationLevelLoading(false)
      }
    }, observationLevelQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(timeoutId)
  }, [observationLevelQuery, observationLevelOpen, isEditMode])

  useEffect(() => {
    if (isEditMode || !obsDepartmentOpen) return
    const timeoutId = setTimeout(async () => {
      try {
        const results = await fetchMedicalDepartments(obsDepartmentQuery.trim() || undefined)
        setObsDepartmentOptions(results)
      } catch (err) {
        console.error('Failed to search departments:', err)
      }
    }, obsDepartmentQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(timeoutId)
  }, [obsDepartmentQuery, obsDepartmentOpen, isEditMode])

  useEffect(() => {
    if (isEditMode || !obsPractitionerOpen) return
    const timeoutId = setTimeout(async () => {
      try {
        const results = await fetchHealthcarePractitioners(
          obsPractitionerQuery.trim() || undefined,
          observationForm.department || formData.medical_department || undefined
        )
        setObsPractitionerOptions(results)
      } catch (err) {
        console.error('Failed to search practitioners:', err)
      }
    }, obsPractitionerQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(timeoutId)
  }, [obsPractitionerQuery, obsPractitionerOpen, observationForm.department, formData.medical_department, isEditMode])

  // Pre-fill observation tab from admission details
  useEffect(() => {
    if (isEditMode || activeCreateTab !== 'observation') return
    setObservationForm((prev) => ({
      ...prev,
      practitioner: prev.practitioner || formData.consultant_doctor,
      department: prev.department || formData.medical_department,
      start_date: prev.start_date || formData.admission_ordered_for,
    }))
    if (formData.consultant_doctor && !selectedObsPractitioner) {
      setObsPractitionerQuery(consultantQuery || formData.consultant_doctor)
    }
    if (formData.medical_department && !selectedObsDepartment) {
      setObsDepartmentQuery(formData.medical_department)
    }
  }, [
    activeCreateTab,
    formData.consultant_doctor,
    formData.medical_department,
    formData.admission_ordered_for,
    isEditMode,
    consultantQuery,
    selectedObsDepartment,
    selectedObsPractitioner,
  ])

  // Auto-fill current user's practitioner as consultant doctor (create only)
  useEffect(() => {
    if (isEditMode) return
    getCurrentUserPractitioner().then(pract => {
      if (pract) setFormData(prev => prev.consultant_doctor === '' ? { ...prev, consultant_doctor: pract } : prev)
    })
  }, [isEditMode])

  // Auto-populate next case number (create only); user can change it
  useEffect(() => {
    if (isEditMode) return
    fetchNextCaseNumber().then((nextCaseNo) => {
      if (nextCaseNo) {
        setFormData((prev) => (prev.case_no === '' ? { ...prev, case_no: nextCaseNo } : prev))
      }
    })
  }, [isEditMode])

  // Search nursing templates
  // (UI currently disabled; keep hook placeholder if needed in future)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!selectedPatient) {
      setError('Please select a patient')
      if (!isEditMode) setActiveCreateTab('admission')
      return
    }

    if (!isEditMode && blockingAdmission) {
      const caseLabel = blockingAdmission.case_no || blockingAdmission.name
      const status = blockingAdmission.status || 'active'
      let advice =
        'Open that admission, or finish discharge before scheduling a new one.'
      if (status === 'Discharge Scheduled') {
        advice = 'Complete or cancel that discharge before admitting again.'
      } else if (status === 'Admission Scheduled') {
        advice = 'Open that record to admit the patient, or cancel it first.'
      } else if (status === 'Admitted') {
        advice = 'Discharge the patient first before creating a new admission.'
      }
      setError(
        `Cannot admit this patient — they already have an active admission (${status}: ${caseLabel}). ${advice}`,
      )
      setActiveCreateTab('admission')
      return
    }

    if (!isEditMode && !formData.case_no.trim()) {
      setError('Case No is required')
      setActiveCreateTab('admission')
      return
    }

    if (!formData.company) {
      setError('Company is required')
      if (!isEditMode) setActiveCreateTab('admission')
      return
    }

    if (!formData.cost_center) {
      setError('Branch is required')
      if (!isEditMode) setActiveCreateTab('admission')
      return
    }

    // if (!formData.medical_department) {
    //   setError('Medical Department is required')
    //   return
    // }

    if (!formData.consultant_doctor) {
      setError('Consultant Doctor is required')
      if (!isEditMode) setActiveCreateTab('admission')
      return
    }

    if (!encounterName && !formData.expected_length_of_stay) {
      setError('Expected Length of Stay is required')
      if (!isEditMode) setActiveCreateTab('admission')
      return
    }

    if (!isEditMode && observationForm.addObservation === 'Yes') {
      if (!observationForm.chargesStartToday) {
        setError('Please select Yes or No for whether charges start today')
        setActiveCreateTab('observation')
        return
      }

      if (observationForm.chargesStartToday === 'No' && !observationForm.start_date) {
        setError('Observation start date is required')
        return
      }
      // Doctors must record Notes when adding an observation; room/level remain optional.
      if (isDoctorRole(userRole) && !observationForm.note?.trim()) {
        setError('Notes are required.')
        setActiveCreateTab('observation')
        return
      }
    }

    try {
      setSubmitting(true)

      if (isEditMode && editAdmissionName) {
        const updatePayload: Record<string, unknown> = {
          company: formData.company,
          cost_center: formData.cost_center,
          medical_department: formData.medical_department || undefined,
          consultant_doctor: formData.consultant_doctor,
          psychologist_doctor: formData.psychologist_doctor || undefined,
          residents_doctor: formData.residents_doctor || undefined,
          admission_ordered_for: formData.admission_ordered_for,
          expected_length_of_stay: formData.expected_length_of_stay
            ? parseInt(formData.expected_length_of_stay, 10)
            : undefined,
          admission_instruction: formData.admission_instruction || undefined,
          admission_nursing_checklist_template: formData.admission_nursing_checklist_template || undefined,
          patient_relatives: relatives
            .filter((r) => r.relative_relation.trim())
            .map((r) => ({
              relative_relation: r.relative_relation.trim(),
              relationship_with_patient: r.relative_relation.trim(),
              relative_name: r.relative_name.trim() || undefined,
              relative_id_num: r.relative_id_num.trim() || undefined,
              cpr__id_no: r.relative_id_num.trim() || undefined,
              relative_phone_no: r.relative_phone_no.trim() || undefined,
              relative_alternative_phone_no: r.relative_alternative_phone_no.trim() || undefined,
              relative_alternative_phone_no_2: r.relative_alternative_phone_no_2.trim() || undefined,
              any_remarks: r.any_remarks.trim() || undefined,
            })),
          patient_visitors: visitors
            .filter((v) => v.visitors_name.trim() && v.relationship_with_patient.trim())
            .map((v) => ({
              visitors_name: v.visitors_name.trim(),
              relationship_with_patient: v.relationship_with_patient.trim(),
              cpr__id_no: v.cpr__id_no.trim() || undefined,
              any_remarks: v.any_remarks.trim() || undefined,
              entered_by: v.entered_by,
              entered_date: v.entered_date,
            })),
          signature: signature || undefined,
          patient_documents: documents
            .filter((d) =>
              (d.file_name || '').trim()
              || (d.document_type || '').trim()
              || (d.document || '').trim()
            )
            .map((d) => ({
              file_name: (d.file_name || d.document_type || '').trim(),
              document_type: (d.document_type || '').trim() || undefined,
              transaction_no: (d.transaction_no || '').trim() || undefined,
              upload_remarks: (d.upload_remarks || '').trim() || undefined,
              document: (d.document || '').trim() || undefined,
            })),
        }

        await updateInpatientAdmission(editAdmissionName, updatePayload)
        toast.success('Admission updated successfully!', 3000)
        onSuccess(editAdmissionName)
        return
      }

      const args: any = {
        patient: selectedPatient.name,
        case_no: formData.case_no.trim(),
        company: formData.company,
        cost_center: formData.cost_center,
        medical_department: formData.medical_department,
        primary_practitioner: formData.consultant_doctor,
        psychologist_doctor: formData.psychologist_doctor || undefined,
        residents_doctor_no: formData.residents_doctor || undefined,
        admission_ordered_for: formData.admission_ordered_for,
      }
      
      if (encounterName) {
        args.admission_encounter = encounterName
      }
      
      if (formData.expected_length_of_stay) {
        args.expected_length_of_stay = parseInt(formData.expected_length_of_stay)
      }
      if (formData.admission_instruction) {
        args.admission_instruction = formData.admission_instruction
      }
      if (formData.admission_nursing_checklist_template) {
        args.admission_nursing_checklist_template = formData.admission_nursing_checklist_template
      }

      const resData = await apiRequest<any>(
        '/api/method/healthcare.healthcare.doctype.inpatient_admission.inpatient_admission.schedule_inpatient',
        {
          method: 'POST',
          body: JSON.stringify({ args })
        }
      )

      const message = resData

      if ((message as any)?.exc) {
        let errorMessage = (message as any).exc || 'Failed to create admission'
        
        if (errorMessage.includes('Already Admission Scheduled')) {
          const match = errorMessage.match(/Already Admission Scheduled Patient (.+?) with Inpatient Record (.+?)(?:\n|$)/)
          if (match && match.length >= 3) {
            const patientName = match[1].trim()
            const admissionNo = match[2].trim()
            errorMessage = `This patient (${patientName}) already has a scheduled admission (${admissionNo}). Please check the existing admission or cancel it before creating a new one.`
          } else {
            errorMessage = 'This patient already has a scheduled admission. Please check existing admissions or cancel the current one before creating a new admission.'
          }
        } else if (errorMessage.includes('Missing required details')) {
          errorMessage = 'Please fill in all required fields: Patient, Medical Department, and Consultant Doctor are required.'
        // } else if (errorMessage.includes('Medical Department is required')) {
        //   errorMessage = 'Medical Department is required when creating admission without a Patient Visit.'
        } else if (errorMessage.includes('Primary Practitioner is required')) {
          errorMessage = 'Consultant Doctor is required when creating admission without a Patient Visit.'
        } else if (errorMessage.includes('Patient is required')) {
          errorMessage = 'Please select a patient.'
        }
        
        toast.error(errorMessage, 7000)
        setError(errorMessage)
        return
      }

      const admissionName =
        (typeof message === 'string' && message) ||
        (typeof message === 'object' && message && (message as any).name) ||
        null

      if (admissionName) {
        let successMsg = 'Admission created successfully!'

        if (observationForm.addObservation === 'Yes') {
          try {
            const today = new Date().toISOString().split('T')[0]
            const startDate = observationForm.chargesStartToday === 'Yes'
              ? today
              : (observationForm.start_date || formData.admission_ordered_for || today)

            const obs = await createObservation({
              patient: selectedPatient.name,
              admission_no: admissionName,
              company: formData.company,
              practitioner: observationForm.practitioner || formData.consultant_doctor || undefined,
              department: observationForm.department || formData.medical_department || undefined,
              observation_level: observationForm.observation_level || undefined,
              designated_security_personel: observationForm.designated_security_personel || undefined,
              note: observationForm.note || undefined,
              amount: observationForm.amount || undefined,
              duration: observationForm.duration || undefined,
              start_date: startDate,
              room: observationForm.room || undefined,
            })

            if (observationForm.chargesStartToday === 'Yes') {
              try {
                await createObservationSalesOrder(obs.name)
                successMsg = 'Admission and observation created (charges started today)'
              } catch {
                successMsg = 'Admission and observation created (sales order could not be created)'
              }
            } else {
              successMsg = 'Admission and observation created successfully!'
            }
          } catch (obsErr) {
            toast.error(
              obsErr instanceof Error ? obsErr.message : 'Admission saved but observation failed',
              7000
            )
            onSuccess(admissionName)
            return
          }
        }

        toast.success(successMsg, 3000)
        onSuccess(admissionName)
      } else {
        const errorMsg = 'Admission created but no name returned'
        toast.error(errorMsg)
        setError(errorMsg)
      }
    } catch (err) {
      // apiRequest throws on a Frappe `exc`, so map the backend message to friendly guidance here
      // (the message.exc branch above never runs).
      let errorMessage = err instanceof Error ? err.message : 'Failed to create admission'
      if (errorMessage.includes('Already Admission Scheduled')) {
        const match = errorMessage.match(/Already Admission Scheduled Patient (.+?) with Inpatient Record (.+?)(?:\n|$)/)
        errorMessage = match && match.length >= 3
          ? `This patient (${match[1].trim()}) already has a scheduled admission (${match[2].trim()}). Please check the existing admission or cancel it before creating a new one.`
          : 'This patient already has a scheduled admission. Please check existing admissions or cancel the current one before creating a new admission.'
      } else if (errorMessage.includes('Missing required details')) {
        errorMessage = 'Please fill in all required fields: Patient, Medical Department, and Consultant Doctor are required.'
      } else if (errorMessage.includes('Primary Practitioner is required')) {
        errorMessage = 'Consultant Doctor is required when creating admission without a Patient Visit.'
      } else if (errorMessage.includes('Patient is required')) {
        errorMessage = 'Please select a patient.'
      }
      toast.error(errorMessage, 7000)
      setError(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  const closeAllDropdowns = () => {
    setPatientOpen(false)
        setCostCenterOpen(false)
    setConsultantOpen(false)
    setPsychologistOpen(false)
    setResidentOpen(false)
  }

  const handleSignatureSave = async (file: File) => {
    setSignatureUploading(true)
    try {
      const dataUrl = await fileToDataUrl(file)
      setSignature(dataUrl)
      toast.success('Signature captured')
    } catch {
      toast.error('Failed to capture signature')
    } finally {
      setSignatureUploading(false)
    }
  }

  const filledRelativesCount = relatives.filter((r) => r.relative_relation.trim()).length
  const filledVisitorsCount = visitors.filter((v) => v.visitors_name.trim()).length
  const filledDocumentsCount = documents.filter(
    (d) => (d.file_name || '').trim() || (d.document_type || '').trim() || (d.document || '').trim()
  ).length
  const showAdmissionFields = isEditMode
    ? activeTab === 'details'
    : activeCreateTab === 'admission'

  const addDocumentRow = () =>
    setDocuments((prev) => [...prev, { file_name: '', document_type: '', transaction_no: '', upload_remarks: '' }])
  const removeDocumentRow = (idx: number) => setDocuments((prev) => prev.filter((_, i) => i !== idx))
  const updateDocumentRow = (idx: number, field: keyof PatientDocumentRow, value: string) => {
    setDocuments((prev) => {
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

  const handleObservationLevelSelect = async (obsLevel: LinkFieldOption) => {
    setSelectedObservationLevel(obsLevel)
    setObservationLevelQuery(obsLevel.label)
    setObservationLevelOpen(false)

    let rateFromLevel: number | undefined
    let intervalFromLevel: string | undefined
    try {
      const details = await fetchObservationLevelDetails(obsLevel.name)
      if (details?.rate != null && Number(details.rate) > 0) {
        rateFromLevel = Number(details.rate)
      }
      if (details?.interval) {
        intervalFromLevel = details.interval
      }
    } catch {
      // keep manual values
    }

    setObservationForm((prev) => {
      const next = { ...prev, observation_level: obsLevel.name }
      if (rateFromLevel != null && (!prev.amount || Number(prev.amount) === 0)) {
        next.amount = rateFromLevel
      }
      if (intervalFromLevel) {
        next.duration = intervalFromLevel
      }
      return next
    })
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-3xl w-full max-h-[90vh] overflow-hidden')}>
        <CreateModalHeader title={isEditMode ? 'Edit Admission' : 'Create New Admission'} onClose={onClose}>
          {isEditMode ? (
            <div className="-mb-px mt-3 flex border-b border-emerald-100/80">
              {([
                { id: 'details' as const, label: 'Details' },
                { id: 'relatives' as const, label: 'Relatives', count: filledRelativesCount },
                { id: 'visitors' as const, label: 'Visitors', count: filledVisitorsCount },
                { id: 'documents' as const, label: 'Documents', count: filledDocumentsCount },
              ]).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`${createModalTabButtonClass(activeTab === tab.id)} flex items-center gap-1.5`}
                >
                  {tab.label}
                  {tab.count ? (
                    <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-emerald-100 px-1 py-0.5 text-[10px] font-bold text-emerald-700">
                      {tab.count}
                    </span>
                  ) : null}
                  {tab.id === 'visitors' && signature ? (
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="-mb-px mt-3 flex border-b border-emerald-100/80">
              {([
                { id: 'admission' as const, label: 'Admission' },
                { id: 'observation' as const, label: 'Observation' },
              ]).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveCreateTab(tab.id)}
                  className={`${createModalTabButtonClass(activeCreateTab === tab.id)} flex items-center gap-1.5`}
                >
                  {tab.label}
                  {tab.id === 'observation' && observationForm.addObservation === 'Yes' ? (
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </CreateModalHeader>

        {loadingRecord ? (
          <div className={`${CREATE_MODAL_BODY_GRADIENT} p-6 text-sm text-slate-600`}>
            Loading admission details...
          </div>
        ) : (
        <form
          onSubmit={handleSubmit}
          className={`${CREATE_MODAL_BODY_GRADIENT} space-y-4 p-6`}
          onClick={(e) => {
          const target = e.target as HTMLElement
          if (target.tagName !== 'INPUT' && !target.closest('.absolute')) {
            closeAllDropdowns()
          }
        }}>
          {!isEditMode && blockingAdmission ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-medium">Unable to schedule a new admission</p>
              <p className="mt-1 text-amber-800/90">
                This patient already has an active admission (
                {blockingAdmission.status || 'active'}:{' '}
                <span className="font-semibold">
                  {blockingAdmission.case_no || blockingAdmission.name}
                </span>
                ).{' '}
                {blockingAdmission.status === 'Discharge Scheduled'
                  ? 'Complete or cancel that discharge before admitting again.'
                  : blockingAdmission.status === 'Admission Scheduled'
                    ? 'Open that record to admit the patient, or cancel it first.'
                    : blockingAdmission.status === 'Admitted'
                      ? 'Discharge the patient first before creating a new admission.'
                      : 'Continue with the existing admission or finish discharge before creating a new one.'}
              </p>
            </div>
          ) : null}
          {!isEditMode && checkingBlockingAdmission && selectedPatient ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
              Checking for an existing admission…
            </div>
          ) : null}
          {showAdmissionFields && (
          <>
          {/* Patient Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
              Patient <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={selectedPatient ? (selectedPatient.patient_name || selectedPatient.name) : patientQuery}
                onChange={(e) => {
                  if (isEditMode) return
                  // When user types after selecting, clear the selection so input becomes fully editable
                  setSelectedPatient(null)
                  setPatientQuery(e.target.value)
                  setPatientOpen(true)
                }}
                onFocus={() => { if (!isEditMode) setPatientOpen(true) }}
                placeholder="Search patient..."
                readOnly={isEditMode}
                className={`w-full rounded-md border border-slate-300 pr-9 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${isEditMode ? 'bg-slate-50 text-slate-600 cursor-not-allowed' : ''}`}
              />
              {!isEditMode && (
              <button
                type="button"
                onClick={() => setShowCreatePatient(true)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs hover:bg-primary/90"
                title="Add Patient"
              >
                +
              </button>
              )}
              {!isEditMode && patientOpen && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                  {loading ? (
                    <div className="px-3 py-2 text-xs text-slate-500">Loading patients...</div>
                  ) : patients.length > 0 ? (
                    patients.map((patient) => (
                      <button
                        key={patient.name}
                        type="button"
                        className="w-full text-left px-[11px] py-2 text-sm hover:bg-blue-50"
                        onClick={() => {
                          setSelectedPatient(patient)
                          setPatientQuery(patient.patient_name || patient.name)
                          setPatientOpen(false)
                        }}
                      >
                        <div className="font-medium">{patient.patient_name || patient.name}</div>
                        <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                          {patient.file_number && <span>File: {patient.file_number}</span>}
                          {patient.id_number && <span>ID: {patient.id_number}</span>}
                          {patient.mobile && <span>{patient.mobile}</span>}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-xs text-slate-500">
                      {patientQuery ? 'No Patient Found.' : 'NO PATIENTS FOUND.'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Case No — auto-populated on create; editable like Patient File No */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
              Case No <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.case_no}
              onChange={(e) => {
                if (isEditMode) return
                setFormData((prev) => ({ ...prev, case_no: e.target.value }))
              }}
              readOnly={isEditMode}
              required={!isEditMode}
              placeholder="Case number"
              className={`w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${isEditMode ? 'bg-slate-50 text-slate-600 cursor-not-allowed' : ''}`}
            />
          </div>

          {/* Branch row — company is set automatically in the backend */}
          <div className="grid gap-4 grid-cols-1">
            {/* Branch — always shown, mandatory */}
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
                Branch <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.cost_center ? (costCenters.find(c => c.name === formData.cost_center)?.label ?? formData.cost_center) : costCenterQuery}
                onChange={(e) => {
                  setCostCenterQuery(e.target.value)
                  setCostCenterOpen(true)
                  setFormData(prev => ({ ...prev, cost_center: '' }))
                }}
                onFocus={() => setCostCenterOpen(true)}
                placeholder="SEARCH BRANCH..."
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
              />
              {costCenterOpen && (formData.company || isSingleCompany) && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                  {costCenters.length > 0 ? (
                    costCenters.map((cc) => (
                      <button
                        key={cc.name}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                        onClick={() => {
                          setFormData(prev => ({ ...prev, cost_center: cc.name }))
                          setCostCenterQuery(cc.label)
                          setCostCenterOpen(false)
                        }}
                      >
                        {cc.label}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-xs text-slate-500">NO BRANCHES FOUND</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Medical Department */}
            {/* <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
                Medical Department <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.medical_department || deptQuery}
                  onChange={(e) => {
                    setDeptQuery(e.target.value)
                    setDeptOpen(true)
                  }}
                  onFocus={() => setDeptOpen(true)}
                  placeholder="Search Medical Department..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
                {deptOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                    {medicalDepartments.length > 0 ? (
                      medicalDepartments.map((dept) => (
                        <button
                          key={dept.name}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                          onClick={() => {
                            setFormData(prev => ({ ...prev, medical_department: dept.name, primary_practitioner: '', secondary_practitioner: '' }))
                            setDeptQuery(dept.label)
                            setDeptOpen(false)
                          }}
                        >
                          {dept.label}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-xs text-slate-500">NO DEPARTMENTS FOUND</div>
                    )}
                  </div>
                )}
              </div>
            </div> */}

            {/* Consultant Doctor (Primary Practitioner) */}
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
                Consultant Doctor <span className="text-red-500">*</span>
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={formData.consultant_doctor ? consultantOptions.find(p => p.name === formData.consultant_doctor)?.label || formData.consultant_doctor : consultantQuery}
                  onChange={(e) => {
                    // Clear current selection so user can freely edit text
                    setFormData(prev => ({ ...prev, consultant_doctor: '' }))
                    setConsultantQuery(e.target.value)
                    setConsultantOpen(true)
                  }}
                  onFocus={() => setConsultantOpen(true)}
                  placeholder="Search Consultant Doctor..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setPractitionerFieldType('consultant')
                    setShowCreatePractitioner(true)
                  }}
                  className="absolute right-2 p-1 text-primary hover:text-primary/80 rounded"
                  title="Create New Practitioner"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                {consultantOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto top-full">
                    {consultantOptions.length > 0 ? (
                      consultantOptions.map((pract) => (
                        <button
                          key={pract.name}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                          onClick={() => {
                            setFormData(prev => ({ ...prev, consultant_doctor: pract.name }))
                            setConsultantQuery(pract.label)
                            setConsultantOpen(false)
                          }}
                        >
                          <div className="font-medium">{pract.label}</div>
                          <div className="text-xs text-slate-500">
                            {[pract.name, pract.department].filter(Boolean).join(' · ')}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-xs text-slate-500">NO PRACTITIONERS FOUND</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Psychologist Doctor */}
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
                Psychologist Doctor
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={formData.psychologist_doctor ? psychologistOptions.find(p => p.name === formData.psychologist_doctor)?.label || formData.psychologist_doctor : psychologistQuery}
                  onChange={(e) => {
                    // Clear current selection so user can freely edit text
                    setFormData(prev => ({ ...prev, psychologist_doctor: '' }))
                    setPsychologistQuery(e.target.value)
                    setPsychologistOpen(true)
                  }}
                  onFocus={() => setPsychologistOpen(true)}
                  placeholder="Search Psychologist Doctor..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setPractitionerFieldType('psychologist')
                    setShowCreatePractitioner(true)
                  }}
                  className="absolute right-2 p-1 text-primary hover:text-primary/80 rounded"
                  title="Create New Practitioner"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                {psychologistOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto top-full">
                    {psychologistOptions.length > 0 ? (
                      psychologistOptions.map((pract) => (
                        <button
                          key={pract.name}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                          onClick={() => {
                            setFormData(prev => ({ ...prev, psychologist_doctor: pract.name }))
                            setPsychologistQuery(pract.label)
                            setPsychologistOpen(false)
                          }}
                        >
                          <div className="font-medium">{pract.label}</div>
                          <div className="text-xs text-slate-500">
                            {[pract.name, pract.department].filter(Boolean).join(' · ')}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-xs text-slate-500">NO PRACTITIONERS FOUND</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Residents Doctor */}
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
                Residents Doctor
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={formData.residents_doctor ? residentOptions.find(p => p.name === formData.residents_doctor)?.label || formData.residents_doctor : residentQuery}
                  onChange={(e) => {
                    // Clear current selection so user can freely edit text
                    setFormData(prev => ({ ...prev, residents_doctor: '' }))
                    setResidentQuery(e.target.value)
                    setResidentOpen(true)
                  }}
                  onFocus={() => setResidentOpen(true)}
                  placeholder="Search Residents Doctor..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setPractitionerFieldType('resident')
                    setShowCreatePractitioner(true)
                  }}
                  className="absolute right-2 p-1 text-primary hover:text-primary/80 rounded"
                  title="Create New Practitioner"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                {residentOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto top-full">
                    {residentOptions.length > 0 ? (
                      residentOptions.map((pract) => (
                        <button
                          key={pract.name}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                          onClick={() => {
                            setFormData(prev => ({ ...prev, residents_doctor: pract.name }))
                            setResidentQuery(pract.label)
                            setResidentOpen(false)
                          }}
                        >
                          <div className="font-medium">{pract.label}</div>
                          <div className="text-xs text-slate-500">
                            {[pract.name, pract.department].filter(Boolean).join(' · ')}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-xs text-slate-500">NO PRACTITIONERS FOUND</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Admission Ordered For */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
                Admission Ordered For
              </label>
              <input
                type="date"
                value={formData.admission_ordered_for}
                onChange={(e) => setFormData(prev => ({ ...prev, admission_ordered_for: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Expected Length of Stay */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
                Expected Length of Stay (days) {!encounterName && <span className="text-red-500">*</span>}
              </label>
              <input
                type="number"
                value={formData.expected_length_of_stay}
                required={!encounterName}
                onChange={(e) => setFormData(prev => ({ ...prev, expected_length_of_stay: e.target.value }))}
                placeholder="Days"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Admission Instructions */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
              Admission Instructions
            </label>
            <textarea
              value={formData.admission_instruction}
              onChange={(e) => setFormData(prev => ({ ...prev, admission_instruction: e.target.value }))}
              rows={3}
              placeholder="Admission instructions..."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          </>
          )}

          {!isEditMode && activeCreateTab === 'observation' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                Optionally create an observation linked to this admission when you save.
              </p>

              <YesNoField
                label="Add observation with this admission?"
                value={observationForm.addObservation}
                onChange={(v) => setObservationForm((prev) => ({ ...prev, addObservation: v }))}
                required
              />

              {observationForm.addObservation === 'Yes' && (
                <>
                  <YesNoField
                    label="Start charges today?"
                    value={observationForm.chargesStartToday}
                    onChange={(v) => setObservationForm((prev) => ({ ...prev, chargesStartToday: v }))}
                    required
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
                        Observation Level
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={selectedObservationLevel ? selectedObservationLevel.label : observationLevelQuery}
                          onChange={(e) => {
                            setObservationLevelQuery(e.target.value)
                            setObservationLevelOpen(true)
                            setSelectedObservationLevel(null)
                            setObservationForm((prev) => ({ ...prev, observation_level: '' }))
                          }}
                          onFocus={() => setObservationLevelOpen(true)}
                          placeholder="Search observation level..."
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        {observationLevelOpen && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                            {observationLevelLoading ? (
                              <div className="px-3 py-2 text-sm text-slate-500">Loading...</div>
                            ) : observationLevelOptions.length > 0 ? (
                              observationLevelOptions.map((obsLevel) => (
                                <button
                                  key={obsLevel.name}
                                  type="button"
                                  onClick={() => handleObservationLevelSelect(obsLevel)}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
                                >
                                  {obsLevel.label}
                                </button>
                              ))
                            ) : (
                              <div className="px-3 py-2 text-sm text-slate-500">NO OBSERVATION LEVELS FOUND</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">Start Date <span className="text-red-500">*</span></label>
                      <input
                        type="date"
                        value={observationForm.chargesStartToday === 'Yes'
                          ? new Date().toISOString().split('T')[0]
                          : observationForm.start_date}
                        onChange={(e) => setObservationForm((prev) => ({ ...prev, start_date: e.target.value }))}
                        disabled={observationForm.chargesStartToday === 'Yes'}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-50 disabled:text-slate-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">Department</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={selectedObsDepartment ? selectedObsDepartment.label : obsDepartmentQuery}
                          onChange={(e) => {
                            setObsDepartmentQuery(e.target.value)
                            setObsDepartmentOpen(true)
                            setSelectedObsDepartment(null)
                            setObservationForm((prev) => ({ ...prev, department: '' }))
                          }}
                          onFocus={() => setObsDepartmentOpen(true)}
                          placeholder="Search department..."
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        {obsDepartmentOpen && obsDepartmentOptions.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                            {obsDepartmentOptions.map((dept) => (
                              <button
                                key={dept.name}
                                type="button"
                                onClick={() => {
                                  setSelectedObsDepartment(dept)
                                  setObsDepartmentQuery(dept.label)
                                  setObsDepartmentOpen(false)
                                  setObservationForm((prev) => ({ ...prev, department: dept.name }))
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
                              >
                                {dept.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">Doctor Name</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={selectedObsPractitioner ? selectedObsPractitioner.label : obsPractitionerQuery}
                          onChange={(e) => {
                            setObsPractitionerQuery(e.target.value)
                            setObsPractitionerOpen(true)
                            setSelectedObsPractitioner(null)
                            setObservationForm((prev) => ({ ...prev, practitioner: '' }))
                          }}
                          onFocus={() => setObsPractitionerOpen(true)}
                          placeholder="Search doctor..."
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        {obsPractitionerOpen && obsPractitionerOptions.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                            {obsPractitionerOptions.map((pract) => (
                              <button
                                key={pract.name}
                                type="button"
                                onClick={() => {
                                  setSelectedObsPractitioner(pract)
                                  setObsPractitionerQuery(pract.label)
                                  setObsPractitionerOpen(false)
                                  setObservationForm((prev) => ({ ...prev, practitioner: pract.name }))
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
                              >
                                <div className="font-medium">{pract.label}</div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">Amount</label>
                      <input
                        type="number"
                        step="0.01"
                        value={observationForm.amount}
                        onChange={(e) => setObservationForm((prev) => ({
                          ...prev,
                          amount: parseFloat(e.target.value) || 0,
                        }))}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">Duration</label>
                      <input
                        type="text"
                        value={observationForm.duration}
                        onChange={(e) => setObservationForm((prev) => ({ ...prev, duration: e.target.value }))}
                        placeholder="e.g. 60M, 24H"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">Notes</label>
                    <textarea
                      value={observationForm.note}
                      onChange={(e) => setObservationForm((prev) => ({ ...prev, note: e.target.value }))}
                      rows={3}
                      placeholder="Observation notes..."
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {isEditMode && activeTab === 'relatives' && (
            <div>
              <p className="text-sm text-slate-500 mb-4">
                Add relatives / guardians responsible for the patient during this admission.
              </p>
              <div className="border border-slate-200 rounded-md">
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-slate-50">
                  <h3 className="text-sm font-semibold text-slate-800">Relatives / Guardians</h3>
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded-full bg-primary text-white hover:bg-primary/90"
                    onClick={() => setRelatives((prev) => [...prev, { ...EMPTY_RELATIVE }])}
                  >
                    + Add Relative
                  </button>
                </div>
                {relatives.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-slate-500">
                    NO RELATIVES ADDED YET.
                  </div>
                ) : (
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
                                setRelatives((prev) => prev.map((r, i) => i === idx ? { ...r, relative_relation: value } : r))
                              }}
                              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                              <option value="">Select relation</option>
                              {RELATION_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Name</label>
                            <input
                              type="text"
                              value={row.relative_name}
                              onChange={(e) => setRelatives((prev) => prev.map((r, i) => i === idx ? { ...r, relative_name: e.target.value } : r))}
                              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                              placeholder="Relative full name"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">ID Number</label>
                            <input
                              type="text"
                              value={row.relative_id_num}
                              onChange={(e) => setRelatives((prev) => prev.map((r, i) => i === idx ? { ...r, relative_id_num: e.target.value } : r))}
                              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                              placeholder="CPR / ID"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Phone No</label>
                            <input
                              type="text"
                              value={row.relative_phone_no}
                              onChange={(e) => setRelatives((prev) => prev.map((r, i) => i === idx ? { ...r, relative_phone_no: e.target.value } : r))}
                              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Alt. Phone</label>
                            <input
                              type="text"
                              value={row.relative_alternative_phone_no}
                              onChange={(e) => setRelatives((prev) => prev.map((r, i) => i === idx ? { ...r, relative_alternative_phone_no: e.target.value } : r))}
                              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Alt. Phone 2</label>
                            <input
                              type="text"
                              value={row.relative_alternative_phone_no_2}
                              onChange={(e) => setRelatives((prev) => prev.map((r, i) => i === idx ? { ...r, relative_alternative_phone_no_2: e.target.value } : r))}
                              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-slate-700 mb-1">Remarks</label>
                            <textarea
                              value={row.any_remarks}
                              onChange={(e) => setRelatives((prev) => prev.map((r, i) => i === idx ? { ...r, any_remarks: e.target.value } : r))}
                              rows={2}
                              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setRelatives((prev) => prev.filter((_, i) => i !== idx))}
                            className="mt-5 text-xs text-red-600 hover:text-red-700 px-2 py-1"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {isEditMode && activeTab === 'visitors' && (
            <div className="space-y-6">
              <div>
                <p className="text-sm text-slate-500 mb-4">
                  Manage visitors allowed for this admission.
                </p>
                <div className="border border-slate-200 rounded-md">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-slate-50">
                    <h3 className="text-sm font-semibold text-slate-800">Patient Visitors</h3>
                    <button
                      type="button"
                      className="text-xs px-2 py-1 rounded-full bg-primary text-white hover:bg-primary/90"
                      onClick={() => setVisitors((prev) => [...prev, { ...EMPTY_VISITOR }])}
                    >
                      + Add Visitor
                    </button>
                  </div>
                  {visitors.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-slate-500">
                      NO VISITORS ADDED YET.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {visitors.map((row, idx) => (
                        <div key={idx} className="px-3 py-3 space-y-2">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">
                                Visitor Name <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={row.visitors_name}
                                onChange={(e) => setVisitors((prev) => prev.map((v, i) => i === idx ? { ...v, visitors_name: e.target.value } : v))}
                                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">
                                Relationship <span className="text-red-500">*</span>
                              </label>
                              <select
                                value={row.relationship_with_patient}
                                onChange={(e) => setVisitors((prev) => prev.map((v, i) => i === idx ? { ...v, relationship_with_patient: e.target.value } : v))}
                                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                              >
                                <option value="">Select relationship…</option>
                                {RELATION_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">CPR / ID No</label>
                              <input
                                type="text"
                                value={row.cpr__id_no}
                                onChange={(e) => setVisitors((prev) => prev.map((v, i) => i === idx ? { ...v, cpr__id_no: e.target.value } : v))}
                                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">Entered Date</label>
                              <input
                                type="text"
                                value={row.entered_date || new Date().toLocaleDateString('en-GB')}
                                readOnly
                                className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs bg-slate-50 text-slate-500"
                              />
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <div className="flex-1">
                              <label className="block text-xs font-medium text-slate-700 mb-1">Remarks</label>
                              <textarea
                                value={row.any_remarks}
                                onChange={(e) => setVisitors((prev) => prev.map((v, i) => i === idx ? { ...v, any_remarks: e.target.value } : v))}
                                rows={2}
                                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => setVisitors((prev) => prev.filter((_, i) => i !== idx))}
                              className="mt-5 text-xs text-red-600 hover:text-red-700 px-2 py-1"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-1">Admission Signature</h3>
                <p className="text-sm text-slate-500 mb-3">
                  Capture a signature for this admission (stored on the admission record).
                </p>
                <SignaturePad
                  onSave={handleSignatureSave}
                  onClear={() => setSignature('')}
                  existingUrl={resolveSignatureUrl(signature)}
                  uploading={signatureUploading}
                />
              </div>
            </div>
          )}

          {isEditMode && activeTab === 'documents' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                Attach admission documents (e-signatures child table on the admission record).
              </p>
              {documents.length === 0 && (
                <div className="text-center py-10 rounded-lg border-2 border-dashed border-slate-200 text-slate-400 text-sm">
                  NO DOCUMENTS ADDED YET.
                </div>
              )}
              {documents.map((row, idx) => (
                <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Document #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeDocumentRow(idx)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-0.5">File Name</label>
                      <input
                        value={row.file_name}
                        onChange={(e) => updateDocumentRow(idx, 'file_name', e.target.value)}
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                      />
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
                      <input
                        value={row.transaction_no || ''}
                        onChange={(e) => updateDocumentRow(idx, 'transaction_no', e.target.value)}
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-0.5">Upload Remarks</label>
                      <input
                        value={row.upload_remarks || ''}
                        onChange={(e) => updateDocumentRow(idx, 'upload_remarks', e.target.value)}
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-0.5">File Attachment</label>
                      <input
                        type="file"
                        disabled={documentUploading === idx}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) handleDocumentFile(idx, f)
                          e.target.value = ''
                        }}
                        className="w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-white"
                      />
                      {row.document && documentUploading !== idx && (
                        <PatientDocumentAttachmentPreview
                          url={row.document}
                          fileName={row.file_name}
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addDocumentRow}
                className="text-sm text-primary font-medium hover:underline"
              >
                + Add document
              </button>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <CreateModalFooter>
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || loadingRecord || Boolean(!isEditMode && blockingAdmission) || checkingBlockingAdmission}
              className={CM_BTN_PRIMARY}
            >
              {submitting
                ? (isEditMode ? 'Saving...' : 'Creating...')
                : (isEditMode ? 'Save Changes' : 'Create Admission')}
            </button>
          </CreateModalFooter>
        </form>
        )}
      </div>

      {showCreatePatient && (
        <CreatePatientModal
          onClose={() => setShowCreatePatient(false)}
          onSuccess={(patientName) => {
            const newPatient: PatientListItem = { name: patientName, patient_name: patientName }
            setSelectedPatient(newPatient)
            setPatientQuery(newPatient.patient_name)
            setPatientOpen(false)
            setShowCreatePatient(false)
          }}
        />
      )}
      {showCreatePractitioner && (
        <CreatePractitionerModal
          onClose={() => {
            setShowCreatePractitioner(false)
            setPractitionerFieldType(null)
          }}
          onSuccess={(practitionerName) => {
            if (practitionerFieldType === 'consultant') {
              setFormData(prev => ({ ...prev, consultant_doctor: practitionerName }))
              const newPract = consultantOptions.find(p => p.name === practitionerName)
              if (newPract) {
                setConsultantQuery(newPract.label)
              } else {
                fetchHealthcarePractitioners(formData.medical_department).then(setConsultantOptions).catch(console.error)
                setConsultantQuery(practitionerName)
              }
              setConsultantOpen(false)
            } else if (practitionerFieldType === 'psychologist') {
              setFormData(prev => ({ ...prev, psychologist_doctor: practitionerName }))
              const newPract = psychologistOptions.find(p => p.name === practitionerName)
              if (newPract) {
                setPsychologistQuery(newPract.label)
              } else {
                fetchHealthcarePractitioners(formData.medical_department).then(setPsychologistOptions).catch(console.error)
                setPsychologistQuery(practitionerName)
              }
              setPsychologistOpen(false)
            } else if (practitionerFieldType === 'resident') {
              setFormData(prev => ({ ...prev, residents_doctor: practitionerName }))
              const newPract = residentOptions.find(p => p.name === practitionerName)
              if (newPract) {
                setResidentQuery(newPract.label)
              } else {
                fetchHealthcarePractitioners(formData.medical_department).then(setResidentOptions).catch(console.error)
                setResidentQuery(practitionerName)
              }
              setResidentOpen(false)
            }
            setShowCreatePractitioner(false)
            setPractitionerFieldType(null)
          }}
        />
      )}
    </div>
  )
}