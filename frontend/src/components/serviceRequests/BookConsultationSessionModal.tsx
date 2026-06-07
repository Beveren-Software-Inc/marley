import { useState, useEffect } from 'react'
import {
  createAppointment,
  getAvailabilityData,
  type SlotDetail,
  type AvailabilitySlotInfo
} from '../../services/appointments'
import {
  fetchHealthcarePractitioners,
  fetchAppointmentTypes,
  pickDefaultAppointmentType,
  type LinkFieldOption,
} from '../../services/common'
import { bookSession } from '../../services/serviceRequests'
import { toast } from '../../hooks/useToast'
import { X, Calendar, Clock, User } from 'lucide-react'
import type { ServiceRequest } from '../../services/serviceRequests'

/* ─── time helpers (identical to CreateAppointmentModal) ─── */
function getTimePart(t: string | number | null | undefined): string {
  const s = String(t ?? '').trim()
  const spaceIdx = s.lastIndexOf(' ')
  return spaceIdx >= 0 ? s.slice(spaceIdx + 1) : s
}
function timeToMinutes(t: string | number | null | undefined): number {
  const parts = getTimePart(t).split(':').filter(Boolean)
  const h = parseInt(parts[0] || '0', 10)
  const m = parseInt(parts[1] || '0', 10)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0
}
function formatSlotTime(t: string | number | null | undefined): string {
  const parts = getTimePart(t).split(':').filter(Boolean)
  return `${(parts[0] ?? '0').padStart(2, '0')}:${(parts[1] ?? '0').padStart(2, '0')}`
}
function toApiTime(t: string | number | null | undefined): string {
  const parts = getTimePart(t).split(':').filter(Boolean)
  return `${(parts[0] ?? '0').padStart(2, '0')}:${(parts[1] ?? '0').padStart(2, '0')}:${(parts[2] ?? '0').padStart(2, '0')}`
}
function getAvailSlots(slotInfo: SlotDetail): AvailabilitySlotInfo[] {
  const raw = slotInfo.avail_slot
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') return Object.values(raw) as AvailabilitySlotInfo[]
  return []
}
function isSlotDisabled(slot: AvailabilitySlotInfo, slotInfo: SlotDetail, date: string): boolean {
  const slotStart = timeToMinutes(slot.from_time)
  const slotEnd = slot.to_time ? timeToMinutes(slot.to_time) : slotStart + (slot.duration ?? 60)
  const today = new Date().toISOString().split('T')[0]
  if (date === today && slotStart < new Date().getHours() * 60 + new Date().getMinutes()) return true
  const appointments = Array.isArray(slotInfo.appointments) ? slotInfo.appointments : []
  const allowOverlap = slotInfo.allow_overlap === 1
  const capacity = Math.max(1, Number(slotInfo.service_unit_capacity) || 1)
  let overlapping = 0
  for (const a of appointments.filter(a => a?.name)) {
    const aStart = timeToMinutes(a.appointment_time || '0:0')
    const aEnd = aStart + (Number(a.duration) || 0)
    if (slotStart < aEnd && slotEnd > aStart) {
      if (!allowOverlap) return true
      overlapping++
    }
  }
  if (allowOverlap && overlapping >= capacity) return true
  return false
}
function flattenSlots(slotDetails: SlotDetail[], date: string) {
  const out: { slot: AvailabilitySlotInfo; slotInfo: SlotDetail; disabled: boolean }[] = []
  for (const si of slotDetails)
    for (const s of getAvailSlots(si))
      if (s && s.from_time != null)
        out.push({ slot: s, slotInfo: si, disabled: isSlotDisabled(s, si, date) })
  return out.sort((a, b) => timeToMinutes(a.slot.from_time) - timeToMinutes(b.slot.from_time))
}

interface Props {
  serviceRequest: ServiceRequest
  onClose: () => void
  onSuccess: () => void
}

