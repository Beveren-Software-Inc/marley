import { useState, useEffect } from 'react'
import { createWarningMessage } from '../../services/warningMessages'
import { fetchHealthcarePractitioners, fetchClinicalNoteTypes, fetchMedicalRoles, getCurrentUserPractitioner, getPractitionerMedicalRole, type LinkFieldOption } from '../../services/common'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { toast } from '../../hooks/useToast'
import { CreatePractitionerModal } from '../practitioners/CreatePractitionerModal'
import { CreatePatientModal } from '../patients/CreatePatientModal'
import { CreateClinicalNoteTypeModal } from '../clinicalNotes/CreateClinicalNoteTypeModal'
import { CreateMedicalRoleModal } from '../clinicalNotes/CreateMedicalRoleModal'

interface CreateWarningMessageModalProps {
  onClose: () => void
  onSuccess?: () => void
  initialPatient?: string
}

export const CreateWarningMessageModal = ({ onClose, onSuccess, initialPatient }: CreateWarningMessageModalProps) => {
  const [formData, setFormData] = useState({
    patient: initialPatient || '',
    warning: '',
    practitioner: '',
    posting_date: new Date().toISOString().slice(0, 16),
    clinical_note_type: '',
    medical_role: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreatePractitioner, setShowCreatePractitioner] = useState(false)
  const [showCreatePatient, setShowCreatePatient] = useState(false)
  const [showCreateClinicalNoteType, setShowCreateClinicalNoteType] = useState(false)
  const [showCreateMedicalRole, setShowCreateMedicalRole] = useState(false)
  
  // Patient dropdown state
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientQuery, setPatientQuery] = useState(initialPatient || '')
  const [patientLoading, setPatientLoading] = useState(false)

  // Practitioner dropdown state
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [selectedPractitioner, setSelectedPractitioner] = useState<LinkFieldOption | null>(null)

  // Clinical Note Type dropdown state
  const [clinicalNoteTypeOptions, setClinicalNoteTypeOptions] = useState<LinkFieldOption[]>([])
  const [clinicalNoteTypeOpen, setClinicalNoteTypeOpen] = useState(false)
  const [clinicalNoteTypeQuery, setClinicalNoteTypeQuery] = useState('')
  const [selectedClinicalNoteType, setSelectedClinicalNoteType] = useState<LinkFieldOption | null>(null)

  // Medical Role dropdown state
  const [medicalRoleOptions, setMedicalRoleOptions] = useState<LinkFieldOption[]>([])
  const [medicalRoleOpen, setMedicalRoleOpen] = useState(false)
  const [medicalRoleQuery, setMedicalRoleQuery] = useState('')
  const [selectedMedicalRole, setSelectedMedicalRole] = useState<LinkFieldOption | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.patient) {
      setError('Patient is required')
      return
    }

    if (!formData.warning.trim()) {
      setError('Warning message is required')
      return
    }

    try {
      setLoading(true)
      setError(null)

      await createWarningMessage({
        patient: formData.patient,
        warning: formData.warning,
        practitioner: formData.practitioner || undefined,
        posting_date: formData.posting_date || undefined,
        clinical_note_type: formData.clinical_note_type || undefined,
        medical_role: formData.medical_role || undefined
      })
      
      toast.success('Warning message created successfully')
      if (onSuccess) {
        onSuccess()
      }
      
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create warning message'
      setError(message)
      toast.error(message)
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

  // Load initial options
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [practs, noteTypes, roles] = await Promise.all([
          fetchHealthcarePractitioners(),
          fetchClinicalNoteTypes(),
          fetchMedicalRoles()
        ])
        setPractitionerOptions(practs)
        setClinicalNoteTypeOptions(noteTypes)
        setMedicalRoleOptions(roles)
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
            
            // Auto-fetch medical role from practitioner
            let medicalRole: string | null = null
            
            // First try to get from practitioner data if available
            if (practitionerOption.medical_role) {
              medicalRole = practitionerOption.medical_role
            } else {
              // Fallback: fetch from API
              try {
                medicalRole = await getPractitionerMedicalRole(practitioner)
              } catch (err) {
                console.error('Failed to fetch medical role:', err)
              }
            }
            
            // Set the medical role if found
            if (medicalRole) {
              setFormData(prev => ({ ...prev, medical_role: medicalRole! }))
              // Find the role in options to set the label
              const roleOption = medicalRoleOptions.find(r => r.name === medicalRole)
              if (roleOption) {
                setSelectedMedicalRole(roleOption)
                setMedicalRoleQuery(roleOption.label)
              } else {
                // If not found, fetch all roles and try again
                try {
                  const roleResults = await fetchMedicalRoles()
                  const foundRole = roleResults.find(r => r.name === medicalRole)
                  if (foundRole) {
                    setSelectedMedicalRole(foundRole)
                    setMedicalRoleQuery(foundRole.label)
                  } else {
                    // Just set the name as query if we can't find the label
                    setMedicalRoleQuery(medicalRole)
                  }
                } catch (err) {
                  console.error('Failed to fetch medical roles:', err)
                  setMedicalRoleQuery(medicalRole)
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to auto-populate practitioner:', err)
      }
    }
    autoPopulatePractitioner()
  }, [practitionerOptions, medicalRoleOptions])

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

  // Search practitioners
  useEffect(() => {
    if (!practitionerOpen) return

    const search = async () => {
      try {
        const results = await fetchHealthcarePractitioners(practitionerQuery)
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
  }, [practitionerQuery, practitionerOpen])

  // Search clinical note types
  useEffect(() => {
    if (!clinicalNoteTypeOpen) return

    const search = async () => {
      try {
        const results = await fetchClinicalNoteTypes(clinicalNoteTypeQuery)
        setClinicalNoteTypeOptions(results)
      } catch (err) {
        console.error('Failed to search clinical note types:', err)
        setClinicalNoteTypeOptions([])
      }
    }

    const timeoutId = setTimeout(() => {
      search()
    }, clinicalNoteTypeQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [clinicalNoteTypeQuery, clinicalNoteTypeOpen])

  // Search medical roles
  useEffect(() => {
    if (!medicalRoleOpen) return

    const search = async () => {
      try {
        const results = await fetchMedicalRoles(medicalRoleQuery)
        setMedicalRoleOptions(results)
      } catch (err) {
        console.error('Failed to search medical roles:', err)
        setMedicalRoleOptions([])
      }
    }

    const timeoutId = setTimeout(() => {
      search()
    }, medicalRoleQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [medicalRoleQuery, medicalRoleOpen])

  const handlePatientSelect = (patient: PatientListItem) => {
    setFormData(prev => ({ ...prev, patient: patient.name }))
    setPatientQuery(patient.patient_name)
    setPatientOpen(false)
  }

  const handlePractitionerSelect = async (pract: LinkFieldOption) => {
    setSelectedPractitioner(pract)
    setFormData(prev => ({ ...prev, practitioner: pract.name }))
    setPractitionerQuery(pract.label)
    setPractitionerOpen(false)

    // Auto-fetch medical role from practitioner
    let medicalRole: string | null = null
    
    // First try to get from practitioner data if available
    if (pract.medical_role) {
      medicalRole = pract.medical_role
    } else {
      // Fallback: fetch from API
      try {
        medicalRole = await getPractitionerMedicalRole(pract.name)
      } catch (err) {
        console.error('Failed to fetch medical role:', err)
      }
    }

    // Set the medical role if found
    if (medicalRole) {
      setFormData(prev => ({ ...prev, medical_role: medicalRole! }))
      // Find the role in options to set the label
      const roleOption = medicalRoleOptions.find(r => r.name === medicalRole)
      if (roleOption) {
        setSelectedMedicalRole(roleOption)
        setMedicalRoleQuery(roleOption.label)
      } else {
        // If not found, fetch all roles and try again
        try {
          const roleResults = await fetchMedicalRoles()
          const foundRole = roleResults.find(r => r.name === medicalRole)
          if (foundRole) {
            setSelectedMedicalRole(foundRole)
            setMedicalRoleQuery(foundRole.label)
          } else {
            // Just set the name as query if we can't find the label
            setMedicalRoleQuery(medicalRole)
          }
        } catch (err) {
          console.error('Failed to fetch medical roles:', err)
          setMedicalRoleQuery(medicalRole)
        }
      }
    }
  }

  const handleClinicalNoteTypeSelect = (noteType: LinkFieldOption) => {
    setSelectedClinicalNoteType(noteType)
    setFormData(prev => ({ ...prev, clinical_note_type: noteType.name }))
    setClinicalNoteTypeQuery(noteType.label)
    setClinicalNoteTypeOpen(false)
  }

  const handleMedicalRoleSelect = (role: LinkFieldOption) => {
    setSelectedMedicalRole(role)
    setFormData(prev => ({ ...prev, medical_role: role.name }))
    setMedicalRoleQuery(role.label)
    setMedicalRoleOpen(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200 sticky top-0 bg-white z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Create Warning Message</h2>
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
          // Close dropdowns when clicking outside inputs
          const target = e.target as HTMLElement
          if (target.tagName !== 'INPUT' && !target.closest('.absolute')) {
            setPatientOpen(false)
            setPractitionerOpen(false)
            setClinicalNoteTypeOpen(false)
            setMedicalRoleOpen(false)
          }
        }}>
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

          {/* Warning Details */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Warning Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Warning Message <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formData.warning}
                  onChange={(e) => handleChange('warning', e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter warning message..."
                  required
                />
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
                  Practitioner
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={selectedPractitioner ? selectedPractitioner.label : practitionerQuery}
                    onChange={(e) => {
                      setPractitionerQuery(e.target.value)
                      setPractitionerOpen(true)
                    }}
                    onFocus={() => setPractitionerOpen(true)}
                    placeholder="Search practitioner..."
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
                          {pract.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Medical Role
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={selectedMedicalRole ? selectedMedicalRole.label : medicalRoleQuery}
                    onChange={(e) => {
                      setMedicalRoleQuery(e.target.value)
                      setMedicalRoleOpen(true)
                    }}
                    onFocus={() => setMedicalRoleOpen(true)}
                    placeholder="Search medical role..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowCreateMedicalRole(true)
                    }}
                    className="absolute right-2 p-1 text-primary hover:text-primary/80 rounded"
                    title="Create New Medical Role"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  {medicalRoleOpen && medicalRoleOptions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
                      {medicalRoleOptions.map((role) => (
                        <button
                          key={role.name}
                          type="button"
                          onClick={() => handleMedicalRoleSelect(role)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                        >
                          {role.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Clinical Note Type
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={selectedClinicalNoteType ? selectedClinicalNoteType.label : clinicalNoteTypeQuery}
                    onChange={(e) => {
                      setClinicalNoteTypeQuery(e.target.value)
                      setClinicalNoteTypeOpen(true)
                    }}
                    onFocus={() => setClinicalNoteTypeOpen(true)}
                    placeholder="Search clinical note type..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowCreateClinicalNoteType(true)
                    }}
                    className="absolute right-2 p-1 text-primary hover:text-primary/80 rounded"
                    title="Create New Clinical Note Type"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  {clinicalNoteTypeOpen && clinicalNoteTypeOptions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
                      {clinicalNoteTypeOptions.map((noteType) => (
                        <button
                          key={noteType.name}
                          type="button"
                          onClick={() => handleClinicalNoteTypeSelect(noteType)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                        >
                          {noteType.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Warning Message'}
            </button>
          </div>
        </form>
      </div>
      {showCreatePractitioner && (
        <CreatePractitionerModal
          onClose={() => setShowCreatePractitioner(false)}
          onSuccess={(practitionerName) => {
            setFormData(prev => ({ ...prev, practitioner: practitionerName }))
            const newPract = practitionerOptions.find(p => p.name === practitionerName)
            if (newPract) {
              setSelectedPractitioner(newPract)
              setPractitionerQuery(newPract.label)
            } else {
              fetchHealthcarePractitioners().then(setPractitionerOptions).catch(console.error)
              setPractitionerQuery(practitionerName)
            }
            setPractitionerOpen(false)
            setShowCreatePractitioner(false)
          }}
        />
      )}
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
      {showCreateMedicalRole && (
        <CreateMedicalRoleModal
          onClose={() => setShowCreateMedicalRole(false)}
          onSuccess={(created) => {
            const option: LinkFieldOption = {
              name: created.name,
              label: created.medical_role,
            }
            setMedicalRoleOptions((prev) => [option, ...prev])
            setSelectedMedicalRole(option)
            setFormData((prev) => ({ ...prev, medical_role: created.name }))
            setMedicalRoleQuery(option.label)
            setMedicalRoleOpen(false)
            setShowCreateMedicalRole(false)
          }}
        />
      )}
      {showCreateClinicalNoteType && (
        <CreateClinicalNoteTypeModal
          onClose={() => setShowCreateClinicalNoteType(false)}
          onSuccess={(created) => {
            const option: LinkFieldOption = {
              name: created.name,
              label: created.clinical_note_type,
            }
            setClinicalNoteTypeOptions((prev) => [option, ...prev])
            setSelectedClinicalNoteType(option)
            setFormData((prev) => ({ ...prev, clinical_note_type: created.name }))
            setClinicalNoteTypeQuery(option.label)
            setClinicalNoteTypeOpen(false)
            setShowCreateClinicalNoteType(false)
          }}
        />
      )}
    </div>
  )
}

