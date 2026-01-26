import { useState, useEffect } from 'react'
import { createServiceRequest } from '../../services/serviceRequests'
import { fetchHealthcarePractitioners, fetchMedicalDepartments, fetchServiceRequestTemplateTypes, fetchServiceRequestTemplates, fetchServiceRequestStatuses, type LinkFieldOption } from '../../services/common'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { toast } from '../../hooks/useToast'
import { X } from 'lucide-react'
import { CreatePractitionerModal } from '../practitioners/CreatePractitionerModal'

interface CreateServiceRequestModalProps {
  onClose: () => void
  onSuccess?: () => void
  initialPatient?: string
}

export const CreateServiceRequestModal = ({ onClose, onSuccess, initialPatient }: CreateServiceRequestModalProps) => {
  const [formData, setFormData] = useState({
    patient: initialPatient || '',
    template_dt: '',
    template_dn: '',
    practitioner: '',
    order_date: new Date().toISOString().split('T')[0],
    order_time: new Date().toTimeString().slice(0, 5),
    department: '',
    status: 'draft-Request Status',
    priority: '',
    intent: '',
    quantity: 1
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreatePractitioner, setShowCreatePractitioner] = useState(false)
  
  // Patient dropdown state
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientQuery, setPatientQuery] = useState(initialPatient || '')
  const [patientLoading, setPatientLoading] = useState(false)

  // Template Type dropdown state
  const [templateTypeOptions, setTemplateTypeOptions] = useState<LinkFieldOption[]>([])
  const [templateTypeOpen, setTemplateTypeOpen] = useState(false)
  const [templateTypeQuery, setTemplateTypeQuery] = useState('')

  // Template dropdown state
  const [templateOptions, setTemplateOptions] = useState<LinkFieldOption[]>([])
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateQuery, setTemplateQuery] = useState('')

  // Practitioner dropdown state
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerQuery, setPractitionerQuery] = useState('')

  // Department dropdown state
  const [departmentOptions, setDepartmentOptions] = useState<LinkFieldOption[]>([])
  const [departmentOpen, setDepartmentOpen] = useState(false)
  const [departmentQuery, setDepartmentQuery] = useState('')

  // Status dropdown state
  const [statusOptions, setStatusOptions] = useState<LinkFieldOption[]>([])
  const [statusOpen, setStatusOpen] = useState(false)
  const [statusQuery, setStatusQuery] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.patient) {
      setError('Patient is required')
      return
    }

    if (!formData.template_dt) {
      setError('Order Template Type is required')
      return
    }

    if (!formData.template_dn) {
      setError('Order Template is required')
      return
    }

    try {
      setLoading(true)
      setError(null)

      await createServiceRequest({
        patient: formData.patient,
        template_dt: formData.template_dt,
        template_dn: formData.template_dn,
        practitioner: formData.practitioner || undefined,
        order_date: formData.order_date || undefined,
        order_time: formData.order_time || undefined,
        department: formData.department || undefined,
        status: formData.status || undefined,
        priority: formData.priority || undefined,
        intent: formData.intent || undefined,
        quantity: formData.quantity || undefined
      })
      
      toast.success('Service request created successfully')
      
      if (onSuccess) {
        onSuccess()
      }
      
      onClose()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create service request'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: string, value: string | number) => {
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
        console.log('Loading options for Service Request modal...')
        console.log('About to call fetchServiceRequestStatuses...')
        
        // Call statuses separately first to debug
        const statusesPromise = fetchServiceRequestStatuses()
        console.log('Statuses promise created')
        
        const [practs, templateTypes, depts, statuses] = await Promise.all([
          fetchHealthcarePractitioners(),
          fetchServiceRequestTemplateTypes(),
          fetchMedicalDepartments(),
          statusesPromise
        ])
        console.log('All promises resolved')
        console.log('Statuses received:', statuses)
        console.log('Statuses length:', statuses?.length)
        
        setPractitionerOptions(practs)
        setTemplateTypeOptions(templateTypes)
        setDepartmentOptions(depts)
        setStatusOptions(statuses)
        
        // Set default status
        const defaultStatus = statuses.find(s => s.code_value === 'draft')
        console.log('Default status found:', defaultStatus)
        if (defaultStatus) {
          setStatusQuery(defaultStatus.label)
          setFormData(prev => ({ ...prev, status: defaultStatus.name }))
        } else if (statuses.length > 0) {
          // If no draft, use first available status
          const firstStatus = statuses[0]
          setStatusQuery(firstStatus.label)
          setFormData(prev => ({ ...prev, status: firstStatus.name }))
        } else {
          console.warn('No statuses available')
        }
      } catch (err) {
        console.error('Failed to load options:', err)
        if (err instanceof Error) {
          console.error('Error details:', err.message, err.stack)
        }
      }
    }
    loadOptions()
  }, [])

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

  // Search template types
  useEffect(() => {
    if (!templateTypeOpen) return

    const search = async () => {
      try {
        const results = await fetchServiceRequestTemplateTypes()
        // Filter by query if provided
        const filtered = templateTypeQuery.trim() === '' 
          ? results 
          : results.filter(t => t.label.toLowerCase().includes(templateTypeQuery.toLowerCase()))
        setTemplateTypeOptions(filtered)
      } catch (err) {
        console.error('Failed to search template types:', err)
        setTemplateTypeOptions([])
      }
    }

    const timeoutId = setTimeout(() => {
      search()
    }, templateTypeQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [templateTypeQuery, templateTypeOpen])

  // Search templates based on template_dt
  useEffect(() => {
    if (!templateOpen || !formData.template_dt) return

    const search = async () => {
      try {
        const results = await fetchServiceRequestTemplates(formData.template_dt, templateQuery, formData.department)
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
  }, [templateQuery, templateOpen, formData.template_dt, formData.department])

  // Search practitioners
  useEffect(() => {
    if (!practitionerOpen) return

    const search = async () => {
      try {
        const results = await fetchHealthcarePractitioners(practitionerQuery, formData.department)
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

  const handlePatientSelect = (patient: PatientListItem) => {
    setFormData(prev => ({ ...prev, patient: patient.name }))
    setPatientQuery(patient.patient_name)
    setPatientOpen(false)
  }

  const handleTemplateTypeSelect = (templateType: LinkFieldOption) => {
    setFormData(prev => ({ 
      ...prev, 
      template_dt: templateType.name,
      template_dn: '', // Clear template when type changes
      department: '' // Clear department when type changes
    }))
    setTemplateTypeQuery(templateType.label)
    setTemplateTypeOpen(false)
    setTemplateQuery('')
    setDepartmentQuery('')
  }

  const handleTemplateSelect = (template: LinkFieldOption) => {
    setFormData(prev => ({ 
      ...prev, 
      template_dn: template.name,
      // Auto-set department from template if available
      department: template.department || prev.department
    }))
    setTemplateQuery(template.label)
    setTemplateOpen(false)
    
    // Update department query if template has department
    if (template.department) {
      const dept = departmentOptions.find(d => d.name === template.department)
      if (dept) {
        setDepartmentQuery(dept.label)
      }
    }
  }

  const handlePractitionerSelect = (pract: LinkFieldOption) => {
    setFormData(prev => ({ ...prev, practitioner: pract.name }))
    setPractitionerQuery(pract.label)
    setPractitionerOpen(false)
  }

  const handleDepartmentSelect = (dept: LinkFieldOption) => {
    setFormData(prev => ({ ...prev, department: dept.name }))
    setDepartmentQuery(dept.label)
    setDepartmentOpen(false)
    // Refresh templates and practitioners when department changes
    if (formData.template_dt) {
      fetchServiceRequestTemplates(formData.template_dt, '', dept.name).then(setTemplateOptions).catch(console.error)
    }
    fetchHealthcarePractitioners('', dept.name).then(setPractitionerOptions).catch(console.error)
  }

  const handleStatusSelect = (status: LinkFieldOption) => {
    setFormData(prev => ({ ...prev, status: status.name }))
    setStatusQuery(status.label)
    setStatusOpen(false)
  }

  // Search statuses
  useEffect(() => {
    if (!statusOpen) return

    const search = async () => {
      try {
        const searchTerm = statusQuery.trim() || undefined
        const results = await fetchServiceRequestStatuses(searchTerm)
        setStatusOptions(results)
      } catch (err) {
        console.error('Failed to search statuses:', err)
        setStatusOptions([])
      }
    }

    const timeoutId = setTimeout(() => {
      search()
    }, statusQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [statusQuery, statusOpen])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Create Service Request</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4" onClick={(e) => {
          const target = e.target as HTMLElement
          if (target.tagName !== 'INPUT' && !target.closest('.absolute')) {
            setPatientOpen(false)
            setTemplateTypeOpen(false)
            setTemplateOpen(false)
            setPractitionerOpen(false)
            setDepartmentOpen(false)
            setStatusOpen(false)
          }
        }}>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Patient */}
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
                  required
                />
                {patientLoading && (
                  <div className="absolute right-3 top-2.5 text-slate-400 text-sm">Loading...</div>
                )}
                {patientOpen && patientOptions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
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

            {/* Order Template Type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Order Template Type <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={templateTypeQuery}
                  onChange={(e) => {
                    setTemplateTypeQuery(e.target.value)
                    setTemplateTypeOpen(true)
                  }}
                  onFocus={() => setTemplateTypeOpen(true)}
                  placeholder="Select template type..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
                {templateTypeOpen && templateTypeOptions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {templateTypeOptions.map((templateType) => (
                      <button
                        key={templateType.name}
                        type="button"
                        onClick={() => handleTemplateTypeSelect(templateType)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                      >
                        <div className="font-medium">{templateType.label}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Order Template */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Order Template <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={templateQuery}
                  onChange={(e) => {
                    setTemplateQuery(e.target.value)
                    setTemplateOpen(true)
                  }}
                  onFocus={() => {
                    if (formData.template_dt) {
                      setTemplateOpen(true)
                    }
                  }}
                  placeholder={formData.template_dt ? "Search template..." : "Select template type first"}
                  disabled={!formData.template_dt}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-100 disabled:cursor-not-allowed"
                  required
                />
                {templateOpen && templateOptions.length > 0 && formData.template_dt && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {templateOptions.map((template) => (
                      <button
                        key={template.name}
                        type="button"
                        onClick={() => handleTemplateSelect(template)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                      >
                        <div className="font-medium">{template.label}</div>
                        {template.department && (
                          <div className="text-xs text-slate-500">Dept: {template.department}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Practitioner */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Practitioner
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
                        <div className="font-medium">{pract.label}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Department */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Medical Department
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={departmentQuery}
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
                      <button
                        key={dept.name}
                        type="button"
                        onClick={() => handleDepartmentSelect(dept)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                      >
                        <div className="font-medium">{dept.label}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Order Date */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Order Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.order_date}
                onChange={(e) => handleChange('order_date', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            {/* Order Time */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Order Time
              </label>
              <input
                type="time"
                value={formData.order_time}
                onChange={(e) => handleChange('order_time', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Status
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={statusQuery}
                  onChange={(e) => {
                    setStatusQuery(e.target.value)
                    setStatusOpen(true)
                  }}
                  onFocus={() => setStatusOpen(true)}
                  placeholder="Search status..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {statusOpen && statusOptions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {statusOptions.map((status) => (
                      <button
                        key={status.name}
                        type="button"
                        onClick={() => handleStatusSelect(status)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                      >
                        <div className="font-medium">{status.label}</div>
                        {status.code_value && (
                          <div className="text-xs text-slate-500">{status.code_value}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Quantity
              </label>
              <input
                type="number"
                min="1"
                value={formData.quantity}
                onChange={(e) => handleChange('quantity', parseInt(e.target.value) || 1)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
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
              {loading ? 'Creating...' : 'Create Service Request'}
            </button>
          </div>
        </form>
      </div>
      {showCreatePractitioner && (
        <CreatePractitionerModal
          onClose={() => setShowCreatePractitioner(false)}
          onSuccess={(practitionerName) => {
            setFormData({ ...formData, practitioner: practitionerName })
            const newPract = practitionerOptions.find(p => p.name === practitionerName)
            if (newPract) {
              setPractitionerQuery(newPract.label)
            } else {
              fetchHealthcarePractitioners('', formData.department).then(setPractitionerOptions).catch(console.error)
              setPractitionerQuery(practitionerName)
            }
            setPractitionerOpen(false)
            setShowCreatePractitioner(false)
          }}
        />
      )}
    </div>
  )
}

