// import { useEffect, useState } from 'react'
// import { createPortal } from 'react-dom'
// import {
//   fetchLongActingMedicationReminders,
//   type LongActingMedicationReminder,
// } from '../../services/medicineGiven'
// import { CreateMedicineGivenModal } from './CreateMedicineGivenModal'

// interface LongActingMedReminderListProps {
//   /** If set, only show reminders for this patient */
//   patient?: string
//   /** Number of days ahead to show "due soon" (default 7) */
//   daysAhead?: number
// }

// const statusConfig: Record<
//   LongActingMedicationReminder['status'],
//   { label: string; className: string }
// > = {
//   overdue: { label: 'Overdue', className: 'bg-red-100 text-red-800 border-red-200' },
//   due_today: { label: 'Due today', className: 'bg-amber-100 text-amber-800 border-amber-200' },
//   due_soon: { label: 'Due soon', className: 'bg-blue-100 text-blue-800 border-blue-200' },
// }

// export const LongActingMedReminderList = ({ patient, daysAhead = 7 }: LongActingMedReminderListProps) => {
//   const [reminders, setReminders] = useState<LongActingMedicationReminder[]>([])
//   const [loading, setLoading] = useState(false)
//   const [error, setError] = useState<string | null>(null)
//   const [recordingFor, setRecordingFor] = useState<LongActingMedicationReminder | null>(null)
//   const [refreshKey, setRefreshKey] = useState(0)

//   useEffect(() => {
//     const load = async () => {
//       try {
//         setLoading(true)
//         setError(null)
//         const data = await fetchLongActingMedicationReminders({
//           patient: patient || undefined,
//           days_ahead: daysAhead,
//         })
//         setReminders(data)
//       } catch (e) {
//         setError(e instanceof Error ? e.message : 'Failed to load reminders')
//         setReminders([])
//       } finally {
//         setLoading(false)
//       }
//     }

//     load()
//   }, [patient, daysAhead, refreshKey])

//   if (loading) {
//     return (
//       <div className="text-sm text-slate-600 py-4">
//         Loading long-acting medication reminders…
//       </div>
//     )
//   }

//   if (error) {
//     return (
//       <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
//         {error}
//       </div>
//     )
//   }

//   if (reminders.length === 0) {
//     return (
//       <div className="text-sm text-slate-600 py-4 text-center border border-dashed border-slate-200 rounded-lg">
//         No long-acting medication doses due in the next {daysAhead} days.
//         {patient && ' Try clearing the patient filter to see all reminders.'}
//       </div>
//     )
//   }

//   return (
//     <div className="space-y-3">
//       <p className="text-xs text-slate-500">
//         Medications with extended intervals (Q1W, Q2W, Q3W, Q4W). Record administration when the dose is given.
//       </p>
//       <div className="overflow-x-auto border border-slate-200 rounded-lg">
//         <table className="min-w-full text-sm">
//           <thead className="bg-slate-50 border-b border-slate-200">
//             <tr>
//               <th className="px-3 py-2 text-left font-semibold text-slate-600">Patient</th>
//               <th className="px-3 py-2 text-left font-semibold text-slate-600">Medication</th>
//               <th className="px-3 py-2 text-left font-semibold text-slate-600">Dose</th>
//               <th className="px-3 py-2 text-left font-semibold text-slate-600">Frequency</th>
//               <th className="px-3 py-2 text-left font-semibold text-slate-600">Last given</th>
//               <th className="px-3 py-2 text-left font-semibold text-slate-600">Next due</th>
//               <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
//               <th className="px-3 py-2 text-right font-semibold text-slate-600">Action</th>
//             </tr>
//           </thead>
//           <tbody className="divide-y divide-slate-100">
//             {reminders.map((r) => {
//               const config = statusConfig[r.status]
//               return (
//                 <tr key={`${r.prescription}-${r.order_entry}`} className="hover:bg-slate-50">
//                   <td className="px-3 py-2 text-slate-900">
//                     {r.patient_name || '-'}
//                   </td>
//                   <td className="px-3 py-2 text-slate-900">{r.drug_name}</td>
//                   <td className="px-3 py-2 text-slate-700">{r.dosage || '–'}</td>
//                   <td className="px-3 py-2 text-slate-700">{r.frequency}</td>
//                   <td className="px-3 py-2 text-slate-700">{r.last_given_date}</td>
//                   <td className="px-3 py-2 text-slate-800 font-medium">{r.next_due_date}</td>
//                   <td className="px-3 py-2">
//                     <span
//                       className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${config.className}`}
//                     >
//                       {config.label}
//                     </span>
//                   </td>
//                   <td className="px-3 py-2 text-right">
//                     <button
//                       type="button"
//                       onClick={() => setRecordingFor(r)}
//                       className="text-xs font-medium text-primary hover:underline"
//                     >
//                       Record administration
//                     </button>
//                   </td>
//                 </tr>
//               )
//             })}
//           </tbody>
//         </table>
//       </div>

