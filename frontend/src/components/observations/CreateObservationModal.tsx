import { useState, useEffect } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { createObservation, fetchObservationLevelDetails } from '../../services/observations'
import { fetchHealthcarePractitioners, getCurrentUserPractitioner, fetchObservationTemplates, fetchMedicalDepartments, type LinkFieldOption, fetchPatientVisits, fetchObservationLevels } from '../../services/common'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { toast } from '../../hooks/useToast'
import { fetchInpatientRecords, type InpatientRecord } from '../../services/inpatientRecords'
import { X } from 'lucide-react'
import { useCareContext } from '../../providers/CareContextProvider'

interface CreateObservationModalProps {
  onClose: () => void
  onSuccess?: () => void
  initialPatient?: string
}

export const CreateObservationModal = ({ onClose, onSuccess, initialPatient }: CreateObservationModalProps) => {
  // Get context from CareContextProvider
  const { mode, activeVisit, activeAdmission, selectedPatient: contextPatient } = useCareContext()
  
  // Determine if we're in IP or OP mode based on context
  const isIPMode = mode === 'IP'
  const isOPMode = mode === 'OP'
  
  const [formData, setFormData] = useState({
    patient: initialPatient || contextPatient || '',
    observation_template: '',
    posting_date: new Date().toISOString().slice(0, 16),
    start_date: new Date().toISOString().split('T')[0],
    status: 'Registered',
    practitioner: '',
    department: '',
    admission_no: (isIPMode && activeAdmission) ? activeAdmission : '',
    patient_visit: (isOPMode && activeVisit) ? activeVisit : '',
    observation_level: '',
    note: '',
    amount: 0,
    duration: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Patient dropdown state
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientQuery, setPatientQuery] = useState(initialPatient || contextPatient || '')
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

  // Observation Level dropdown state - using fetchObservationLevels like fetchMedicalDepartments
  const [observationLevelOptions, setObservationLevelOptions] = useState<LinkFieldOption[]>([])
  const [observationLevelOpen, setObservationLevelOpen] = useState(false)
  const [observationLevelQuery, setObservationLevelQuery] = useState('')
  const [selectedObservationLevel, setSelectedObservationLevel] = useState<LinkFieldOption | null>(null)
  const [observationLevelLoading, setObservationLevelLoading] = useState(false)

  // Admission dropdown state (IP mode) - filtered by selected patient
  const [admissionOptions, setAdmissionOptions] = useState<{ value: string; label: string }[]>([])
  const [admissionOpen, setAdmissionOpen] = useState(false)
  const [admissionQuery, setAdmissionQuery] = useState('')
  const [admissionLoading, setAdmissionLoading] = useState(false)
  const [selectedAdmissionLabel, setSelectedAdmissionLabel] = useState('')

  // Visit dropdown state (OP mode) - filtered by selected patient
  const [visitOptions, setVisitOptions] = useState<LinkFieldOption[]>([])
  const [visitOpen, setVisitOpen] = useState(false)
  const [visitQuery, setVisitQuery] = useState('')
  const [visitLabel, setVisitLabel] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.patient) {
      setError('Patient is required')
      return
    }

    // if (!formData.observation_template) {
    //   setError('Observation Template is required')
    //   return
    // }

    // Validate based on global mode
    if (isIPMode && !formData.admission_no) {
      setError('Please select an inpatient admission (IP mode active)')
      return
    }
    if (isOPMode && !formData.patient_visit) {
      setError('Please select a patient visit (OP mode active)')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const payload: any = {
        patient: formData.patient,
        observation_template: formData.observation_template || undefined,
        posting_date: formData.posting_date || undefined,
        start_date: formData.start_date || undefined,
        status: formData.status || undefined,
        practitioner: formData.practitioner || undefined,
        department: formData.department || undefined,
        observation_level: formData.observation_level || undefined,
        note: formData.note || undefined,
        amount: formData.amount || undefined,
        duration: formData.duration || undefined,
      }

      // Add the appropriate care context based on global mode
      if (isIPMode && formData.admission_no) {
        payload.admission_no = formData.admission_no
      } else if (isOPMode && formData.patient_visit) {
        payload.patient_visit = formData.patient_visit
      }

      await createObservation(payload)
      
      toast.success('Observation created successfully')
      
      if (onSuccess) {
        onSuccess()
      }
      
      onClose()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create observation'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // Load observation levels - using fetchObservationLevels (same pattern as departments)
  useEffect(() => {
    if (!observationLevelOpen) return

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
  }, [observationLevelQuery, observationLevelOpen])

  // Load initial patient if provided
  useEffect(() => {
    if (initialPatient || contextPatient) {
      const patientToLoad = initialPatient || contextPatient
      const loadInitialPatient = async () => {
        try {
          const patients = await fetchPatients(1, 0, patientToLoad)
          if (patients.length > 0) {
            setPatientQuery(patients[0].patient_name)
          }
        } catch (err) {
          console.error('Failed to load initial patient:', err)
        }
      }
      loadInitialPatient()
    }
  }, [initialPatient, contextPatient])

  // Load initial options (practitioners, departments, etc.)
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [practs, depts] = await Promise.all([
          fetchHealthcarePractitioners(),
          fetchMedicalDepartments()
        ])
        setPractitionerOptions(practs)
        setDepartmentOptions(depts)
      } catch (err) {
        console.error('Failed to load options:', err)
      }
    }
    loadOptions()
  }, [])

  // Auto-populate current user's practitioner (same approach as CreateClinicalNoteModal)
  useEffect(() => {
    const autoPopulatePractitioner = async () => {
      try {
        const practitioner = await getCurrentUserPractitioner()
        if (practitioner) {
          setFormData(prev => ({ ...prev, practitioner }))
          
          // Find the practitioner option to set display label
          const practitionerOption = practitionerOptions.find(p => p.name === practitioner)
          if (practitionerOption) {
            setSelectedPractitioner(practitionerOption)
            setPractitionerQuery(practitionerOption.label)
            
            // Auto-populate department from practitioner if available
            if (practitionerOption.department) {
              setFormData(prev => ({ ...prev, department: practitionerOption.department || '' }))
              // Find the department in options to set display label
              const departmentOption = departmentOptions.find(d => d.name === practitionerOption.department)
              if (departmentOption) {
                setSelectedDepartment(departmentOption)
                setDepartmentQuery(departmentOption.label)
              } else {
                // If department not in options, fetch all departments and try again
                try {
                  const deptResults = await fetchMedicalDepartments()
                  const foundDept = deptResults.find(d => d.name === practitionerOption.department)
                  if (foundDept) {
                    setSelectedDepartment(foundDept)
                    setDepartmentQuery(foundDept.label)
                  } else {
                    setDepartmentQuery(practitionerOption.department)
                  }
                } catch (err) {
                  console.error('Failed to fetch departments:', err)
                  setDepartmentQuery(practitionerOption.department)
                }
              }
            }
          } else {
            // If practitioner not in options (shouldn't happen, but just in case)
            setPractitionerQuery(practitioner)
          }
        }
      } catch (err) {
        console.error('Failed to auto-populate practitioner:', err)
      }
    }
    
    // Wait for practitionerOptions and departmentOptions to be loaded
    if (practitionerOptions.length > 0) {
      autoPopulatePractitioner()
    }
  }, [practitionerOptions, departmentOptions])

  // Search patients
  useEffect(() => {
    if (!patientOpen) return

    const timeoutId = setTimeout(async () => {
      if (patientQuery.trim().length >= 2) {
        try {
          setPatientLoading(true)
          const results = await searchPatients(patientQuery)
          setPatientOptions(results)
        } catch (err) {
          console.error('Failed to search patients:', err)
        } finally {
          setPatientLoading(false)
        }
      } else {
        setPatientOptions([])
      }
    }, patientQuery.trim().length === 0 ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [patientQuery, patientOpen])

  // Search observation templates
  useEffect(() => {
    if (!templateOpen) return

    const timeoutId = setTimeout(async () => {
      try {
        const results = await fetchObservationTemplates(templateQuery.trim() || undefined)
        setTemplateOptions(results)
      } catch (err) {
        console.error('Failed to search observation templates:', err)
      }
    }, templateQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [templateQuery, templateOpen])

  // Search practitioners (with department filter)
  useEffect(() => {
    if (!practitionerOpen) return

    const timeoutId = setTimeout(async () => {
      try {
        const results = await fetchHealthcarePractitioners(practitionerQuery.trim() || undefined, formData.department || undefined)
        setPractitionerOptions(results)
      } catch (err) {
        console.error('Failed to search practitioners:', err)
      }
    }, practitionerQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [practitionerQuery, practitionerOpen, formData.department])

  // Search departments
  useEffect(() => {
    if (!departmentOpen) return

    const timeoutId = setTimeout(async () => {
      try {
        const results = await fetchMedicalDepartments(departmentQuery.trim() || undefined)
        setDepartmentOptions(results)
      } catch (err) {
        console.error('Failed to search departments:', err)
      }
    }, departmentQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [departmentQuery, departmentOpen])

  // Load admissions for selected patient (IP mode)
  useEffect(() => {
    if (!isIPMode) return
    if (!admissionOpen || !formData.patient) {
      if (!admissionOpen) setAdmissionOptions([])
      return
    }

    const timeoutId = setTimeout(async () => {
      setAdmissionLoading(true)
      try {
        const results: InpatientRecord[] = await fetchInpatientRecords(
          undefined,
          admissionQuery.trim() || undefined,
          formData.patient,
          undefined,
          undefined,
          undefined
        )
        setAdmissionOptions(
          results.slice(0, 50).map((r) => ({
            value: r.name,
            label: `${r.name}${r.patient_name ? ` — ${r.patient_name}` : ''}`,
          }))
        )
      } catch (err) {
        console.error('Failed to load admission options', err)
        setAdmissionOptions([])
      } finally {
        setAdmissionLoading(false)
      }
    }, admissionQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [admissionQuery, admissionOpen, formData.patient, isIPMode])

  // Load visits for selected patient (OP mode)
  useEffect(() => {
    if (!isOPMode) return
    if (!visitOpen && !formData.patient_visit) return

    const timeoutId = setTimeout(async () => {
      try {
        const visits = await fetchPatientVisits(formData.patient, visitQuery || undefined)
        setVisitOptions(visits.slice(0, 50))
      } catch (err) {
        console.error('Failed to load visits for observation:', err)
        setVisitOptions([])
      }
    }, visitQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [visitQuery, visitOpen, formData.patient, isOPMode])

  // Auto-load visit label if activeVisit exists (OP mode)
  useEffect(() => {
    if (isOPMode && activeVisit && formData.patient) {
      const loadVisitLabel = async () => {
        try {
          const visits = await fetchPatientVisits(formData.patient, undefined)
          const matchedVisit = visits.find(v => v.name === activeVisit)
          if (matchedVisit) {
            setVisitLabel(matchedVisit.label)
            setVisitQuery(matchedVisit.label)
          }
        } catch (err) {
          console.error('Failed to load visit label:', err)
        }
      }
      loadVisitLabel()
    }
  }, [isOPMode, activeVisit, formData.patient])

  const handlePatientSelect = (patient: PatientListItem) => {
    setFormData(prev => ({ ...prev, patient: patient.name, admission_no: '', patient_visit: '' }))
    setPatientQuery(patient.patient_name)
    setSelectedAdmissionLabel('')
    setAdmissionQuery('')
    setVisitQuery('')
    setVisitLabel('')
    setPatientOpen(false)
  }

  const handleTemplateSelect = (template: LinkFieldOption) => {
    setSelectedTemplate(template)
    setFormData(prev => ({ ...prev, observation_template: template.name }))
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
  }

  const handleObservationLevelSelect = async (obsLevel: LinkFieldOption) => {
    setSelectedObservationLevel(obsLevel)
    setObservationLevelQuery(obsLevel.label)
    setObservationLevelOpen(false)

    let rateFromLevel: number | undefined
    try {
      const details = await fetchObservationLevelDetails(obsLevel.name)
      if (details?.rate != null && Number(details.rate) > 0) {
        rateFromLevel = Number(details.rate)
      }
    } catch {
      // amount stays as entered
    }

    setFormData(prev => {
      const next = { ...prev, observation_level: obsLevel.name }
      if (
        rateFromLevel != null &&
        (!prev.amount || Number(prev.amount) === 0)
      ) {
        next.amount = rateFromLevel
      }
      return next
    })
  }

  const handleAdmissionSelect = (value: string, label: string) => {
    setFormData(prev => ({ ...prev, admission_no: value }))
    setSelectedAdmissionLabel(label)
    setAdmissionQuery('')
    setAdmissionOpen(false)
  }

  const handleVisitSelect = (visit: LinkFieldOption) => {
    setFormData(prev => ({ ...prev, patient_visit: visit.name }))
    setVisitQuery(visit.label)
    setVisitLabel(visit.label)
    setVisitOpen(false)
  }

  const admissionDisplay = admissionOpen
    ? admissionQuery
    : (formData.admission_no ? selectedAdmissionLabel || formData.admission_no : '')

  const visitDisplay = visitOpen
    ? visitQuery
    : (formData.patient_visit ? visitLabel || formData.patient_visit : '')

  // Get mode-specific help text
  const getModeHelpText = () => {
    if (isIPMode) {
      return `Creating observation for IP admission: ${formData.admission_no || 'not selected yet'}`
    }
    if (isOPMode) {
      return `Creating observation for OP visit: ${visitLabel || formData.patient_visit || 'not selected yet'}`
    }
    return 'Select either IP or OP mode from the context switcher above'
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-2xl w-full max-h-[90vh] overflow-y-auto')}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-emerald-950">Create Observation</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isIPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium mr-2">IP Mode Active</span>}
              {isOPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium mr-2">OP Mode Active</span>}
              {getModeHelpText()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Mode indicator box */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <p className="text-xs font-semibold text-primary mb-1">
              {isIPMode ? '🏥 Creating Observation for Inpatient' : isOPMode ? '👤 Creating Observation for Outpatient' : '📋 Select Context'}
            </p>
            <p className="text-xs text-slate-600">
              {isIPMode 
                ? `The observation will be linked to the selected inpatient admission. Make sure you have an admission selected below.`
                : isOPMode
                ? `The observation will be linked to the selected outpatient visit. Make sure you have a visit selected below.`
                : 'Please select either IP or OP mode from the top navbar before creating an observation.'
              }
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Patient <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={patientQuery}
                  onChange={(e) => {
                    setPatientQuery(e.target.value)
                    setPatientOpen(true)
                  }}
                  onFocus={() => setPatientOpen(true)}
                  placeholder="Search patient..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={Boolean(contextPatient)}
                />
                {contextPatient && (
                  <p className="text-xs text-slate-400 mt-1">Patient auto-selected from context</p>
                )}
                {patientOpen && !contextPatient && patientOptions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {patientLoading && (
                      <div className="px-3 py-2 text-sm text-slate-500">Loading...</div>
                    )}
                    {!patientLoading && patientOptions.map((patient) => (
                      <div
                        key={patient.name}
                        onClick={() => handlePatientSelect(patient)}
                        className="px-3 py-2 text-sm hover:bg-slate-100 cursor-pointer"
                      >
                        {patient.patient_name} ({patient.name})
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Observation Template
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={selectedTemplate ? selectedTemplate.label : templateQuery}
                  onChange={(e) => {
                    setTemplateQuery(e.target.value)
                    setTemplateOpen(true)
                  }}
                  onFocus={() => setTemplateOpen(true)}
                  placeholder="Search observation template..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {templateOpen && templateOptions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {templateOptions.map((template) => (
                      <div
                        key={template.name}
                        onClick={() => handleTemplateSelect(template)}
                        className="px-3 py-2 text-sm hover:bg-slate-100 cursor-pointer"
                      >
                        {template.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Observation Level
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={selectedObservationLevel ? selectedObservationLevel.label : observationLevelQuery}
                  onChange={(e) => {
                    setObservationLevelQuery(e.target.value)
                    setObservationLevelOpen(true)
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
                        <div
                          key={obsLevel.name}
                          onClick={() => handleObservationLevelSelect(obsLevel)}
                          className="px-3 py-2 text-sm hover:bg-slate-100 cursor-pointer"
                        >
                          {obsLevel.label}
                        </div>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-slate-500">
                        No observation levels found
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Posting Date
              </label>
              <input
                type="datetime-local"
                value={formData.posting_date}
                onChange={(e) => handleChange('posting_date', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={formData.start_date}
                onChange={(e) => handleChange('start_date', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
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
                <option value="Registered">Registered</option>
                <option value="Preliminary">Preliminary</option>
                <option value="Final">Final</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Department
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={selectedDepartment ? selectedDepartment.label : departmentQuery}
                  onChange={(e) => {
                    setDepartmentQuery(e.target.value)
                    setDepartmentOpen(true)
                  }}
                  onFocus={() => setDepartmentOpen(true)}
                  placeholder="Search department..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {departmentOpen && departmentOptions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {departmentOptions.map((dept) => (
                      <div
                        key={dept.name}
                        onClick={() => handleDepartmentSelect(dept)}
                        className="px-3 py-2 text-sm hover:bg-slate-100 cursor-pointer"
                      >
                        {dept.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Practitioner
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
                  placeholder="Search practitioner..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {practitionerOpen && practitionerOptions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {practitionerOptions.map((pract) => (
                      <div
                        key={pract.name}
                        onClick={() => handlePractitionerSelect(pract)}
                        className="px-3 py-2 text-sm hover:bg-slate-100 cursor-pointer"
                      >
                        <div>
                          <div className="font-medium">{pract.label}</div>
                          <div className="text-xs text-slate-500">{pract.name}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Admission Selection - Only shown in IP mode */}
            {isIPMode && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Admission No <span className="text-red-500">*</span>
                </label>
                <div className="relative" data-filter-dropdown>
                  {activeAdmission ? (
                    <div>
                      <input
                        type="text"
                        value={formData.admission_no}
                        readOnly
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-100 cursor-not-allowed"
                      />
                      <p className="text-xs text-slate-400 mt-1">Auto-selected from IP context</p>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={admissionDisplay}
                        onChange={(e) => {
                          const value = e.target.value
                          setAdmissionQuery(value)
                          setFormData(prev => ({ ...prev, admission_no: '' }))
                          setSelectedAdmissionLabel('')
                          setAdmissionOpen(true)
                        }}
                        onFocus={() => {
                          if (formData.patient) {
                            setAdmissionOpen(true)
                            setAdmissionQuery('')
                          }
                        }}
                        onBlur={() => setTimeout(() => setAdmissionOpen(false), 200)}
                        placeholder={formData.patient ? 'Search or choose admission...' : 'Select patient first'}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-100"
                        disabled={!formData.patient}
                        autoComplete="off"
                      />
                      {admissionOpen && formData.patient && (
                        <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                          {admissionLoading ? (
                            <div className="px-3 py-3 text-sm text-slate-500">Loading admissions...</div>
                          ) : admissionOptions.length === 0 ? (
                            <div className="px-3 py-3 text-sm text-slate-500">No admissions found for this patient.</div>
                          ) : (
                            admissionOptions.map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => handleAdmissionSelect(opt.value, opt.label)}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none border-b border-slate-100 last:border-0"
                              >
                                <div className="font-medium text-slate-800">{opt.label}</div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Visit Selection - Only shown in OP mode */}
            {isOPMode && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Patient Visit <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  {activeVisit ? (
                    <div>
                      <input
                        type="text"
                        value={visitLabel || formData.patient_visit}
                        readOnly
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-100 cursor-not-allowed"
                      />
                      <p className="text-xs text-slate-400 mt-1">Auto-selected from OP context</p>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={visitDisplay}
                        onChange={(e) => {
                          setVisitQuery(e.target.value)
                          setVisitOpen(true)
                          if (!e.target.value) {
                            setFormData(prev => ({ ...prev, patient_visit: '' }))
                            setVisitLabel('')
                          }
                        }}
                        onFocus={() => {
                          if (formData.patient) {
                            setVisitOpen(true)
                          }
                        }}
                        onBlur={() => setTimeout(() => setVisitOpen(false), 200)}
                        placeholder={formData.patient ? 'Search or choose visit...' : 'Select patient first'}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-100"
                        disabled={!formData.patient}
                        autoComplete="off"
                      />
                      {visitOpen && formData.patient && visitOptions.length > 0 && (
                        <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                          {visitOptions.map((visit) => (
                            <button
                              key={visit.name}
                              type="button"
                              onClick={() => handleVisitSelect(visit)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none border-b border-slate-100 last:border-0"
                            >
                              <div className="font-medium text-slate-800">{visit.label}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Amount
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => handleChange('amount', e.target.value)}
                placeholder="0.00"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Duration
              </label>
              <input
                type="text"
                value={formData.duration}
                onChange={(e) => handleChange('duration', e.target.value)}
                placeholder="e.g. 30 minutes"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Notes
            </label>
            <textarea
              value={formData.note}
              onChange={(e) => handleChange('note', e.target.value)}
              placeholder="Enter observation notes..."
              rows={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className={CM_BTN_CANCEL}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || (!isIPMode && !isOPMode) || (isIPMode && !formData.admission_no) || (isOPMode && !formData.patient_visit)}
              className={CM_BTN_PRIMARY}
            >
              {loading ? 'Creating...' : 'Create Observation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}