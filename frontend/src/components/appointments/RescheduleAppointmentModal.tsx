import { useState, useEffect } from 'react'
import {
  rescheduleAppointment,
  getAvailabilityData,
  type Appointment,
  type SlotDetail,
  type AvailabilitySlotInfo
} from '../../services/appointments'
import { toast } from '../../hooks/useToast'
import { X } from 'lucide-react'

interface RescheduleAppointmentModalProps {
  appointment: Appointment
  onClose: () => void
  onSuccess?: () => void
}

/** Extract time part only (backend may return "HH:MM:SS" or "YYYY-MM-DD HH:MM:SS"). */
function getTimePart(t: string | number | null | undefined): string {
  const s = String(t ?? '').trim()
  const spaceIdx = s.lastIndexOf(' ')
  const timeStr = spaceIdx >= 0 ? s.slice(spaceIdx + 1) : s
  return timeStr
}

/** Parse "HH:MM:SS" or "HH:MM" to minutes since midnight. */
function timeToMinutes(t: string | number | null | undefined): number {
  const timeStr = getTimePart(t)
  const parts = timeStr.split(':').filter(Boolean)
  const h = parseInt(parts[0] || '0', 10)
  const m = parseInt(parts[1] || '0', 10)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return h * 60 + m
}

/** Format "HH:MM:SS" or datetime to "HH:MM" for display. */
function formatSlotTime(t: string | number | null | undefined): string {
  const timeStr = getTimePart(t)
  const parts = timeStr.split(':').filter(Boolean)
  const h = (parts[0] ?? '0').padStart(2, '0')
  const m = (parts[1] ?? '0').padStart(2, '0')
  return `${h}:${m}`
}

