import { useState, useEffect, useRef } from 'react'
import {
  fetchPractitionerAppointments,
  fetchAllAppointments,
  updateAppointmentStatus,
  createEncounterFromAppointment,
  getVitalSignsNewUrl,
  getPatientVisitFormUrl,
  type Appointment
} from '../../services/appointments'
import { StatusPill } from '../ui/StatusPill'
import { RescheduleAppointmentModal } from './RescheduleAppointmentModal'

const statusColors: Record<string, string> = {
  'Scheduled': 'info',
  'Open': 'warning',
  'Confirmed': 'success',
  'Checked In': 'success',
  'Checked Out': 'default',
  'Closed': 'default',
  'Cancelled': 'danger',
  'No Show': 'danger'
}

interface AppointmentListProps {
  refreshKey?: string | number
  showAll?: boolean // If true, show all appointments (for receptionist), otherwise show practitioner appointments
  patient?: string // Optional patient filter
  onAddAppointment?: () => void // Callback for add button
}

const ACTIVE_STATUSES = ['Scheduled', 'Open', 'Confirmed', 'Checked In']
const CAN_CONFIRM_STATUSES = ['Open', 'Scheduled']

export const AppointmentList = ({ refreshKey, showAll = false, patient }: AppointmentListProps) => {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [rescheduleAppointment, setRescheduleAppointment] = useState<Appointment | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const loadAppointments = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = showAll 
          ? await fetchAllAppointments(50, 0, undefined, patient)
          : await fetchPractitionerAppointments(50, 0)
        setAppointments(response)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch appointments'))
      } finally {
        setLoading(false)
      }
    }

    loadAppointments()
  }, [refreshKey, showAll, patient, refreshTrigger])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenActionRow(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const getStatusColor = (status?: string): string => {
    if (!status) return 'default'
    
    const statusLower = status.toLowerCase()
    if (statusLower.includes('scheduled')) return 'info'
    if (statusLower.includes('open') || statusLower.includes('confirmed')) return 'warning'
    if (statusLower.includes('checked in')) return 'success'
    if (statusLower.includes('checked out') || statusLower.includes('closed')) return 'default'
    if (statusLower.includes('cancelled') || statusLower.includes('no show')) return 'danger'
    return statusColors[status] || 'default'
  }

  const formatDateTime = (date?: string, time?: string): string => {
    if (!date) return '-'
    const dateObj = new Date(date)
    const dateStr = dateObj.toLocaleDateString()
    if (time) {
      return `${dateStr} ${time}`
    }
    return dateStr
  }

  const canCancel = (status?: string) => status && ACTIVE_STATUSES.includes(status)
  const canConfirm = (status?: string) => status && CAN_CONFIRM_STATUSES.includes(status)

  const handleCancel = async (apt: Appointment) => {
    if (!window.confirm('Are you sure you want to cancel this appointment?')) return
    setActionLoading(apt.name)
    setOpenActionRow(null)
    try {
      await updateAppointmentStatus(apt.name, 'Cancelled')
      setRefreshTrigger((t) => t + 1)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to cancel')
    } finally {
      setActionLoading(null)
    }
  }

  const handleConfirm = async (apt: Appointment) => {
    setActionLoading(apt.name)
    setOpenActionRow(null)
    try {
      await updateAppointmentStatus(apt.name, 'Confirmed')
      setRefreshTrigger((t) => t + 1)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to confirm')
    } finally {
      setActionLoading(null)
    }
  }

  const handleReschedule = (apt: Appointment) => {
    setOpenActionRow(null)
    setRescheduleAppointment(apt)
  }

  const handleCreateVitalSign = (apt: Appointment) => {
    setOpenActionRow(null)
    if (!apt.patient) {
      window.alert('Patient is missing for this appointment.')
      return
    }
    window.open(getVitalSignsNewUrl(apt.patient, apt.name, apt.company), '_blank')
  }

  const handleCreatePatientVisit = async (apt: Appointment) => {
    setActionLoading(apt.name)
    setOpenActionRow(null)
    try {
      const visitName = await createEncounterFromAppointment(apt.name)
      window.open(getPatientVisitFormUrl(visitName), '_blank')
      setRefreshTrigger((t) => t + 1)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to create Patient Visit')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading appointments...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Appointments</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
        </div>
      </div>
    )
  }

  if (appointments.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">No appointments found</div>
      </div>
    )
  }

  return (
    <>
    <div className="min-w-full">
      <table className="w-full min-w-[900px]">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Appointment ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Patient
            </th>
            {showAll && (
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Practitioner
              </th>
            )}
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Date & Time
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Type
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Status
            </th>
            {showAll && (
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[100px]">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {appointments.map((apt) => (
            <tr key={apt.name} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-sm font-medium text-slate-900">
                {apt.name}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {apt.patient_name || apt.patient || '-'}
              </td>
              {showAll && (
                <td className="px-4 py-3 text-sm text-slate-700">
                  {apt.practitioner_name || apt.practitioner || '-'}
                </td>
              )}
              <td className="px-4 py-3 text-sm text-slate-700">
                {formatDateTime(apt.appointment_date, apt.appointment_time)}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {apt.appointment_type || '-'}
              </td>
              <td className="px-4 py-3">
                {apt.status ? (
                  <StatusPill
                    status={apt.status}
                    color={getStatusColor(apt.status)}
                  />
                ) : (
                  <span className="text-sm text-slate-500">-</span>
                )}
              </td>
              {showAll && (
                <td className="px-4 py-2 align-middle">
                  <div className="relative" ref={openActionRow === apt.name ? menuRef : undefined}>
                    <button
                      type="button"
                      onClick={() => setOpenActionRow((prev) => (prev === apt.name ? null : apt.name))}
                      disabled={!!actionLoading}
                      className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      aria-label="Actions"
                    >
                      <span className="sr-only">Actions</span>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>
                    {openActionRow === apt.name && (
                      <div className="absolute right-0 top-full mt-1 z-10 min-w-[180px] rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                        {canCancel(apt.status) && (
                          <button
                            type="button"
                            onClick={() => handleCancel(apt)}
                            className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          >
                            Cancel
                          </button>
                        )}
                        {canConfirm(apt.status) && (
                          <button
                            type="button"
                            onClick={() => handleConfirm(apt)}
                            className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          >
                            Confirm
                          </button>
                        )}
                        {canCancel(apt.status) && (
                          <button
                            type="button"
                            onClick={() => handleReschedule(apt)}
                            className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          >
                            Reschedule
                          </button>
                        )}
                        {canCancel(apt.status) && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleCreateVitalSign(apt)}
                              className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                            >
                              Create Vital Sign
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCreatePatientVisit(apt)}
                              disabled={actionLoading === apt.name}
                              className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                            >
                              {actionLoading === apt.name ? 'Creating…' : 'Create Patient Visit'}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {rescheduleAppointment && (
      <RescheduleAppointmentModal
        appointment={rescheduleAppointment}
        onClose={() => setRescheduleAppointment(null)}
        onSuccess={() => setRefreshTrigger((t) => t + 1)}
      />
    )}
    </>
  )
}

