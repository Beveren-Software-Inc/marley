import { useState, useEffect } from 'react'
import { createObservation } from '../../services/observations'
import { fetchHealthcarePractitioners, fetchObservationTemplates, fetchMedicalDepartments, type LinkFieldOption } from '../../services/common'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { toast } from '../../hooks/useToast'
import { fetchInpatientRecords, type InpatientRecord } from '../../services/inpatientRecords'
import { X } from 'lucide-react'

interface CreateObservationModalProps {
  onClose: () => void
  onSuccess?: () => void
  initialPatient?: string
}

export const CreateObservationModal = ({ onClose, onSuccess, initialPatient }: CreateObservationModalProps) => {
  const [formData, setFormData] = useState({
    patient: initialPatient || '',
    observation_template: '',
    posting_date: new Date().toISOString().slice(0, 16),
    start_date: new Date().toISOString().split('T')[0],
    status: 'Registered',
    practitioner: '',
    department: '',
    admission_no: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
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

  // Admission dropdown state (filtered by selected patient) — only set from list selection
  const [admissionOptions, setAdmissionOptions] = useState<{ value: string; label: string }[]>([])
  const [admissionOpen, setAdmissionOpen] = useState(false)
  const [admissionQuery, setAdmissionQuery] = useState('')
  const [admissionLoading, setAdmissionLoading] = useState(false)
  const [selectedAdmissionLabel, setSelectedAdmissionLabel] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.patient) {
      setError('Patient is required')
      return
    }

    if (!formData.observation_template) {
      setError('Observation Template is required')
      return
    }

    try {
      setLoading(true)
      setError(null)

      await createObservation({
        patient: formData.patient,
        observation_template: formData.observation_template,
        posting_date: formData.posting_date || undefined,
        start_date: formData.start_date || undefined,
        status: formData.status || undefined,
        practitioner: formData.practitioner || undefined,
        department: formData.department || undefined,
        admission_no: formData.admission_no || undefined
      })
      
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

  // Search practitioners
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

  // Load admissions for selected patient when dropdown opens or search changes (choosable list only)
  useEffect(() => {
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
  }, [admissionQuery, admissionOpen, formData.patient])

  const handlePatientSelect = (patient: PatientListItem) => {
    setFormData(prev => ({ ...prev, patient: patient.name, admission_no: '' }))
    setPatientQuery(patient.patient_name)
    setSelectedAdmissionLabel('')
    setAdmissionQuery('')
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

  const handleAdmissionSelect = (value: string, label: string) => {
    setFormData(prev => ({ ...prev, admission_no: value }))
    setSelectedAdmissionLabel(label)
    setAdmissionQuery('')
    setAdmissionOpen(false)
  }

  const admissionDisplay = admissionOpen
    ? admissionQuery
    : (formData.admission_no ? selectedAdmissionLabel || formData.admission_no : '')

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Create Observation</h2>
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
                />
                {patientOpen && patientOptions.length > 0 && (
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
                Observation Template <span className="text-red-500">*</span>
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
                        {pract.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Admission No <span className="text-slate-400 font-normal">(optional — choose from list)</span>
              </label>
              <div className="relative" data-filter-dropdown>
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
              </div>
            </div>
          </div>

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
              {loading ? 'Creating...' : 'Create Observation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}





