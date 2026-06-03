// import { useState, useEffect, useRef } from 'react'
// import {
//   fetchPractitionerAppointments,
//   fetchAllAppointments,
//   updateAppointmentStatus,
//   createEncounterFromAppointment,
//   getVitalSignsNewUrl,
//   getPatientVisitFormUrl,
//   type Appointment
// } from '../../services/appointments'
// import { StatusPill } from '../ui/StatusPill'
// import { DetailSlideOver } from '../ui/DetailSlideOver'
// import { RescheduleAppointmentModal } from './RescheduleAppointmentModal'
// import { AppointmentDetailPanel } from './AppointmentDetailPanel'
// import { PortalActionsMenu } from '../ui/PortalActionsMenu'
// import { ConfirmDialog } from '../ui/ConfirmDialog'
// import { toast } from '../../hooks/useToast'

// const statusColors: Record<string, string> = {
//   'Scheduled': 'info',
//   'Open': 'warning',
//   'Confirmed': 'success',
//   'Checked In': 'success',
//   'Checked Out': 'default',
//   'Closed': 'default',
//   'Cancelled': 'danger',
//   'No Show': 'danger'
// }

// const ALL_STATUSES = ['Scheduled', 'Open', 'Confirmed', 'Checked In', 'Checked Out', 'Closed', 'Cancelled', 'No Show']

// interface AppointmentListProps {
//   refreshKey?: string | number
//   showAll?: boolean
//   patient?: string
//   onAddAppointment?: () => void
// }

// interface LeaveDetails {
//   leave_type: string
//   status: string
//   from_date: string
//   to_date: string
// }

// interface AvailabilityResponse {
//   available: boolean
//   leave_details?: LeaveDetails
// }

// const ACTIVE_STATUSES = ['Scheduled', 'Open', 'Confirmed', 'Checked In']
// const CAN_CONFIRM_STATUSES = ['Open', 'Scheduled']

// // Stub — replace with your real API call
// const sendAppointmentReminder = async (appointmentName: string): Promise<void> => {
//   await new Promise((res) => setTimeout(res, 600))
//   console.log('Reminder sent for', appointmentName)
// }

// // New function to check if practitioner is on leave on a specific date
// const checkPractitionerAvailability = async (practitioner: string, date: string): Promise<AvailabilityResponse> => {
//   try {
//     const response = await fetch(
//       `/api/method/healthcare.api.patient_appointment.check_practitioner_availability?practitioner=${encodeURIComponent(practitioner)}&date=${encodeURIComponent(date)}`
//     )
//     const resData = await response.json()
//     return resData?.message ?? { available: true }
//   } catch (error) {
//     console.error('Failed to check practitioner availability:', error)
//     return { available: true } // Default to available if check fails
//   }
// }

// // Tooltip component for leave information
// const LeaveTooltip = ({ leaveDetails, children }: { leaveDetails: LeaveDetails; children: React.ReactNode }) => {
//   const [showTooltip, setShowTooltip] = useState(false)
//   const tooltipRef = useRef<HTMLDivElement>(null)

//   const formatDate = (dateStr: string) => {
//     if (!dateStr) return 'Unknown'
//     return new Date(dateStr).toLocaleDateString('en-US', {
//       year: 'numeric',
//       month: 'short',
//       day: 'numeric'
//     })
//   }

//   return (
//     <div 
//       className="relative inline-block"
//       onMouseEnter={() => setShowTooltip(true)}
//       onMouseLeave={() => setShowTooltip(false)}
//     >
//       {children}
//       {showTooltip && (
//         <>
//           {/* Arrow */}
//           <div 
//             className="absolute z-20 left-1/2 transform -translate-x-1/2 -bottom-2 
//                        w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-slate-800"
//           />
//           {/* Tooltip content */}
//           <div 
//             ref={tooltipRef}
//             className="absolute z-20 left-1/2 transform -translate-x-1/2 mt-2 
//                         bg-red-200 rounded-lg shadow-xl p-3 min-w-[200px]"
//             style={{ bottom: '100%', marginBottom: '8px' }}
//           >
//             <div className="text-xs font-semibold text-red-300 mb-1">On Leave</div>
//             <div className="text-xs space-y-1">
//               <div><span className="text-slate-400">Leave Type:</span> {leaveDetails.leave_type}</div>
//               <div><span className="text-slate-400">Status:</span> {leaveDetails.status}</div>
//               <div><span className="text-slate-400">From:</span> {formatDate(leaveDetails.from_date)}</div>
//               <div><span className="text-slate-400">To:</span> {formatDate(leaveDetails.to_date)}</div>
//             </div>
//           </div>
//         </>
//       )}
//     </div>
//   )
// }

// // Component to show practitioner status with red circle/dot for unavailable
// const PractitionerStatusIndicator = ({ available, leaveDetails }: { available: boolean; leaveDetails?: LeaveDetails }) => {
//   if (!available) {
//     return (
//       <LeaveTooltip leaveDetails={leaveDetails!}>
//         <div className="flex items-center gap-2 cursor-help">
//           <div className="relative">
//             <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
//             <div className="absolute inset-0 w-2.5 h-2.5 bg-red-500 rounded-full opacity-75 animate-ping" />
//           </div>
//           <span className="text-sm text-red-600 font-medium">Not Available</span>
//         </div>
//       </LeaveTooltip>
//     )
//   }
//   return (
//     <div className="flex items-center gap-2">
//       <div className="w-2.5 h-2.5 bg-green-500 rounded-full" />
//       <span className="text-sm text-green-600">Available</span>
//     </div>
//   )
// }

// export const AppointmentList = ({ refreshKey, showAll = false, patient }: AppointmentListProps) => {
//   const [appointments, setAppointments] = useState<Appointment[]>([])
//   const [loading, setLoading] = useState(true)
//   const [error, setError] = useState<Error | null>(null)
//   const [openActionRow, setOpenActionRow] = useState<string | null>(null)
//   const [actionLoading, setActionLoading] = useState<string | null>(null)
//   const [refreshTrigger, setRefreshTrigger] = useState(0)
//   const [rescheduleAppointment, setRescheduleAppointment] = useState<Appointment | null>(null)
//   const [detailApt, setDetailApt] = useState<Appointment | null>(null)
//   const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null)
//   const [cancelLoading, setCancelLoading] = useState(false)
//   const [practitionerAvailability, setPractitionerAvailability] = useState<Record<string, AvailabilityResponse>>({})
//   const [availabilityLoading, setAvailabilityLoading] = useState<Record<string, boolean>>({})
//   const menuRef = useRef<HTMLDivElement>(null)

//   // Filters
//   const [filterStatus, setFilterStatus] = useState<string>('')
//   const [filterDateFrom, setFilterDateFrom] = useState<string>('')
//   const [filterDateTo, setFilterDateTo] = useState<string>('')
//   const [bulkSending, setBulkSending] = useState(false)

//   useEffect(() => {
//     const loadAppointments = async () => {
//       try {
//         setLoading(true)
//         setError(null)
//         const response = showAll
//           ? await fetchAllAppointments(50, 0, undefined, patient)
//           : await fetchPractitionerAppointments(50, 0)
//         setAppointments(response)
        
//         // Check availability for each practitioner in the appointments
//         for (const apt of response) {
//           if (apt.practitioner && apt.appointment_date && !practitionerAvailability[apt.name]) {
//             setAvailabilityLoading(prev => ({ ...prev, [apt.name]: true }))
//             checkPractitionerAvailability(apt.practitioner, apt.appointment_date)
//               .then(availabilityResponse => {
//                 setPractitionerAvailability(prev => ({ ...prev, [apt.name]: availabilityResponse }))
//               })
//               .finally(() => {
//                 setAvailabilityLoading(prev => ({ ...prev, [apt.name]: false }))
//               })
//           }
//         }
//       } catch (err) {
//         setError(err instanceof Error ? err : new Error('Failed to fetch appointments'))
//       } finally {
//         setLoading(false)
//       }
//     }
//     loadAppointments()
//   }, [refreshKey, showAll, patient, refreshTrigger])

