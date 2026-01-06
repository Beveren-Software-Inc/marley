import { useState } from 'react'
import { usePatientVisits } from '../../hooks/usePatientVisits'
import { StatusPill } from '../ui/StatusPill'

const statusColors: Record<string, string> = {
  'Open': 'warning',
  'Ordered': 'info',
  'Completed': 'success',
  'Cancelled': 'danger'
}

interface PatientVisitListProps {
  onVisitSelect?: (visitName: string) => void
  searchQuery?: string
  patient?: string
}

export const PatientVisitList = ({ onVisitSelect, searchQuery: externalSearchQuery = '', patient }: PatientVisitListProps = {}) => {
  const [selectedStatus, setSelectedStatus] = useState<string>('')

  const { visits, loading, error, refetch } = usePatientVisits(
    selectedStatus || undefined,
    externalSearchQuery || undefined,
    patient
  )

  const statuses = ['Open', 'Ordered', 'Completed', 'Cancelled']

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading patient visits...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Patient Visits</h3>
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
      {/* Status Filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setSelectedStatus('')}
          className={`px-4 py-2 rounded-md text-sm font-medium ${
            selectedStatus === ''
              ? 'bg-primary text-white'
              : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
          }`}
        >
          All
        </button>
        {statuses.map((status) => (
          <button
            key={status}
            onClick={() => setSelectedStatus(status)}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              selectedStatus === status
                ? 'bg-primary text-white'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Visits Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Visit No
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Patient
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Practitioner
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Encounter Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {visits.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  {externalSearchQuery ? 'No visits match your search.' : 'No patient visits found'}
                </td>
              </tr>
            ) : (
              visits.map((visit) => (
                <tr 
                  key={visit.name} 
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => onVisitSelect?.(visit.name)}
                >
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">
                    {visit.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {visit.patient_name || visit.patient}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {visit.practitioner_name || visit.practitioner}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {visit.encounter_date
                      ? new Date(visit.encounter_date).toLocaleDateString()
                      : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill
                      status={visit.status}
                      color={statusColors[visit.status] || 'default'}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

