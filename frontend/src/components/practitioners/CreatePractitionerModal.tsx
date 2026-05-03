import { useState, useEffect } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { createPractitioner, fetchMedicalDepartments, fetchMedicalRoles, type LinkFieldOption } from '../../services/common'

interface CreatePractitionerModalProps {
  onClose: () => void
  onSuccess?: (practitionerName: string) => void
}

export const CreatePractitionerModal = ({ onClose, onSuccess }: CreatePractitionerModalProps) => {
  const [formData, setFormData] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    gender: '',
    status: 'Active',
    mobile_phone: '',
    office_phone: '',
    department: '',
    medical_role: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Department dropdown state
  const [departmentOptions, setDepartmentOptions] = useState<LinkFieldOption[]>([])
  const [departmentOpen, setDepartmentOpen] = useState(false)
  const [departmentQuery, setDepartmentQuery] = useState('')
  const [selectedDepartment, setSelectedDepartment] = useState<LinkFieldOption | null>(null)

  // Medical Role dropdown state
  const [medicalRoleOptions, setMedicalRoleOptions] = useState<LinkFieldOption[]>([])
  const [medicalRoleOpen, setMedicalRoleOpen] = useState(false)
  const [medicalRoleQuery, setMedicalRoleQuery] = useState('')
  const [selectedMedicalRole, setSelectedMedicalRole] = useState<LinkFieldOption | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.first_name) {
      setError('First Name is required')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const practitioner = await createPractitioner(formData)
      
      if (onSuccess) {
        onSuccess(practitioner.name)
      }
      
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create practitioner')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // Load initial options
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [depts, roles] = await Promise.all([
          fetchMedicalDepartments(),
          fetchMedicalRoles()
        ])
        setDepartmentOptions(depts)
        setMedicalRoleOptions(roles)
      } catch (err) {
        console.error('Failed to load options:', err)
      }
    }
    loadOptions()
  }, [])

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

  const handleDepartmentSelect = (dept: LinkFieldOption) => {
    setSelectedDepartment(dept)
    setFormData(prev => ({ ...prev, department: dept.name }))
    setDepartmentOpen(false)
    setDepartmentQuery('')
  }

  const handleMedicalRoleSelect = (role: LinkFieldOption) => {
    setSelectedMedicalRole(role)
    setFormData(prev => ({ ...prev, medical_role: role.name }))
    setMedicalRoleOpen(false)
    setMedicalRoleQuery('')
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-2xl w-full max-h-[90vh] overflow-y-auto')}>
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight text-emerald-950">Create New Healthcare Practitioner</h2>
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
          // Close dropdowns when clicking outside inputs
          const target = e.target as HTMLElement
          if (target.tagName !== 'INPUT' && !target.closest('.absolute')) {
            setDepartmentOpen(false)
            setMedicalRoleOpen(false)
          }
        }}>
          {/* Basic Information */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => handleChange('first_name', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Middle Name
                </label>
                <input
                  type="text"
                  value={formData.middle_name}
                  onChange={(e) => handleChange('middle_name', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Last Name
                </label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => handleChange('last_name', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Gender
                </label>
                <select
                  value={formData.gender}
                  onChange={(e) => handleChange('gender', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
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
                  <option value="Active">Active</option>
                  <option value="Disabled">Disabled</option>
                </select>
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Contact Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Mobile Phone
                </label>
                <input
                  type="tel"
                  value={formData.mobile_phone}
                  onChange={(e) => handleChange('mobile_phone', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Office Phone
                </label>
                <input
                  type="tel"
                  value={formData.office_phone}
                  onChange={(e) => handleChange('office_phone', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          {/* Professional Information */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Professional Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Medical Department
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

              <div className="relative">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Medical Role
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={selectedMedicalRole ? selectedMedicalRole.label : medicalRoleQuery}
                    onChange={(e) => {
                      setMedicalRoleQuery(e.target.value)
                      setMedicalRoleOpen(true)
                    }}
                    onFocus={() => setMedicalRoleOpen(true)}
                    placeholder="Search medical role..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  {medicalRoleOpen && medicalRoleOptions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
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
            </div>
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
              disabled={loading}
              className={CM_BTN_PRIMARY}
            >
              {loading ? 'Creating...' : 'Create Practitioner'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
