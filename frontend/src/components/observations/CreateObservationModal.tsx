import { useState, useEffect } from 'react'
import {
  CM_BTN_OUTLINE_CANCEL,
  CM_BTN_OUTLINE_SAVE,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_OVERLAY,
  CreateModalFooter,
  CreateModalHeader,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { createObservation, fetchObservationLevelDetails } from '../../services/observations'
import { fetchHealthcarePractitioners, getCurrentUserPractitioner, fetchMedicalDepartments, type LinkFieldOption, fetchPatientVisits, fetchObservationLevels } from '../../services/common'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { toast } from '../../hooks/useToast'
import { fetchInpatientRecords, fetchServiceUnits, type ServiceUnit } from '../../services/inpatientRecords'
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
    posting_date: new Date().toISOString().slice(0, 16),
    start_date: new Date().toISOString().split('T')[0],
    practitioner: '',
    department: '',
    admission_no: (isIPMode && activeAdmission) ? activeAdmission : '',
    patient_visit: (isOPMode && activeVisit) ? activeVisit : '',
    observation_level: '',
    designated_security_personel: '',
    note: '',
    amount: 0,
    duration: '',
    room: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Patient dropdown state
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientQuery, setPatientQuery] = useState(initialPatient || contextPatient || '')
  const [patientLoading, setPatientLoading] = useState(false)

  // Practitioner dropdown state
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [selectedPractitioner, setSelectedPractitioner] = useState<LinkFieldOption | null>(null)

  // Department dropdown state
  const [departmentOptions, setDepartmentOptions] = useState<LinkFieldOption[]>([])
  const [, setDepartmentQuery] = useState('')

  // Dropdowns close when clicking anywhere outside their field (no forced selection).
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-dd]')) return
      setPatientOpen(false)
      setObservationLevelOpen(false)
      setPractitionerOpen(false)
      setAdmissionOpen(false)
      setVisitOpen(false)
      setRoomOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  const [, setSelectedDepartment] = useState<LinkFieldOption | null>(null)

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

  // Room (service unit) dropdown — IP observation placement
  const [roomOptions, setRoomOptions] = useState<ServiceUnit[]>([])
  const [roomOpen, setRoomOpen] = useState(false)
  const [roomQuery, setRoomQuery] = useState('')
  const [selectedRoom, setSelectedRoom] = useState<ServiceUnit | null>(null)
  const [roomLoading, setRoomLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.patient) {
      setError('Patient is required')
      return
    }

    if (!formData.start_date) {
      setError('Start date is required')
      return
    }

    if (!formData.practitioner) {
      setError('Please select a doctor')
      return
    }

    // Validate based on global mode
    if (isOPMode && !formData.patient_visit) {
      setError('Please select a patient visit (OP mode active)')
      return
    }
    if (isIPMode && !formData.room) {
      setError('Please select a room / service unit for this observation')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const payload: any = {
        patient: formData.patient,
        posting_date: formData.posting_date || undefined,
        start_date: formData.start_date || undefined,
        practitioner: formData.practitioner || undefined,
        department: formData.department || undefined,
        observation_level: formData.observation_level || undefined,
        designated_security_personel: formData.designated_security_personel || undefined,
        note: formData.note || undefined,
        amount: formData.amount || undefined,
        duration: formData.duration || undefined,
      }

      // Add the appropriate care context based on global mode
      if (isIPMode && formData.admission_no) {
        payload.admission_no = formData.admission_no
        payload.room = formData.room || undefined
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
        const response = await fetchInpatientRecords(
          undefined,
          admissionQuery.trim() || undefined,
          formData.patient,
          undefined,
          undefined,
          undefined
        )
        setAdmissionOptions(
          response.data.slice(0, 50).map((r) => ({
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

  // Load vacant service units for observation room (IP mode)
  useEffect(() => {
    if (!isIPMode || !roomOpen) return

    const timeoutId = setTimeout(async () => {
      setRoomLoading(true)
      try {
        const results = await fetchServiceUnits(undefined, 'Vacant', roomQuery.trim() || undefined)
        setRoomOptions(results)
      } catch (err) {
        console.error('Failed to load service units:', err)
        setRoomOptions([])
      } finally {
        setRoomLoading(false)
      }
    }, roomQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [roomQuery, roomOpen, isIPMode])

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

  const handlePractitionerSelect = (pract: LinkFieldOption) => {
    setSelectedPractitioner(pract)
    setFormData(prev => ({ ...prev, practitioner: pract.name }))
    setPractitionerQuery(pract.label)
    setPractitionerOpen(false)
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
      // amount/duration stay as entered
    }

    setFormData(prev => {
      const next = { ...prev, observation_level: obsLevel.name }
      if (
        rateFromLevel != null &&
        (!prev.amount || Number(prev.amount) === 0)
      ) {
        next.amount = rateFromLevel
      }
      if (intervalFromLevel) {
        next.duration = intervalFromLevel
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

  const handleRoomSelect = (unit: ServiceUnit) => {
    setSelectedRoom(unit)
    setFormData(prev => ({ ...prev, room: unit.name }))
    setRoomQuery(unit.healthcare_service_unit_name || unit.name)
    setRoomOpen(false)
  }

  const admissionDisplay = admissionOpen
    ? admissionQuery
    : (formData.admission_no ? selectedAdmissionLabel || formData.admission_no : '')

  const visitDisplay = visitOpen
    ? visitQuery
    : (formData.patient_visit ? visitLabel || formData.patient_visit : '')

  // Get mode-specific help text (IP mode intentionally shows nothing)
  const getModeHelpText = () => {
    if (isOPMode) {
      return `Creating observation for OP visit: ${visitLabel || formData.patient_visit || 'not selected yet'}`
    }
    return ''
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-2xl w-full max-h-[90vh] overflow-y-auto')}>
        <CreateModalHeader
          title="Create Observation"
          subtitle={
            <>
              {isOPMode ? (
                <span className="mr-2 inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                  OP Mode Active
                </span>
              ) : null}
              {getModeHelpText()}
            </>
          }
          onClose={onClose}
        />

        <form onSubmit={handleSubmit} className={`${CREATE_MODAL_BODY_GRADIENT} space-y-4 p-6`}>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Mode indicator box — hidden in IP mode */}
          {!isIPMode && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-xs font-semibold text-primary mb-1">
                {isOPMode ? '👤 Creating Observation for Outpatient' : '📋 SEARCH PATIENT & SELECT VISIT NO. / ADMISSION NO.'}
              </p>
              {isOPMode && (
                <p className="text-xs text-slate-600">
                  The observation will be linked to the selected outpatient visit. Make sure you have a visit selected below.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
                Patient <span className="text-red-500">*</span>
              </label>
              <div data-dd className="relative">
                <input
                  type="text"
                  value={patientQuery}
                  onChange={(e) => {
                    setPatientQuery(e.target.value)
                    setPatientOpen(true)
                  }}
                  onFocus={() => setPatientOpen(true)}
                  placeholder="SEARCH PATIENT"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={Boolean(contextPatient)}
                />
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
              <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
                Observation Level
              </label>
              <div data-dd className="relative">
                <input
                  type="text"
                  value={selectedObservationLevel ? selectedObservationLevel.label : observationLevelQuery}
                  onChange={(e) => {
                    setObservationLevelQuery(e.target.value)
                    setObservationLevelOpen(true)
                  }}
                  onFocus={() => setObservationLevelOpen(true)}
                  placeholder="SEARCH OBSERVATION LEVEL"
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
                        NO OBSERVATION LEVELS FOUND
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
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
              <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
                Start Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.start_date}
                onChange={(e) => handleChange('start_date', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>


            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
                Doctor <span className="text-red-500">*</span>
              </label>
              <div data-dd className="relative">
                <input
                  type="text"
                  value={selectedPractitioner ? selectedPractitioner.label : practitionerQuery}
                  onChange={(e) => {
                    setPractitionerQuery(e.target.value)
                    setPractitionerOpen(true)
                  }}
                  onFocus={() => setPractitionerOpen(true)}
                  placeholder="SEARCH DOCTOR"
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
                <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
                  Admission No
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
                    </div>
                  ) : (
                    <>
                      <input
                        data-dd
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
                        placeholder={formData.patient ? 'SEARCH OR CHOOSE ADMISSION' : 'SELECT PATIENT FIRST'}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-100"
                        disabled={!formData.patient}
                        autoComplete="off"
                      />
                      {admissionOpen && formData.patient && (
                        <div data-dd className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
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
                <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
                  Patient Visit <span className="text-red-500">*</span>
                </label>
                <div data-dd className="relative">
                  {activeVisit ? (
                    <div>
                      <input
                        type="text"
                        value={visitLabel || formData.patient_visit}
                        readOnly
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-100 cursor-not-allowed"
                      />
                    </div>
                  ) : (
                    <>
                      <input
                        data-dd
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
                        placeholder={formData.patient ? 'SEARCH OR CHOOSE VISIT' : 'SELECT PATIENT FIRST'}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-100"
                        disabled={!formData.patient}
                        autoComplete="off"
                      />
                      {visitOpen && formData.patient && visitOptions.length > 0 && (
                        <div data-dd className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
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

            {isIPMode && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
                  Room / Service Unit <span className="text-red-500">*</span>
                </label>
                <div data-dd className="relative">
                  <input
                    type="text"
                    value={selectedRoom ? (selectedRoom.healthcare_service_unit_name || selectedRoom.name) : roomQuery}
                    onChange={(e) => {
                      setRoomQuery(e.target.value)
                      setFormData(prev => ({ ...prev, room: '' }))
                      setSelectedRoom(null)
                      setRoomOpen(true)
                    }}
                    onFocus={() => setRoomOpen(true)}
                    onBlur={() => setTimeout(() => setRoomOpen(false), 200)}
                    placeholder="SEARCH VACANT ROOMS"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    autoComplete="off"
                  />
                  {roomOpen && (
                    <div data-dd className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {roomLoading ? (
                        <div className="px-3 py-3 text-sm text-slate-500">Loading rooms...</div>
                      ) : roomOptions.length === 0 ? (
                        <div className="px-3 py-3 text-sm text-slate-500">NO VACANT ROOMS FOUND.</div>
                      ) : (
                        roomOptions.map((unit) => (
                          <button
                            key={unit.name}
                            type="button"
                            onClick={() => handleRoomSelect(unit)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none border-b border-slate-100 last:border-0"
                          >
                            <div className="font-medium text-slate-800">
                              {unit.healthcare_service_unit_name || unit.name}
                            </div>
                            <div className="text-xs text-slate-500">
                              {unit.occupancy_status || 'Vacant'}
                              {unit.room_category ? ` · ${unit.room_category}` : ''}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
                Frequency
              </label>
              <input
                type="text"
                value={formData.duration}
                onChange={(e) => handleChange('duration', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
                Designated Security Personnel
              </label>
              <input
                type="text"
                value={formData.designated_security_personel}
                onChange={(e) => handleChange('designated_security_personel', e.target.value)}
                placeholder="ENTER SECURITY PERSONNEL NAME"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
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

          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 mb-1 uppercase">
              Remarks
            </label>
            <textarea
              value={formData.note}
              onChange={(e) => handleChange('note', e.target.value)}
              placeholder="ENTER OBSERVATION NOTES"
              rows={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <CreateModalFooter>
            <button
              type="button"
              onClick={onClose}
              className={CM_BTN_OUTLINE_CANCEL}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || (!isIPMode && !isOPMode) || (isIPMode && !formData.room) || (isOPMode && !formData.patient_visit)}
              className={CM_BTN_OUTLINE_SAVE}
            >
              {loading ? 'Creating...' : 'Create Observation'}
            </button>
          </CreateModalFooter>
        </form>
      </div>
    </div>
  )
}