//   useEffect(() => {
//     const handleClickOutside = (e: MouseEvent) => {
//       const el = e.target as HTMLElement
//       if (el.closest('[data-portal-actions-menu]')) return
//       if (el.closest('button[aria-label="Actions"]')) return
//       if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
//         setOpenActionRow(null)
//       }
//     }
//     document.addEventListener('mousedown', handleClickOutside)
//     return () => document.removeEventListener('mousedown', handleClickOutside)
//   }, [])

//   // Client-side filtering
//   const filtered = appointments.filter((apt) => {
//     if (filterStatus && apt.status !== filterStatus) return false
//     if (filterDateFrom && apt.appointment_date && apt.appointment_date < filterDateFrom) return false
//     if (filterDateTo && apt.appointment_date && apt.appointment_date > filterDateTo) return false
//     return true
//   })

//   const reminderEligible = filtered.filter((apt) => apt.patient)

//   const getStatusColor = (status?: string): string => {
//     if (!status) return 'default'
//     const s = status.toLowerCase()
//     if (s.includes('scheduled')) return 'info'
//     if (s.includes('open') || s.includes('confirmed')) return 'warning'
//     if (s.includes('checked in')) return 'success'
//     if (s.includes('checked out') || s.includes('closed')) return 'default'
//     if (s.includes('cancelled') || s.includes('no show')) return 'danger'
//     return statusColors[status] || 'default'
//   }

//   const formatDateTime = (date?: string, time?: string): string => {
//     if (!date) return '-'
//     const dateStr = new Date(date).toLocaleDateString()
//     return time ? `${dateStr} ${time}` : dateStr
//   }

//   const canCancel = (status?: string) => status && ACTIVE_STATUSES.includes(status)
//   const canConfirm = (status?: string) => status && CAN_CONFIRM_STATUSES.includes(status)

//   const handleCancel = (apt: Appointment) => {
//     setOpenActionRow(null)
//     setCancelTarget(apt)
//   }

//   const handleConfirmCancel = async () => {
//     if (!cancelTarget) return
//     setCancelLoading(true)
//     setActionLoading(cancelTarget.name)
//     try {
//       await updateAppointmentStatus(cancelTarget.name, 'Cancelled')
//       setRefreshTrigger((t) => t + 1)
//       toast.success('Appointment cancelled successfully')
//       setCancelTarget(null)
//     } catch (e) {
//       toast.error(e instanceof Error ? e.message : 'Failed to cancel appointment')
//     } finally {
//       setCancelLoading(false)
//       setActionLoading(null)
//     }
//   }

//   const handleConfirm = async (apt: Appointment) => {
//     setActionLoading(apt.name)
//     setOpenActionRow(null)
//     try {
//       await updateAppointmentStatus(apt.name, 'Confirmed')
//       setRefreshTrigger((t) => t + 1)
//     } catch (e) {
//       window.alert(e instanceof Error ? e.message : 'Failed to confirm')
//     } finally {
//       setActionLoading(null)
//     }
//   }

//   const handleReschedule = (apt: Appointment) => {
//     setOpenActionRow(null)
//     setRescheduleAppointment(apt)
//   }

//   const handleCreateVitalSign = (apt: Appointment) => {
//     setOpenActionRow(null)
//     if (!apt.patient) { window.alert('Patient is missing for this appointment.'); return }
//     window.open(getVitalSignsNewUrl(apt.patient, apt.name, apt.company), '_blank')
//   }

//   const handleCreatePatientVisit = async (apt: Appointment) => {
//     setActionLoading(apt.name)
//     setOpenActionRow(null)
//     try {
//       const visitName = await createEncounterFromAppointment(apt.name)
//       window.open(getPatientVisitFormUrl(visitName), '_blank')
//       setRefreshTrigger((t) => t + 1)
//     } catch (e) {
//       window.alert(e instanceof Error ? e.message : 'Failed to create Patient Visit')
//     } finally {
//       setActionLoading(null)
//     }
//   }

//   const handleSendReminder = async (apt: Appointment) => {
//     setOpenActionRow(null)
//     setActionLoading(apt.name)
//     try {
//       await sendAppointmentReminder(apt.name)
//       toast.success(`Reminder sent for ${apt.patient_name || apt.patient}`)
//     } catch (e) {
//       toast.error(e instanceof Error ? e.message : 'Failed to send reminder')
//     } finally {
//       setActionLoading(null)
//     }
//   }

//   const handleBulkSendReminders = async () => {
//     if (reminderEligible.length === 0) {
//       toast.error('No appointments to send reminders for')
//       return
//     }
//     if (!window.confirm(`Send reminders to all ${reminderEligible.length} patient(s) in the current view?`)) return
//     setBulkSending(true)
//     let successCount = 0
//     let failCount = 0
//     for (const apt of reminderEligible) {
//       try {
//         await sendAppointmentReminder(apt.name)
//         successCount++
//       } catch {
//         failCount++
//       }
//     }
//     setBulkSending(false)
//     if (failCount === 0) {
//       toast.success(`Reminders sent to ${successCount} patient(s)`)
//     } else {
//       toast.error(`${successCount} sent, ${failCount} failed`)
//     }
//   }

//   const clearFilters = () => {
//     setFilterStatus('')
//     setFilterDateFrom('')
//     setFilterDateTo('')
//   }

//   const hasActiveFilters = filterStatus || filterDateFrom || filterDateTo

//   if (loading) {
//     return <div className="flex items-center justify-center p-8 text-slate-600">Loading appointments...</div>
//   }

//   if (error) {
//     return (
//       <div className="flex flex-col items-center justify-center p-8">
//         <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
//           <h3 className="text-red-800 font-semibold mb-2">Error Loading Appointments</h3>
//           <p className="text-red-700 text-sm">{error.message}</p>
//         </div>
//       </div>
//     )
//   }

//   return (
//     <>
//       {/* ── Filters + Bulk Reminder bar ── */}
//       <div className="mb-3 space-y-2">
//         {/* Top row: filters */}
//         <div className="flex flex-wrap items-end gap-2">
//           {/* Date From */}
//           <div className="flex flex-col gap-1">
//             <label className="text-xs font-medium text-slate-500">From</label>
//             <input
//               type="date"
//               value={filterDateFrom}
//               onChange={(e) => setFilterDateFrom(e.target.value)}
//               className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//             />
//           </div>
//           {/* Date To */}
//           <div className="flex flex-col gap-1">
//             <label className="text-xs font-medium text-slate-500">To</label>
//             <input
//               type="date"
//               value={filterDateTo}
//               onChange={(e) => setFilterDateTo(e.target.value)}
//               className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//             />
//           </div>
//           {/* Status */}
//           <div className="flex flex-col gap-1">
//             <label className="text-xs font-medium text-slate-500">Status</label>
//             <select
//               value={filterStatus}
//               onChange={(e) => setFilterStatus(e.target.value)}
//               className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//             >
//               <option value="">All statuses</option>
//               {ALL_STATUSES.map((s) => (
//                 <option key={s} value={s}>{s}</option>
//               ))}
//             </select>
//           </div>
//           {/* Clear */}
//           {hasActiveFilters && (
//             <button
//               type="button"
//               onClick={clearFilters}
//               className="self-end px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200"
//             >
//               Clear
//             </button>
//           )}

//           {/* Spacer + Bulk Reminder */}
//           <div className="flex-1" />
//           <button
//             type="button"
//             onClick={handleBulkSendReminders}
//             disabled={bulkSending || reminderEligible.length === 0}
//             className="self-end inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap"
//           >
//             {bulkSending ? (
//               <>
//                 <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
//                   <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
//                   <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
//                 </svg>
//                 Sending…
//               </>
//             ) : (
//               <>
//                 <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
//                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
//                 </svg>
//                 Bulk Send Reminders{reminderEligible.length > 0 ? ` (${reminderEligible.length})` : ''}
//               </>
//             )}
//           </button>
//         </div>

//         {/* Result count */}
//         <p className="text-xs text-slate-500">
//           Showing {filtered.length} of {appointments.length} appointment{appointments.length !== 1 ? 's' : ''}
//           {hasActiveFilters && ' (filtered)'}
//         </p>
//       </div>

