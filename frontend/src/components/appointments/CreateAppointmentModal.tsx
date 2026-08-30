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
  checkPractitionerAvailability,
  fetchAppointmentCostCenterOptions,
  getAvailabilityData,
  type SlotDetail,
  type AvailabilitySlotInfo,
  type PractitionerAvailabilityResponse,
} from '../../services/appointments'
import {
  fetchAppointmentPractitioners,
  fetchAppointmentTypes,
  pickDefaultAppointmentType,
  type LinkFieldOption,
} from '../../services/common'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { toast } from '../../hooks/useToast'
import { localDateInputValue } from '../../utils/formatDate'
import { CalendarOff, X } from 'lucide-react'
import {
  LOCKED_PRACTITIONER_INPUT_CLASS,
  useLockedLinkedPractitioner,
} from '../../hooks/useLockedLinkedPractitioner'
import { CreatePractitionerModal } from '../practitioners/CreatePractitionerModal'
import { useBlockIfActiveCareClosed } from '../../hooks/useBlockIfActiveCareClosed'
import { CreatePatientModal } from '../patients/CreatePatientModal'
import { useCareContext } from '../../providers/CareContextProvider'
import { DateFilterInput } from '../ui/DateFilterInput'

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
  const today = localDateInputValue()
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
  const { userCostCenter } = useCareContext()
  const [formData, setFormData] = useState({
    patient: initialPatient || '',
    appointment_type: '',
    appointment_date: localDateInputValue(),
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
  const {
    locked: practitionerLocked,
    practitionerId: linkedPractitionerId,
    practitionerLabel: linkedPractitionerLabel,
  } = useLockedLinkedPractitioner()

  // Slots (Check Availability) state
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotDetails, setSlotDetails] = useState<SlotDetail[] | null>(null)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<{ from_time: string; duration?: number } | null>(null)
  const [timeMode, setTimeMode] = useState<'schedule' | 'custom'>('schedule')
  const [customTime, setCustomTime] = useState('')
  const [customDurationMinutes, setCustomDurationMinutes] = useState('')
  const [appointmentTypeDuration, setAppointmentTypeDuration] = useState<number | null>(null)
  const [practitionerAvailability, setPractitionerAvailability] =
    useState<PractitionerAvailabilityResponse | null>(null)
  const [availabilityChecking, setAvailabilityChecking] = useState(false)

  const isPractitionerUnavailable = practitionerAvailability?.available === false

  const unavailableWarningMessage = (() => {
    if (!isPractitionerUnavailable || !practitionerAvailability) return null
    const details = practitionerAvailability.leave_details
    const isUnavail = practitionerAvailability.reason === 'unavailable'
    const from = details?.from_date
    const to = details?.to_date
    const range =
      from && to
        ? from === to
          ? ` on ${from}`
          : ` from ${from} to ${to}`
        : formData.appointment_date
          ? ` on ${formData.appointment_date}`
          : ''
    if (isUnavail) {
      const remarks = details?.remarks ? ` (${details.remarks})` : ''
      return `This doctor is marked unavailable${range}${remarks}. You cannot book an appointment for this date.`
    }
    const leaveType = details?.leave_type ? ` (${details.leave_type})` : ''
    return `This doctor is on leave${leaveType}${range}. You cannot book an appointment for this date.`
  })()

  const [costCenter, setCostCenter] = useState(userCostCenter || '')
  const [costCenterOptions, setCostCenterOptions] = useState<LinkFieldOption[]>([])
  const [costCenterLoading, setCostCenterLoading] = useState(false)
  /** True when user has exactly one permitted branch (User Permission). */
  const [costCenterLocked, setCostCenterLocked] = useState(false)

  // Keep in sync when header branch changes while the modal is open
  useEffect(() => {
    if (!userCostCenter || costCenterLocked) return
    setCostCenter((prev) => {
      if (prev === userCostCenter) return prev
      if (costCenterOptions.length && !costCenterOptions.some((o) => o.name === userCostCenter)) {
        return prev
      }
      return userCostCenter
    })
  }, [userCostCenter, costCenterLocked, costCenterOptions])

  // Doctor roster: only fill branch from shift location when none is set yet
  // (header / permitted default already wins).
  useEffect(() => {
    if (!formData.practitioner || !formData.appointment_date || costCenterLocked) return
    if (costCenter) return
    let cancelled = false
    const params = new URLSearchParams()
    params.append('practitioner', formData.practitioner)
    params.append('date', formData.appointment_date)
    fetch(`/api/method/healthcare.api.patient_appointment.get_practitioner_branch_for_date?${params.toString()}`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        const cc = d?.message
        if (cc && typeof cc === 'string' && costCenterOptions.some((o) => o.name === cc)) setCostCenter(cc)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [formData.practitioner, formData.appointment_date, costCenterLocked, costCenterOptions, costCenter])

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

    if (!costCenter) {
      setError('Please select a branch')
      return
    }

    if (!formData.appointment_date) {
      setError('Appointment Date is required')
      return
    }

    if (!formData.practitioner) {
      setError('Please select a doctor')
      return
    }

    if (isPractitionerUnavailable) {
      setError(
        unavailableWarningMessage ||
          `Cannot create appointment: doctor is not available on ${formData.appointment_date}.`
      )
      toast.error('Doctor is not available on the selected date.')
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
          (customDurationMinutes.trim()
            ? parseCustomDurationMinutes(customDurationMinutes, 0)
            : undefined)
        if (durationMinutes != null && durationMinutes < 1) {
          durationMinutes = undefined
        }
      } else {
        if (!customTime.trim()) {
          setError('Enter a start time for the custom appointment.')
          return
        }
        appointmentTime = toApiTime(customTime)
        if (customDurationMinutes.trim()) {
          const parsedDuration = parseCustomDurationMinutes(customDurationMinutes, 0)
          if (parsedDuration < 1) {
            setError('Duration must be at least 1 minute, or leave it blank.')
            return
          }
          durationMinutes = parsedDuration
        }
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
      let errorMessage = /overlap|OverlapError/i.test(raw)
        ? 'This slot is no longer available. Please select another slot.'
        : raw
      if (/leave|unavailable|not available|holiday/i.test(raw)) {
        errorMessage = raw
        setPractitionerAvailability({
          available: false,
          reason: /unavailable/i.test(raw) ? 'unavailable' : 'leave',
          leave_details: {
            leave_type: /unavailable/i.test(raw) ? 'Practitioner Unavailability' : 'Leave',
            from_date: formData.appointment_date,
            to_date: formData.appointment_date,
          },
        })
      }
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  // Load initial options and auto-fill current user's practitioner
  useEffect(() => {
    let cancelled = false

    const applyPractitioner = async (practitionerId: string, allowOverwrite = false) => {
      setFormData((prev) =>
        allowOverwrite || !prev.practitioner ? { ...prev, practitioner: practitionerId } : prev,
      )
      try {
        const options = await fetchAppointmentPractitioners(practitionerId)
        if (cancelled) return
        const match = options.find((p) => p.name === practitionerId)
        setPractitionerQuery(match?.label || practitionerId)
        if (match) {
          setPractitionerOptions((prev) =>
            prev.some((p) => p.name === match.name) ? prev : [...prev, match],
          )
        }
      } catch {
        if (!cancelled) setPractitionerQuery(practitionerId)
      }
    }

    const loadOptions = async () => {
      try {
        const [practs, appointmentTypes] = await Promise.all([
          fetchAppointmentPractitioners(),
          fetchAppointmentTypes(),
        ])
        if (cancelled) return
        setPractitionerOptions(practs)
        setAppointmentTypeOptions(appointmentTypes)

        const defaultAptType = pickDefaultAppointmentType(appointmentTypes)
        if (defaultAptType) {
          setAppointmentTypeQuery(defaultAptType.label)
          setFormData((prev) =>
            prev.appointment_type
              ? prev
              : { ...prev, appointment_type: defaultAptType.name },
          )
          applyAppointmentTypeDuration(defaultAptType.default_duration)
        }

        if (initialPractitioner) {
          await applyPractitioner(initialPractitioner, true)
        }
      } catch (err) {
        console.error('Failed to load options:', err)
      }
    }
    loadOptions()
    return () => {
      cancelled = true
    }
  }, [initialPractitioner])

  // Auto-populate current user's linked practitioner; lock for doctors (not admins).
  useEffect(() => {
    if (!linkedPractitionerId || initialPractitioner) return
    setFormData((prev) =>
      prev.practitioner ? prev : { ...prev, practitioner: linkedPractitionerId },
    )
    setPractitionerQuery((q) => q.trim() || linkedPractitionerLabel || linkedPractitionerId)
  }, [linkedPractitionerId, linkedPractitionerLabel, initialPractitioner])

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
        const headerCc =
          userCostCenter && centers.some((c) => c.name === userCostCenter) ? userCostCenter : ''
        setCostCenter((prev) => {
          if (prev && centers.some((c) => c.name === prev)) return prev
          if (headerCc) return headerCc
          return defaultCc
        })
      } catch (err) {
        console.error('Failed to load branches:', err)
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
  }, [userCostCenter])

  // Check leave / Practitioner Unavailability when doctor + date are set
  useEffect(() => {
    if (!formData.practitioner || !formData.appointment_date) {
      setPractitionerAvailability(null)
      setAvailabilityChecking(false)
      return
    }
    let cancelled = false
    setAvailabilityChecking(true)
    setPractitionerAvailability(null)
    checkPractitionerAvailability(formData.practitioner, formData.appointment_date)
      .then((res) => {
        if (!cancelled) setPractitionerAvailability(res)
      })
      .finally(() => {
        if (!cancelled) setAvailabilityChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [formData.practitioner, formData.appointment_date])

  // Auto-load slots when practitioner and date are set (skip when doctor unavailable)
  useEffect(() => {
    if (!formData.practitioner || !formData.appointment_date || isPractitionerUnavailable) {
      if (isPractitionerUnavailable) {
        setSlotDetails(null)
        setSelectedSlot(null)
        setSlotsError(null)
        setSlotsLoading(false)
      } else if (!formData.practitioner || !formData.appointment_date) {
        setSlotDetails(null)
        setSelectedSlot(null)
        setSlotsError(null)
      }
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
          const msg = err instanceof Error ? err.message : 'Could not load schedule slots.'
          setSlotsError(msg)
          if (/leave|unavailable|not available|holiday/i.test(msg)) {
            setPractitionerAvailability({
              available: false,
              reason: /unavailable/i.test(msg) ? 'unavailable' : 'leave',
              leave_details: {
                leave_type: /unavailable/i.test(msg) ? 'Practitioner Unavailability' : 'Leave',
                from_date: formData.appointment_date,
                to_date: formData.appointment_date,
              },
            })
          }
        }
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [formData.practitioner, formData.appointment_date, isPractitionerUnavailable])

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
        const results = await fetchAppointmentPractitioners(practitionerQuery)
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
    const d = mins != null && Number(mins) > 0 ? Number(mins) : null
    setAppointmentTypeDuration(d)
    // Duration is optional — do not force-fill the input.
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
    setPractitionerAvailability(null)
    setError(null)
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
                {isWalkIn ? '↩ Back to file search' : '⚡ WALK-IN PATIENT (NO FILE)'}
              </button>
            </div>

            {isWalkIn ? (
              /* Walk-in fields */
              <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
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
              Doctor <span className="text-red-500">*</span>
            </label>
            <div className="relative flex items-center">
              <input
                type="text"
                value={practitionerQuery}
                readOnly={practitionerLocked}
                onChange={(e) => {
                  if (practitionerLocked) return
                  setPractitionerQuery(e.target.value)
                  setPractitionerOpen(true)
                  setSlotDetails(null)
                  setSelectedSlot(null)
                  setSlotsError(null)
                }}
                onFocus={() => {
                  if (!practitionerLocked) setPractitionerOpen(true)
                }}
                placeholder="Select doctor..."
                title={practitionerLocked ? 'Locked to your linked practitioner' : undefined}
                className={
                  practitionerLocked
                    ? LOCKED_PRACTITIONER_INPUT_CLASS
                    : 'w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary'
                }
              />
              {!practitionerLocked ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowCreatePractitioner(true)
                  }}
                  className="absolute right-2 p-1 text-primary hover:text-primary/80 rounded"
                  title="Create New Doctor"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              ) : null}
              {practitionerOpen && !practitionerLocked && practitionerOptions.length > 0 && (
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
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Branch <span className="text-red-500">*</span>
            </label>
            <select
              value={costCenter}
              onChange={(e) => setCostCenter(e.target.value)}
              disabled={costCenterLoading}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary bg-white"
            >
              <option value="">
                {costCenterLoading ? 'Loading branches…' : 'Select branch'}
              </option>
              {costCenterOptions.map((cc) => (
                <option key={cc.name} value={cc.name}>
                  {cc.label || cc.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Appointment Date <span className="text-red-500">*</span>
            </label>
            <DateFilterInput
              min={localDateInputValue()}
              value={formData.appointment_date}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, appointment_date: e.target.value }))
                setSlotDetails(null)
                setSelectedSlot(null)
                setSlotsError(null)
                setPractitionerAvailability(null)
                setError(null)
              }}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              required
            />
          </div>

          {formData.practitioner && formData.appointment_date && availabilityChecking && (
            <p className="text-sm text-slate-500">Checking doctor availability…</p>
          )}

          {isPractitionerUnavailable && unavailableWarningMessage && (
            <div className="bg-amber-50 border border-amber-300 rounded-md p-3 flex items-start gap-2">
              <CalendarOff className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-900">Cannot book this date</p>
                <p className="text-sm text-amber-800 mt-0.5">{unavailableWarningMessage}</p>
                <p className="text-xs text-amber-700 mt-1">
                  Select another date, or wait until the doctor is available again.
                </p>
              </div>
            </div>
          )}

          {formData.practitioner && !isPractitionerUnavailable && (
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
                      Duration (minutes)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={customDurationMinutes}
                      onChange={(e) => setCustomDurationMinutes(e.target.value.replace(/\D/g, ''))}
                      onBlur={() => {
                        if (!customDurationMinutes.trim()) return
                        const n = parseCustomDurationMinutes(customDurationMinutes, 0)
                        if (n >= 1) {
                          setCustomDurationMinutes(String(n))
                        }
                      }}
                      placeholder="Optional — e.g. 45"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    />
                    {appointmentTypeDuration ? (
                      <p className="text-[11px] text-slate-500 mt-1">
                        Appointment type default: {appointmentTypeDuration} min (optional override)
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-500 mt-1">Leave blank if no duration is needed.</p>
                    )}
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
            <button
              type="submit"
              disabled={loading || isPractitionerUnavailable || availabilityChecking}
              className={CM_BTN_PRIMARY}
            >
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
              fetchAppointmentPractitioners().then(setPractitionerOptions).catch(console.error)
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

