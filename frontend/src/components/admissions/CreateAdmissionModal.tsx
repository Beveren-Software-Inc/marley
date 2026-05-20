import { useState, useEffect } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { searchPatients, fetchPatients, fetchPatientDoc, type PatientListItem } from '../../services/patients'
import { toast } from '../../hooks/useToast'
import { apiRequest } from '../../services/apiClient'
import { 
  fetchHealthcarePractitioners, 
  fetchCompanies,
  resolveDefaultCompany,
  fetchCostCenters,
  getCurrentUserPractitioner,
  type LinkFieldOption
} from '../../services/common'
import { CreatePatientModal } from '../patients/CreatePatientModal'
import { CreatePractitionerModal } from '../practitioners/CreatePractitionerModal'

interface Company {
  name: string
  company_name: string
}

interface CreateAdmissionModalProps {
  onClose: () => void
  onSuccess: (admissionName: string) => void
  patientName?: string
  encounterName?: string
}

export const CreateAdmissionModal = ({ onClose, onSuccess, patientName, encounterName }: CreateAdmissionModalProps) => {
  const [patientQuery, setPatientQuery] = useState(patientName || '')
  const [selectedPatient, setSelectedPatient] = useState<PatientListItem | null>(
    patientName ? { name: patientName, patient_name: patientName } as PatientListItem : null
  )
  const [patients, setPatients] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreatePatient, setShowCreatePatient] = useState(false)
  const [showCreatePractitioner, setShowCreatePractitioner] = useState(false)
  const [practitionerFieldType, setPractitionerFieldType] = useState<'consultant' | 'psychologist' | 'resident' | null>(null)

  // Company state
  const [companies, setCompanies] = useState<Company[]>([])
  const [isSingleCompany, setIsSingleCompany] = useState(false)
  const [companyOpen, setCompanyOpen] = useState(false)
  const [companyQuery, setCompanyQuery] = useState('')

  // Cost center state
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

  // When patientName prop is provided, resolve the real display name
  useEffect(() => {
    if (!patientName) return
    fetchPatientDoc(patientName)
      .then(doc => {
        const displayName = doc.patient_name || patientName
        setSelectedPatient({ name: patientName, patient_name: displayName } as PatientListItem)
        setPatientQuery(displayName)
      })
      .catch(() => {
        // fallback — keep the ID as display name
      })
  }, [patientName])

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

  // Load cost centers filtered by selected company
  const loadCostCenters = async (companyName?: string, query?: string) => {
    try {
      const list = await fetchCostCenters(companyName, query)
      setCostCenters(list)
    } catch (err) {
      console.error('Failed to load cost centers:', err)
    }
  }

  // Re-fetch cost centers when company changes or search query changes
  useEffect(() => {
    if (!formData.company && !isSingleCompany) return
    const timeoutId = setTimeout(() => {
      loadCostCenters(formData.company || undefined, costCenterQuery || undefined)
    }, 300)
    return () => clearTimeout(timeoutId)
  }, [formData.company, costCenterQuery, costCenterOpen])

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

  // Auto-fill current user's practitioner as consultant doctor
  useEffect(() => {
    getCurrentUserPractitioner().then(pract => {
      if (pract) setFormData(prev => prev.consultant_doctor === '' ? { ...prev, consultant_doctor: pract } : prev)
    })
  }, [])

  // Search nursing templates
  // (UI currently disabled; keep hook placeholder if needed in future)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!selectedPatient) {
      setError('Please select a patient')
      return
    }

    if (!formData.company) {
      setError('Company is required')
      return
    }

    if (!formData.cost_center) {
      setError('Cost Center is required')
      return
    }

    // if (!formData.medical_department) {
    //   setError('Medical Department is required')
    //   return
    // }

    if (!formData.consultant_doctor) {
      setError('Consultant Doctor is required')
      return
    }

    if (!encounterName && !formData.expected_length_of_stay) {
      setError('Expected Length of Stay is required')
      return
    }

    try {
      setSubmitting(true)

      const args: any = {
        patient: selectedPatient.name,
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
        toast.success('Admission created successfully!', 3000)
        onSuccess(admissionName)
      } else {
        const errorMsg = 'Admission created but no name returned'
        toast.error(errorMsg)
        setError(errorMsg)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create admission'
      toast.error(errorMessage, 5000)
      setError(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  const closeAllDropdowns = () => {
    setPatientOpen(false)
    setCompanyOpen(false)
    setCostCenterOpen(false)
    setConsultantOpen(false)
    setPsychologistOpen(false)
    setResidentOpen(false)
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-3xl w-full max-h-[90vh] overflow-y-auto')}>
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight text-emerald-950">Create New Admission</h2>
            <button
              onClick={onClose}
              className="shrink-0 rounded-lg p-2 text-emerald-800/70 transition hover:bg-emerald-200/50 hover:text-emerald-950"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4" onClick={(e) => {
          const target = e.target as HTMLElement
          if (target.tagName !== 'INPUT' && !target.closest('.absolute')) {
            closeAllDropdowns()
          }
        }}>
          {/* Patient Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Patient <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={selectedPatient ? (selectedPatient.patient_name || selectedPatient.name) : patientQuery}
                onChange={(e) => {
                  // When user types after selecting, clear the selection so input becomes fully editable
                  setSelectedPatient(null)
                  setPatientQuery(e.target.value)
                  setPatientOpen(true)
                }}
                onFocus={() => setPatientOpen(true)}
                placeholder="Search patient..."
                className="w-full rounded-md border border-slate-300 pr-9 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => setShowCreatePatient(true)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs hover:bg-primary/90"
                title="Add Patient"
              >
                +
              </button>
              {patientOpen && (
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
                      {patientQuery ? 'No patients match your search.' : 'No patients found.'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Company + Cost Center row — company hidden when single */}
          <div className={`grid gap-4 ${isSingleCompany ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {/* Company — only shown when multiple companies exist */}
            {!isSingleCompany && (
              <div className="relative">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Company <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.company ? (companies.find(c => c.name === formData.company)?.company_name ?? formData.company) : companyQuery}
                  onChange={(e) => {
                    setCompanyQuery(e.target.value)
                    setCompanyOpen(true)
                    // Clear cost center when company changes
                    setFormData(prev => ({ ...prev, company: '', cost_center: '' }))
                    setCostCenterQuery('')
                  }}
                  onFocus={() => setCompanyOpen(true)}
                  placeholder="Select Company..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {companyOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                    {companies.filter(c =>
                      !companyQuery || c.company_name.toLowerCase().includes(companyQuery.toLowerCase())
                    ).length > 0 ? (
                      companies
                        .filter(c => !companyQuery || c.company_name.toLowerCase().includes(companyQuery.toLowerCase()))
                        .map((company) => (
                          <button
                            key={company.name}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                            onClick={() => {
                              setFormData(prev => ({ ...prev, company: company.name, cost_center: '' }))
                              setCompanyQuery(company.company_name)
                              setCostCenterQuery('')
                              setCompanyOpen(false)
                            }}
                          >
                            {company.company_name}
                          </button>
                        ))
                    ) : (
                      <div className="px-3 py-2 text-xs text-slate-500">No companies found</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Cost Center — always shown, mandatory */}
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Cost Center <span className="text-red-500">*</span>
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
                placeholder={!formData.company && !isSingleCompany ? 'Select a company first...' : 'Search Cost Center...'}
                disabled={!formData.company && !isSingleCompany}
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
                    <div className="px-3 py-2 text-xs text-slate-500">No cost centers found</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Medical Department */}
            {/* <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">
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
                      <div className="px-3 py-2 text-xs text-slate-500">No departments found</div>
                    )}
                  </div>
                )}
              </div>
            </div> */}

            {/* Consultant Doctor (Primary Practitioner) */}
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">
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
                      <div className="px-3 py-2 text-xs text-slate-500">No practitioners found</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Psychologist Doctor */}
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">
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
                      <div className="px-3 py-2 text-xs text-slate-500">No practitioners found</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Residents Doctor */}
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">
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
                      <div className="px-3 py-2 text-xs text-slate-500">No practitioners found</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Admission Ordered For */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
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
              <label className="block text-sm font-medium text-slate-700 mb-1">
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
            <label className="block text-sm font-medium text-slate-700 mb-1">
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

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={CM_BTN_CANCEL}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={CM_BTN_PRIMARY}
            >
              {submitting ? 'Creating...' : 'Create Admission'}
            </button>
          </div>
        </form>
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