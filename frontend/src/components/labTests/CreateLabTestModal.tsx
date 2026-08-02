import { useState, useEffect } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { createLabTest } from '../../services/labTests'
import { fetchHealthcarePractitioners, fetchLabTestTemplates, fetchMedicalDepartments, fetchDocumentTypes, fetchCostCenters, getCurrentUserPractitioner, type LinkFieldOption } from '../../services/common'
import { getUserCostCenterPermission } from '../../services/costCenterPermission'
import { createNurseTask } from '../../services/nurseTask'
import { searchPatients, fetchPatients, uploadPatientFile, type PatientListItem, type PatientDocumentRow } from '../../services/patients'
import { DocumentTypeSelect } from '../ui/DocumentTypeSelect'
import { CreatePatientModal } from '../patients/CreatePatientModal'
import { CreatePractitionerModal } from '../practitioners/CreatePractitionerModal'
import { CreateLabTestTemplateModal } from './CreateLabTestTemplateModal'
import { CreateDepartmentModal } from './CreateDepartmentModal'
import { useBlockIfActiveCareClosed } from '../../hooks/useBlockIfActiveCareClosed'
import { fromDatetimeLocalValue } from '../../utils/datetimeLocal'

interface CreateLabTestModalProps {
  onClose: () => void
  onSuccess?: () => void
  initialPatient?: string
  /** Nurse portal: only Lab Test Templates with by_nurse set */
  templatesNurseOnly?: boolean
}

