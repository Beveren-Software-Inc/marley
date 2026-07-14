import { useState, useEffect, useRef, useCallback } from 'react'
import { usePatients } from '../../hooks/usePatients'
import { EditPatientModal } from './EditPatientModal'
import { Pencil, Users } from 'lucide-react'
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
  const { selectedPatient: globalSelectedPatient, guardClinicalEdit } = useCareContext()
  const [editPatientName, setEditPatientName] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [debouncedQuery, setDebouncedQuery] = useState<string>('')
  const previousPatientRef = useRef<string>('')
  const isInitialLoadRef = useRef<boolean>(true)

  // Track loading with a delay to prevent flashing
  const [showRefreshing, setShowRefreshing] = useState<boolean>(false)
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Debounce search query to prevent rapid refetching
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 500)

    return () => clearTimeout(timer)
  }, [searchQuery])
  
  // Update search query only when global selected patient actually changes
  useEffect(() => {
    const newQuery = globalSelectedPatient || ''
    if (previousPatientRef.current !== newQuery) {
      previousPatientRef.current = newQuery
      setSearchQuery(newQuery)
    }
  }, [globalSelectedPatient])

  // One patient is searched at a time, so the card shows a single record — no pagination.
  // The query is always a patient ID picked in the global search, so fetch it exactly —
  // fuzzy matching could also hit look-alike mobile numbers and show a second patient.
  const { patients, loading, error, refetch } = usePatients(undefined, 20, 0, debouncedQuery || undefined)

  // Handle loading state with delay to prevent blinking
  useEffect(() => {
    if (loading && !isInitialLoadRef.current) {
      // Only show "Refreshing..." if loading takes more than 300ms
      loadingTimeoutRef.current = setTimeout(() => {
        setShowRefreshing(true)
      }, 300)
    } else {
      // Clear the timeout and hide refreshing text immediately
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current)
        loadingTimeoutRef.current = null
      }
      setShowRefreshing(false)
    }
    
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current)
      }
    }
  }, [loading])

  // Handle refresh key changes with debounce
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastRefreshRef = useRef<number>(0)
  
  useEffect(() => {
    if (refreshKey !== undefined && !isInitialLoadRef.current) {
      const now = Date.now()
      // Throttle refreshes to at most once every 500ms
      if (now - lastRefreshRef.current < 500) {
        return
      }
      lastRefreshRef.current = now
      
      // Clear any pending refresh
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }
      
      // Debounce the refresh
      refreshTimeoutRef.current = setTimeout(() => {
        refetch()
      }, 100)
    }
    
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }
    }
  }, [refreshKey, refetch])

  // Mark initial load as complete after first successful load
  useEffect(() => {
    if (!loading && patients.length > 0 && isInitialLoadRef.current) {
      // Small delay to ensure smooth transition
      setTimeout(() => {
        isInitialLoadRef.current = false
      }, 100)
    }
  }, [loading, patients.length])

  // Memoize callbacks
  const handleRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  const handleEditSuccess = useCallback(() => {
    refetch()
    setEditPatientName(null)
  }, [refetch])

  // Show loading only on initial load
  if (loading && patients.length === 0 && isInitialLoadRef.current) {
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
            onClick={handleRefresh}
            className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full flex flex-col">
      {/* Stable table container — isolate stacking so sticky headers cover scrolling rows */}
      <div className="flex-1 min-h-0 overflow-auto relative isolate" data-sticky-table-scroll>
        {/* Loading indicator overlays the table — takes no layout space */}
        <div
          className={`absolute top-1.5 right-3 z-20 transition-opacity duration-200 ${showRefreshing ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
          <div className="text-xs text-slate-400">
            Refreshing...
          </div>
        </div>
        <div className="min-w-[1150px]">
          <table className="w-full table-fixed border-separate border-spacing-0">
            <colgroup>
              <col className="w-[90px]" />
              <col className="w-[110px]" />
              <col className="w-[170px]" />
              <col className="w-[110px]" />
              <col className="w-[100px]" />
              <col className="w-[120px]" />
              <col className="w-[110px]" />
              <col className="w-[100px]" />
              <col className="w-[140px]" />
              <col className="w-[90px]" />
            </colgroup>

            <thead>
              <tr>
                <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase shadow-[0_1px_0_0_rgb(226_232_240)]">
                  File No.
                </th>
                <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase shadow-[0_1px_0_0_rgb(226_232_240)]">
                  CPR No. / ID
                </th>
                <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase shadow-[0_1px_0_0_rgb(226_232_240)]">
                  Full Name
                </th>
                <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase shadow-[0_1px_0_0_rgb(226_232_240)]">
                  Mobile
                </th>
                <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase shadow-[0_1px_0_0_rgb(226_232_240)]">
                  Blood Group
                </th>
                <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase shadow-[0_1px_0_0_rgb(226_232_240)]">
                  Patient Category
                </th>
                <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase shadow-[0_1px_0_0_rgb(226_232_240)]">
                  Nationality
                </th>
                <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase shadow-[0_1px_0_0_rgb(226_232_240)]">
                  Has Insurance
                </th>
                <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase shadow-[0_1px_0_0_rgb(226_232_240)]">
                  Status
                </th>
                <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase shadow-[0_1px_0_0_rgb(226_232_240)]">
                  Edit Details
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {patients.length === 0 && !loading ? (
                <tr>
                  <td colSpan={10} className="p-0">
                    {debouncedQuery ? (
                      <div className="px-4 py-8 text-center text-slate-500">No Patient Found.</div>
                    ) : (
                      <div className="flex items-center justify-center py-10 bg-gradient-to-b from-slate-50 via-white to-slate-50">
                        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-slate-100">
                          <Users className="w-8 h-8 text-slate-300" />
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                patients.map((patient) => {
                  const status = getPatientStatus(patient)
                  // Create a stable unique key
                  const uniqueKey = patient.name || `${patient.patient_name || 'patient'}_${patient.mobile || ''}`

                  return (
                    <tr
                      key={uniqueKey}
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
                        {patient.file_number || patient.name}
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-700">
                        {patient.id_number || '-'}
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-700">
                        {patient.patient_name || '-'}
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-700">
                        {patient.mobile || '-'}
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-700">
                        {patient.blood_group || '-'}
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-700">
                        {patient.category || '-'}
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-700">
                        {patient.nationality || '-'}
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-700">
                        {patient.has_insurance ? 'Yes' : 'No'}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[status.color]}`}
                          >
                            {status.label}
                          </span>
                          
                          {status.color === 'green' && status.hasMissedAppointment && (
                            <span className="text-xs text-red-600 font-medium whitespace-nowrap">
                              ⚠️ Missed last appointments
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => guardClinicalEdit(() => setEditPatientName(patient.name))}
                          className="p-2 rounded-md bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-white transition-colors"
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
      </div>

      {/* Edit Modal */}
      {editPatientName && (
        <EditPatientModal
          patientName={editPatientName}
          onClose={() => setEditPatientName(null)}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  )
}