import { useState, useEffect } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_OVERLAY,
  CreateModalFooter,
  CreateModalHeader,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import {
  createAppointment,
  fetchAppointmentCostCenterOptions,
  getAvailabilityData,
  type SlotDetail,
  type AvailabilitySlotInfo,
} from '../../services/appointments'
import {
  fetchHealthcarePractitioners,
  fetchAppointmentTypes,
  getCurrentUserPractitioner,
  pickDefaultAppointmentType,
  type LinkFieldOption,
} from '../../services/common'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { toast } from '../../hooks/useToast'
import { X } from 'lucide-react'
import { CreatePractitionerModal } from '../practitioners/CreatePractitionerModal'
import { useBlockIfActiveCareClosed } from '../../hooks/useBlockIfActiveCareClosed'
import { CreatePatientModal } from '../patients/CreatePatientModal'

function getTimePart(t: string | number | null | undefined): string {
  const s = String(t ?? '').trim()
  const spaceIdx = s.lastIndexOf(' ')
  return spaceIdx >= 0 ? s.slice(spaceIdx + 1) : s
}
function timeToMinutes(t: string | number | null | undefined): number {
  const timeStr = getTimePart(t)
  const parts = timeStr.split(':').filter(Boolean)
  const h = parseInt(parts[0] || '0', 10)
  const m = parseInt(parts[1] || '0', 10)
  return (Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0)
}
function formatSlotTime(t: string | number | null | undefined): string {
  const timeStr = getTimePart(t)
  const parts = timeStr.split(':').filter(Boolean)
  return `${(parts[0] ?? '0').padStart(2, '0')}:${(parts[1] ?? '0').padStart(2, '0')}`
}
function getAvailSlots(slotInfo: SlotDetail): AvailabilitySlotInfo[] {
  const raw = slotInfo.avail_slot
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') return Object.values(raw) as AvailabilitySlotInfo[]
  return []
}

/** Whether a slot is disabled for new booking: past (today) or overlaps with any existing appointment (same as doctype). */
function isSlotDisabledForNew(
  slot: AvailabilitySlotInfo,
  slotInfo: SlotDetail,
  appointmentDate: string
): boolean {
  const slotStart = timeToMinutes(slot.from_time)
  const slotEnd = slot.to_time ? timeToMinutes(slot.to_time) : slotStart + (slot.duration ?? 60)
  const today = new Date().toISOString().split('T')[0]
  if (appointmentDate === today) {
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
    if (slotStart < nowMin) return true
  }
  const appointmentsList = Array.isArray(slotInfo.appointments) ? slotInfo.appointments : []
  const others = appointmentsList.filter(
    (a) => a != null && String(a.name || '').trim() !== ''
  )
  const allowOverlap = slotInfo.allow_overlap === 1
  const capacity = Math.max(1, Number(slotInfo.service_unit_capacity) || 1)
  let overlappingCount = 0
  for (const app of others) {
    const appStart = timeToMinutes(app.appointment_time || '0:0')
    const appDuration = Number(app.duration)
    const appEnd = appStart + (Number.isFinite(appDuration) ? appDuration : 0)
    const overlaps = slotStart < appEnd && slotEnd > appStart
    if (overlaps) {
      if (!allowOverlap) return true
      overlappingCount++
    }
  }
  if (allowOverlap && overlappingCount >= capacity) return true
  if (slot.maximum_appointments != null && slot.maximum_appointments > 0) {
    const sameSlotCount = others.filter(
      (a) => a.appointment_date === appointmentDate && timeToMinutes(a.appointment_time || '0:0') === slotStart
    ).length
    if (sameSlotCount >= slot.maximum_appointments) return true
  }
  return false
}

function flattenSlotsForNew(slotDetails: SlotDetail[], appointmentDate: string): { slot: AvailabilitySlotInfo; slotInfo: SlotDetail; disabled: boolean }[] {
  const out: { slot: AvailabilitySlotInfo; slotInfo: SlotDetail; disabled: boolean }[] = []
  for (const slotInfo of slotDetails) {
    for (const slot of getAvailSlots(slotInfo)) {
      if (slot && (slot.from_time != null || slot.to_time != null)) {
        out.push({
          slot,
          slotInfo,
          disabled: isSlotDisabledForNew(slot, slotInfo, appointmentDate)
        })
      }
    }
  }
  return out.sort((a, b) => timeToMinutes(a.slot.from_time) - timeToMinutes(b.slot.from_time))
}
function toApiTime(t: string | number | null | undefined): string {
  const timeStr = getTimePart(t)
  const parts = timeStr.split(':').filter(Boolean)
  return `${(parts[0] ?? '0').padStart(2, '0')}:${(parts[1] ?? '0').padStart(2, '0')}:${(parts[2] ?? '0').padStart(2, '0')}`
}