export const CreateLabTestModal = ({
  onClose,
  onSuccess,
  initialPatient,
  templatesNurseOnly = false,
}: CreateLabTestModalProps) => {
  const blockIfActiveCareClosed = useBlockIfActiveCareClosed()
  const [formData, setFormData] = useState({
    patient: initialPatient || '',
    cost_center: '',
    template: '',
    practitioner: '',
    date: new Date().toISOString().split('T')[0],
    time: new Date().toTimeString().slice(0, 5),
    department: '',
    service_unit: '',
    status: 'Draft',
    repeat_daily: false,
    repeat_until: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createNurseTaskFlag, setCreateNurseTaskFlag] = useState(false)

  // Global branch auto-applies as the default.
  useEffect(() => {
    getUserCostCenterPermission()
      .then((perm) => {
        const cc = perm?.cost_center
        if (!cc) return
        setFormData((prev) => {
          if (prev.cost_center) return prev
          setSelectedCostCenter((s) => s || { name: cc, label: cc })
          return { ...prev, cost_center: cc }
        })
      })
      .catch(() => {})
  }, [])
  
  // Patient dropdown state
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientQuery, setPatientQuery] = useState(initialPatient || '')
  const [patientLoading, setPatientLoading] = useState(false)

  // Template dropdown state
  const [templateOptions, setTemplateOptions] = useState<LinkFieldOption[]>([])
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateQuery, setTemplateQuery] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<LinkFieldOption | null>(null)

  // Practitioner dropdown state
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [selectedPractitioner, setSelectedPractitioner] = useState<LinkFieldOption | null>(null)

  // Department dropdown state
  const [departmentOptions, setDepartmentOptions] = useState<LinkFieldOption[]>([])
  const [departmentOpen, setDepartmentOpen] = useState(false)
  const [departmentQuery, setDepartmentQuery] = useState('')
  const [selectedDepartment, setSelectedDepartment] = useState<LinkFieldOption | null>(null)

  // Branch dropdown state
  const [costCenterOptions, setCostCenterOptions] = useState<LinkFieldOption[]>([])
  const [costCenterOpen, setCostCenterOpen] = useState(false)
  const [costCenterQuery, setCostCenterQuery] = useState('')
  const [selectedCostCenter, setSelectedCostCenter] = useState<LinkFieldOption | null>(null)

  // Create modals
  const [showCreatePatient, setShowCreatePatient] = useState(false)
  const [showCreatePractitioner, setShowCreatePractitioner] = useState(false)
  const [showCreateTemplate, setShowCreateTemplate] = useState(false)
  const [showCreateDepartment, setShowCreateDepartment] = useState(false)

  // Tabs: details | documents
  const [activeTab, setActiveTab] = useState<'details' | 'documents'>('details')
  const [documents, setDocuments] = useState<PatientDocumentRow[]>([{ file_name: '', document_type: '', transaction_no: '', upload_remarks: '' }])
  const [documentTypes, setDocumentTypes] = useState<{ name: string; document_name?: string }[]>([])
  const [documentUploading, setDocumentUploading] = useState<number | null>(null)

  useEffect(() => {
    fetchDocumentTypes().then(setDocumentTypes).catch(() => setDocumentTypes([]))
  }, [])

  const addDocumentRow = () => setDocuments(prev => [...prev, { file_name: '', document_type: '', transaction_no: '', upload_remarks: '' }])
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
        next[idx] = { ...next[idx], document: file_url, file_name: (next[idx].file_name || '').trim() || file.name }
        return next
      })
    } catch (err) {
      console.error(err)
    } finally {
      setDocumentUploading(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      blockIfActiveCareClosed()
    } catch {
      return
    }

    if (!formData.patient) {
      setError('Patient is required')
      return
    }
    if (!formData.cost_center) {
      setError('Branch is required')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const docPayload = documents
        .filter((r) => (r.file_name || '').trim() || (r.document || '').trim())
        .map((r) => ({
          file_name: (r.file_name || '').trim() || undefined,
          document_type: (r.document_type || '').trim() || undefined,
          transaction_no: (r.transaction_no || '').trim() || undefined,
          upload_remarks: (r.upload_remarks || '').trim() || undefined,
          document: (r.document || '').trim() || undefined,
        }))
      await createLabTest({
        patient: formData.patient,
        cost_center: formData.cost_center,
        template: formData.template || undefined,
        practitioner: formData.practitioner || undefined,
        date: formData.date || undefined,
        time: formData.time || undefined,
        department: formData.department || undefined,
        service_unit: formData.service_unit || undefined,
        status: formData.status || undefined,
        repeat_daily: formData.repeat_daily ? 1 : undefined,
        repeat_until: formData.repeat_daily ? formData.repeat_until || undefined : undefined,
        documents: docPayload.length ? docPayload : undefined
      })

      if (createNurseTaskFlag && formData.patient) {
        const scheduledDateTime = formData.date && formData.time
          ? `${formData.date} ${formData.time}:00`
          : fromDatetimeLocalValue()
        const templateLabel = selectedTemplate?.label || formData.template || 'Lab Test'
        try {
          await createNurseTask({
            patient: formData.patient,
            task_type: 'Lab Support',
            scheduled_time: scheduledDateTime,
            description: `Collect sample for: ${templateLabel}`,
          })
        } catch {
          // Don't block the flow — lab test was already created
        }
      }

      if (onSuccess) {
        onSuccess()
      }
      
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create lab test')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // Load initial patient if provided
  useEffect(() => {
    if (initialPatient) {
      const loadInitialPatient = async () => {
        try {
          const patients = await fetchPatients(1, 0, initialPatient)
          if (patients.length > 0) {
            setPatientQuery(patients[0].patient_name)
          }
        } catch (err) {
          console.error('Failed to load initial patient:', err)
        }
      }
      loadInitialPatient()
    }
  }, [initialPatient])

  // Load initial options and auto-fill current user's practitioner
  useEffect(() => {
    const loadOptions = async () => {
      // Load each option list independently so one failed lookup does not blank the whole form.
      const [templates, practs, depts, costCenters, currentPract] = await Promise.allSettled([
        fetchLabTestTemplates(undefined, undefined, templatesNurseOnly),
        fetchHealthcarePractitioners(),
        fetchMedicalDepartments(),
        fetchCostCenters(),
        getCurrentUserPractitioner(),
      ])
      if (templates.status === 'fulfilled') setTemplateOptions(templates.value)
      else console.error('Failed to load lab test templates:', templates.reason)
      if (practs.status === 'fulfilled') setPractitionerOptions(practs.value)
      if (depts.status === 'fulfilled') setDepartmentOptions(depts.value)
      if (costCenters.status === 'fulfilled') setCostCenterOptions(costCenters.value)
      if (currentPract.status === 'fulfilled' && currentPract.value) {
        const pract = currentPract.value
        setFormData(prev => prev.practitioner === '' ? { ...prev, practitioner: pract } : prev)
      }
    }
    loadOptions()
  }, [templatesNurseOnly])

  // Search/fetch patients
  useEffect(() => {
    if (!patientOpen) return

    const search = async () => {
      setPatientLoading(true)
      try {
        let results: PatientListItem[] = []
        if (patientQuery.trim() === '') {
          results = await fetchPatients(20, 0)
        } else {
          results = await searchPatients(patientQuery, 20)
        }
        setPatientOptions(results)
      } catch (err) {
        console.error('Failed to fetch/search patients:', err)
        setPatientOptions([])
      } finally {
        setPatientLoading(false)
      }
    }

    const timeoutId = setTimeout(() => {
      search()
    }, patientQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [patientQuery, patientOpen])

  // Search templates
  useEffect(() => {
    if (!templateOpen) return

    const search = async () => {
      try {
        const results = await fetchLabTestTemplates(
          templateQuery,
          formData.department || undefined,
          templatesNurseOnly
        )
        setTemplateOptions(results)
      } catch (err) {
        console.error('Failed to search templates:', err)
        setTemplateOptions([])
      }
    }

    const timeoutId = setTimeout(() => {
      search()
    }, templateQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [templateQuery, templateOpen, formData.department, templatesNurseOnly])

  // Search practitioners
  useEffect(() => {
    if (!practitionerOpen) return

    const search = async () => {
      try {
        const results = await fetchHealthcarePractitioners(practitionerQuery, formData.department || undefined)
        setPractitionerOptions(results)
      } catch (err) {
        console.error('Failed to search practitioners:', err)
        setPractitionerOptions([])
      }
    }

    const timeoutId = setTimeout(() => {
      search()
    }, practitionerQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [practitionerQuery, practitionerOpen, formData.department])

  // Search departments
  useEffect(() => {
    if (!departmentOpen) return

    const search = async () => {
      try {
        const results = await fetchMedicalDepartments(departmentQuery)
        setDepartmentOptions(results)
      } catch (err) {
        console.error('Failed to search departments:', err)
        setDepartmentOptions([])
      }
    }

    const timeoutId = setTimeout(() => {
      search()
    }, departmentQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [departmentQuery, departmentOpen])

  // Search branches
  useEffect(() => {
    if (!costCenterOpen) return

    const search = async () => {
      try {
        const results = await fetchCostCenters(undefined, costCenterQuery)
        setCostCenterOptions(results)
      } catch (err) {
        console.error('Failed to search branches:', err)
        setCostCenterOptions([])
      }
    }

    const timeoutId = setTimeout(() => {
      search()
    }, costCenterQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [costCenterQuery, costCenterOpen])

  const handlePatientSelect = (patient: PatientListItem) => {
    setFormData(prev => ({ ...prev, patient: patient.name }))
    setPatientQuery(patient.patient_name)
    setPatientOpen(false)
  }

  const handleTemplateSelect = (template: LinkFieldOption) => {
    setSelectedTemplate(template)
    setFormData(prev => ({ ...prev, template: template.name }))
    setTemplateQuery(template.label)
    setTemplateOpen(false)
  }

  const handlePractitionerSelect = (pract: LinkFieldOption) => {
    setSelectedPractitioner(pract)
    setFormData(prev => ({ ...prev, practitioner: pract.name }))
    setPractitionerQuery(pract.label)
    setPractitionerOpen(false)
  }

  const handleDepartmentSelect = (dept: LinkFieldOption) => {
    setSelectedDepartment(dept)
    setFormData(prev => ({ ...prev, department: dept.name }))
    setDepartmentQuery(dept.label)
    setDepartmentOpen(false)
    // Refresh templates and practitioners when department changes
    fetchLabTestTemplates(undefined, dept.name, templatesNurseOnly).then(setTemplateOptions).catch(console.error)
    fetchHealthcarePractitioners(undefined, dept.name).then(setPractitionerOptions).catch(console.error)
  }

  const handleCostCenterSelect = (cc: LinkFieldOption) => {
    setSelectedCostCenter(cc)
    setFormData(prev => ({ ...prev, cost_center: cc.name }))
    setCostCenterQuery(cc.label)
    setCostCenterOpen(false)
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-2xl w-full max-h-[90vh] overflow-hidden')}>
        <div className="relative shrink-0 border-b border-emerald-100/60 bg-gradient-to-r from-emerald-100 via-teal-50 to-sky-100 p-4 sm:px-5 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight text-emerald-950">Create Lab Test</h2>
            <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-2 text-emerald-800/70 transition hover:bg-emerald-200/50 hover:text-emerald-950">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex border-b border-slate-200 px-4 flex-shrink-0">
          {(['details', 'documents'] as const).map((tab) => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {tab === 'documents' ? `Documents${documents.length > 0 ? ` (${documents.length})` : ''}` : 'Details'}
            </button>
          ))}
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0"
          onClick={(e) => {
            const target = e.target as HTMLElement
            if (target.tagName !== 'INPUT' && !target.closest('.absolute')) {
              setPatientOpen(false)
              setTemplateOpen(false)
              setPractitionerOpen(false)
              setDepartmentOpen(false)
              setCostCenterOpen(false)
            }
          }}
        >
          {activeTab === 'details' && (
          <>
          {/* Patient Information */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Patient Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Patient <span className="text-red-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={patientQuery}
                    onChange={(e) => {
                      setPatientQuery(e.target.value)
                      setPatientOpen(true)
                    }}
                    onFocus={() => setPatientOpen(true)}
                    placeholder="Search patient..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                  {patientLoading && (
                    <div className="absolute right-10 top-2.5 text-slate-400 text-sm">Loading...</div>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowCreatePatient(true)
                    }}
                    className="absolute right-2 p-1 text-primary hover:text-primary/80 rounded"
                    title="Create New Patient"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  {patientOpen && patientOptions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
                      {patientOptions.map((patient) => (
                        <button
                          key={patient.name}
                          type="button"
                          onClick={() => handlePatientSelect(patient)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                        >
                          <div className="font-medium">{patient.patient_name}</div>
                          {patient.mobile && (
                            <div className="text-xs text-slate-500">{patient.mobile}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Lab Test Details */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Lab Test Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Branch <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={costCenterOpen ? costCenterQuery : (selectedCostCenter ? selectedCostCenter.label : '')}
                    onChange={(e) => {
                      const value = e.target.value
                      setCostCenterQuery(value)
                      if (!value) {
                        setSelectedCostCenter(null)
                        setFormData(prev => ({ ...prev, cost_center: '' }))
                      }
                      setCostCenterOpen(true)
                    }}
                    onFocus={() => setCostCenterOpen(true)}
                    placeholder="Search branch..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  {costCenterOpen && costCenterOptions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
                      {costCenterOptions.map((cc) => (
                        <button
                          key={cc.name}
                          type="button"
                          onClick={() => handleCostCenterSelect(cc)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                        >
                          {cc.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Lab Test Template
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={selectedTemplate ? selectedTemplate.label : templateQuery}
                    onChange={(e) => {
                      setTemplateQuery(e.target.value)
                      setTemplateOpen(true)
                    }}
                    onFocus={() => setTemplateOpen(true)}
                    placeholder="Search template..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowCreateTemplate(true)
                    }}
                    className="absolute right-2 p-1 text-primary hover:text-primary/80 rounded"
                    title="Create New Lab Test Template"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  {templateOpen && templateOptions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
                      {templateOptions.map((template) => (
                        <button
                          key={template.name}
                          type="button"
                          onClick={() => handleTemplateSelect(template)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                        >
                          <span className="flex items-center gap-2">
                            <span className="truncate">{template.label}</span>
                            {Number(template.is_group) === 1 ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-200 text-indigo-700 shrink-0">
                                GROUP
                              </span>
                            ) : null}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Department
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={selectedDepartment ? selectedDepartment.label : departmentQuery}
                    onChange={(e) => {
                      setDepartmentQuery(e.target.value)
                      setDepartmentOpen(true)
                    }}
                    onFocus={() => setDepartmentOpen(true)}
                    placeholder="Search department..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowCreateDepartment(true)
                    }}
                    className="absolute right-2 p-1 text-primary hover:text-primary/80 rounded"
                    title="Create New Department"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  {departmentOpen && departmentOptions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
                      {departmentOptions.map((dept) => (
                        <button
                          key={dept.name}
                          type="button"
                          onClick={() => handleDepartmentSelect(dept)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                        >
                          {dept.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Requesting Practitioner
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={selectedPractitioner ? selectedPractitioner.label : practitionerQuery}
                    onChange={(e) => {
                      setPractitionerQuery(e.target.value)
                      setPractitionerOpen(true)
                    }}
                    onFocus={() => setPractitionerOpen(true)}
                    placeholder="Search doctor..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowCreatePractitioner(true)
                    }}
                    className="absolute right-2 p-1 text-primary hover:text-primary/80 rounded"
                    title="Create New Practitioner"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  {practitionerOpen && practitionerOptions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
                      {practitionerOptions.map((pract) => (
                        <button
                          key={pract.name}
                          type="button"
                          onClick={() => handlePractitionerSelect(pract)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                        >
                          <div>
                            <div className="font-medium">{pract.label}</div>
                            <div className="text-xs text-slate-500">{pract.name}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => handleChange('status', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="Draft">Draft</option>
                  <option value="Submitted">Submitted</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              {/* Daily repeat — doctor orders once, nurses perform every day until the date */}
              <div className="flex items-end gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-700 pb-2">
                  <input
                    type="checkbox"
                    checked={formData.repeat_daily}
                    onChange={(e) => setFormData(prev => ({ ...prev, repeat_daily: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Repeat daily
                </label>
                {formData.repeat_daily && (
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Repeat Until</label>
                    <input
                      type="date"
                      value={formData.repeat_until}
                      onChange={(e) => setFormData(prev => ({ ...prev, repeat_until: e.target.value }))}
                      min={formData.date || undefined}
                      required
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => handleChange('date', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Time
                </label>
                <input
                  type="time"
                  value={formData.time}
                  onChange={(e) => handleChange('time', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </div>
          </>
          )}
          {activeTab === 'documents' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">Attach documents (same table as Admission, Discharge, Patient). Optional.</p>
              {documents.map((row, idx) => (
                <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-0.5">File Name</label>
                    <input value={row.file_name || ''} onChange={(e) => updateDocumentRow(idx, 'file_name', e.target.value)} placeholder="File name" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
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
                    <input value={row.transaction_no || ''} onChange={(e) => updateDocumentRow(idx, 'transaction_no', e.target.value)} placeholder="Optional" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-0.5">Upload Remarks</label>
                    <input value={row.upload_remarks || ''} onChange={(e) => updateDocumentRow(idx, 'upload_remarks', e.target.value)} placeholder="Optional" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-0.5">File</label>
                    <input type="file" disabled={documentUploading === idx} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocumentFile(idx, f); e.target.value = '' }} className="w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-white file:text-sm" />
                    {documentUploading === idx && <span className="text-xs text-slate-500">Uploading...</span>}
                    {row.document && documentUploading !== idx && <span className="text-xs text-green-600 block">✓ File attached</span>}
                  </div>
                </div>
              ))}
              <button type="button" onClick={addDocumentRow} className="flex items-center gap-1.5 text-sm text-primary font-medium hover:underline">+ Add document</button>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Nurse Task checkbox */}
          <div className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 flex items-center gap-2">
            <input
              id="lab-create-nurse-task"
              type="checkbox"
              checked={createNurseTaskFlag}
              onChange={(e) => setCreateNurseTaskFlag(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <label htmlFor="lab-create-nurse-task" className="text-xs font-medium text-teal-800 cursor-pointer select-none">
              Create a Nurse Task (Lab Support) for sample collection
            </label>
          </div>

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
              disabled={loading}
              className={CM_BTN_PRIMARY}
            >
              {loading ? 'Creating...' : 'Create Lab Test'}
            </button>
          </div>
        </form>
      </div>
      {showCreatePatient && (
        <CreatePatientModal
          onClose={() => setShowCreatePatient(false)}
          onSuccess={(patientName) => {
            const newPatient: PatientListItem = { name: patientName, patient_name: patientName }
            setFormData((prev) => ({ ...prev, patient: newPatient.name }))
            setPatientQuery(newPatient.patient_name)
            setPatientOpen(false)
            setShowCreatePatient(false)
          }}
        />
      )}
      {showCreatePractitioner && (
        <CreatePractitionerModal
          onClose={() => setShowCreatePractitioner(false)}
          onSuccess={(practitionerName) => {
            setFormData((prev) => ({ ...prev, practitioner: practitionerName }))
            const newPract = practitionerOptions.find((p) => p.name === practitionerName)
            if (newPract) {
              setSelectedPractitioner(newPract)
              setPractitionerQuery(newPract.label)
            } else {
              fetchHealthcarePractitioners(undefined, formData.department || undefined)
                .then(setPractitionerOptions)
                .catch(console.error)
              setPractitionerQuery(practitionerName)
            }
            setPractitionerOpen(false)
            setShowCreatePractitioner(false)
          }}
        />
      )}
      {showCreateTemplate && (
        <CreateLabTestTemplateModal
          onClose={() => setShowCreateTemplate(false)}
          onSuccess={(created) => {
            const option: LinkFieldOption = {
              name: created.name,
              label: created.lab_test_name,
              department: created.department,
            }
            setTemplateOptions((prev) => [option, ...prev])
            setSelectedTemplate(option)
            setFormData((prev) => ({ ...prev, template: created.name }))
            setTemplateQuery(option.label)
            setTemplateOpen(false)
            setShowCreateTemplate(false)
          }}
        />
      )}
      {showCreateDepartment && (
        <CreateDepartmentModal
          onClose={() => setShowCreateDepartment(false)}
          onSuccess={(created) => {
            const option: LinkFieldOption = {
              name: created.name,
              label: created.department,
            }
            setDepartmentOptions((prev) => [option, ...prev])
            setSelectedDepartment(option)
            setFormData((prev) => ({ ...prev, department: created.name }))
            setDepartmentQuery(option.label)
            setDepartmentOpen(false)
            setShowCreateDepartment(false)
          }}
        />
      )}
    </div>
  )
}