//       {/* ── Table ── */}
//       {filtered.length === 0 ? (
//         <div className="flex items-center justify-center p-8 text-slate-500">
//           {appointments.length === 0 ? 'No appointments found' : 'No appointments match the current filters'}
//         </div>
//       ) : (
//         <div className="min-w-full">
//           <table className="w-full min-w-[1000px]">
//             <thead className="bg-slate-50 border-b border-slate-200">
//               <tr>
//                 <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Appointment ID</th>
//                 <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Patient</th>
//                 {showAll && (
//                   <>
//                     <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Practitioner</th>
//                     <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Practitioner Status</th>
//                   </>
//                 )}
//                 <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Date & Time</th>
//                 <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Type</th>
//                 <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Status</th>
//                 <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[100px]">Actions</th>
//               </tr>
//             </thead>
//             <tbody className="divide-y divide-slate-200">
//               {filtered.map((apt) => {
//                 const availabilityResponse = practitionerAvailability[apt.name]
//                 const isAvailable = availabilityResponse?.available ?? true
//                 const leaveDetails = availabilityResponse?.leave_details
//                 const isLoadingAvailability = availabilityLoading[apt.name]
//                 const showPractitionerStatus = showAll && apt.practitioner
                
//                 return (
//                   <tr key={apt.name} className="hover:bg-slate-50">
//                     <td
//                       className="px-4 py-3 text-sm font-medium text-primary cursor-pointer hover:underline"
//                       onClick={() => setDetailApt(apt)}
//                     >
//                       {apt.name}
//                     </td>
//                     <td className="px-4 py-3 text-sm text-slate-700">{apt.patient_name || apt.patient || '-'}</td>
//                     {showAll && (
//                       <>
//                         <td className="px-4 py-3 text-sm text-slate-700">{apt.practitioner_name || apt.practitioner || '-'}</td>
//                         <td className="px-4 py-3">
//                           {showPractitionerStatus && (
//                             isLoadingAvailability ? (
//                               <div className="flex items-center gap-2">
//                                 <div className="w-2.5 h-2.5 bg-slate-300 rounded-full animate-pulse" />
//                                 <span className="text-sm text-slate-400">Checking...</span>
//                               </div>
//                             ) : (
//                               <PractitionerStatusIndicator available={isAvailable} leaveDetails={leaveDetails} />
//                             )
//                           )}
//                           {!apt.practitioner && (
//                             <span className="text-sm text-slate-400">No practitioner assigned</span>
//                           )}
//                         </td>
//                       </>
//                     )}
//                     <td className="px-4 py-3 text-sm text-slate-700">
//                       {formatDateTime(apt.appointment_date, apt.appointment_time)}
//                     </td>
//                     <td className="px-4 py-3 text-sm text-slate-700">{apt.appointment_type || '-'}</td>
//                     <td className="px-4 py-3">
//                       {apt.status
//                         ? <StatusPill status={apt.status} color={getStatusColor(apt.status)} />
//                         : <span className="text-sm text-slate-500">-</span>}
//                     </td>
//                     <td className="px-4 py-2 align-middle">
//                       <div className="relative" ref={openActionRow === apt.name ? menuRef : undefined}>
//                         <button
//                           type="button"
//                           onClick={() => setOpenActionRow((prev) => (prev === apt.name ? null : apt.name))}
//                           disabled={!!actionLoading}
//                           className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
//                           aria-label="Actions"
//                         >
//                           {actionLoading === apt.name ? (
//                             <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
//                               <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
//                               <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
//                             </svg>
//                           ) : (
//                             <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
//                               <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
//                             </svg>
//                           )}
//                         </button>
//                         <PortalActionsMenu
//                           open={openActionRow === apt.name}
//                           onClose={() => setOpenActionRow(null)}
//                           triggerRef={menuRef}
//                           minWidth={180}
//                         >
//                           {canCancel(apt.status) && (
//                             <button type="button" onClick={() => handleCancel(apt)}
//                               className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
//                               Cancel
//                             </button>
//                           )}
//                           {canConfirm(apt.status) && (
//                             <button type="button" onClick={() => handleConfirm(apt)}
//                               className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
//                               Confirm
//                             </button>
//                           )}
//                           {canCancel(apt.status) && (
//                             <button type="button" onClick={() => handleReschedule(apt)}
//                               className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
//                               Reschedule
//                             </button>
//                           )}
//                           {apt.patient && (
//                             <>
//                               <button type="button" onClick={() => handleCreateVitalSign(apt)}
//                                 className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
//                                 Create Vital Sign
//                               </button>
//                               <button type="button" onClick={() => handleCreatePatientVisit(apt)}
//                                 disabled={actionLoading === apt.name}
//                                 className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50">
//                                 {actionLoading === apt.name ? 'Creating…' : 'Create Patient Visit'}
//                               </button>
//                             </>
//                           )}
//                           {apt.patient && (
//                             <button type="button" onClick={() => handleSendReminder(apt)}
//                               disabled={actionLoading === apt.name}
//                               className="block w-full text-left px-3 py-2 text-sm text-primary font-medium hover:bg-primary/5 disabled:opacity-50 border-t border-slate-100 mt-1">
//                               Send Reminder
//                             </button>
//                           )}
//                         </PortalActionsMenu>
//                       </div>
//                     </td>
//                   </tr>
//                 )
//               })}
//             </tbody>
//           </table>
//         </div>
//       )}

//       {rescheduleAppointment && (
//         <RescheduleAppointmentModal
//           appointment={rescheduleAppointment}
//           onClose={() => setRescheduleAppointment(null)}
//           onSuccess={() => setRefreshTrigger((t) => t + 1)}
//         />
//       )}

//       {detailApt && (
//         <DetailSlideOver
//           title={detailApt.temporary_patient_name && !detailApt.patient ? '⚡ Walk-in Appointment' : 'Appointment'}
//           subtitle={detailApt.patient_name || detailApt.temporary_patient_name || detailApt.name}
//           onClose={() => setDetailApt(null)}
//         >
//           <AppointmentDetailPanel name={detailApt.name} />
//         </DetailSlideOver>
//       )}

//       <ConfirmDialog
//         open={!!cancelTarget}
//         variant="danger"
//         title="Cancel Appointment"
//         message={
//           cancelTarget
//             ? `Are you sure you want to cancel the appointment for ${
//                 cancelTarget.patient_name || cancelTarget.temporary_patient_name || cancelTarget.name
//               }? This action cannot be undone.`
//             : ''
//         }
//         confirmLabel="Yes, Cancel Appointment"
//         cancelLabel="Keep Appointment"
//         loading={cancelLoading}
//         onConfirm={handleConfirmCancel}
//         onCancel={() => setCancelTarget(null)}
//       />
//     </>
//   )
// }


import { useCardFilters, useDashboardCompactClinical } from '../../contexts/CardFilterContext'
import {
  CardRowMetaHint,
  dashboardCardRowHoverClass,
  type CardMetaField,
} from '../ui/dashboardCardListing'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  fetchPractitionerAppointments,
  fetchAllAppointments,
  updateAppointmentStatus,
  createEncounterFromAppointment,
  getVitalSignsNewUrl,
  getPatientVisitFormUrl,
  isWalkInAppointment,
  linkWalkInAppointmentToPatient,
  sendAppointmentReminder as sendAppointmentReminderAPI,
  sendAppointmentRemindersBulk,
  type Appointment,
  type AppointmentPage,
  type ReminderChannel,
} from '../../services/appointments'
import { CreatePatientModal } from '../patients/CreatePatientModal'
import { CreatePatientVisitModal } from '../patientVisits/CreatePatientVisitModal'
import { StatusPill } from '../ui/StatusPill'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { RescheduleAppointmentModal } from './RescheduleAppointmentModal'
import { AppointmentDetailPanel } from './AppointmentDetailPanel'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { toast } from '../../hooks/useToast'
import { MarkPatientArrivedModal } from './MarkPatientArrivedModal'
import { MarkPatientCheckedOutModal } from './MarkPatientCheckedOutModal'
import { AppointmentCreateSalesOrderModal } from './AppointmentCreateSalesOrderModal'
import { AppointmentPaymentModal } from './AppointmentPaymentModal'
import { PaginationControls, DEFAULT_PAGE_SIZE, type PageSize } from '../ui/PaginationControls'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import {
  fetchHealthcarePractitioners,
  getCurrentUserPractitioner,
  type LinkFieldOption,
} from '../../services/common'