interface CreateAppointmentModalProps {
  onClose: () => void
  onSuccess?: () => void
  initialPatient?: string
  initialPractitioner?: string
}

export const CreateAppointmentModal = ({ onClose, onSuccess, initialPatient, initialPractitioner }: CreateAppointmentModalProps) => {
  const blockIfActiveCareClosed = useBlockIfActiveCareClosed()
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

  // Walk-in (no file) mode
  const [isWalkIn, setIsWalkIn] = useState(false)
  const [temporaryPatientName, setTemporaryPatientName] = useState('')
  const [temporaryMobileNo, setTemporaryMobileNo] = useState('')
  const [notes, setNotes] = useState('')
  
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

  // Slots (Check Availability) state
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotDetails, setSlotDetails] = useState<SlotDetail[] | null>(null)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<{ from_time: string; duration?: number } | null>(null)
  const [timeMode, setTimeMode] = useState<'schedule' | 'custom'>('schedule')
  const [customTime, setCustomTime] = useState('')
  const [customDurationMinutes, setCustomDurationMinutes] = useState('30')
  const [appointmentTypeDuration, setAppointmentTypeDuration] = useState<number | null>(null)

  const [costCenter, setCostCenter] = useState('')
  const [costCenterOptions, setCostCenterOptions] = useState<LinkFieldOption[]>([])
  const [costCenterLoading, setCostCenterLoading] = useState(false)
  /** True when user has exactly one permitted cost center (User Permission). */
  const [costCenterLocked, setCostCenterLocked] = useState(false)

  const parseCustomDurationMinutes = (raw: string, fallback = 30): number => {
    const n = parseInt(raw.trim(), 10)
    return Number.isFinite(n) && n >= 1 ? n : fallback
  }

  const flatSlots =
    slotDetails && formData.appointment_date
      ? flattenSlotsForNew(slotDetails, formData.appointment_date)
      : []

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      blockIfActiveCareClosed()
    } catch {
      return
    }

    if (isWalkIn) {
      if (!temporaryPatientName.trim()) {
        setError('Patient name is required for walk-in booking')
        return
      }
    } else {
      if (!formData.patient) {
        setError('Please select a patient or use walk-in booking')
        return
      }
    }

    if (!formData.appointment_type) {
      setError('Appointment Type is required')
      return
    }

    if (!formData.appointment_date) {
      setError('Appointment Date is required')
      return
    }

    let appointmentTime: string | undefined
    let durationMinutes: number | undefined

    if (formData.practitioner) {
      if (timeMode === 'schedule') {
        if (!selectedSlot) {
          setError('Select a slot from the schedule, or switch to Custom time.')
          return
        }
        appointmentTime = toApiTime(selectedSlot.from_time)
        durationMinutes =
          selectedSlot.duration ??
          appointmentTypeDuration ??
          parseCustomDurationMinutes(customDurationMinutes)
      } else {
        if (!customTime.trim()) {
          setError('Enter a start time for the custom appointment.')
          return
        }
        const parsedDuration = parseCustomDurationMinutes(customDurationMinutes, 0)
        if (!customDurationMinutes.trim() || parsedDuration < 1) {
          setError('Enter duration in minutes (e.g. 45).')
          return
        }
        appointmentTime = toApiTime(customTime)
        durationMinutes = parsedDuration
      }
    }

    try {
      setLoading(true)
      setError(null)

      await createAppointment({
        patient: isWalkIn ? undefined : formData.patient,
        appointment_type: formData.appointment_type,
        appointment_date: formData.appointment_date,
        appointment_time: appointmentTime,
        practitioner: formData.practitioner || undefined,
        cost_center: costCenter.trim() || undefined,
        duration: durationMinutes,
        temporary_patient_name: isWalkIn ? temporaryPatientName.trim() : undefined,
        temporary_mobile_no: isWalkIn ? temporaryMobileNo.trim() || undefined : undefined,
        notes: notes.trim() || undefined,
      })
      
      toast.success('Appointment created successfully')
      
      if (onSuccess) {
        onSuccess()
      }
      
      onClose()
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Failed to create appointment'
      const errorMessage = /overlap|OverlapError/i.test(raw)
        ? 'This slot is no longer available. Please select another slot.'
        : raw
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  // Load initial options and auto-fill current user's practitioner
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [practs, appointmentTypes, currentPract] = await Promise.all([
          fetchHealthcarePractitioners(),
          fetchAppointmentTypes(),
          getCurrentUserPractitioner(),
        ])
        setPractitionerOptions(practs)
        setAppointmentTypeOptions(appointmentTypes)

        const defaultAptType = pickDefaultAppointmentType(appointmentTypes)
        if (defaultAptType) {
          setAppointmentTypeQuery(defaultAptType.label)
          setFormData((prev) =>
            prev.appointment_type
              ? prev
              : { ...prev, appointment_type: defaultAptType.name }
          )
          applyAppointmentTypeDuration(defaultAptType.default_duration)
        }

        // Set initial practitioner if provided, otherwise auto-fill current user
        if (initialPractitioner) {
          const pract = practs.find(p => p.name === initialPractitioner)
          if (pract) {
            setPractitionerQuery(pract.label)
            setFormData(prev => ({ ...prev, practitioner: pract.name }))
          }
        } else if (currentPract) {
          const pract = practs.find(p => p.name === currentPract)
          if (pract) {
            setPractitionerQuery(pract.label)
            setFormData(prev => prev.practitioner === '' ? { ...prev, practitioner: pract.name } : prev)
          }
        }
      } catch (err) {
        console.error('Failed to load options:', err)
      }
    }
    loadOptions()
  }, [initialPractitioner])

  useEffect(() => {
    let cancelled = false
    const loadCostCenters = async () => {
      setCostCenterLoading(true)
      try {
        const opts = await fetchAppointmentCostCenterOptions()
        if (cancelled) return

        const centers: LinkFieldOption[] = (opts.cost_centers || []).map((cc) => ({
          name: cc.name,
          label: cc.label || cc.name,
        }))
        setCostCenterOptions(centers)
        setCostCenterLocked(Boolean(opts.locked))

        const defaultCc = opts.default_cost_center || ''
        setCostCenter((prev) => {
          if (prev && centers.some((c) => c.name === prev)) return prev
          return defaultCc
        })
      } catch (err) {
        console.error('Failed to load cost centers:', err)
        if (!cancelled) {
          setCostCenterOptions([])
          setCostCenterLocked(false)
        }
      } finally {
        if (!cancelled) setCostCenterLoading(false)
      }
    }
    loadCostCenters()
    return () => {
      cancelled = true
    }
  }, [])

  // Auto-load slots when practitioner and date are set
  useEffect(() => {
    if (!formData.practitioner || !formData.appointment_date) {
      setSlotDetails(null)
      setSelectedSlot(null)
      setSlotsError(null)
      return
    }
    let cancelled = false
    setSlotsLoading(true)
    setSlotsError(null)
    setSlotDetails(null)
    setSelectedSlot(null)
    getAvailabilityData(formData.appointment_date, formData.practitioner, 'new')
      .then((res) => {
        if (!cancelled) {
          setSlotDetails(res.slot_details || [])
          if (res.user_message) {
            setSlotsError(res.user_message)
          } else if (!res.slot_details?.length) {
            setSlotsError('No slots available for this date. Try another date or use Custom time.')
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setSlotsError(err instanceof Error ? err.message : 'Could not load schedule slots.')
        }
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [formData.practitioner, formData.appointment_date])

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

  const applyAppointmentTypeDuration = (mins: number | null | undefined) => {
    const d = mins != null && Number(mins) > 0 ? Number(mins) : 30
    setAppointmentTypeDuration(d)
    setCustomDurationMinutes(String(d))
  }

  const handleAppointmentTypeSelect = (aptType: LinkFieldOption) => {
    setFormData(prev => ({ ...prev, appointment_type: aptType.name }))
    setAppointmentTypeQuery(aptType.label)
    setAppointmentTypeOpen(false)
    applyAppointmentTypeDuration(aptType.default_duration)
  }

  const handlePractitionerSelect = (pract: LinkFieldOption) => {
    setFormData(prev => ({ ...prev, practitioner: pract.name }))
    setPractitionerQuery(pract.label)
    setPractitionerOpen(false)
    setSlotDetails(null)
    setSelectedSlot(null)
    setSlotsError(null)
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-2xl w-full max-h-[90vh] overflow-hidden')}>
        <CreateModalHeader title="Create Appointment" onClose={onClose} />

        <form
          onSubmit={handleSubmit}
          className={`${CREATE_MODAL_BODY_GRADIENT} flex min-h-0 flex-1 flex-col`}
          onClick={(e) => {
          const target = e.target as HTMLElement
          if (target.tagName !== 'INPUT' && !target.closest('.absolute')) {
            setPatientOpen(false)
            setAppointmentTypeOpen(false)
            setPractitionerOpen(false)
          }
        }}
        >
          <div className="space-y-4 p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {/* ── Patient / Walk-in toggle ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700">
                Patient <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setIsWalkIn(v => !v)
                  setError(null)
                  // clear whichever mode we're leaving
                  if (!isWalkIn) {
                    setFormData(prev => ({ ...prev, patient: '' }))
                    setSelectedPatient(null)
                    setPatientQuery('')
                  } else {
                    setTemporaryPatientName('')
                    setTemporaryMobileNo('')
                  }
                }}
                className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                  isWalkIn
                    ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                    : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                }`}
              >
                {isWalkIn ? '↩ Back to file search' : '⚡ Walk-in (no file)'}
              </button>
            </div>

            {isWalkIn ? (
              /* Walk-in fields */
              <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs text-amber-700 font-medium">
                  Patient has no file — enter their name and mobile number below.
                </p>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Patient Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={temporaryPatientName}
                    onChange={e => setTemporaryPatientName(e.target.value)}
                    placeholder="Full name…"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Mobile No</label>
                  <input
                    type="tel"
                    value={temporaryMobileNo}
                    onChange={e => setTemporaryMobileNo(e.target.value)}
                    placeholder="Phone number…"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            ) : (
              /* Existing patient search */
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
                />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowCreatePatient(true) }}
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
            )}
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
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Healthcare Practitioner <span className="text-red-500">*</span>
            </label>
            <div className="relative flex items-center">
              <input
                type="text"
                value={practitionerQuery}
                onChange={(e) => {
                  setPractitionerQuery(e.target.value)
                  setPractitionerOpen(true)
                  setSlotDetails(null)
                  setSelectedSlot(null)
                  setSlotsError(null)
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
                      <div className="text-xs text-slate-500">
                        {[pract.name, pract.department].filter(Boolean).join(' · ')}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Cost Center</label>
            <select
              value={costCenter}
              onChange={(e) => setCostCenter(e.target.value)}
              disabled={costCenterLoading || costCenterLocked}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary bg-white disabled:bg-slate-50 disabled:text-slate-700"
            >
              <option value="">
                {costCenterLoading ? 'Loading cost centers…' : 'Select cost center'}
              </option>
              {costCenterOptions.map((cc) => (
                <option key={cc.name} value={cc.name}>
                  {cc.label || cc.name}
                </option>
              ))}
            </select>
            {costCenterLocked ? (
              <p className="text-[11px] text-slate-500 mt-1">
                Assigned from your user permission (only one cost center linked to your account).
              </p>
            ) : costCenter && costCenterOptions.length > 1 ? (
              <p className="text-[11px] text-slate-500 mt-1">
                Pre-selected from your linked cost center. You can choose another permitted cost center.
              </p>
            ) : costCenterOptions.length > 0 && costCenterOptions.length <= 10 ? (
              <p className="text-[11px] text-slate-500 mt-1">
                Showing cost centers linked to your user permissions.
              </p>
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Appointment Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={formData.appointment_date}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, appointment_date: e.target.value }))
                setSlotDetails(null)
                setSelectedSlot(null)
                setSlotsError(null)
              }}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              required
            />
          </div>

          {formData.practitioner && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <label className="block text-sm font-medium text-slate-700">Appointment time</label>
                <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setTimeMode('schedule')}
                    className={`px-3 py-1.5 transition-colors ${
                      timeMode === 'schedule'
                        ? 'bg-primary text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Schedule slots
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTimeMode('custom')
                      if (selectedSlot && !customTime) {
                        setCustomTime(formatSlotTime(selectedSlot.from_time))
                      }
                      if (selectedSlot?.duration) {
                        setCustomDurationMinutes(String(selectedSlot.duration))
                      }
                    }}
                    className={`px-3 py-1.5 border-l border-slate-300 transition-colors ${
                      timeMode === 'custom'
                        ? 'bg-primary text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Custom time
                  </button>
                </div>
              </div>

              {timeMode === 'schedule' ? (
                <>
                  {slotsLoading && <p className="text-sm text-slate-500">Loading slots…</p>}
                  {slotsError && !slotsLoading && (
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                      {slotsError}
                    </p>
                  )}
                  {!slotsLoading && !slotsError && flatSlots.length > 0 && (
                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                      {flatSlots.map(({ slot, disabled }, idx) => {
                        const isSelected = selectedSlot?.from_time === slot.from_time
                        const slotMins = slot.duration ?? appointmentTypeDuration
                        return (
                          <button
                            key={`${slot.from_time}-${idx}`}
                            type="button"
                            disabled={disabled}
                            onClick={() =>
                              setSelectedSlot({ from_time: slot.from_time, duration: slot.duration })
                            }
                            className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                              disabled
                                ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                                : isSelected
                                  ? 'border-primary bg-primary text-white'
                                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {formatSlotTime(slot.from_time)}
                            {slot.to_time ? ` – ${formatSlotTime(slot.to_time)}` : ''}
                            {slotMins ? (
                              <span className={`block text-[10px] mt-0.5 ${isSelected ? 'text-white/80' : 'text-slate-500'}`}>
                                {slotMins} min
                              </span>
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {selectedSlot && (
                    <p className="text-xs text-slate-500 mt-2">
                      Selected: {formatSlotTime(selectedSlot.from_time)}
                      {selectedSlot.duration ? ` · ${selectedSlot.duration} minutes` : ''}
                      {' · '}
                      <button
                        type="button"
                        className="text-primary underline hover:no-underline"
                        onClick={() => {
                          setTimeMode('custom')
                          setCustomTime(formatSlotTime(selectedSlot.from_time))
                          if (selectedSlot.duration) setCustomDurationMinutes(String(selectedSlot.duration))
                        }}
                      >
                        Adjust time or duration
                      </button>
                    </p>
                  )}
                  {!formData.appointment_date && !slotsLoading && (
                    <p className="text-sm text-slate-500">Select date to see slots.</p>
                  )}
                </>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Start time <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="time"
                      value={customTime}
                      onChange={(e) => setCustomTime(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      required={timeMode === 'custom'}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Duration (minutes) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={customDurationMinutes}
                      onChange={(e) => setCustomDurationMinutes(e.target.value.replace(/\D/g, ''))}
                      onBlur={() => {
                        const n = parseCustomDurationMinutes(customDurationMinutes, 0)
                        if (n < 1) {
                          setCustomDurationMinutes(String(appointmentTypeDuration ?? 30))
                        } else {
                          setCustomDurationMinutes(String(n))
                        }
                      }}
                      placeholder="e.g. 45"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    />
                    {appointmentTypeDuration ? (
                      <p className="text-[11px] text-slate-500 mt-1">
                        Appointment type default: {appointmentTypeDuration} min (you can change this)
                      </p>
                    ) : null}
                  </div>
                  <p className="sm:col-span-2 text-xs text-slate-500">
                    Use custom time when the visit needs a length other than the standard schedule slots
                    (e.g. 45 or 90 minutes). Overlap checks still apply.
                  </p>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Remarks</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any notes or remarks about this appointment…"
              rows={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none"
            />
          </div>

          </div>
          <CreateModalFooter>
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className={CM_BTN_PRIMARY}>
              {loading ? 'Creating...' : 'Create Appointment'}
            </button>
          </CreateModalFooter>
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
        <div className={CREATE_MODAL_OVERLAY}>
          <div className={createModalShellClass('max-w-md w-full p-6')}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold tracking-tight text-emerald-950">Create Appointment Type</h2>
              <button
                onClick={() => setShowCreateAppointmentType(false)}
                className="shrink-0 rounded-lg p-2 text-emerald-800/70 transition hover:bg-emerald-200/50 hover:text-emerald-950"
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
                className={CM_BTN_CANCEL}
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