/** Whether a slot is disabled: past (today), or overlapping with other appointments (exclude current). */
function isSlotDisabled(
  slot: AvailabilitySlotInfo,
  slotInfo: SlotDetail,
  appointmentDate: string,
  currentAppointmentName: string
): boolean {
  const slotStart = timeToMinutes(slot.from_time)
  const slotEnd = slot.to_time ? timeToMinutes(slot.to_time) : slotStart + (slot.duration ?? 60)
  const today = new Date().toISOString().split('T')[0]
  if (appointmentDate === today) {
    const now = new Date()
    const nowMin = now.getHours() * 60 + now.getMinutes()
    if (slotStart < nowMin) return true
  }
  const appointmentsList = Array.isArray(slotInfo.appointments) ? slotInfo.appointments : []
  const others = appointmentsList.filter(
    (a) => a != null && String(a.name || '').trim() !== '' && String(a.name) !== String(currentAppointmentName)
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

/** Ensure we have an array of slots (avail_slot may be array or object from API). */
function getAvailSlots(slotInfo: SlotDetail): AvailabilitySlotInfo[] {
  const raw = slotInfo.avail_slot
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') return Object.values(raw) as AvailabilitySlotInfo[]
  return []
}

/** Flatten slot_details into list of { slot, slotInfo, disabled } for rendering. */
function flattenSlots(
  slotDetails: SlotDetail[],
  appointmentDate: string,
  currentAppointmentName: string
): { slot: AvailabilitySlotInfo; slotInfo: SlotDetail; disabled: boolean }[] {
  const out: { slot: AvailabilitySlotInfo; slotInfo: SlotDetail; disabled: boolean }[] = []
  for (const slotInfo of slotDetails) {
    for (const slot of getAvailSlots(slotInfo)) {
      if (slot && (slot.from_time != null || slot.to_time != null)) {
        out.push({
          slot,
          slotInfo,
          disabled: isSlotDisabled(slot, slotInfo, appointmentDate, currentAppointmentName)
        })
      }
    }
  }
  return out.sort((a, b) => timeToMinutes(a.slot.from_time) - timeToMinutes(b.slot.from_time))
}

/** Normalize time to HH:MM:SS for API (input may be HH:MM or datetime). */
function toApiTime(t: string | number | null | undefined): string {
  const timeStr = getTimePart(t)
  const parts = timeStr.split(':').filter(Boolean)
  const h = (parts[0] ?? '0').padStart(2, '0')
  const m = (parts[1] ?? '0').padStart(2, '0')
  const s = (parts[2] ?? '0').padStart(2, '0')
  return `${h}:${m}:${s}`
}

export const RescheduleAppointmentModal = ({
  appointment,
  onClose,
  onSuccess
}: RescheduleAppointmentModalProps) => {
  const initialDate = appointment.appointment_date
    ? new Date(appointment.appointment_date).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0]

  const [appointment_date, setAppointmentDate] = useState(initialDate)
  const [appointment_time, setAppointmentTime] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotDetails, setSlotDetails] = useState<SlotDetail[] | null>(null)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<{
    from_time: string
    duration?: number
    service_unit?: string | null
  } | null>(null)

  const hasPractitioner = Boolean(appointment.practitioner)

  useEffect(() => {
    if (!hasPractitioner || !appointment_date) {
      setSlotDetails(null)
      setSlotsError(null)
      setSelectedSlot(null)
      return
    }
    let cancelled = false
    setSlotsLoading(true)
    setSlotsError(null)
    setSlotDetails(null)
    setSelectedSlot(null)
    getAvailabilityData(appointment_date, appointment.practitioner!, appointment.name)
      .then((res) => {
        if (!cancelled) {
          setSlotDetails(res.slot_details || [])
          if (!res.slot_details?.length) setSlotsError('No slots available for this date.')
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setSlotsError(err instanceof Error ? err.message : 'Failed to load slots')
        }
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [hasPractitioner, appointment_date, appointment.practitioner, appointment.name])

  const flatSlots =
    slotDetails && appointment_date
      ? flattenSlots(slotDetails, appointment_date, appointment.name)
      : []

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!appointment_date) {
      setError('Appointment date is required')
      return
    }
    const timeToSend = selectedSlot
      ? toApiTime(selectedSlot.from_time)
      : appointment_time
        ? `${appointment_time.replace(/^(\d{1,2}):(\d{2}).*/, (_, h, m) => `${h.padStart(2, '0')}:${m}:00`)}`
        : undefined
    if (!timeToSend && hasPractitioner) {
      setError('Please select an available slot.')
      return
    }
    try {
      setLoading(true)
      setError(null)
      await rescheduleAppointment(
        appointment.name,
        appointment_date,
        timeToSend,
        selectedSlot?.duration,
        selectedSlot?.service_unit ?? undefined
      )
      toast.success('Appointment rescheduled successfully')
      onSuccess?.()
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reschedule appointment'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Reschedule Appointment</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-slate-600">
            {appointment.patient_name || appointment.patient} · {appointment.name}
          </p>
          {hasPractitioner && (
            <p className="text-sm text-slate-500">
              Practitioner: {appointment.practitioner_name || appointment.practitioner}
            </p>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Appointment Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={appointment_date}
              onChange={(e) => setAppointmentDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              required
            />
          </div>

          {hasPractitioner ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Available slots <span className="text-red-500">*</span>
              </label>
              {slotsLoading && (
                <p className="text-sm text-slate-500 py-2">Loading slots…</p>
              )}
              {slotsError && !slotsLoading && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                  {slotsError}
                </p>
              )}
              {!slotsLoading && !slotsError && flatSlots.length === 0 && slotDetails && (
                <p className="text-sm text-slate-500">No slots available for this date.</p>
              )}
              {!slotsLoading && flatSlots.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {flatSlots.map(({ slot, slotInfo, disabled }, idx) => {
                    const key = `${slotInfo.slot_name}-${slot.from_time}-${idx}`
                    const isSelected =
                      selectedSlot?.from_time === slot.from_time &&
                      selectedSlot?.service_unit === slotInfo.service_unit
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          setSelectedSlot({
                            from_time: slot.from_time,
                            duration: slot.duration,
                            service_unit: slotInfo.service_unit
                          })
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
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Appointment Time
              </label>
              <input
                type="time"
                value={appointment_time}
                onChange={(e) => {
                  setAppointmentTime(e.target.value)
                  setSelectedSlot(null)
                }}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
          )}

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
              disabled={loading || (hasPractitioner && !selectedSlot && flatSlots.length > 0)}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Rescheduling…' : 'Reschedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
