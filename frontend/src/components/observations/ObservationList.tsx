import { useState, useEffect } from 'react'
import { fetchObservations, type Observation } from '../../services/observations'
import { StatusPill } from '../ui/StatusPill'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { DocDetailView } from '../ui/DocDetailView'

const statusColors: Record<string, string> = {
  'Registered': 'default',
  'Preliminary': 'warning',
  'Final': 'success',
  'Approved': 'success',
  'Rejected': 'danger',
  'Cancelled': 'default',
  'Amended': 'info',
  'Corrected': 'info'
}

interface ObservationListProps {
  patient?: string
}

export const ObservationList = ({ patient }: ObservationListProps) => {
  const [observations, setObservations] = useState<Observation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)

  useEffect(() => {
    const loadObservations = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetchObservations(50, 0, patient)
        setObservations(response)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch observations'))
      } finally {
        setLoading(false)
      }
    }

    loadObservations()
  }, [patient])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading observations...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Observations</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
        </div>
      </div>
    )
  }

  if (observations.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">No observations found</div>
      </div>
    )
  }

  const getResultDisplay = (obs: Observation): string => {
    if (obs.result_text) return obs.result_text
    if (obs.result_float !== undefined && obs.result_float !== null) return obs.result_float.toString()
    if (obs.result_select) return obs.result_select
    if (obs.result_boolean !== undefined && obs.result_boolean !== null) return obs.result_boolean ? 'Yes' : 'No'
    if (obs.result_datetime) return new Date(obs.result_datetime).toLocaleString()
    if (obs.result_time) return obs.result_time
    if (obs.result_data) return obs.result_data
    return '-'
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Observation ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Patient
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Template
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Start Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Result
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Practitioner
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[100px]">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {observations.map((obs) => (
            <tr key={obs.name} className="hover:bg-slate-50">
              <td
                className="px-4 py-3 text-sm font-medium text-primary cursor-pointer hover:underline"
                onClick={() => setDetailName(obs.name)}
              >
                {obs.name}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {obs.patient_name || obs.patient || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {obs.template_name || obs.observation_template || '-'}
              </td>
              <td className="px-4 py-3">
                <StatusPill
                  status={obs.status || 'Registered'}
                  color={statusColors[obs.status || 'Registered'] || 'default'}
                />
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {obs.start_date ? new Date(obs.start_date).toLocaleDateString() : '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {getResultDisplay(obs)}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {obs.practitioner_name || obs.healthcare_practitioner || '-'}
              </td>
              <td className="px-4 py-2 align-middle">
                <PrintFormatDropdown
                  doctype="Observation"
                  docName={obs.name}
                  noLetterhead={0}
                  triggerPrint={1}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {detailName && (
        <DetailSlideOver
          title="Observation"
          subtitle={detailName}
          onClose={() => setDetailName(null)}
        >
          <DocDetailView doctype="Observation" name={detailName} />
        </DetailSlideOver>
      )}
    </div>
  )
}





