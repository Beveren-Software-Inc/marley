// import { useState, useEffect } from 'react'
// import { usePatients } from '../../hooks/usePatients'
// import { EditPatientModal } from './EditPatientModal'
// import { Pencil } from 'lucide-react'

// interface PatientListProps {
//   refreshKey?: string | number
// }

// export const PatientList = ({ refreshKey }: PatientListProps = {}) => {
//   const [searchQuery, setSearchQuery] = useState('')
//   const [editPatientName, setEditPatientName] = useState<string | null>(null)
//   const { patients, loading, error, refetch } = usePatients(searchQuery || undefined)

//   useEffect(() => {
//     if (refreshKey !== undefined) {
//       refetch()
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [refreshKey])

//   if (loading) {
//     return (
//       <div className="flex items-center justify-center p-8">
//         <div className="text-slate-600">Loading patients...</div>
//       </div>
//     )
//   }

//   if (error) {
//     return (
//       <div className="flex flex-col items-center justify-center p-8">
//         <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
//           <h3 className="text-red-800 font-semibold mb-2">Error Loading Patients</h3>
//           <p className="text-red-700 text-sm mb-2">{error.message}</p>
//           <button
//             onClick={() => refetch()}
//             className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700"
//           >
//             Retry
//           </button>
//         </div>
//       </div>
//     )
//   }

//   return (
//     <div className="space-y-4">
//       {/* Search */}
//       <div>
//         <input
//           type="text"
//           value={searchQuery}
//           onChange={(e) => setSearchQuery(e.target.value)}
//           placeholder="Search patients by name, file number, or ID..."
//           className="w-full max-w-md rounded-md border border-slate-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//         />
//       </div>

//       {/* Patients Table */}
//       <div className="min-w-full">
//         <table className="w-full min-w-[900px]">
//           <thead className="bg-slate-50 border-b border-slate-200">
//             <tr>
//               <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
//                 File Number
//               </th>
//               <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
//                 Patient Name
//               </th>
//               <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
//                 Gender
//               </th>
//               <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
//                 Mobile
//               </th>
//               <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
//                 ID Number
//               </th>
//               <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
//                 Category
//               </th>
//               <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[80px]">
//                 Actions
//               </th>
//             </tr>
//           </thead>
//           <tbody className="divide-y divide-slate-200">
//             {patients.length === 0 ? (
//               <tr>
//                 <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
//                   {searchQuery ? 'No patients match your search.' : 'No patients found.'}
//                 </td>
//               </tr>
//             ) : (
//               patients.map((patient) => (
//                 <tr key={patient.name} className="hover:bg-slate-50">
//                   <td className="px-4 py-3 text-sm font-medium text-slate-900">
//                     {patient.name}
//                   </td>
//                   <td className="px-4 py-3 text-sm text-slate-700">
//                     {patient.patient_name || '-'}
//                   </td>
//                   <td className="px-4 py-3 text-sm text-slate-700">
//                     {patient.sex || '-'}
//                   </td>
//                   <td className="px-4 py-3 text-sm text-slate-700">
//                     {patient.mobile || '-'}
//                   </td>
//                   <td className="px-4 py-3 text-sm text-slate-700">
//                     {patient.id_number || '-'}
//                   </td>
//                   <td className="px-4 py-3 text-sm text-slate-700">
//                     {patient.category || '-'}
//                   </td>
//                   <td className="px-4 py-3">
//                     <button
//                       type="button"
//                       onClick={() => setEditPatientName(patient.name)}
//                       className="p-2 text-slate-500 hover:text-primary hover:bg-slate-100 rounded-md"
//                       title="Edit patient"
//                     >
//                       <Pencil className="w-4 h-4" />
//                     </button>
//                   </td>
//                 </tr>
//               ))
//             )}
//           </tbody>
//         </table>
//       </div>
//       {editPatientName && (
//         <EditPatientModal
//           patientName={editPatientName}
//           onClose={() => setEditPatientName(null)}
//           onSuccess={() => {
//             refetch()
//             setEditPatientName(null)
//           }}
//         />
//       )}
//     </div>
//   )
// }


import { useState, useEffect } from 'react'
import { usePatients } from '../../hooks/usePatients'
import { EditPatientModal } from './EditPatientModal'
import { Pencil } from 'lucide-react'

interface PatientListProps {
  refreshKey?: string | number
}

// ─── Status helpers ─────────────────────────────────────
const getPatientStatus = (p: any) => {
  if (p.appointment_status === 'No Show') {
    return { color: 'red', label: 'Missed Appointment' }
  }
  if (p.inpatient_status === 'Admitted') {
    return { color: 'green', label: 'Medication Ongoing' }
  }
  return { color: 'default', label: '' }
}

const STATUS_STYLES = {
  red: 'bg-red-100 text-red-700 border-red-200',
  green: 'bg-green-100 text-green-700 border-green-200',
  default: 'bg-slate-100 text-slate-500 border-slate-200',
}

export const PatientList = ({ refreshKey }: PatientListProps = {}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [editPatientName, setEditPatientName] = useState<string | null>(null)
  const { patients, loading, error, refetch } = usePatients(searchQuery || undefined)

  useEffect(() => {
    if (refreshKey !== undefined) {
      refetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading patients...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Patients</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search patients by name, file number, or ID..."
          className="w-full max-w-md rounded-md border border-slate-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Patients Table */}
      <div className="min-w-full">
        <table className="w-full min-w-[950px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                File Number
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Patient Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Gender
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Mobile
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                ID Number
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Category
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[80px]">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {patients.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  {searchQuery ? 'No patients match your search.' : 'No patients found.'}
                </td>
              </tr>
            ) : (
              patients.map((patient) => {
                const status = getPatientStatus(patient)

                return (
                  <tr
                    key={patient.name}
                    className={`hover:bg-slate-50 ${
                      status.color === 'red'
                        ? 'bg-red-50/40'
                        : status.color === 'green'
                        ? 'bg-green-50/40'
                        : ''
                    }`}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">
                      {patient.name}
                    </td>

                    <td className="px-4 py-3 text-sm text-slate-700">
                      {patient.patient_name || '-'}
                    </td>

                    <td className="px-4 py-3 text-sm text-slate-700">
                      {patient.sex || '-'}
                    </td>

                    <td className="px-4 py-3 text-sm text-slate-700">
                      {patient.mobile || '-'}
                    </td>

                    <td className="px-4 py-3 text-sm text-slate-700">
                      {patient.id_number || '-'}
                    </td>

                    <td className="px-4 py-3 text-sm text-slate-700">
                      {patient.category || '-'}
                    </td>

                    {/* ✅ STATUS COLUMN */}
                    <td className="px-4 py-3">
                      {status.label ? (
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[status.color]}`}
                        >
                          {status.label}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setEditPatientName(patient.name)}
                        className="p-2 text-slate-500 hover:text-primary hover:bg-slate-100 rounded-md"
                        title="Edit patient"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {editPatientName && (
        <EditPatientModal
          patientName={editPatientName}
          onClose={() => setEditPatientName(null)}
          onSuccess={() => {
            refetch()
            setEditPatientName(null)
          }}
        />
      )}
    </div>
  )
}