export const BookConsultationSessionModal = ({ serviceRequest: sr, onClose, onSuccess }: Props) => {
  const [appointmentDate, setAppointmentDate] = useState(new Date().toISOString().split('T')[0])
  const [appointmentType, setAppointmentType] = useState('')
  const [appointmentTypeQuery, setAppointmentTypeQuery] = useState('')
  const [appointmentTypeOpen, setAppointmentTypeOpen] = useState(false)
  const [appointmentTypeOptions, setAppointmentTypeOptions] = useState<LinkFieldOption[]>([])

  const [practitioner, setPractitioner] = useState(sr.practitioner || '')
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])

  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotDetails, setSlotDetails] = useState<SlotDetail[] | null>(null)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<{ from_time: string; duration?: number; service_unit?: string | null } | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const flatSlots = slotDetails && appointmentDate ? flattenSlots(slotDetails, appointmentDate) : []

  /* ── load initial options ── */
  useEffect(() => {
    Promise.all([
      fetchHealthcarePractitioners(),
      fetchAppointmentTypes(),
    ]).then(([practs, types]) => {
      setPractitionerOptions(practs)
      setAppointmentTypeOptions(types)
      const defaultType = pickDefaultAppointmentType(types)
      if (defaultType) {
        setAppointmentType(defaultType.name)
        setAppointmentTypeQuery(defaultType.label)
      }
      if (sr.practitioner) {
        const p = practs.find(p => p.name === sr.practitioner)
        setPractitionerQuery(p?.label || sr.practitioner)
      }
    }).catch(console.error)
  }, [sr.practitioner])

  /* ── fetch slots when practitioner + date change ── */
  useEffect(() => {
    setSlotDetails(null)
    setSelectedSlot(null)
    setSlotsError(null)
    if (!practitioner || !appointmentDate) return
    let cancelled = false
    setSlotsLoading(true)
    getAvailabilityData(appointmentDate, practitioner, 'new')
      .then(res => {
        if (cancelled) return
        setSlotDetails(res.slot_details || [])
        if (res.user_message) {
          setSlotsError(res.user_message)
        } else if (!res.slot_details?.length) {
          setSlotsError('No slots available for this date.')
        }
      })
      .catch(err => {
        if (!cancelled) setSlotsError(err instanceof Error ? err.message : 'Could not load schedule slots.')
      })
      .finally(() => { if (!cancelled) setSlotsLoading(false) })
    return () => { cancelled = true }
  }, [practitioner, appointmentDate])

  /* ── practitioner search ── */
  useEffect(() => {
    if (!practitionerOpen) return
    const t = setTimeout(() =>
      fetchHealthcarePractitioners(practitionerQuery).then(setPractitionerOptions).catch(console.error)
    , practitionerQuery ? 300 : 0)
    return () => clearTimeout(t)
  }, [practitionerQuery, practitionerOpen])

  /* ── appointment type search ── */
  useEffect(() => {
    if (!appointmentTypeOpen) return
    const t = setTimeout(() =>
      fetchAppointmentTypes(appointmentTypeQuery).then(setAppointmentTypeOptions).catch(console.error)
    , appointmentTypeQuery ? 300 : 0)
    return () => clearTimeout(t)
  }, [appointmentTypeQuery, appointmentTypeOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!appointmentType) { setError('Please select an appointment type'); return }
    if (!practitioner) { setError('Please select a practitioner'); return }
    if (!selectedSlot) { setError('Please select a time slot'); return }

    setSubmitting(true)
    try {
      const appt = await createAppointment({
        patient: sr.patient,
        appointment_type: appointmentType,
        appointment_date: appointmentDate,
        appointment_time: toApiTime(selectedSlot.from_time),
        practitioner,
      })

      await bookSession(sr.name, appt.name)

      toast.success(`Session booked — Appointment ${appt.name}`)
      onSuccess()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to book session'
      setError(/overlap/i.test(msg) ? 'This slot is no longer available. Please select another.' : msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => {
          if (!(e.target as HTMLElement).closest('.dropdown-area')) {
            setAppointmentTypeOpen(false)
            setPractitionerOpen(false)
          }
        }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Book Consultation Session</h2>
            <p className="text-xs text-slate-500 mt-0.5">Service Request: {sr.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">{error}</div>
          )}

          {/* Patient (read-only) */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-3">
            <User className="w-4 h-4 text-slate-400 shrink-0" />
            <div>
              <p className="text-xs text-slate-500">Patient</p>
              <p className="text-sm font-medium text-slate-900">{sr.patient_name || sr.patient}</p>
            </div>
          </div>

          {/* Appointment Type */}
          <div className="dropdown-area">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Appointment Type <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={appointmentTypeQuery}
                onChange={e => { setAppointmentTypeQuery(e.target.value); setAppointmentTypeOpen(true) }}
                onFocus={() => setAppointmentTypeOpen(true)}
                placeholder="Search appointment type..."
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              {appointmentTypeOpen && appointmentTypeOptions.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-auto">
                  {appointmentTypeOptions.map(t => (
                    <button key={t.name} type="button"
                      onClick={() => { setAppointmentType(t.name); setAppointmentTypeQuery(t.label || t.name); setAppointmentTypeOpen(false) }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-slate-100 last:border-0"
                    >{t.label || t.name}</button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Practitioner */}
          <div className="dropdown-area">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Practitioner <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={practitionerQuery}
                onChange={e => {
                  setPractitionerQuery(e.target.value)
                  setPractitioner('')
                  setPractitionerOpen(true)
                  setSlotDetails(null); setSelectedSlot(null); setSlotsError(null)
                }}
                onFocus={() => setPractitionerOpen(true)}
                placeholder="Search practitioner..."
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              {practitionerOpen && practitionerOptions.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-auto">
                  {practitionerOptions.map(p => (
                    <button key={p.name} type="button"
                      onClick={() => { setPractitioner(p.name); setPractitionerQuery(p.label || p.name); setPractitionerOpen(false) }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-slate-100 last:border-0"
                    >
                      <div className="font-medium">{p.label || p.name}</div>
                      {p.department && <div className="text-xs text-slate-500">Dept: {p.department}</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              <Calendar className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
              Appointment Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={appointmentDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={e => {
                setAppointmentDate(e.target.value)
                setSlotDetails(null); setSelectedSlot(null); setSlotsError(null)
              }}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          {/* Time Slots */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <Clock className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
              Available Time Slots <span className="text-red-500">*</span>
            </label>

            {!practitioner && (
              <p className="text-sm text-slate-500 bg-slate-50 rounded-md px-3 py-2">
                Select a practitioner and date to see available slots.
              </p>
            )}

            {practitioner && slotsLoading && (
              <div className="flex items-center gap-2 py-2 text-sm text-slate-500">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Loading slots…
              </div>
            )}

            {practitioner && !slotsLoading && slotsError && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">{slotsError}</p>
            )}

            {practitioner && !slotsLoading && !slotsError && flatSlots.length > 0 && (
              <div className="flex flex-wrap gap-2 max-h-44 overflow-y-auto py-1">
                {flatSlots.map(({ slot, slotInfo, disabled }, idx) => {
                  const isSelected = selectedSlot?.from_time === slot.from_time
                  return (
                    <button
                      key={`${slot.from_time}-${idx}`}
                      type="button"
                      disabled={disabled}
                      onClick={() => setSelectedSlot({ from_time: slot.from_time, duration: slot.duration, service_unit: slotInfo.service_unit })}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                        disabled
                          ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                          : isSelected
                            ? 'border-primary bg-primary text-white shadow-sm'
                            : 'border-slate-300 bg-white text-slate-700 hover:border-primary hover:bg-primary/5'
                      }`}
                    >
                      {formatSlotTime(slot.from_time)}
                      {slot.to_time ? ` – ${formatSlotTime(slot.to_time)}` : ''}
                    </button>
                  )
                })}
              </div>
            )}

            {selectedSlot && (
              <div className="mt-3 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-primary">
                  Selected: {formatSlotTime(selectedSlot.from_time)}
                  {selectedSlot.duration ? ` (${selectedSlot.duration} min)` : ''}
                </span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedSlot}
              className="px-5 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Booking…' : 'Book Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
