import { useState, useEffect, useRef } from 'react'
import { usePatients } from '../../hooks/usePatients'
import { EditPatientModal } from './EditPatientModal'
import { Pencil } from 'lucide-react'
import { useCareContext } from '../../providers/CareContextProvider'

interface PatientListProps {
  refreshKey?: string | number
}

// ─── Status helpers ─────────────────────────────────────
interface PatientStatus {
  color: StatusColor
  label: string
  hasMissedAppointment: boolean
}

const getPatientStatus = (p: any): PatientStatus => {
  const isNoShow = p.appointment_status === 'No Show'
  const isAdmitted = p.inpatient_status === 'Admitted'
  
  if (isAdmitted) {
    const hasMissedAppointment = isNoShow
    return {
      color: 'green',
      label: 'Medication Ongoing',
      hasMissedAppointment
    }
  }
  
  if (isNoShow) {
    return {
      color: 'red',
      label: 'Missed Appointment',
      hasMissedAppointment: true
    }
  }
  
  return {
    color: 'default',
    label: 'Active',
    hasMissedAppointment: false
  }
}

type StatusColor = "red" | "green" | "default";

const STATUS_STYLES: Record<StatusColor, string> = {
  red: "bg-red-100 text-red-600",
  green: "bg-green-100 text-green-600",
  default: "bg-gray-100 text-gray-600",
};

export const PatientList = ({ refreshKey }: PatientListProps = {}) => {
  const { selectedPatient: globalSelectedPatient } = useCareContext()
  const [editPatientName, setEditPatientName] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const previousPatientRef = useRef<string>('')
  
  // Update search query only when global selected patient actually changes
  useEffect(() => {
    const newQuery = globalSelectedPatient || ''
    if (previousPatientRef.current !== newQuery) {
      previousPatientRef.current = newQuery
      setSearchQuery(newQuery)
    }
  }, [globalSelectedPatient])
  
  const { patients, loading, error, refetch } = usePatients(searchQuery || undefined)

  // Handle refresh key changes
  useEffect(() => {
    if (refreshKey !== undefined) {
      refetch()
    }
  }, [refreshKey, refetch])



  // Show loading only on initial load, not on every refetch
  if (loading && patients.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading patients...</div>
      </div>
    )
  }

  if (error && patients.length === 0) {
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
      {/* Search hint - showing what's being searched */}
      {searchQuery && (
        <div className="text-sm text-slate-500 bg-slate-50 rounded-md px-3 py-2">
          Showing patients matching: <span className="font-medium text-slate-700">{searchQuery}</span>
          {patients.length === 0 && !loading && (
            <span className="ml-2 text-amber-600">No results found</span>
          )}
        </div>
      )}

      {/* Loading indicator overlay for subsequent loads (subtle) */}
      {loading && patients.length > 0 && (
        <div className="flex items-center justify-center py-2">
          <div className="text-xs text-slate-400 animate-pulse">Refreshing...</div>
        </div>
      )}

      {/* Patients Table */}
      <div className="min-w-full overflow-x-auto">
        <table className="w-full min-w-[950px]">
          <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
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
            {patients.length === 0 && !loading ? (
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
                    className={`
                      transition-colors duration-150
                      ${
                        status.color === 'red'
                          ? 'bg-red-100/40 hover:bg-red-200/60'
                          : status.color === 'green'
                          ? 'bg-green-100/40 hover:bg-green-200/60'
                          : 'hover:bg-slate-50'
                      }
                    `}
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

                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[status.color]}`}
                        >
                          {status.label}
                        </span>
                        
                        {status.color === 'green' && status.hasMissedAppointment && (
                          <span className="text-xs text-red-600 font-medium">
                            ⚠️ Missed last appointments
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setEditPatientName(patient.name)}
                        className="p-2 text-slate-500 hover:text-primary hover:bg-slate-100 rounded-md transition-colors"
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