const statusColors: Record<string, string> = {
  'Scheduled': 'info',
  'Open': 'warning',
  'Confirmed': 'success',
  'Checked In': 'success',
  'Patient Arrived': 'success',
  'Checked Out': 'default',
  'Postponed': 'warning',
  'Closed': 'default',
  'Cancelled': 'danger',
  'No Show': 'danger'
}

const ALL_STATUSES = ['Scheduled', 'Open', 'Confirmed', 'Checked In', 'Patient Arrived', 'Checked Out', 'Postponed', 'Closed', 'Cancelled', 'No Show']

const FILTER_LABEL_CLASS = 'text-xs font-medium text-slate-500 uppercase tracking-wide'
const FILTER_CONTROL_CLASS =
  'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary'

interface AppointmentListProps {
  refreshKey?: string | number
  showAll?: boolean
  /** Doctor dashboard: list uses the logged-in user's linked practitioner; dates/status live in filters */
  doctorScheduleMode?: boolean
  /** Dashboard card preview: ID, date/time, patient (if none selected), status only */
  compact?: boolean
  patient?: string
  onAddAppointment?: () => void
  onPatientClick?: (patient: string) => void
  /** Reception: walk-in actions (register, create visit, patient arrived) in the ⋮ menu. */
  receptionWalkInActions?: boolean
}

interface LeaveDetails {
  leave_type: string
  status: string
  from_date: string
  to_date: string
}

interface AvailabilityResponse {
  available: boolean
  leave_details?: LeaveDetails
}

const ACTIVE_STATUSES = ['Scheduled', 'Open', 'Confirmed', 'Checked In', 'Patient Arrived']
const CAN_CONFIRM_STATUSES = ['Open', 'Scheduled']
const CAN_POSTPONE_STATUSES = ['Scheduled', 'Open', 'Confirmed', 'Checked In']
/** Reception can mark arrived from these statuses (DocType already includes "Patient Arrived"). */
const CAN_MARK_ARRIVED_STATUSES = ['Scheduled', 'Open', 'Confirmed', 'Checked In']
/** Reception can check out after patient has arrived or checked in. */
const CAN_MARK_CHECKED_OUT_STATUSES = ['Patient Arrived', 'Checked In']

function appointmentCardMetaFields(apt: Appointment): readonly CardMetaField[] {
  const fields: CardMetaField[] = [
    ['Appointment ID', apt.name],
    ['Type', apt.appointment_type],
    ['Practitioner', apt.practitioner_name || apt.practitioner],
    ['Department', apt.department],
    ['Cost center', apt.cost_center],
    ['Service unit', apt.service_unit],
    ['Patient', apt.patient_name || apt.patient],
    ['Notes', apt.notes],
  ]
  if (isWalkInAppointment(apt)) {
    fields.push(['Walk-in name', apt.temporary_patient_name], ['Walk-in mobile', apt.temporary_mobile_no])
  }
  if (apt.sales_order) fields.push(['Sales order', apt.sales_order])
  if (apt.ref_sales_invoice) fields.push(['Sales invoice', apt.ref_sales_invoice])
  return fields
}

const CHANNEL_OPTIONS: { value: ReminderChannel; label: string; icon: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { value: 'sms', label: 'SMS', icon: '📱' },
  { value: 'email', label: 'Email', icon: '📧' },
]

// New function to check if practitioner is on leave on a specific date
const checkPractitionerAvailability = async (practitioner: string, date: string): Promise<AvailabilityResponse> => {
  try {
    const response = await fetch(
      `/api/method/healthcare.api.patient_appointment.check_practitioner_availability?practitioner=${encodeURIComponent(practitioner)}&date=${encodeURIComponent(date)}`
    )
    const resData = await response.json()
    return resData?.message ?? { available: true }
  } catch (error) {
    console.error('Failed to check practitioner availability:', error)
    return { available: true } // Default to available if check fails
  }
}

