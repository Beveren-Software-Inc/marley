import { useState, useEffect } from 'react'
import { createAppointment } from '../../services/appointments'
import { fetchHealthcarePractitioners, fetchAppointmentTypes, type LinkFieldOption } from '../../services/common'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { toast } from '../../hooks/useToast'
import { X } from 'lucide-react'
import { CreatePractitionerModal } from '../practitioners/CreatePractitionerModal'
import { CreatePatientModal } from '../patients/CreatePatientModal'

interface CreateAppointmentModalProps {
  onClose: () => void
  onSuccess?: () => void
  initialPatient?: string
  initialPractitioner?: string
}

export const CreateAppointmentModal = ({ onClose, onSuccess, initialPatient, initialPractitioner }: CreateAppointmentModalProps) => {
  const [formData, setFormData] = useState({
    patient: initialPatient || '',
    appointment_type: '',
    appointment_date: new Date().toISOString().split('T')[0],
    appointment_time: '',
    practitioner: initialPractitioner || ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreatePractitioner, setShowCreatePractitioner] = useState(false)
  const [showCreatePatient, setShowCreatePatient] = useState(false)
  const [showCreateAppointmentType, setShowCreateAppointmentType] = useState(false)
  
  // Patient dropdown state
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientQuery, setPatientQuery] = useState(initialPatient || '')
  const [patientLoading, setPatientLoading] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<PatientListItem | null>(null)

  // Appointment Type dropdown state
  const [appointmentTypeOptions, setAppointmentTypeOptions] = useState<LinkFieldOption[]>([])
  const [appointmentTypeOpen, setAppointmentTypeOpen] = useState(false)
  const [appointmentTypeQuery, setAppointmentTypeQuery] = useState('')

  // Practitioner dropdown state
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerQuery, setPractitionerQuery] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.patient) {
      setError('Patient is required')
      return
    }

    if (!formData.appointment_type) {
      setError('Appointment Type is required')
      return
    }

    if (!formData.appointment_date) {
      setError('Appointment Date is required')
      return
    }

    try {
      setLoading(true)
      setError(null)

      await createAppointment({
        patient: formData.patient,
        appointment_type: formData.appointment_type,
        appointment_date: formData.appointment_date,
        appointment_time: formData.appointment_time || undefined,
        practitioner: formData.practitioner || undefined
      })
      
      toast.success('Appointment created successfully')
      
      if (onSuccess) {
        onSuccess()
      }
      
      onClose()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create appointment'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  // Load initial options
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [practs, appointmentTypes] = await Promise.all([
          fetchHealthcarePractitioners(),
          fetchAppointmentTypes()
        ])
        setPractitionerOptions(practs)
        setAppointmentTypeOptions(appointmentTypes)
        
        // Set initial practitioner if provided
        if (initialPractitioner) {
          const pract = practs.find(p => p.name === initialPractitioner)
          if (pract) {
            setPractitionerQuery(pract.label)
            setFormData(prev => ({ ...prev, practitioner: pract.name }))
          }
        }
      } catch (err) {
        console.error('Failed to load options:', err)
      }
    }
    loadOptions()
  }, [initialPractitioner])

  // Load initial patient if provided
  useEffect(() => {
    if (initialPatient) {
      const loadInitialPatient = async () => {
        try {
          const patients = await fetchPatients(1, 0, initialPatient)
          if (patients.length > 0) {
            setSelectedPatient(patients[0])
            setPatientQuery(patients[0].patient_name || patients[0].name)
            setFormData(prev => ({ ...prev, patient: patients[0].name }))
          }
        } catch (err) {
          console.error('Failed to load initial patient:', err)
        }
      }
      loadInitialPatient()
    }
  }, [initialPatient])

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

  // Search appointment types
  useEffect(() => {
    if (!appointmentTypeOpen) return

    const search = async () => {
      try {
        const results = await fetchAppointmentTypes(appointmentTypeQuery)
        setAppointmentTypeOptions(results)
      } catch (err) {
        console.error('Failed to search appointment types:', err)
        setAppointmentTypeOptions([])
      }
    }

    const timeoutId = setTimeout(() => {
      search()
    }, appointmentTypeQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [appointmentTypeQuery, appointmentTypeOpen])

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

  const handlePatientSelect = (patient: PatientListItem) => {
    setSelectedPatient(patient)
    setFormData(prev => ({ ...prev, patient: patient.name }))
    setPatientQuery(patient.patient_name || patient.name)
    setPatientOpen(false)
  }

  const handleAppointmentTypeSelect = (aptType: LinkFieldOption) => {
    setFormData(prev => ({ ...prev, appointment_type: aptType.name }))
    setAppointmentTypeQuery(aptType.label)
    setAppointmentTypeOpen(false)
  }

  const handlePractitionerSelect = (pract: LinkFieldOption) => {
    setFormData(prev => ({ ...prev, practitioner: pract.name }))
    setPractitionerQuery(pract.label)
    setPractitionerOpen(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Create Appointment</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4" onClick={(e) => {
          const target = e.target as HTMLElement
          if (target.tagName !== 'INPUT' && !target.closest('.absolute')) {
            setPatientOpen(false)
            setAppointmentTypeOpen(false)
            setPractitionerOpen(false)
          }
        }}>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div>
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
                  if (selectedPatient) {
                    setSelectedPatient(null)
                    setFormData(prev => ({ ...prev, patient: '' }))
                  }
                }}
                onFocus={() => setPatientOpen(true)}
                placeholder="Search patient..."
                className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                required
              />
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
              {patientLoading && (
                <div className="absolute right-10 top-2.5 text-slate-400 text-sm">Loading...</div>
              )}
              {patientOpen && patientOptions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
                  {patientOptions.map((patient) => (
                    <button
                      key={patient.name}
                      type="button"
                      onClick={() => handlePatientSelect(patient)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                    >
                      <div className="font-medium">{patient.patient_name || patient.name}</div>
                      {patient.mobile && (
                        <div className="text-xs text-slate-500">{patient.mobile}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Appointment Type <span className="text-red-500">*</span>
            </label>
            <div className="relative flex items-center">
              <input
                type="text"
                value={appointmentTypeQuery}
                onChange={(e) => {
                  setAppointmentTypeQuery(e.target.value)
                  setAppointmentTypeOpen(true)
                }}
                onFocus={() => setAppointmentTypeOpen(true)}
                placeholder="Select appointment type..."
                className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                required
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowCreateAppointmentType(true)
                }}
                className="absolute right-2 p-1 text-primary hover:text-primary/80 rounded"
                title="Create New Appointment Type"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              {appointmentTypeOpen && appointmentTypeOptions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
                  {appointmentTypeOptions.map((aptType) => (
                    <button
                      key={aptType.name}
                      type="button"
                      onClick={() => handleAppointmentTypeSelect(aptType)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                    >
                      <div className="font-medium">{aptType.label}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Appointment Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.appointment_date}
                onChange={(e) => setFormData(prev => ({ ...prev, appointment_date: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Appointment Time
              </label>
              <input
                type="time"
                value={formData.appointment_time}
                onChange={(e) => setFormData(prev => ({ ...prev, appointment_time: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Healthcare Practitioner
            </label>
            <div className="relative flex items-center">
              <input
                type="text"
                value={practitionerQuery}
                onChange={(e) => {
                  setPractitionerQuery(e.target.value)
                  setPractitionerOpen(true)
                }}
                onFocus={() => setPractitionerOpen(true)}
                placeholder="Select practitioner..."
                className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
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
                      <div className="font-medium">{pract.label}</div>
                      {pract.department && (
                        <div className="text-xs text-slate-500">Dept: {pract.department}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Appointment'}
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
            setFormData({ ...formData, patient: patientName })
            setPatientOpen(false)
            setShowCreatePatient(false)
          }}
        />
      )}
      {showCreatePractitioner && (
        <CreatePractitionerModal
          onClose={() => setShowCreatePractitioner(false)}
          onSuccess={(practitionerName) => {
            setFormData({ ...formData, practitioner: practitionerName })
            const newPract = practitionerOptions.find(p => p.name === practitionerName)
            if (newPract) {
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
      {showCreateAppointmentType && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-900">Create Appointment Type</h2>
              <button
                onClick={() => setShowCreateAppointmentType(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Appointment Type creation is not yet implemented. Please create it from the Appointment Type DocType in Frappe.
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setShowCreateAppointmentType(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

