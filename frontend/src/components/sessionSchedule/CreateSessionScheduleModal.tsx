import { useState, useEffect, useRef } from 'react'
import {
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import {
  createSessionSchedule,
  getSessionTypes,
  type CreateSessionScheduleData
} from '../../services/sessionSchedule'
import { fetchHealthcarePractitioners, getCurrentUserPractitioner, type LinkFieldOption } from '../../services/common'
import { fetchInpatientRecords, type InpatientRecord } from '../../services/inpatientRecords'
import { toast } from '../../hooks/useToast'
import { X, ChevronDown } from 'lucide-react'
import {
  linkComboboxDropdownClass,
  linkComboboxInputWithClearClass,
  linkComboboxOptionClassCompact,
} from '../ui/linkComboboxStyles'

interface CreateSessionScheduleModalProps {
  onClose: () => void
  onSuccess?: () => void
  initialAdmission?: string
}

// Combobox component for doctor selection (same as prescription modal)
interface ComboboxProps {
  value: string
  displayValue: string
  placeholder: string
  options: LinkFieldOption[]
  loading?: boolean
  onQueryChange: (q: string) => void
  onSelect: (opt: LinkFieldOption) => void
  onOpen: () => void
  onClear?: () => void
  required?: boolean
  renderOption?: (opt: LinkFieldOption) => React.ReactNode
}

const Combobox = ({
  displayValue,
  placeholder,
  options,
  loading,
  onQueryChange,
  onSelect,
  onOpen,
  required,
  renderOption,
  onClear,
}: ComboboxProps) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <input
          type="text"
          value={displayValue}
          onChange={(e) => {
            onQueryChange(e.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            setOpen(true)
            onOpen()
          }}
          placeholder={placeholder}
          required={required}
          className={linkComboboxInputWithClearClass}
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {displayValue && onClear && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onClear()
                setOpen(false)
              }}
              className="text-slate-400 hover:text-slate-600 transition-colors p-0.5"
              title="Clear"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <ChevronDown className="w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>
      
      {open && (
        <div className={linkComboboxDropdownClass}>
          {loading ? (
            <div className="px-3 py-2 text-xs text-slate-500">Loading...</div>
          ) : options.length ? (
            options.map((opt) => (
              <button
                key={opt.name}
                type="button"
                className={linkComboboxOptionClassCompact}
                onClick={() => {
                  onSelect(opt)
                  setOpen(false)
                }}
              >
                {renderOption ? renderOption(opt) : (opt.label || opt.name)}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-slate-500">
              No results found
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export const CreateSessionScheduleModal = ({
  onClose,
  onSuccess,
  initialAdmission
}: CreateSessionScheduleModalProps) => {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    admission_number: initialAdmission || '',
    session_type: '',
    session_name: '',
    company: '',
    doctor: '',
    doctor_name: '',
    cost_center: '',
    from_time: '',
    to_time: '',
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Session Types
  const [sessionTypes, setSessionTypes] = useState<Array<{ name: string }>>([])
  const [sessionTypesLoading, setSessionTypesLoading] = useState(false)

  // Companies
  const [companyOptions, setCompanyOptions] = useState<LinkFieldOption[]>([])
  const [companyLoading, setCompanyLoading] = useState(false)

  // Cost Centers
  const [costCenterOptions, setCostCenterOptions] = useState<LinkFieldOption[]>([])
  const [costCenterLoading, setCostCenterLoading] = useState(false)

  // Admissions
  const [admissionOptions, setAdmissionOptions] = useState<InpatientRecord[]>([])
  const [admissionOpen, setAdmissionOpen] = useState(false)
  const [admissionQuery, setAdmissionQuery] = useState('')

  // Doctors - updated to use Combobox
  const [doctorOptions, setDoctorOptions] = useState<LinkFieldOption[]>([])
  const [doctorLoading, setDoctorLoading] = useState(false)
  const [doctorQuery, setDoctorQuery] = useState('')

  // Load session types
  useEffect(() => {
    const loadSessionTypes = async () => {
      try {
        setSessionTypesLoading(true)
        const types = await getSessionTypes()
        setSessionTypes(types)
      } catch (err) {
        console.error('Failed to load session types:', err)
        toast.error('Failed to load session types')
      } finally {
        setSessionTypesLoading(false)
      }
    }
    loadSessionTypes()
  }, [])

  // Load companies
  useEffect(() => {
    const loadCompanies = async () => {
      try {
        setCompanyLoading(true)
        const response = await fetch('/api/method/frappe.client.get_list?doctype=Company&fields=["name"]&limit_page_length=999')
        const resData = await response.json()
        if (resData?.message && Array.isArray(resData.message)) {
          setCompanyOptions(resData.message as LinkFieldOption[])
        }
      } catch (err) {
        console.error('Failed to load companies:', err)
      } finally {
        setCompanyLoading(false)
      }
    }
    loadCompanies()
  }, [])

  // Load cost centers
  useEffect(() => {
    const loadCostCenters = async () => {
      try {
        setCostCenterLoading(true)
        const response = await fetch('/api/method/frappe.client.get_list?doctype=Cost%20Center&fields=["name"]&limit_page_length=999')
        const resData = await response.json()
        if (resData?.message && Array.isArray(resData.message)) {
          setCostCenterOptions(resData.message as LinkFieldOption[])
        }
      } catch (err) {
        console.error('Failed to load cost centers:', err)
      } finally {
        setCostCenterLoading(false)
      }
    }
    loadCostCenters()
  }, [])

  // Load admissions
  useEffect(() => {
    if (!admissionOpen) return

    const timeoutId = setTimeout(async () => {
      try {
        const records = await fetchInpatientRecords(
          undefined,
          admissionQuery || undefined,
          undefined,
          undefined,
          undefined,
          undefined
        )
        setAdmissionOptions(records.slice(0, 30))
      } catch (err) {
        console.error('Failed to load admissions:', err)
        setAdmissionOptions([])
      }
    }, admissionQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [admissionQuery, admissionOpen])

  // Load doctors - search as user types
  const loadDoctors = (query: string) => {
    setDoctorLoading(true)
    fetchHealthcarePractitioners(query || undefined)
      .then(practitioners => setDoctorOptions(practitioners))
      .catch(() => setDoctorOptions([]))
      .finally(() => setDoctorLoading(false))
  }

  // Auto-populate doctor field if current user is a healthcare practitioner
  useEffect(() => {
    const autoPopulateDoctor = async () => {
      try {
        const practitioner = await getCurrentUserPractitioner()
        if (practitioner) {
          handleChange('doctor', practitioner)
          handleChange('doctor_name', practitioner)
          setDoctorQuery(practitioner)
        }
      } catch (err) {
        console.error('Failed to auto-populate doctor:', err)
        // If this fails, leave field blank - user can select manually
      }
    }
    
    autoPopulateDoctor()
  }, [])

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.date) {
      setError('Date is required')
      return
    }

    if (!formData.session_type) {
      setError('Session Type is required')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const data: CreateSessionScheduleData = {
        date: formData.date,
        session_type: formData.session_type,
        session_name: formData.session_name || undefined,
        company: formData.company || undefined,
        doctor: formData.doctor || undefined,
        cost_center: formData.cost_center || undefined,
        from_time: formData.from_time || undefined,
        to_time: formData.to_time || undefined,
        admission_number: formData.admission_number || undefined,
      }

      await createSessionSchedule(data)
      toast.success('Session Schedule created successfully')
      onSuccess?.()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create session schedule'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  // Get display value for doctor
  const doctorDisplayValue = formData.doctor_name || doctorQuery

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('w-full max-w-2xl max-h-[90vh] overflow-y-auto')}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-emerald-950">Create Session Schedule</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-md text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              required
              value={formData.date}
              onChange={(e) => handleChange('date', e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Admission Number */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Admission Number
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search admission..."
                value={formData.admission_number}
                onChange={(e) => {
                  handleChange('admission_number', e.target.value)
                  setAdmissionQuery(e.target.value)
                  setAdmissionOpen(true)
                }}
                onFocus={() => setAdmissionOpen(true)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {admissionOpen && admissionOptions.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-white border border-slate-300 rounded-md shadow-lg mt-1 z-20 max-h-52 overflow-auto">
                  {admissionOptions.map((admission) => (
                    <button
                      key={admission.name}
                      type="button"
                      onClick={() => {
                        handleChange('admission_number', admission.name)
                        setAdmissionOpen(false)
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-100 text-sm border-b last:border-b-0"
                    >
                      <div className="font-medium">{admission.name}</div>
                      <div className="text-xs text-slate-500">{admission.patient_name}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Session Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Session Type <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={formData.session_type}
              onChange={(e) => handleChange('session_type', e.target.value)}
              disabled={sessionTypesLoading}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            >
              <option value="">Select session type...</option>
              {sessionTypes.map((type) => (
                <option key={type.name} value={type.name}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>

          {/* Session Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Session Name
            </label>
            <input
              type="text"
              placeholder="Enter session name"
              value={formData.session_name}
              onChange={(e) => handleChange('session_name', e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Cost Center */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Cost Center
            </label>
            <select
              value={formData.cost_center}
              onChange={(e) => handleChange('cost_center', e.target.value)}
              disabled={costCenterLoading}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            >
              <option value="">Select cost center...</option>
              {costCenterOptions.map((cc) => (
                <option key={cc.name} value={cc.name}>
                  {cc.name}
                </option>
              ))}
            </select>
          </div>

          {/* From Time and To Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                From Time
              </label>
              <input
                type="time"
                value={formData.from_time}
                onChange={(e) => handleChange('from_time', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                To Time
              </label>
              <input
                type="time"
                value={formData.to_time}
                onChange={(e) => handleChange('to_time', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Doctor - Using Combobox from prescription modal */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Doctor
            </label>
            <Combobox
              value={formData.doctor}
              displayValue={doctorDisplayValue}
              placeholder="Search doctor..."
              options={doctorOptions}
              loading={doctorLoading}
              onQueryChange={(q) => {
                setDoctorQuery(q)
                if (formData.doctor) {
                  handleChange('doctor', '')
                  handleChange('doctor_name', '')
                }
                loadDoctors(q)
              }}
              onOpen={() => {
                if (doctorOptions.length === 0) {
                  loadDoctors(doctorQuery)
                }
              }}
              onSelect={(opt) => {
                handleChange('doctor', opt.name)
                handleChange('doctor_name', opt.label || opt.name)
                setDoctorQuery(opt.label || opt.name)
              }}
              onClear={() => {
                handleChange('doctor', '')
                handleChange('doctor_name', '')
                setDoctorQuery('')
              }}
              renderOption={(opt) => (
                <div>
                  <div className="font-medium">{opt.label || opt.name}</div>
                  <div className="text-xs text-slate-500">{opt.name}</div>
                </div>
              )}
            />
          </div>

          {/* Company */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Company
            </label>
            <select
              value={formData.company}
              onChange={(e) => handleChange('company', e.target.value)}
              disabled={companyLoading}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            >
              <option value="">Select company...</option>
              {companyOptions.map((company) => (
                <option key={company.name} value={company.name}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              {loading && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              {loading ? 'Creating...' : 'Create Session Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}