// Tooltip component for leave information
const LeaveTooltip = ({ leaveDetails, children }: { leaveDetails: LeaveDetails; children: React.ReactNode }) => {
  const [showTooltip, setShowTooltip] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'Unknown'
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {children}
      {showTooltip && (
        <>
          {/* Arrow */}
          <div 
            className="absolute z-20 left-1/2 transform -translate-x-1/2 -bottom-2 
                       w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-slate-800"
          />
          {/* Tooltip content */}
          <div 
            ref={tooltipRef}
            className="absolute z-20 left-1/2 transform -translate-x-1/2 mt-2 
                        bg-red-200 rounded-lg shadow-xl p-3 min-w-[200px]"
            style={{ bottom: '100%', marginBottom: '8px' }}
          >
            <div className="text-xs font-semibold text-red-300 mb-1">On Leave</div>
            <div className="text-xs space-y-1">
              <div><span className="text-slate-400">Leave Type:</span> {leaveDetails.leave_type}</div>
              <div><span className="text-slate-400">Status:</span> {leaveDetails.status}</div>
              <div><span className="text-slate-400">From:</span> {formatDate(leaveDetails.from_date)}</div>
              <div><span className="text-slate-400">To:</span> {formatDate(leaveDetails.to_date)}</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Component to show practitioner status with red circle/dot for unavailable
const PractitionerStatusIndicator = ({ available, leaveDetails }: { available: boolean; leaveDetails?: LeaveDetails }) => {
  if (!available) {
    return (
      <LeaveTooltip leaveDetails={leaveDetails!}>
        <div className="flex items-center gap-2 cursor-help">
          <div className="relative">
            <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
            <div className="absolute inset-0 w-2.5 h-2.5 bg-red-500 rounded-full opacity-75 animate-ping" />
          </div>
          <span className="text-sm text-red-600 font-medium">Not Available</span>
        </div>
      </LeaveTooltip>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <div className="w-2.5 h-2.5 bg-green-500 rounded-full" />
      <span className="text-sm text-green-600">Available</span>
    </div>
  )
}

export const AppointmentList = ({
  refreshKey,
  showAll = false,
  doctorScheduleMode = false,
  compact = false,
  patient,
  onPatientClick,
  receptionWalkInActions = false,
}: AppointmentListProps) => {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [rescheduleAppointment, setRescheduleAppointment] = useState<Appointment | null>(null)
  const [detailApt, setDetailApt] = useState<Appointment | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null)
  const [arrivedTarget, setArrivedTarget] = useState<Appointment | null>(null)
  const [checkoutTarget, setCheckoutTarget] = useState<Appointment | null>(null)
  const [billingTarget, setBillingTarget] = useState<Appointment | null>(null)
  const [paymentTarget, setPaymentTarget] = useState<Appointment | null>(null)
  const [registerWalkInTarget, setRegisterWalkInTarget] = useState<Appointment | null>(null)
  /** After registration, auto mark arrived and create patient visit. */
  const [registerThenArrive, setRegisterThenArrive] = useState(false)
  const [visitFromAppointment, setVisitFromAppointment] = useState<Appointment | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [practitionerAvailability, setPractitionerAvailability] = useState<Record<string, AvailabilityResponse>>({})
  const [availabilityLoading, setAvailabilityLoading] = useState<Record<string, boolean>>({})
  const menuRef = useRef<HTMLDivElement>(null)

  // Filters (server-side)
  const cardFilters = useCardFilters()
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = cardFilters !== undefined ? cardFilters : showFiltersInternal
  const isInsideCard = cardFilters !== undefined
  const compactClinical = useDashboardCompactClinical()
  /** Dashboard card tiles: date, status, patient (if none selected); details in ⓘ popover. */
  const cardCompactLayout = compactClinical || (compact && isInsideCard)
  /** Full table in card only when not using compact clinical layout (e.g. wide reception tile). */
  const cardHorizontalScroll = isInsideCard && !cardCompactLayout
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterPractitioner, setFilterPractitioner] = useState<string>('')
  const [filterDateFrom, setFilterDateFrom] = useState<string>('')
  const [filterDateTo, setFilterDateTo] = useState<string>('')
  const [bulkSending, setBulkSending] = useState(false)
  const [bulkChannelMenuOpen, setBulkChannelMenuOpen] = useState(false)
  const bulkMenuRef = useRef<HTMLDivElement>(null)

  // Pagination & search
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE)
  const [totalCount, setTotalCount] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [myPractitionerId, setMyPractitionerId] = useState<string | null>(null)
  const [linkedPractitionerName, setLinkedPractitionerName] = useState<string>('')
  const [schedulePractitionerResolved, setSchedulePractitionerResolved] = useState(false)
  const [practitionerDropdownOptions, setPractitionerDropdownOptions] = useState<LinkFieldOption[]>([])
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const defaultPractitionerFilterApplied = useRef(false)

  const useAllAppointmentsApi = Boolean(showAll || doctorScheduleMode)
  const showPractitionerColumn = useAllAppointmentsApi

  useEffect(() => {
    if (!doctorScheduleMode) {
      setSchedulePractitionerResolved(false)
      setMyPractitionerId(null)
      return
    }
    setSchedulePractitionerResolved(false)
    getCurrentUserPractitioner()
      .then(setMyPractitionerId)
      .finally(() => setSchedulePractitionerResolved(true))
  }, [doctorScheduleMode])

  useEffect(() => {
    if (!doctorScheduleMode || !myPractitionerId) {
      setLinkedPractitionerName('')
      return
    }
    let cancelled = false
    fetch(`/api/resource/Healthcare Practitioner/${encodeURIComponent(myPractitionerId)}`, {
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return
        const n = j?.data?.practitioner_name
        setLinkedPractitionerName(typeof n === 'string' && n.trim() ? n.trim() : myPractitionerId)
      })
      .catch(() => {
        if (!cancelled) setLinkedPractitionerName(myPractitionerId)
      })
    return () => {
      cancelled = true
    }
  }, [doctorScheduleMode, myPractitionerId])

  useEffect(() => {
    if (!doctorScheduleMode || patient || !schedulePractitionerResolved) return
    if (defaultPractitionerFilterApplied.current) return
    defaultPractitionerFilterApplied.current = true
    if (!myPractitionerId) return
    setFilterPractitioner(myPractitionerId)
    fetchHealthcarePractitioners()
      .then((options) => {
        const match = options.find((p) => p.name === myPractitionerId)
        setPractitionerQuery(match?.label || linkedPractitionerName || myPractitionerId)
      })
      .catch(() => {
        setPractitionerQuery(myPractitionerId)
      })
  }, [doctorScheduleMode, patient, schedulePractitionerResolved, myPractitionerId])

  useEffect(() => {
    if (filterPractitioner !== myPractitionerId || !linkedPractitionerName) return
    setPractitionerQuery(linkedPractitionerName)
  }, [filterPractitioner, myPractitionerId, linkedPractitionerName])

  useEffect(() => {
    if (!useAllAppointmentsApi || !practitionerOpen) return
    const timeoutId = setTimeout(() => {
      fetchHealthcarePractitioners(practitionerQuery || undefined)
        .then(setPractitionerDropdownOptions)
        .catch(() => setPractitionerDropdownOptions([]))
    }, practitionerQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(timeoutId)
  }, [practitionerQuery, practitionerOpen, useAllAppointmentsApi])

  // Debounce search input
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setSearchQuery(searchInput)
      setPage(1)
    }, 400)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [searchInput])

  const handleFilterStatusChange = useCallback((v: string) => { setFilterStatus(v); setPage(1) }, [])
  const handleFilterDateFromChange = useCallback((v: string) => { setFilterDateFrom(v); setPage(1) }, [])
  const handleFilterDateToChange = useCallback((v: string) => { setFilterDateTo(v); setPage(1) }, [])

  const handlePageSizeChange = useCallback((size: PageSize) => {
    setPageSize(size)
    setPage(1)
  }, [])

  useEffect(() => {
    const loadAppointments = async () => {
      try {
        setLoading(true)
        setError(null)
        const offset = (page - 1) * pageSize

        let response: AppointmentPage

        if (useAllAppointmentsApi) {
          response = await fetchAllAppointments(
            pageSize,
            offset,
            filterStatus || undefined,
            patient,
            searchQuery || undefined,
            filterPractitioner || undefined,
            filterDateFrom || undefined,
            filterDateTo || undefined,
          )
        } else {
          response = await fetchPractitionerAppointments(
            pageSize,
            offset,
            filterStatus || undefined,
            searchQuery || undefined,
            filterDateFrom || undefined,
            filterDateTo || undefined,
          )
        }

        setAppointments(response.data)
        setTotalCount(response.total_count)

        if (!cardCompactLayout) {
          for (const apt of response.data) {
            if (apt.practitioner && apt.appointment_date && !practitionerAvailability[apt.name]) {
              setAvailabilityLoading(prev => ({ ...prev, [apt.name]: true }))
              checkPractitionerAvailability(apt.practitioner, apt.appointment_date)
                .then(availabilityResponse => {
                  setPractitionerAvailability(prev => ({ ...prev, [apt.name]: availabilityResponse }))
                })
                .finally(() => {
                  setAvailabilityLoading(prev => ({ ...prev, [apt.name]: false }))
                })
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch appointments'))
      } finally {
        setLoading(false)
      }
    }
    loadAppointments()
  }, [
    refreshKey, useAllAppointmentsApi, cardCompactLayout, patient,
    refreshTrigger, page, pageSize, filterStatus, filterPractitioner, filterDateFrom, filterDateTo, searchQuery,
  ])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('[data-portal-actions-menu]')) return
      if (el.closest('button[aria-label="Actions"]')) return
      if (!el.closest('[data-filter-dropdown]')) {
        setPractitionerOpen(false)
      }
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenActionRow(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const reminderEligible = appointments.filter((apt) => apt.patient)

  const getStatusColor = (status?: string): string => {
    if (!status) return 'default'
    const s = status.toLowerCase()
    if (s.includes('scheduled')) return 'info'
    if (s.includes('open') || s.includes('confirmed')) return 'warning'
    if (s.includes('checked in') || s.includes('patient arrived')) return 'success'
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
  const canPostpone = (status?: string) => status && CAN_POSTPONE_STATUSES.includes(status)
  const canMarkPatientArrived = (status?: string) =>
    Boolean(status && CAN_MARK_ARRIVED_STATUSES.includes(status))
  const canMarkCheckedOut = (status?: string) =>
    Boolean(status && CAN_MARK_CHECKED_OUT_STATUSES.includes(status))
  const canBillAppointment = (apt: Appointment) =>
    Boolean(showAll && apt.patient && apt.status === 'Checked Out' && !apt.invoiced)

  const canRecordAppointmentPayment = (apt: Appointment) =>
    Boolean(showAll && apt.patient && apt.ref_sales_invoice && apt.invoiced)

  const handleOpenSalesOrder = (soName: string) => {
    setOpenActionRow(null)
    window.open(`/app/sales-order/${encodeURIComponent(soName)}`, '_blank')
  }

  const handleOpenSalesInvoice = (siName: string) => {
    setOpenActionRow(null)
    window.open(`/app/sales-invoice/${encodeURIComponent(siName)}`, '_blank')
  }

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

  const handlePostpone = async (apt: Appointment) => {
    setActionLoading(apt.name)
    setOpenActionRow(null)
    try {
      await updateAppointmentStatus(apt.name, 'Postponed')
      setRefreshTrigger((t) => t + 1)
      toast.success('Appointment postponed')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to postpone appointment')
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

  const openRegisterWalkIn = (apt: Appointment, thenMarkArrived: boolean) => {
    setOpenActionRow(null)
    setRegisterThenArrive(thenMarkArrived)
    setRegisterWalkInTarget(apt)
  }

  const handleMarkPatientArrived = (apt: Appointment) => {
    setOpenActionRow(null)
    if (!apt.patient) {
      openRegisterWalkIn(apt, true)
      return
    }
    setArrivedTarget(apt)
  }

  const handleCreatePatientVisit = async (apt: Appointment) => {
    setOpenActionRow(null)
    if (!apt.patient) {
      toast.error('Register the walk-in as a patient first')
      return
    }
    if (receptionWalkInActions) {
      setVisitFromAppointment(apt)
      return
    }
    setActionLoading(apt.name)
    try {
      const visitName = await createEncounterFromAppointment(apt.name)
      window.open(getPatientVisitFormUrl(visitName), '_blank')
      setRefreshTrigger((t) => t + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create Patient Visit')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRegisterWalkInSuccess = async (patientId: string) => {
    if (!registerWalkInTarget) return
    const apt = registerWalkInTarget
    const shouldMarkArrived = registerThenArrive
    setRegisterWalkInTarget(null)
    setRegisterThenArrive(false)
    try {
      await linkWalkInAppointmentToPatient(apt.name, patientId)
      setRefreshTrigger((t) => t + 1)
      if (shouldMarkArrived) {
        const result = await updateAppointmentStatus(apt.name, 'Patient Arrived')
        if (result.patient_visit) {
          toast.success(
            `Patient registered · marked arrived · visit ${result.patient_visit} created`,
          )
        } else {
          toast.success('Patient registered and marked as arrived')
        }
      } else {
        toast.success(`Patient file created and linked to ${apt.name}`)
      }
      onPatientClick?.(patientId)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to complete walk-in registration')
    }
  }

  const handleSendReminder = async (apt: Appointment, channel: ReminderChannel) => {
    setOpenActionRow(null)
    setActionLoading(apt.name)
    const channelLabel = channel === 'whatsapp' ? 'WhatsApp' : channel === 'sms' ? 'SMS' : 'Email'
    try {
      await sendAppointmentReminderAPI(apt.name, channel)
      toast.success(`${channelLabel} reminder sent for ${apt.patient_name || apt.patient}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to send ${channelLabel} reminder`)
    } finally {
      setActionLoading(null)
    }
  }

  const handleBulkSendReminders = async (channel: ReminderChannel) => {
    if (reminderEligible.length === 0) {
      toast.error('No appointments to send reminders for')
      return
    }
    const channelLabel = channel === 'whatsapp' ? 'WhatsApp' : channel === 'sms' ? 'SMS' : 'Email'
    if (!window.confirm(`Send ${channelLabel} reminders to all ${reminderEligible.length} patient(s) in the current view?`)) return
    setBulkSending(true)
    try {
      const result = await sendAppointmentRemindersBulk(
        reminderEligible.map((a) => a.name),
        channel
      )
      if (result.failed === 0) {
        toast.success(`${channelLabel} reminders sent to ${result.sent} patient(s)`)
      } else {
        toast.error(`${result.sent} sent, ${result.failed} failed`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send reminders')
    } finally {
      setBulkSending(false)
    }
  }

  const clearFilters = () => {
    setFilterStatus('')
    setFilterPractitioner('')
    setPractitionerQuery('')
    setPractitionerOpen(false)
    setSearchInput('')
    setSearchQuery('')
    setPage(1)
    setFilterDateFrom('')
    setFilterDateTo('')
  }

  const hasActiveFilters =
    Boolean(filterStatus || filterPractitioner || filterDateFrom || filterDateTo || searchQuery)

  const practitionerFilterDisplayValue = filterPractitioner
    ? practitionerDropdownOptions.find((p) => p.name === filterPractitioner)?.label ||
      (filterPractitioner === myPractitionerId ? linkedPractitionerName : '') ||
      filterPractitioner
    : practitionerQuery

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
      <div className="flex flex-col flex-1 min-h-0 h-full">
      {doctorScheduleMode && !patient && schedulePractitionerResolved && !myPractitionerId && (
        <p className="text-xs text-amber-700 mb-2">
          No Healthcare Practitioner is linked to your user. Appointments may be empty unless you have a reception/admin role.
        </p>
      )}
      {/* Header row */}
      {!isInsideCard && (
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-xl font-semibold text-slate-900">Appointments</h2>
        <button
          type="button"
          onClick={() => setShowFiltersInternal(prev => !prev)}
          className={`p-1.5 rounded-md border transition-colors ${showFilters ? 'bg-primary/10 border-primary text-primary' : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}
          title={showFilters ? 'Hide filters' : 'Show filters'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
        </button>
      </div>
      )}

      {/* ── Filters + Bulk Reminder bar ── */}
      {showFilters && (
      <div className="mb-3 space-y-2">
        {/* Top row: filters */}
        <div className="flex flex-wrap items-end gap-3">
          {/* Search — full listing only */}
          {!cardCompactLayout && (
          <div className="flex flex-col gap-1 min-w-[180px]">
            <label className={FILTER_LABEL_CLASS}>Search</label>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Patient, practitioner, ID…"
              className={FILTER_CONTROL_CLASS}
            />
          </div>
          )}

          <div className="flex flex-col gap-1 min-w-[120px]">
            <label className={FILTER_LABEL_CLASS}>Status</label>
            <select
              value={filterStatus}
              onChange={(e) => handleFilterStatusChange(e.target.value)}
              className={FILTER_CONTROL_CLASS}
            >
              <option value="">All statuses</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {useAllAppointmentsApi && (
            <div data-filter-dropdown className="flex flex-col gap-1 min-w-[180px]">
              <label className={FILTER_LABEL_CLASS}>Practitioner</label>
              <div className="relative">
                <input
                  type="text"
                  value={practitionerFilterDisplayValue}
                  onChange={(e) => {
                    setPractitionerQuery(e.target.value)
                    setFilterPractitioner('')
                    setPractitionerOpen(true)
                    setPage(1)
                  }}
                  onFocus={() => setPractitionerOpen(true)}
                  placeholder="Search practitioner..."
                  className={`${FILTER_CONTROL_CLASS}${filterPractitioner ? ' pr-8' : ''}`}
                />
                {filterPractitioner && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label="Clear practitioner filter"
                    onClick={() => {
                      setFilterPractitioner('')
                      setPractitionerQuery('')
                      setPractitionerOpen(false)
                      setPage(1)
                    }}
                  >
                    ×
                  </button>
                )}
                {practitionerOpen && practitionerDropdownOptions.length > 0 && (
                  <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-auto">
                    {practitionerDropdownOptions.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                        onClick={() => {
                          setFilterPractitioner(p.name)
                          setPractitionerQuery(p.label || p.name)
                          setPractitionerOpen(false)
                          setPage(1)
                        }}
                      >
                        {p.label || p.name}
                        {p.name === myPractitionerId ? ' (you)' : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1 min-w-[120px]">
            <label className={FILTER_LABEL_CLASS}>From</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => handleFilterDateFromChange(e.target.value)}
              className={FILTER_CONTROL_CLASS}
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[120px]">
            <label className={FILTER_LABEL_CLASS}>To</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => handleFilterDateToChange(e.target.value)}
              className={FILTER_CONTROL_CLASS}
            />
          </div>
          
          <ClearFiltersButton onClick={clearFilters} disabled={!hasActiveFilters} />

          {/* Spacer + Bulk Reminder (full listing only) */}
          {!cardCompactLayout && (
          <>
          <div className="flex-1" />
          <div className="relative self-end" ref={bulkMenuRef}>
            <button
              type="button"
              onClick={() => setBulkChannelMenuOpen((p) => !p)}
              disabled={bulkSending || reminderEligible.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap"
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
                  <svg className="w-3 h-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </>
              )}
            </button>
            {bulkChannelMenuOpen && (
              <div className="absolute right-0 z-30 mt-1 w-48 bg-white border border-slate-200 rounded-md shadow-lg py-1">
                <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                  Choose Channel
                </div>
                {CHANNEL_OPTIONS.map((ch) => (
                  <button
                    key={ch.value}
                    type="button"
                    onClick={() => { setBulkChannelMenuOpen(false); handleBulkSendReminders(ch.value) }}
                    className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <span>{ch.icon}</span> {ch.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          </>
          )}
        </div>

        {/* Result count — full listing only */}
        {!cardCompactLayout && (
        <p className="text-xs text-slate-500">
          Showing {appointments.length} of {totalCount} appointment{totalCount !== 1 ? 's' : ''}
          {hasActiveFilters && ' (filtered)'}
        </p>
        )}
      </div>
      )}

      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div
          className={`flex-1 min-h-0 ${cardHorizontalScroll ? 'overflow-x-auto overflow-y-auto' : 'overflow-auto'}`}
          style={{ scrollbarWidth: 'thin' }}
        >
      {/* ── Table ── */}
      {appointments.length === 0 ? (
        <div className="flex items-center justify-center p-8 text-slate-500">
          {totalCount === 0 ? 'No appointments found' : 'No appointments match the current filters'}
        </div>
      ) : (
        <div className={cardHorizontalScroll ? 'inline-block min-w-full align-top' : 'min-w-full'}>
          {cardCompactLayout ? (
            <table className="w-full table-fixed">
              <colgroup>
                <col className={patient ? 'w-[48%]' : 'w-[34%]'} />
                <col className={patient ? 'w-[52%]' : 'w-[26%]'} />
                {!patient && <col className="w-[40%]" />}
              </colgroup>
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                    Date &amp; Time
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                    Status
                  </th>
                  {!patient && (
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                      Patient
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {appointments.map((apt) => (
                  <tr
                    key={apt.name}
                    className={dashboardCardRowHoverClass}
                    onClick={() => setDetailApt(apt)}
                  >
                    <td className="px-3 py-2.5 text-xs text-slate-700 align-top">
                      <span className="text-primary font-medium break-words">
                        {formatDateTime(apt.appointment_date, apt.appointment_time)}
                      </span>
                      <CardRowMetaHint fields={appointmentCardMetaFields(apt)} />
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      {apt.status ? (
                        <StatusPill status={apt.status} color={getStatusColor(apt.status)} />
                      ) : (
                        <span className="text-sm text-slate-500">-</span>
                      )}
                    </td>
                    {!patient && (
                      <td
                        className="px-3 py-2.5 text-xs text-slate-700 align-top min-w-0"
                        onClick={(e) => {
                          if (apt.patient) {
                            e.stopPropagation()
                            onPatientClick?.(apt.patient)
                          }
                        }}
                      >
                        <span
                          className={`block truncate ${apt.patient ? 'font-medium text-primary hover:underline' : ''}`}
                          title={apt.patient_name || apt.patient || apt.temporary_patient_name || undefined}
                        >
                          {apt.patient_name || apt.patient || apt.temporary_patient_name || '—'}
                          {isWalkInAppointment(apt) && (
                            <span className="ml-1 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200">
                              Walk-in
                            </span>
                          )}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
          <table
            className={
              cardHorizontalScroll
                ? 'w-max min-w-full table-auto'
                : 'w-full min-w-[1080px] table-auto'
            }
          >
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th
                  className={`px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap ${cardHorizontalScroll ? 'min-w-[7.5rem]' : 'w-[7.5rem]'}`}
                >
                  Appointment ID
                </th>
                <th
                  className={`px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap ${cardHorizontalScroll ? 'min-w-[9.5rem]' : 'w-[9.5rem]'}`}
                >
                  Date & Time
                </th>
                {!patient && (
                  <th
                    className={`px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap ${cardHorizontalScroll ? 'min-w-[10rem]' : 'w-[28%] max-w-[220px]'}`}
                  >
                    Patient
                  </th>
                )}
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap min-w-[6rem]">
                  Type
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap min-w-[8rem]">
                  Cost Center
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap min-w-[7rem]">
                  Status
                </th>
                {showPractitionerColumn && (
                  <>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap min-w-[8rem]">
                      Practitioner
                    </th>
                    {showAll && (
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap min-w-[9.5rem]">
                      Practitioner Status
                    </th>
                    )}
                  </>
                )}
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap w-[4.5rem] sticky right-0 bg-slate-50 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {appointments.map((apt) => {
                const availabilityResponse = practitionerAvailability[apt.name]
                const isAvailable = availabilityResponse?.available ?? true
                const leaveDetails = availabilityResponse?.leave_details
                const isLoadingAvailability = availabilityLoading[apt.name]
                const showPractitionerStatus = showAll && apt.practitioner
                
                return (
                  <tr
                    key={apt.name}
                    className="group hover:bg-slate-50"
                  >
                    <td
                      className="px-3 py-2.5 text-sm font-medium text-primary whitespace-nowrap cursor-pointer hover:underline"
                      onClick={() => setDetailApt(apt)}
                      title={apt.name}
                    >
                      {apt.name}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-slate-700 whitespace-nowrap">
                      {formatDateTime(apt.appointment_date, apt.appointment_time)}
                    </td>
                    {!patient && (
                      <td
                        className={`px-3 py-2.5 text-sm text-slate-700 ${cardHorizontalScroll ? 'whitespace-nowrap' : 'max-w-[220px]'}`}
                        onClick={(e) => {
                          if (apt.patient) {
                            e.stopPropagation()
                            onPatientClick?.(apt.patient)
                          }
                        }}
                      >
                        <span className={`${cardHorizontalScroll ? 'inline-flex items-center gap-1.5' : 'truncate block'} ${apt.patient ? 'font-medium text-primary hover:underline cursor-pointer' : ''}`}>
                          {apt.patient_name || apt.patient || apt.temporary_patient_name || '-'}
                          {isWalkInAppointment(apt) && (
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200">
                              Walk-in
                            </span>
                          )}
                        </span>
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-sm text-slate-700 whitespace-nowrap">{apt.appointment_type || '-'}</td>
                    <td
                      className="px-3 py-2.5 text-sm text-slate-700 whitespace-nowrap max-w-[12rem] truncate"
                      title={apt.cost_center || undefined}
                    >
                      {apt.cost_center || '-'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {apt.status
                        ? <StatusPill status={apt.status} color={getStatusColor(apt.status)} />
                        : <span className="text-sm text-slate-500">-</span>}
                    </td>
                    {showPractitionerColumn && (
                      <>
                        <td className="px-3 py-2.5 text-sm text-slate-700 whitespace-nowrap">{apt.practitioner_name || apt.practitioner || '-'}</td>
                        {showAll && (
                        <td className="px-3 py-2.5">
                          {showPractitionerStatus && (
                            isLoadingAvailability ? (
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 bg-slate-300 rounded-full animate-pulse" />
                                <span className="text-sm text-slate-400">Checking...</span>
                              </div>
                            ) : (
                              <PractitionerStatusIndicator available={isAvailable} leaveDetails={leaveDetails} />
                            )
                          )}
                          {!apt.practitioner && (
                            <span className="text-sm text-slate-400">No practitioner assigned</span>
                          )}
                        </td>
                        )}
                      </>
                    )}
                    <td className={`px-3 py-2 align-middle ${cardHorizontalScroll ? 'sticky right-0 bg-white group-hover:bg-slate-50 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]' : ''}`}>
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
                          minWidth={receptionWalkInActions && isWalkInAppointment(apt) ? 220 : 180}
                        >
                          {receptionWalkInActions && isWalkInAppointment(apt) && (
                            <>
                              <div className="px-3 py-1.5 text-[10px] font-semibold text-amber-700 uppercase tracking-wide border-b border-amber-100 bg-amber-50/80">
                                Walk-in visit
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCreatePatientVisit(apt)}
                                disabled={!apt.patient || actionLoading === apt.name}
                                className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                              >
                                Create patient visit
                              </button>
                              {canMarkPatientArrived(apt.status) && (
                                <button
                                  type="button"
                                  onClick={() => handleMarkPatientArrived(apt)}
                                  className="block w-full text-left px-3 py-2 text-sm text-emerald-800 hover:bg-emerald-50"
                                >
                                  {!apt.patient ? 'Register patient' : 'Patient arrived'}
                                </button>
                              )}
                              {canMarkCheckedOut(apt.status) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionRow(null)
                                    setCheckoutTarget(apt)
                                  }}
                                  className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                                >
                                  Check out patient
                                </button>
                              )}
                              {canBillAppointment(apt) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionRow(null)
                                    setBillingTarget(apt)
                                  }}
                                  className="block w-full text-left px-3 py-2 text-sm text-primary font-medium hover:bg-primary/5"
                                >
                                  {apt.sales_order ? 'Bill appointment…' : 'Create Sales Order…'}
                                </button>
                              )}
                              {apt.sales_order && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenSalesOrder(apt.sales_order!)}
                                  className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                                >
                                  Open Sales Order
                                </button>
                              )}
                              {apt.ref_sales_invoice && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenSalesInvoice(apt.ref_sales_invoice!)}
                                  className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                                >
                                  Open Sales Invoice
                                </button>
                              )}
                              {canRecordAppointmentPayment(apt) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionRow(null)
                                    setPaymentTarget(apt)
                                  }}
                                  className="block w-full text-left px-3 py-2 text-sm text-emerald-800 font-medium hover:bg-emerald-50"
                                >
                                  Record payment
                                </button>
                              )}
                              <div className="border-t border-slate-100 my-1" />
                            </>
                          )}
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
                          {canPostpone(apt.status) && (
                            <button type="button" onClick={() => handlePostpone(apt)}
                              className="block w-full text-left px-3 py-2 text-sm text-amber-700 hover:bg-amber-50">
                              Postpone
                            </button>
                          )}
                          {showAll && canMarkPatientArrived(apt.status) && (
                              <button
                                type="button"
                                onClick={() => handleMarkPatientArrived(apt)}
                                className="block w-full text-left px-3 py-2 text-sm text-emerald-800 hover:bg-emerald-50"
                              >
                                {!apt.patient ? 'Register patient' : 'Patient arrived'}
                              </button>
                            )}
                          {showAll &&
                            canMarkCheckedOut(apt.status) &&
                            !(receptionWalkInActions && isWalkInAppointment(apt)) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionRow(null)
                                  setCheckoutTarget(apt)
                                }}
                                className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                              >
                                Check out patient
                              </button>
                            )}
                          {canBillAppointment(apt) &&
                            !(receptionWalkInActions && isWalkInAppointment(apt)) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionRow(null)
                                  setBillingTarget(apt)
                                }}
                                className="block w-full text-left px-3 py-2 text-sm text-primary font-medium hover:bg-primary/5"
                              >
                                {apt.sales_order ? 'Bill appointment…' : 'Create Sales Order…'}
                              </button>
                            )}
                          {apt.sales_order && (
                            <button
                              type="button"
                              onClick={() => handleOpenSalesOrder(apt.sales_order!)}
                              className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                            >
                              Open Sales Order
                            </button>
                          )}
                          {apt.ref_sales_invoice && (
                            <button
                              type="button"
                              onClick={() => handleOpenSalesInvoice(apt.ref_sales_invoice!)}
                              className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                            >
                              Open Sales Invoice
                            </button>
                          )}
                          {canRecordAppointmentPayment(apt) && (
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionRow(null)
                                setPaymentTarget(apt)
                              }}
                              className="block w-full text-left px-3 py-2 text-sm text-emerald-800 font-medium hover:bg-emerald-50"
                            >
                              Record payment
                            </button>
                          )}
                          {canCancel(apt.status) && (
                            <button type="button" onClick={() => handleReschedule(apt)}
                              className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                              Reschedule
                            </button>
                          )}
                          {apt.patient && !isWalkInAppointment(apt) && (
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
                            <>
                              <div className="border-t border-slate-100 mt-1 px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                                Send Reminder
                              </div>
                              {CHANNEL_OPTIONS.map((ch) => (
                                <button
                                  key={ch.value}
                                  type="button"
                                  onClick={() => handleSendReminder(apt, ch.value)}
                                  disabled={actionLoading === apt.name}
                                  className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2"
                                >
                                  <span>{ch.icon}</span> {ch.label}
                                </button>
                              ))}
                            </>
                          )}
                        </PortalActionsMenu>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          )}
        </div>
      )}
        </div>

      {/* ── Pagination ── */}
      <PaginationControls
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        loading={loading}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
      />
      </div>
      </div>

      {arrivedTarget && (
        <MarkPatientArrivedModal
          appointment={arrivedTarget}
          onClose={() => setArrivedTarget(null)}
          onSuccess={() => setRefreshTrigger((t) => t + 1)}
          onRequiresRegistration={() => {
            const apt = arrivedTarget
            setArrivedTarget(null)
            openRegisterWalkIn(apt, true)
          }}
        />
      )}

      {checkoutTarget && (
        <MarkPatientCheckedOutModal
          appointment={checkoutTarget}
          onClose={() => setCheckoutTarget(null)}
          onSuccess={() => setRefreshTrigger((t) => t + 1)}
        />
      )}

      {billingTarget && (
        <AppointmentCreateSalesOrderModal
          appointment={billingTarget}
          onClose={() => setBillingTarget(null)}
          onRecordPayment={(result) => {
            if (result.sales_invoice) {
              setPaymentTarget({
                ...billingTarget,
                ref_sales_invoice: result.sales_invoice,
                invoiced: 1,
              })
            }
            setBillingTarget(null)
          }}
          onSuccess={(result) => {
            setRefreshTrigger((t) => t + 1)
            if (!result.sales_invoice && result.sales_order) {
              handleOpenSalesOrder(result.sales_order)
            }
          }}
        />
      )}

      {paymentTarget?.ref_sales_invoice && (
        <AppointmentPaymentModal
          appointment={paymentTarget}
          salesInvoice={paymentTarget.ref_sales_invoice}
          onClose={() => setPaymentTarget(null)}
          onSuccess={() => {
            setPaymentTarget(null)
            setRefreshTrigger((t) => t + 1)
          }}
        />
      )}

      {rescheduleAppointment && (
        <RescheduleAppointmentModal
          appointment={rescheduleAppointment}
          onClose={() => setRescheduleAppointment(null)}
          onSuccess={() => setRefreshTrigger((t) => t + 1)}
        />
      )}

      {registerWalkInTarget && (
        <CreatePatientModal
          initialName={registerWalkInTarget.temporary_patient_name || ''}
          initialMobile={registerWalkInTarget.temporary_mobile_no || ''}
          onClose={() => {
            setRegisterWalkInTarget(null)
            setRegisterThenArrive(false)
          }}
          onSuccess={handleRegisterWalkInSuccess}
        />
      )}

      {visitFromAppointment?.patient && (
        <CreatePatientVisitModal
          initialPatient={visitFromAppointment.patient}
          initialAppointment={visitFromAppointment.name}
          initialPractitioner={visitFromAppointment.practitioner}
          onClose={() => setVisitFromAppointment(null)}
          onSuccess={(visitName) => {
            toast.success(`Patient visit ${visitName} created`)
            setVisitFromAppointment(null)
            setRefreshTrigger((t) => t + 1)
            onPatientClick?.(visitFromAppointment.patient!)
          }}
        />
      )}

      {detailApt && (
        <DetailSlideOver
          title={detailApt.temporary_patient_name && !detailApt.patient ? '⚡ Walk-in Appointment' : 'Appointment'}
          subtitle={detailApt.patient_name || detailApt.temporary_patient_name || detailApt.name}
          onClose={() => setDetailApt(null)}
        >
          <AppointmentDetailPanel
            name={detailApt.name}
            receptionWalkInActions={receptionWalkInActions}
            onRegisterWalkIn={
              receptionWalkInActions && isWalkInAppointment(detailApt)
                ? () => {
                    setDetailApt(null)
                    openRegisterWalkIn(detailApt, false)
                  }
                : undefined
            }
            onCreateVisit={
              receptionWalkInActions
                ? () => {
                    setDetailApt(null)
                    handleCreatePatientVisit(detailApt)
                  }
                : undefined
            }
            onMarkArrived={
              receptionWalkInActions && canMarkPatientArrived(detailApt.status)
                ? () => {
                    setDetailApt(null)
                    handleMarkPatientArrived(detailApt)
                  }
                : undefined
            }
            onMarkCheckedOut={
              receptionWalkInActions && canMarkCheckedOut(detailApt.status)
                ? () => {
                    setDetailApt(null)
                    setCheckoutTarget(detailApt)
                  }
                : undefined
            }
          />
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