import { useState, useEffect } from 'react'
import { fetchPractitionerAppointments, fetchAllAppointments, type Appointment } from '../../services/appointments'
import { StatusPill } from '../ui/StatusPill'

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

export const AppointmentList = ({ refreshKey, showAll = false, patient, onAddAppointment }: AppointmentListProps) => {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

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
  }, [refreshKey, showAll, patient])

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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

