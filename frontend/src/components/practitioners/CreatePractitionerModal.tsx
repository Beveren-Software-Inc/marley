import { useState, useEffect, useCallback } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { createPractitioner, fetchMedicalDepartments, fetchMedicalRoles, type LinkFieldOption } from '../../services/common'

interface ScheduleRow {
  schedule: string
  scheduleLabel: string
  service_unit: string
  serviceUnitLabel: string
}

interface CreatePractitionerModalProps {
  onClose: () => void
  onSuccess?: (practitionerName: string) => void
}

type Tab = 'details' | 'schedules'

export const CreatePractitionerModal = ({ onClose, onSuccess }: CreatePractitionerModalProps) => {
  const [activeTab, setActiveTab] = useState<Tab>('details')
  const [formData, setFormData] = useState({
    full_name: '',
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

  // Schedule rows
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([])

  // Schedule dropdown options (per-row state managed via indexes)
  const [scheduleOptions, setScheduleOptions] = useState<LinkFieldOption[]>([])
  const [serviceUnitOptions, setServiceUnitOptions] = useState<LinkFieldOption[]>([])
  const [openScheduleDropdown, setOpenScheduleDropdown] = useState<number | null>(null)
  const [openServiceUnitDropdown, setOpenServiceUnitDropdown] = useState<number | null>(null)
  const [scheduleQuery, setScheduleQuery] = useState('')
  const [serviceUnitQuery, setServiceUnitQuery] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.full_name.trim()) {
      setError('Full Name is required')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const practitioner_schedules = scheduleRows
        .filter(r => r.schedule)
        .map(r => ({
          schedule: r.schedule,
          service_unit: r.service_unit || undefined,
        }))

      const practitioner = await createPractitioner({
        ...formData,
        practitioner_schedules: practitioner_schedules.length > 0 ? practitioner_schedules : undefined,
      })
      
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

  // Fetch Practitioner Schedule options
  const fetchScheduleOptions = useCallback(async (search: string) => {
    try {
      const params = new URLSearchParams({
        fields: JSON.stringify(['name', 'schedule_name']),
        limit_page_length: '100',
      })
      if (search.trim()) {
        params.append('filters', JSON.stringify([['schedule_name', 'like', `%${search}%`]]))
      }
      const res = await fetch(`/api/resource/Practitioner%20Schedule?${params.toString()}`)
      const data = await res.json()
      const rows = Array.isArray(data?.data) ? data.data : []
      setScheduleOptions(
        rows.map((r: { name: string; schedule_name?: string }) => ({
          name: r.name,
          label: r.schedule_name || r.name,
        }))
      )
    } catch {
      setScheduleOptions([])
    }
  }, [])

  // Fetch Healthcare Service Unit options
  const fetchServiceUnitOptions = useCallback(async (search: string) => {
    try {
      const params = new URLSearchParams({
        fields: JSON.stringify(['name']),
        limit_page_length: '100',
      })
      if (search.trim()) {
        params.append('filters', JSON.stringify([['name', 'like', `%${search}%`]]))
      }
      const res = await fetch(`/api/resource/Healthcare%20Service%20Unit?${params.toString()}`)
      const data = await res.json()
      const rows = Array.isArray(data?.data) ? data.data : []
      setServiceUnitOptions(
        rows.map((r: { name: string }) => ({
          name: r.name,
          label: r.name,
        }))
      )
    } catch {
      setServiceUnitOptions([])
    }
  }, [])

  // Search schedule options when dropdown opens or query changes
  useEffect(() => {
    if (openScheduleDropdown === null) return
    const timeoutId = setTimeout(() => {
      fetchScheduleOptions(scheduleQuery)
    }, scheduleQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(timeoutId)
  }, [scheduleQuery, openScheduleDropdown, fetchScheduleOptions])

  // Search service unit options when dropdown opens or query changes
  useEffect(() => {
    if (openServiceUnitDropdown === null) return
    const timeoutId = setTimeout(() => {
      fetchServiceUnitOptions(serviceUnitQuery)
    }, serviceUnitQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(timeoutId)
  }, [serviceUnitQuery, openServiceUnitDropdown, fetchServiceUnitOptions])

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

  const closeAllDropdowns = () => {
    setDepartmentOpen(false)
    setMedicalRoleOpen(false)
    setOpenScheduleDropdown(null)
    setOpenServiceUnitDropdown(null)
  }

  const addScheduleRow = () => {
    setScheduleRows(prev => [...prev, { schedule: '', scheduleLabel: '', service_unit: '', serviceUnitLabel: '' }])
  }

  const removeScheduleRow = (index: number) => {
    setScheduleRows(prev => prev.filter((_, i) => i !== index))
    if (openScheduleDropdown === index) setOpenScheduleDropdown(null)
    if (openServiceUnitDropdown === index) setOpenServiceUnitDropdown(null)
  }

  const handleScheduleSelect = (index: number, option: LinkFieldOption) => {
    setScheduleRows(prev =>
      prev.map((row, i) =>
        i === index ? { ...row, schedule: option.name, scheduleLabel: option.label } : row
      )
    )
    setOpenScheduleDropdown(null)
    setScheduleQuery('')
  }

  const handleServiceUnitSelect = (index: number, option: LinkFieldOption) => {
    setScheduleRows(prev =>
      prev.map((row, i) =>
        i === index ? { ...row, service_unit: option.name, serviceUnitLabel: option.label } : row
      )
    )
    setOpenServiceUnitDropdown(null)
    setServiceUnitQuery('')
  }

  const tabClass = (tab: Tab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition ${
      activeTab === tab
        ? 'border-emerald-600 text-emerald-700'
        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
    }`

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

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6">
          <button type="button" className={tabClass('details')} onClick={() => setActiveTab('details')}>
            Details
          </button>
          <button type="button" className={tabClass('schedules')} onClick={() => setActiveTab('schedules')}>
            Practitioner Schedules
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4" onClick={(e) => {
          const target = e.target as HTMLElement
          if (target.tagName !== 'INPUT' && !target.closest('.absolute')) {
            closeAllDropdowns()
          }
        }}>

          {/* ─── Details Tab ─── */}
          {activeTab === 'details' && (
            <>
              {/* Basic Information */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.full_name}
                      onChange={(e) => handleChange('full_name', e.target.value)}
                      placeholder="Enter practitioner full name"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      required
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
            </>
          )}

          {/* ─── Practitioner Schedules Tab ─── */}
          {activeTab === 'schedules' && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Practitioner Schedules</h3>

              {scheduleRows.length === 0 ? (
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center">
                  <p className="text-sm text-slate-500 mb-3">No schedules added yet</p>
                  <button
                    type="button"
                    onClick={addScheduleRow}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Schedule
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {scheduleRows.map((row, index) => (
                    <div key={index} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1">
                        {/* Schedule dropdown */}
                        <div className="relative">
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Schedule <span className="text-red-500">*</span>
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              value={row.schedule ? row.scheduleLabel : (openScheduleDropdown === index ? scheduleQuery : '')}
                              onChange={(e) => {
                                setScheduleQuery(e.target.value)
                                setOpenScheduleDropdown(index)
                                if (row.schedule) {
                                  setScheduleRows(prev =>
                                    prev.map((r, i) =>
                                      i === index ? { ...r, schedule: '', scheduleLabel: '' } : r
                                    )
                                  )
                                }
                              }}
                              onFocus={() => {
                                setOpenScheduleDropdown(index)
                                setOpenServiceUnitDropdown(null)
                                setScheduleQuery('')
                              }}
                              placeholder="Search schedule..."
                              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            {openScheduleDropdown === index && scheduleOptions.length > 0 && (
                              <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                                {scheduleOptions.map((opt) => (
                                  <button
                                    key={opt.name}
                                    type="button"
                                    onClick={() => handleScheduleSelect(index, opt)}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Service Unit dropdown */}
                        <div className="relative">
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Service Unit
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              value={row.service_unit ? row.serviceUnitLabel : (openServiceUnitDropdown === index ? serviceUnitQuery : '')}
                              onChange={(e) => {
                                setServiceUnitQuery(e.target.value)
                                setOpenServiceUnitDropdown(index)
                                if (row.service_unit) {
                                  setScheduleRows(prev =>
                                    prev.map((r, i) =>
                                      i === index ? { ...r, service_unit: '', serviceUnitLabel: '' } : r
                                    )
                                  )
                                }
                              }}
                              onFocus={() => {
                                setOpenServiceUnitDropdown(index)
                                setOpenScheduleDropdown(null)
                                setServiceUnitQuery('')
                              }}
                              placeholder="Search service unit..."
                              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            {openServiceUnitDropdown === index && serviceUnitOptions.length > 0 && (
                              <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                                {serviceUnitOptions.map((opt) => (
                                  <button
                                    key={opt.name}
                                    type="button"
                                    onClick={() => handleServiceUnitSelect(index, opt)}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Remove button */}
                      <button
                        type="button"
                        onClick={() => removeScheduleRow(index)}
                        className="mt-6 shrink-0 rounded-md p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                        title="Remove schedule"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addScheduleRow}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Schedule
                  </button>
                </div>
              )}
            </div>
          )}

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
