import { useState, useEffect } from 'react'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { toast } from '../../hooks/useToast'
import { apiRequest } from '../../services/apiClient'
import { 
  fetchMedicalDepartments, 
  fetchHealthcarePractitioners, 
  fetchServiceUnitTypes, 
  fetchNursingChecklistTemplates,
  fetchCompanies,
  fetchCostCenters,
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
  const [practitionerFieldType, setPractitionerFieldType] = useState<'primary' | 'secondary' | null>(null)

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
  const [medicalDepartments, setMedicalDepartments] = useState<LinkFieldOption[]>([])
  const [primaryPractitioners, setPrimaryPractitioners] = useState<LinkFieldOption[]>([])
  const [secondaryPractitioners, setSecondaryPractitioners] = useState<LinkFieldOption[]>([])
  const [serviceUnitTypes, setServiceUnitTypes] = useState<LinkFieldOption[]>([])
  const [nursingTemplates, setNursingTemplates] = useState<LinkFieldOption[]>([])
  
  // Dropdown open states
  const [deptOpen, setDeptOpen] = useState(false)
  const [primaryPractOpen, setPrimaryPractOpen] = useState(false)
  const [secondaryPractOpen, setSecondaryPractOpen] = useState(false)
  const [serviceUnitOpen, setServiceUnitOpen] = useState(false)
  const [nursingTemplateOpen, setNursingTemplateOpen] = useState(false)
  
  // Search queries for link fields
  const [deptQuery, setDeptQuery] = useState('')
  const [primaryPractQuery, setPrimaryPractQuery] = useState('')
  const [secondaryPractQuery, setSecondaryPractQuery] = useState('')
  const [serviceUnitQuery, setServiceUnitQuery] = useState('')
  const [nursingTemplateQuery, setNursingTemplateQuery] = useState('')

  const [formData, setFormData] = useState({
    company: '',
    cost_center: '',
    medical_department: '',
    primary_practitioner: '',
    secondary_practitioner: '',
    admission_service_unit_type: '',
    admission_ordered_for: new Date().toISOString().split('T')[0],
    expected_length_of_stay: '',
    admission_instruction: '',
    admission_nursing_checklist_template: ''
  })

  // Load companies on mount
  useEffect(() => {
    const loadCompanies = async () => {
      try {
        const list = await fetchCompanies()
        // fetchCompanies returns LinkFieldOption[] — map to Company shape
        const mapped: Company[] = list.map(c => ({ name: c.name, company_name: c.label }))
        setCompanies(mapped)

        if (mapped.length === 1) {
          // Single company — hide the field but store the value
          setIsSingleCompany(true)
          setFormData(prev => ({ ...prev, company: mapped[0].name }))
          setCompanyQuery(mapped[0].company_name)
          // Load cost centers for the single company immediately
          loadCostCenters(mapped[0].name)
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

  // Load initial options
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [depts, serviceUnits] = await Promise.all([
          fetchMedicalDepartments(),
          fetchServiceUnitTypes()
        ])
        setMedicalDepartments(depts)
        setServiceUnitTypes(serviceUnits)
      } catch (err) {
        console.error('Failed to load options:', err)
      }
    }
    loadOptions()
  }, [])

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

  // Search medical departments
  useEffect(() => {
    if (deptOpen || deptQuery) {
      const search = async () => {
        try {
          const results = await fetchMedicalDepartments(deptQuery || undefined)
          setMedicalDepartments(results)
        } catch (err) {
          console.error('Failed to search departments:', err)
        }
      }
      const timeoutId = setTimeout(search, 300)
      return () => clearTimeout(timeoutId)
    }
  }, [deptQuery, deptOpen])

  // Search practitioners (filtered by department if selected)
  useEffect(() => {
    if (primaryPractOpen || primaryPractQuery || formData.medical_department) {
      const search = async () => {
        try {
          const results = await fetchHealthcarePractitioners(
            primaryPractQuery || undefined,
            formData.medical_department || undefined
          )
          setPrimaryPractitioners(results)
        } catch (err) {
          console.error('Failed to search practitioners:', err)
        }
      }
      const timeoutId = setTimeout(search, 300)
      return () => clearTimeout(timeoutId)
    }
  }, [primaryPractQuery, primaryPractOpen, formData.medical_department])

  useEffect(() => {
    if (secondaryPractOpen || secondaryPractQuery || formData.medical_department) {
      const search = async () => {
        try {
          const results = await fetchHealthcarePractitioners(
            secondaryPractQuery || undefined,
            formData.medical_department || undefined
          )
          setSecondaryPractitioners(results)
        } catch (err) {
          console.error('Failed to search practitioners:', err)
        }
      }
      const timeoutId = setTimeout(search, 300)
      return () => clearTimeout(timeoutId)
    }
  }, [secondaryPractQuery, secondaryPractOpen, formData.medical_department])

  // Search service unit types
  useEffect(() => {
    if (serviceUnitOpen || serviceUnitQuery) {
      const search = async () => {
        try {
          const results = await fetchServiceUnitTypes(serviceUnitQuery || undefined)
          setServiceUnitTypes(results)
        } catch (err) {
          console.error('Failed to search service unit types:', err)
        }
      }
      const timeoutId = setTimeout(search, 300)
      return () => clearTimeout(timeoutId)
    }
  }, [serviceUnitQuery, serviceUnitOpen])

  // Search nursing templates
  useEffect(() => {
    if (nursingTemplateOpen || nursingTemplateQuery) {
      const search = async () => {
        try {
          const results = await fetchNursingChecklistTemplates(nursingTemplateQuery || undefined)
          setNursingTemplates(results)
        } catch (err) {
          console.error('Failed to search nursing templates:', err)
        }
      }
      const timeoutId = setTimeout(search, 300)
      return () => clearTimeout(timeoutId)
    }
  }, [nursingTemplateQuery, nursingTemplateOpen])

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

    if (!formData.medical_department) {
      setError('Medical Department is required')
      return
    }

    if (!formData.primary_practitioner) {
      setError('Primary Practitioner is required')
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
        primary_practitioner: formData.primary_practitioner,
        admission_ordered_for: formData.admission_ordered_for,
      }
      
      if (encounterName) {
        args.admission_encounter = encounterName
      }
      
      if (formData.secondary_practitioner) {
        args.secondary_practitioner = formData.secondary_practitioner
      }
      if (formData.admission_service_unit_type) {
        args.admission_service_unit_type = formData.admission_service_unit_type
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
          errorMessage = 'Please fill in all required fields: Patient, Medical Department, and Primary Practitioner are required.'
        } else if (errorMessage.includes('Medical Department is required')) {
          errorMessage = 'Medical Department is required when creating admission without a Patient Visit.'
        } else if (errorMessage.includes('Primary Practitioner is required')) {
          errorMessage = 'Primary Practitioner is required when creating admission without a Patient Visit.'
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
    setDeptOpen(false)
    setPrimaryPractOpen(false)
    setSecondaryPractOpen(false)
    setServiceUnitOpen(false)
    setNursingTemplateOpen(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Create New Admission</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600"
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
            <div className="relative">
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
            </div>

            {/* Primary Practitioner */}
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Primary Practitioner <span className="text-red-500">*</span>
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={formData.primary_practitioner ? primaryPractitioners.find(p => p.name === formData.primary_practitioner)?.label || formData.primary_practitioner : primaryPractQuery}
                  onChange={(e) => {
                    setPrimaryPractQuery(e.target.value)
                    setPrimaryPractOpen(true)
                  }}
                  onFocus={() => setPrimaryPractOpen(true)}
                  placeholder="Search Healthcare Practitioner..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setPractitionerFieldType('primary')
                    setShowCreatePractitioner(true)
                  }}
                  className="absolute right-2 p-1 text-primary hover:text-primary/80 rounded"
                  title="Create New Practitioner"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                {primaryPractOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto top-full">
                    {primaryPractitioners.length > 0 ? (
                      primaryPractitioners.map((pract) => (
                        <button
                          key={pract.name}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                          onClick={() => {
                            setFormData(prev => ({ ...prev, primary_practitioner: pract.name }))
                            setPrimaryPractQuery(pract.label)
                            setPrimaryPractOpen(false)
                          }}
                        >
                          <div className="font-medium">{pract.label}</div>
                          {pract.department && (
                            <div className="text-xs text-slate-500">{pract.department}</div>
                          )}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-xs text-slate-500">No practitioners found</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Secondary Practitioner */}
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Secondary Practitioner
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={formData.secondary_practitioner ? secondaryPractitioners.find(p => p.name === formData.secondary_practitioner)?.label || formData.secondary_practitioner : secondaryPractQuery}
                  onChange={(e) => {
                    setSecondaryPractQuery(e.target.value)
                    setSecondaryPractOpen(true)
                  }}
                  onFocus={() => setSecondaryPractOpen(true)}
                  placeholder="Search Healthcare Practitioner (Optional)..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setPractitionerFieldType('secondary')
                    setShowCreatePractitioner(true)
                  }}
                  className="absolute right-2 p-1 text-primary hover:text-primary/80 rounded"
                  title="Create New Practitioner"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                {secondaryPractOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto top-full">
                    {secondaryPractitioners.length > 0 ? (
                      secondaryPractitioners.map((pract) => (
                        <button
                          key={pract.name}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                          onClick={() => {
                            setFormData(prev => ({ ...prev, secondary_practitioner: pract.name }))
                            setSecondaryPractQuery(pract.label)
                            setSecondaryPractOpen(false)
                          }}
                        >
                          <div className="font-medium">{pract.label}</div>
                          {pract.department && (
                            <div className="text-xs text-slate-500">{pract.department}</div>
                          )}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-xs text-slate-500">No practitioners found</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Service Unit Type */}
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Bed
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.admission_service_unit_type ? serviceUnitTypes.find(s => s.name === formData.admission_service_unit_type)?.label || formData.admission_service_unit_type : serviceUnitQuery}
                  onChange={(e) => {
                    setServiceUnitQuery(e.target.value)
                    setServiceUnitOpen(true)
                  }}
                  onFocus={() => setServiceUnitOpen(true)}
                  placeholder="Search Service Unit Type..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {serviceUnitOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                    {serviceUnitTypes.length > 0 ? (
                      serviceUnitTypes.map((unit) => (
                        <button
                          key={unit.name}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                          onClick={() => {
                            setFormData(prev => ({ ...prev, admission_service_unit_type: unit.name }))
                            setServiceUnitQuery(unit.label)
                            setServiceUnitOpen(false)
                          }}
                        >
                          {unit.label}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-xs text-slate-500">No service unit types found</div>
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

          {/* Nursing Checklist Template */}
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Nursing Checklist Template
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.admission_nursing_checklist_template ? nursingTemplates.find(t => t.name === formData.admission_nursing_checklist_template)?.label || formData.admission_nursing_checklist_template : nursingTemplateQuery}
                onChange={(e) => {
                  setNursingTemplateQuery(e.target.value)
                  setNursingTemplateOpen(true)
                }}
                onFocus={() => setNursingTemplateOpen(true)}
                placeholder="Search Nursing Checklist Template..."
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {nursingTemplateOpen && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                  {nursingTemplates.length > 0 ? (
                    nursingTemplates.map((template) => (
                      <button
                        key={template.name}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                        onClick={() => {
                          setFormData(prev => ({ ...prev, admission_nursing_checklist_template: template.name }))
                          setNursingTemplateQuery(template.label)
                          setNursingTemplateOpen(false)
                        }}
                      >
                        {template.label}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-xs text-slate-500">No templates found</div>
                  )}
                </div>
              )}
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
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
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
            if (practitionerFieldType === 'primary') {
              setFormData(prev => ({ ...prev, primary_practitioner: practitionerName }))
              const newPract = primaryPractitioners.find(p => p.name === practitionerName)
              if (newPract) {
                setPrimaryPractQuery(newPract.label)
              } else {
                fetchHealthcarePractitioners(formData.medical_department).then(setPrimaryPractitioners).catch(console.error)
                setPrimaryPractQuery(practitionerName)
              }
              setPrimaryPractOpen(false)
            } else if (practitionerFieldType === 'secondary') {
              setFormData(prev => ({ ...prev, secondary_practitioner: practitionerName }))
              const newPract = secondaryPractitioners.find(p => p.name === practitionerName)
              if (newPract) {
                setSecondaryPractQuery(newPract.label)
              } else {
                fetchHealthcarePractitioners(formData.medical_department).then(setSecondaryPractitioners).catch(console.error)
                setSecondaryPractQuery(practitionerName)
              }
              setSecondaryPractOpen(false)
            }
            setShowCreatePractitioner(false)
            setPractitionerFieldType(null)
          }}
        />
      )}
    </div>
  )
}