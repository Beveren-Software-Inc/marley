import { useState, useEffect, useRef } from 'react'
import {
  CREATE_MODAL_OVERLAY,
  CreateModalHeader,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import {
  createSessionSchedule,
  fetchSessionScheduleAmount,
  getHealthcareServiceTemplates,
  type CreateSessionScheduleData,
  type HealthcareServiceTemplateOption,
} from '../../services/sessionSchedule'
import { fetchHealthcarePractitioners, getCurrentUserPractitioner, fetchPatientVisits, type LinkFieldOption } from '../../services/common'
import { getPortalBranch } from '../../services/costCenterPermission'
import { fetchInpatientRecords, type InpatientRecord } from '../../services/inpatientRecords'
import { toast } from '../../hooks/useToast'
import { X, ChevronDown } from 'lucide-react'
import { useCareContext } from '../../providers/CareContextProvider'
import {
  linkComboboxDropdownClass,
  linkComboboxInputWithClearClass,
  linkComboboxOptionClassCompact,
} from '../ui/linkComboboxStyles'

interface CreateSessionScheduleModalProps {
  onClose: () => void
  onSuccess?: () => void
  initialAdmission?: string
  initialPatientVisit?: string
}

// Combobox for practitioner selection
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
              NO RESULTS FOUND
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
  initialAdmission,
  initialPatientVisit,
}: CreateSessionScheduleModalProps) => {
  const { mode, activeVisit, activeAdmission, selectedPatient } = useCareContext()
  const isIPMode = mode === 'IP'
  const isOPMode = mode === 'OP'

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    admission_number: isIPMode ? (initialAdmission || activeAdmission || '') : '',
    patient_visit: isOPMode ? (initialPatientVisit || activeVisit || '') : '',
    session_type: '',
    session_name: '',
    practitioner: '',
    practitioner_name: '',
    cost_center: '',
    from_time: '',
    to_time: '',
    amount: '',
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Healthcare Service Templates (session_type links to this doctype)
  const [serviceTemplates, setServiceTemplates] = useState<HealthcareServiceTemplateOption[]>([])
  const [serviceTemplatesLoading, setServiceTemplatesLoading] = useState(false)
  const [serviceTemplateQuery, setServiceTemplateQuery] = useState('')

  const [costCenterOptions, setCostCenterOptions] = useState<LinkFieldOption[]>([])
  const [costCenterLoading, setCostCenterLoading] = useState(false)

  // Global portal branch auto-applies as the default (UI filter only).
  useEffect(() => {
    const cc = getPortalBranch()
    if (!cc) return
    setFormData((prev) => (prev.cost_center ? prev : { ...prev, cost_center: cc }))
  }, [])

  // Admissions (IP)
  const [admissionOptions, setAdmissionOptions] = useState<InpatientRecord[]>([])
  const [admissionOpen, setAdmissionOpen] = useState(false)
  const [admissionQuery, setAdmissionQuery] = useState('')

  // Patient visits (OP)
  const [visitOptions, setVisitOptions] = useState<LinkFieldOption[]>([])
  const [visitOpen, setVisitOpen] = useState(false)
  const [visitQuery, setVisitQuery] = useState('')

  // Practitioner (who entered the session)
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerLoading, setPractitionerLoading] = useState(false)
  const [practitionerQuery, setPractitionerQuery] = useState('')

  const loadServiceTemplates = (query: string) => {
    setServiceTemplatesLoading(true)
    const careType: 'OP' | 'IP' = isIPMode ? 'IP' : 'OP'
    getHealthcareServiceTemplates(query || undefined, 100, careType)
      .then((templates) => setServiceTemplates(templates))
      .catch((err) => {
        console.error('Failed to load healthcare service templates:', err)
        setServiceTemplates([])
        toast.error('Failed to load healthcare service templates')
      })
      .finally(() => setServiceTemplatesLoading(false))
  }

  const [insurancePricingHint, setInsurancePricingHint] = useState<{
    discount_pct: number
    discount_amount: number
    net_rate: number
    insurance?: string | null
  } | null>(null)

  const applyInsuredAmount = async (sessionType: string, fallbackRate?: number | null) => {
    if (!sessionType) return
    try {
      const preview = await fetchSessionScheduleAmount({
        sessionType,
        patient: selectedPatient || undefined,
        patientVisit: formData.patient_visit || undefined,
        admissionNumber: formData.admission_number || undefined,
        patientCareType: isIPMode ? 'IP' : 'OP',
      })
      if (preview.amount > 0) {
        handleChange('amount', String(preview.amount))
        const pct = Number(preview.discount_pct || 0)
        const net = Number(preview.net_rate || 0)
        if (pct > 0 || (net > 0 && net < preview.amount)) {
          setInsurancePricingHint({
            discount_pct: pct,
            discount_amount: Number(preview.discount_amount || 0),
            net_rate: net || preview.amount * (1 - pct / 100),
            insurance: preview.insurance,
          })
        } else {
          setInsurancePricingHint(null)
        }
        return
      }
    } catch (err) {
      console.error('Failed to load insured session amount:', err)
    }
    setInsurancePricingHint(null)
    if (fallbackRate != null && Number(fallbackRate) > 0) {
      handleChange('amount', String(fallbackRate))
    }
  }

  useEffect(() => {
    loadServiceTemplates('')
  }, [isIPMode, isOPMode])

  // Refresh amount when visit/admission/patient context changes after a template is chosen
  useEffect(() => {
    if (!formData.session_type) return
    void applyInsuredAmount(formData.session_type)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    formData.session_type,
    formData.patient_visit,
    formData.admission_number,
    selectedPatient,
    isIPMode,
    isOPMode,
  ])

  useEffect(() => {
    if (isIPMode && activeAdmission && !formData.admission_number) {
      setFormData((prev) => ({ ...prev, admission_number: activeAdmission }))
    }
    if (isOPMode && activeVisit && !formData.patient_visit) {
      setFormData((prev) => ({ ...prev, patient_visit: activeVisit }))
    }
  }, [activeAdmission, activeVisit, isIPMode, isOPMode, formData.admission_number, formData.patient_visit])

  // Load branches
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
        console.error('Failed to load branches:', err)
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
        const response = await fetchInpatientRecords(
          undefined,
          admissionQuery || undefined,
          undefined,
          undefined,
          undefined,
          undefined
        )
        setAdmissionOptions(response.data.slice(0, 30))
      } catch (err) {
        console.error('Failed to load admissions:', err)
        setAdmissionOptions([])
      }
    }, admissionQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [admissionQuery, admissionOpen])

  // Load patient visits (OP)
  useEffect(() => {
    if (!visitOpen || !isOPMode) return

    const timeoutId = setTimeout(async () => {
      try {
        const visits = await fetchPatientVisits(selectedPatient || undefined, visitQuery || undefined)
        setVisitOptions(visits.slice(0, 30))
      } catch (err) {
        console.error('Failed to load patient visits:', err)
        setVisitOptions([])
      }
    }, visitQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [visitQuery, visitOpen, isOPMode, selectedPatient])

  const loadPractitioners = (query: string) => {
    setPractitionerLoading(true)
    fetchHealthcarePractitioners(query || undefined)
      .then((practitioners) => setPractitionerOptions(practitioners))
      .catch(() => setPractitionerOptions([]))
      .finally(() => setPractitionerLoading(false))
  }

  // Auto-populate practitioner if current user is linked to Healthcare Practitioner
  useEffect(() => {
    const autoPopulatePractitioner = async () => {
      try {
        const linkedPractitioner = await getCurrentUserPractitioner()
        if (!linkedPractitioner) return
        const practitioners = await fetchHealthcarePractitioners(undefined)
        const match = practitioners.find((p) => p.name === linkedPractitioner)
        handleChange('practitioner', linkedPractitioner)
        handleChange('practitioner_name', match?.label || linkedPractitioner)
        setPractitionerQuery(match?.label || linkedPractitioner)
      } catch (err) {
        console.error('Failed to auto-populate practitioner:', err)
      }
    }

    autoPopulatePractitioner()
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
      setError('Healthcare Service Template is required')
      return
    }

    if (isIPMode && !formData.admission_number) {
      setError('Admission number is required in IP mode.')
      return
    }

    if (isOPMode && !formData.patient_visit) {
      setError('Patient visit is required in OP mode.')
      return
    }

    if (!selectedPatient && !formData.admission_number && !formData.patient_visit) {
      setError('Select a patient (or link a Patient Visit / Admission) before creating a session schedule.')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const data: CreateSessionScheduleData = {
        date: formData.date,
        patient: selectedPatient || undefined,
        session_type: formData.session_type,
        session_name: formData.session_name || undefined,
        practitioner: formData.practitioner || undefined,
        practitioner_name: formData.practitioner_name || undefined,
        cost_center: formData.cost_center || undefined,
        from_time: formData.from_time || undefined,
        to_time: formData.to_time || undefined,
        admission_number: isIPMode ? (formData.admission_number || undefined) : undefined,
        patient_visit: isOPMode ? (formData.patient_visit || undefined) : undefined,
        amount: formData.amount !== '' ? Number(formData.amount) : undefined,
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

  const practitionerDisplayValue = formData.practitioner_name || practitionerQuery
  const serviceTemplateDisplayValue =
    formData.session_name || serviceTemplateQuery || formData.session_type

  const serviceTemplateOptions: LinkFieldOption[] = serviceTemplates.map((tpl) => ({
    name: tpl.name,
    label: tpl.service_name || tpl.name,
  }))

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('w-full max-w-2xl max-h-[90vh] overflow-y-auto')}>
        {/* Header */}
        <CreateModalHeader title="Create Session Schedule" onClose={onClose} />


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

          {/* Care context: IP admission or OP patient visit */}
          {isIPMode ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Admission Number <span className="text-red-500">*</span>
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
          ) : isOPMode ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Patient Visit <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder={selectedPatient ? 'Search patient visit...' : 'Select a patient first, or use the active visit'}
                  value={formData.patient_visit}
                  onChange={(e) => {
                    handleChange('patient_visit', e.target.value)
                    setVisitQuery(e.target.value)
                    setVisitOpen(true)
                  }}
                  onFocus={() => setVisitOpen(true)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {visitOpen && visitOptions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-slate-300 rounded-md shadow-lg mt-1 z-20 max-h-52 overflow-auto">
                    {visitOptions.map((visit) => (
                      <button
                        key={visit.name}
                        type="button"
                        onClick={() => {
                          handleChange('patient_visit', visit.name)
                          setVisitOpen(false)
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-100 text-sm border-b last:border-b-0"
                      >
                        <div className="font-medium">{visit.name}</div>
                        {visit.label ? (
                          <div className="text-xs text-slate-500">{visit.label}</div>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {!formData.patient_visit && activeVisit ? (
                <p className="mt-1 text-xs text-slate-500">
                  Active visit from header: {activeVisit}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Select IP or OP mode in the header to link this session to an admission or patient visit.
            </div>
          )}

          {/* Healthcare Service Template */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Healthcare Service Template <span className="text-red-500">*</span>
            </label>
            <Combobox
              value={formData.session_type}
              displayValue={serviceTemplateDisplayValue}
              placeholder="Search healthcare service template..."
              options={serviceTemplateOptions}
              loading={serviceTemplatesLoading}
              required
              onQueryChange={(q) => {
                setServiceTemplateQuery(q)
                if (formData.session_type) {
                  handleChange('session_type', '')
                  handleChange('session_name', '')
                  handleChange('amount', '')
                  setInsurancePricingHint(null)
                }
                loadServiceTemplates(q)
              }}
              onOpen={() => {
                if (serviceTemplates.length === 0) {
                  loadServiceTemplates(serviceTemplateQuery)
                }
              }}
              onSelect={(opt) => {
                const template = serviceTemplates.find((tpl) => tpl.name === opt.name)
                handleChange('session_type', opt.name)
                handleChange('session_name', template?.service_name || opt.label || opt.name)
                setServiceTemplateQuery(template?.service_name || opt.label || opt.name)
                // Prefer TRICARE/inclusive price + discount over raw template rate
                void applyInsuredAmount(opt.name, template?.rate)
              }}
              onClear={() => {
                handleChange('session_type', '')
                handleChange('session_name', '')
                handleChange('amount', '')
                setInsurancePricingHint(null)
                setServiceTemplateQuery('')
              }}
              renderOption={(opt) => {
                const template = serviceTemplates.find((tpl) => tpl.name === opt.name)
                return (
                  <div>
                    <div className="font-medium">{opt.label || opt.name}</div>
                    <div className="text-xs text-slate-500">
                      {opt.name}
                      {template?.category ? ` · ${template.category}` : ''}
                    </div>
                  </div>
                )
              }}
            />
          </div>

          {/* Session Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Session Name
            </label>
            <input
              type="text"
              placeholder="Filled from template; edit if needed"
              value={formData.session_name}
              onChange={(e) => handleChange('session_name', e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Amount
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Filled from template; edit if needed"
              value={formData.amount}
              onChange={(e) => handleChange('amount', e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="mt-1 text-xs text-slate-500">
              List / Inclusive price. Insurance discount is applied on the Sales Order → Invoice.
            </p>
            {insurancePricingHint ? (
              <p className="mt-1 text-xs text-emerald-700">
                {insurancePricingHint.insurance ? `${insurancePricingHint.insurance}: ` : ''}
                {insurancePricingHint.discount_pct > 0
                  ? `${insurancePricingHint.discount_pct}% discount`
                  : 'Discount'}
                {' → patient net '}
                {Number(insurancePricingHint.net_rate).toFixed(2)}
              </p>
            ) : null}
          </div>

          {/* Branch */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Branch
            </label>
            <select
              value={formData.cost_center}
              onChange={(e) => handleChange('cost_center', e.target.value)}
              disabled={costCenterLoading}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            >
              <option value="">Select branch...</option>
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

          {/* Practitioner (who entered the session) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Practitioner
            </label>
            <Combobox
              value={formData.practitioner}
              displayValue={practitionerDisplayValue}
              placeholder="Search practitioner..."
              options={practitionerOptions}
              loading={practitionerLoading}
              onQueryChange={(q) => {
                setPractitionerQuery(q)
                if (formData.practitioner) {
                  handleChange('practitioner', '')
                  handleChange('practitioner_name', '')
                }
                loadPractitioners(q)
              }}
              onOpen={() => {
                if (practitionerOptions.length === 0) {
                  loadPractitioners(practitionerQuery)
                }
              }}
              onSelect={(opt) => {
                handleChange('practitioner', opt.name)
                handleChange('practitioner_name', opt.label || opt.name)
                setPractitionerQuery(opt.label || opt.name)
              }}
              onClear={() => {
                handleChange('practitioner', '')
                handleChange('practitioner_name', '')
                setPractitionerQuery('')
              }}
              renderOption={(opt) => (
                <div>
                  <div className="font-medium">{opt.label || opt.name}</div>
                  <div className="text-xs text-slate-500">{opt.name}</div>
                </div>
              )}
            />
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