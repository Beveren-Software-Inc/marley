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
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { RescheduleAppointmentModal } from './RescheduleAppointmentModal'
import { AppointmentDetailPanel } from './AppointmentDetailPanel'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { toast } from '../../hooks/useToast'

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

const ALL_STATUSES = ['Scheduled', 'Open', 'Confirmed', 'Checked In', 'Checked Out', 'Closed', 'Cancelled', 'No Show']

interface AppointmentListProps {
  refreshKey?: string | number
  showAll?: boolean
  patient?: string
  onAddAppointment?: () => void
}

const ACTIVE_STATUSES = ['Scheduled', 'Open', 'Confirmed', 'Checked In']
const CAN_CONFIRM_STATUSES = ['Open', 'Scheduled']

// Stub — replace with your real API call
const sendAppointmentReminder = async (appointmentName: string): Promise<void> => {
  await new Promise((res) => setTimeout(res, 600))
  console.log('Reminder sent for', appointmentName)
}

export const AppointmentList = ({ refreshKey, showAll = false, patient }: AppointmentListProps) => {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [rescheduleAppointment, setRescheduleAppointment] = useState<Appointment | null>(null)
  const [detailApt, setDetailApt] = useState<Appointment | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterDateFrom, setFilterDateFrom] = useState<string>('')
  const [filterDateTo, setFilterDateTo] = useState<string>('')
  const [bulkSending, setBulkSending] = useState(false)

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
      const el = e.target as HTMLElement
      if (el.closest('[data-portal-actions-menu]')) return
      if (el.closest('button[aria-label="Actions"]')) return
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenActionRow(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Client-side filtering
  const filtered = appointments.filter((apt) => {
    if (filterStatus && apt.status !== filterStatus) return false
    if (filterDateFrom && apt.appointment_date && apt.appointment_date < filterDateFrom) return false
    if (filterDateTo && apt.appointment_date && apt.appointment_date > filterDateTo) return false
    return true
  })

  const reminderEligible = filtered.filter((apt) => apt.patient)

  const getStatusColor = (status?: string): string => {
    if (!status) return 'default'
    const s = status.toLowerCase()
    if (s.includes('scheduled')) return 'info'
    if (s.includes('open') || s.includes('confirmed')) return 'warning'
    if (s.includes('checked in')) return 'success'
    if (s.includes('checked out') || s.includes('closed')) return 'default'
    if (s.includes('cancelled') || s.includes('no show')) return 'danger'
    return statusColors[status] || 'default'
  }

  const formatDateTime = (date?: string, time?: string): string => {
    if (!date) return '-'
    const dateStr = new Date(date).toLocaleDateString()
    return time ? `${dateStr} ${time}` : dateStr
  }

  const canCancel = (status?: string) => status && ACTIVE_STATUSES.includes(status)
  const canConfirm = (status?: string) => status && CAN_CONFIRM_STATUSES.includes(status)

  const handleCancel = (apt: Appointment) => {
    setOpenActionRow(null)
    setCancelTarget(apt)
  }

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return
    setCancelLoading(true)
    setActionLoading(cancelTarget.name)
    try {
      await updateAppointmentStatus(cancelTarget.name, 'Cancelled')
      setRefreshTrigger((t) => t + 1)
      toast.success('Appointment cancelled successfully')
      setCancelTarget(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to cancel appointment')
    } finally {
      setCancelLoading(false)
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
    if (!apt.patient) { window.alert('Patient is missing for this appointment.'); return }
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

  const handleSendReminder = async (apt: Appointment) => {
    setOpenActionRow(null)
    setActionLoading(apt.name)
    try {
      await sendAppointmentReminder(apt.name)
      toast.success(`Reminder sent for ${apt.patient_name || apt.patient}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send reminder')
    } finally {
      setActionLoading(null)
    }
  }

  const handleBulkSendReminders = async () => {
    if (reminderEligible.length === 0) {
      toast.error('No appointments to send reminders for')
      return
    }
    if (!window.confirm(`Send reminders to all ${reminderEligible.length} patient(s) in the current view?`)) return
    setBulkSending(true)
    let successCount = 0
    let failCount = 0
    for (const apt of reminderEligible) {
      try {
        await sendAppointmentReminder(apt.name)
        successCount++
      } catch {
        failCount++
      }
    }
    setBulkSending(false)
    if (failCount === 0) {
      toast.success(`Reminders sent to ${successCount} patient(s)`)
    } else {
      toast.error(`${successCount} sent, ${failCount} failed`)
    }
  }

  const clearFilters = () => {
    setFilterStatus('')
    setFilterDateFrom('')
    setFilterDateTo('')
  }

  const hasActiveFilters = filterStatus || filterDateFrom || filterDateTo

  if (loading) {
    return <div className="flex items-center justify-center p-8 text-slate-600">Loading appointments...</div>
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Appointments</h3>
          <p className="text-red-700 text-sm">{error.message}</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* ── Filters + Bulk Reminder bar ── */}
      <div className="mb-3 space-y-2">
        {/* Top row: filters */}
        <div className="flex flex-wrap items-end gap-2">
          {/* Date From */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">From</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          {/* Date To */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">To</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          {/* Status */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">All statuses</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          {/* Clear */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="self-end px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200"
            >
              Clear
            </button>
          )}

          {/* Spacer + Bulk Reminder */}
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleBulkSendReminders}
            disabled={bulkSending || reminderEligible.length === 0}
            className="self-end inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap"
          >
            {bulkSending ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Sending…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                Bulk Send Reminders{reminderEligible.length > 0 ? ` (${reminderEligible.length})` : ''}
              </>
            )}
          </button>
        </div>

        {/* Result count */}
        <p className="text-xs text-slate-500">
          Showing {filtered.length} of {appointments.length} appointment{appointments.length !== 1 ? 's' : ''}
          {hasActiveFilters && ' (filtered)'}
        </p>
      </div>

      {/* ── Table ── */}
      {filtered.length === 0 ? (
        <div className="flex items-center justify-center p-8 text-slate-500">
          {appointments.length === 0 ? 'No appointments found' : 'No appointments match the current filters'}
        </div>
      ) : (
        <div className="min-w-full">
          <table className="w-full min-w-[900px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Appointment ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Patient</th>
                {showAll && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Practitioner</th>
                )}
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Date & Time</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[100px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map((apt) => (
                <tr key={apt.name} className="hover:bg-slate-50">
                  <td
                    className="px-4 py-3 text-sm font-medium text-primary cursor-pointer hover:underline"
                    onClick={() => setDetailApt(apt)}
                  >
                    {apt.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{apt.patient_name || apt.patient || '-'}</td>
                  {showAll && (
                    <td className="px-4 py-3 text-sm text-slate-700">{apt.practitioner_name || apt.practitioner || '-'}</td>
                  )}
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {formatDateTime(apt.appointment_date, apt.appointment_time)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{apt.appointment_type || '-'}</td>
                  <td className="px-4 py-3">
                    {apt.status
                      ? <StatusPill status={apt.status} color={getStatusColor(apt.status)} />
                      : <span className="text-sm text-slate-500">-</span>}
                  </td>
                  <td className="px-4 py-2 align-middle">
                    <div className="relative" ref={openActionRow === apt.name ? menuRef : undefined}>
                      <button
                        type="button"
                        onClick={() => setOpenActionRow((prev) => (prev === apt.name ? null : apt.name))}
                        disabled={!!actionLoading}
                        className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        aria-label="Actions"
                      >
                        {actionLoading === apt.name ? (
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                          </svg>
                        )}
                      </button>
                      <PortalActionsMenu
                        open={openActionRow === apt.name}
                        onClose={() => setOpenActionRow(null)}
                        triggerRef={menuRef}
                        minWidth={180}
                      >
                        {canCancel(apt.status) && (
                          <button type="button" onClick={() => handleCancel(apt)}
                            className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                            Cancel
                          </button>
                        )}
                        {canConfirm(apt.status) && (
                          <button type="button" onClick={() => handleConfirm(apt)}
                            className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                            Confirm
                          </button>
                        )}
                        {canCancel(apt.status) && (
                          <button type="button" onClick={() => handleReschedule(apt)}
                            className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                            Reschedule
                          </button>
                        )}
                        {apt.patient && (
                          <>
                            <button type="button" onClick={() => handleCreateVitalSign(apt)}
                              className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                              Create Vital Sign
                            </button>
                            <button type="button" onClick={() => handleCreatePatientVisit(apt)}
                              disabled={actionLoading === apt.name}
                              className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                              {actionLoading === apt.name ? 'Creating…' : 'Create Patient Visit'}
                            </button>
                          </>
                        )}
                        {apt.patient && (
                          <button type="button" onClick={() => handleSendReminder(apt)}
                            disabled={actionLoading === apt.name}
                            className="block w-full text-left px-3 py-2 text-sm text-primary font-medium hover:bg-primary/5 disabled:opacity-50 border-t border-slate-100 mt-1">
                            Send Reminder
                          </button>
                        )}
                      </PortalActionsMenu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rescheduleAppointment && (
        <RescheduleAppointmentModal
          appointment={rescheduleAppointment}
          onClose={() => setRescheduleAppointment(null)}
          onSuccess={() => setRefreshTrigger((t) => t + 1)}
        />
      )}

      {detailApt && (
        <DetailSlideOver
          title={detailApt.temporary_patient_name && !detailApt.patient ? '⚡ Walk-in Appointment' : 'Appointment'}
          subtitle={detailApt.patient_name || detailApt.temporary_patient_name || detailApt.name}
          onClose={() => setDetailApt(null)}
        >
          <AppointmentDetailPanel name={detailApt.name} />
        </DetailSlideOver>
      )}

      <ConfirmDialog
        open={!!cancelTarget}
        variant="danger"
        title="Cancel Appointment"
        message={
          cancelTarget
            ? `Are you sure you want to cancel the appointment for ${
                cancelTarget.patient_name || cancelTarget.temporary_patient_name || cancelTarget.name
              }? This action cannot be undone.`
            : ''
        }
        confirmLabel="Yes, Cancel Appointment"
        cancelLabel="Keep Appointment"
        loading={cancelLoading}
        onConfirm={handleConfirmCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </>
  )
}