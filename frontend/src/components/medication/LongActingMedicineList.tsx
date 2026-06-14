// import { useEffect, useState } from 'react'
// import { fetchLongActingMedicineList, type LongActingMedicineRow } from '../../services/longActingMedicine'
// import { Pill } from 'lucide-react'

// const statusColors: Record<string, string> = {
//   Draft: 'bg-slate-100 text-slate-700 border-slate-200',
//   Active: 'bg-green-100 text-green-800 border-green-200',
//   Paused: 'bg-amber-100 text-amber-800 border-amber-200',
//   Completed: 'bg-blue-100 text-blue-800 border-blue-200',
// }

// function formatDate(d?: string) {
//   if (!d) return '—'
//   return new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })
// }

// interface LongActingMedicineListProps {
//   patient?: string
//   refreshKey?: string | number
// }

// export const LongActingMedicineList = ({ patient, refreshKey }: LongActingMedicineListProps) => {
//   const [list, setList] = useState<LongActingMedicineRow[]>([])
//   const [loading, setLoading] = useState(true)
//   const [error, setError] = useState<string | null>(null)

//   useEffect(() => {
//     if (!patient) {
//       setList([])
//       setLoading(false)
//       return
//     }
//     setLoading(true)
//     setError(null)
//     fetchLongActingMedicineList(patient)
//       .then(setList)
//       .catch((e) => {
//         setError(e instanceof Error ? e.message : 'Failed to load')
//         setList([])
//       })
//       .finally(() => setLoading(false))
//   }, [patient, refreshKey])

//   if (!patient) {
//     return (
//       <div className="flex items-center justify-center py-8 text-slate-500 text-sm">
//         Select a patient to view long acting medicine
//       </div>
//     )
//   }

//   if (loading) {
//     return (
//       <div className="flex items-center justify-center py-8 text-slate-600 text-sm">
//         Loading…
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

//   if (list.length === 0) {
//     return (
//       <div className="flex flex-col items-center justify-center py-8 text-slate-500 text-sm text-center border border-dashed border-slate-200 rounded-lg">
//         <Pill className="w-8 h-8 text-slate-300 mb-2" />
//         <p>No long acting medicine for this patient</p>
//         <p className="text-xs mt-1">Add from Prescription with “Long Acting Medication” ticked</p>
//       </div>
//     )
//   }

//   return (
//     <div className="overflow-x-auto">
//       <table className="min-w-full text-sm">
//         <thead className="bg-slate-50 border-b border-slate-200">
//           <tr>
//             <th className="px-3 py-2 text-left font-semibold text-slate-600">Name</th>
//             <th className="px-3 py-2 text-left font-semibold text-slate-600">Frequency</th>
//             <th className="px-3 py-2 text-left font-semibold text-slate-600">Start</th>
//             <th className="px-3 py-2 text-left font-semibold text-slate-600">Next run</th>
//             <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
//           </tr>
//         </thead>
//         <tbody className="divide-y divide-slate-100">
//           {list.map((row) => (
//             <tr key={row.name} className="hover:bg-slate-50">
//               <td className="px-3 py-2">
//                 <a
//                   href={`/app/long-acting-medicine/${encodeURIComponent(row.name)}`}
//                   target="_blank"
//                   rel="noopener noreferrer"
//                   className="text-primary hover:underline font-medium"
//                 >
//                   {row.name}
//                 </a>
//               </td>
//               <td className="px-3 py-2 text-slate-700">{row.frequency || '—'}</td>
//               <td className="px-3 py-2 text-slate-700">{formatDate(row.start_date)}</td>
//               <td className="px-3 py-2 text-slate-700">{formatDate(row.next_run_date)}</td>
//               <td className="px-3 py-2">
//                 <span
//                   className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium border ${
//                     statusColors[row.status || 'Draft'] ?? 'bg-slate-100 text-slate-700 border-slate-200'
//                   }`}
//                 >
//                   {row.status || 'Draft'}
//                 </span>
//               </td>
//             </tr>
//           ))}
//         </tbody>
//       </table>
//     </div>
//   )
// }


import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchLongActingMedicineList, type LongActingMedicineRow } from '../../services/longActingMedicine'
import { Pill, MoreVertical } from 'lucide-react'
import { useDashboardCompactClinical } from '../../contexts/CardFilterContext'
import {
  CardRowMetaHint,
  formatDashboardDate,
} from '../ui/dashboardCardListing'
import { LongActingMedicineDetailPanel } from './LongActingMedicineDetailPanel'

const statusColors: Record<string, string> = {
  Draft: 'bg-slate-100 text-slate-700 border-slate-200',
  Active: 'bg-green-100 text-green-800 border-green-200',
  Paused: 'bg-amber-100 text-amber-800 border-amber-200',
  Completed: 'bg-blue-100 text-blue-800 border-blue-200',
}

function formatDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function getRowColorClass(nextRunDate?: string) {
  if (!nextRunDate) return 'hover:bg-slate-50'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const next = new Date(nextRunDate)
  next.setHours(0, 0, 0, 0)
  const diffDays = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'bg-red-100 hover:bg-red-200'
  if (diffDays === 0) return 'bg-green-100 hover:bg-green-200'
  return 'hover:bg-slate-50'
}

interface RowMenuProps {
  row: LongActingMedicineRow
}

function RowMenu({ row }: RowMenuProps) {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setMenuPos({
        top: rect.bottom + window.scrollY + 4,
        left: rect.right + window.scrollX - 160, // align right edge of menu with button
      })
    }
    setOpen((v) => !v)
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
        aria-label="Row actions"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open &&
        createPortal(
          <div
            style={{ position: 'absolute', top: menuPos.top, left: menuPos.left, zIndex: 9999, width: 160 }}
            className="bg-white border border-slate-200 rounded-md shadow-lg py-1 text-sm"
          >
            <a
              href={`/app/long-acting-medicine/${encodeURIComponent(row.name)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-3 py-1.5 hover:bg-slate-50 text-slate-700"
              onClick={() => setOpen(false)}
            >
              View
            </a>
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-700"
              onClick={() => { setOpen(false) /* TODO: edit handler */ }}
            >
              Edit
            </button>
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600"
              onClick={() => { setOpen(false) /* TODO: delete handler */ }}
            >
              Delete
            </button>
          </div>,
          document.body
        )}
    </>
  )
}

interface LongActingMedicineListProps {
  patient?: string
  refreshKey?: string | number
  onPatientClick?: (patient: string) => void
}

export const LongActingMedicineList = ({ patient, refreshKey, onPatientClick }: LongActingMedicineListProps) => {
  const compactClinical = useDashboardCompactClinical()
  const [list, setList] = useState<LongActingMedicineRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [detailPreview, setDetailPreview] = useState<LongActingMedicineRow | undefined>(undefined)

  const openDetail = (row: LongActingMedicineRow) => {
    setDetailPreview(row)
    setDetailName(row.name)
  }

  useEffect(() => {
    if (!patient) {
      setList([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    fetchLongActingMedicineList(patient)
      .then(setList)
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load')
        setList([])
      })
      .finally(() => setLoading(false))
  }, [patient, refreshKey])

  if (!patient) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-500 text-sm">
        Select a patient to view long acting medicine
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-600 text-sm">
        Loading…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
        {error}
      </div>
    )
  }

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-slate-500 text-sm text-center border border-dashed border-slate-200 rounded-lg">
        <Pill className="w-8 h-8 text-slate-300 mb-2" />
        <p>No long acting medicine for this patient</p>
        <p className="text-xs mt-1">Add from Prescription with "Long Acting Medication" ticked</p>
      </div>
    )
  }

  if (compactClinical) {
    return (
      <>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Schedule</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Next due</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((row) => {
                const metaFields = [
                  ['Record', row.name],
                  ['Patient', row.patient_name || row.patient],
                  ['Started', formatDashboardDate(row.start_date)],
                  ['Ends', formatDashboardDate(row.end_date)],
                  ['Remarks', row.remarks],
                ] as const
                return (
                  <tr
                    key={row.name}
                    className={`cursor-pointer transition-colors ${getRowColorClass(row.next_run_date)}`}
                    onClick={() => openDetail(row)}
                  >
                    <td className="px-3 py-2.5 text-slate-800 font-medium align-top">
                      {row.frequency || 'Long acting'}
                      <CardRowMetaHint fields={metaFields} />
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap align-top">
                      {formatDashboardDate(row.next_run_date)}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <span
                        className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium border ${
                          statusColors[row.status || 'Draft'] ?? 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {row.status || 'Draft'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {detailName ? (
          <LongActingMedicineDetailPanel
            name={detailName}
            preview={detailPreview}
            onClose={() => { setDetailName(null); setDetailPreview(undefined) }}
            onPatientClick={onPatientClick}
          />
        ) : null}
      </>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Name</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Frequency</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Start</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Next run</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((row) => (
              <tr
                key={row.name}
                className={`cursor-pointer transition-colors ${getRowColorClass(row.next_run_date)}`}
                onClick={() => openDetail(row)}
              >
                <td className="px-3 py-2 text-primary font-medium">{row.name}</td>
                <td className="px-3 py-2 text-slate-700">{row.frequency || '—'}</td>
                <td className="px-3 py-2 text-slate-700">{formatDate(row.start_date)}</td>
                <td className="px-3 py-2 text-slate-700">{formatDate(row.next_run_date)}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium border ${
                      statusColors[row.status || 'Draft'] ?? 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {row.status || 'Draft'}
                  </span>
                </td>
                <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                  <RowMenu row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detailName ? (
        <LongActingMedicineDetailPanel
          name={detailName}
          preview={detailPreview}
          onClose={() => { setDetailName(null); setDetailPreview(undefined) }}
          onPatientClick={onPatientClick}
        />
      ) : null}
    </>
  )
}