//       {recordingFor &&
//         createPortal(
//           <CreateMedicineGivenModal
//             initialPatient={recordingFor.patient}
//             onClose={() => setRecordingFor(null)}
//             onSuccess={() => {
//               setRecordingFor(null)
//               setRefreshKey((k) => k + 1)
//             }}
//           />,
//           document.body
//         )}
//     </div>
//   )
// }
import { useEffect, useRef, useState } from 'react'
import {
  fetchLongActingMedicationReminders,
  type LongActingMedicationReminder,
} from '../../services/medicineGiven'
import { CreateMedicineGivenModal } from './CreateMedicineGivenModal'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'

interface LongActingMedReminderListProps {
  patient?: string
  daysAhead?: number
  onPatientClick?: (patient: string) => void
}

const statusConfig: Record<
  LongActingMedicationReminder['status'],
  { label: string; className: string }
> = {
  overdue: { label: 'Overdue', className: 'bg-red-100 text-red-800 border-red-200' },
  due_today: { label: 'Due today', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  due_soon: { label: 'Due soon', className: 'bg-blue-100 text-blue-800 border-blue-200' },
}

export const LongActingMedReminderList = ({ patient, daysAhead = 7, onPatientClick }: LongActingMedReminderListProps) => {
  const [reminders, setReminders] = useState<LongActingMedicationReminder[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recordingFor, setRecordingFor] = useState<LongActingMedicationReminder | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchLongActingMedicationReminders({
          patient: patient || undefined,
          days_ahead: daysAhead,
        })
        setReminders(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load reminders')
        setReminders([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [patient, daysAhead, refreshKey])

  // Close menu on outside click
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

  if (loading) {
    return <div className="text-sm text-slate-600 py-4">Loading long-acting medication reminders…</div>
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
        {error}
      </div>
    )
  }

  if (reminders.length === 0) {
    return (
      <div className="text-sm text-slate-600 py-4 text-center border border-dashed border-slate-200 rounded-lg">
        No long-acting medication doses due in the next {daysAhead} days.
        {patient && ' Try clearing the patient filter to see all reminders.'}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Medications with extended intervals (Q1W, Q2W, Q3W, Q4W). Record administration when the dose is given.
      </p>
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {!patient && (
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Patient</th>
              )}
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Medication</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Dose</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Frequency</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Last given</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Next due</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reminders.map((r) => {
              const rowKey = `${r.prescription}-${r.order_entry}`
              const config = statusConfig[r.status]
              return (
                <tr key={rowKey} className="hover:bg-slate-50">
                  {!patient && (
                    <td
                      className="px-3 py-2 text-slate-900 cursor-pointer"
                      onClick={() => r.patient && onPatientClick?.(r.patient)}
                    >
                      <span className="font-medium text-primary hover:underline">{r.patient_name || r.patient}</span>
                    </td>
                  )}
                  <td className="px-3 py-2 text-slate-900">{r.drug_name}</td>
                  <td className="px-3 py-2 text-slate-700">{r.dosage || '–'}</td>
                  <td className="px-3 py-2 text-slate-700">{r.frequency}</td>
                  <td className="px-3 py-2 text-slate-700">{r.last_given_date}</td>
                  <td className="px-3 py-2 text-slate-800 font-medium">{r.next_due_date}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${config.className}`}>
                      {config.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <div
                      className="relative inline-block"
                      ref={openActionRow === rowKey ? menuRef : undefined}
                    >
                      <button
                        type="button"
                        aria-label="Actions"
                        onClick={() => setOpenActionRow((prev) => (prev === rowKey ? null : rowKey))}
                        className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>
                      <PortalActionsMenu
                        open={openActionRow === rowKey}
                        onClose={() => setOpenActionRow(null)}
                        triggerRef={menuRef}
                        minWidth={200}
                      >
                        <button
                          type="button"
                          onClick={() => { setOpenActionRow(null); setRecordingFor(r) }}
                          className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                        >
                          Record administration
                        </button>
                      </PortalActionsMenu>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {recordingFor && (
        <CreateMedicineGivenModal
          initialPatient={recordingFor.patient}
          onClose={() => setRecordingFor(null)}
          onSuccess={() => {
            setRecordingFor(null)
            setRefreshKey((k) => k + 1)
          }}
        />
      )}
    </div>
  )
}