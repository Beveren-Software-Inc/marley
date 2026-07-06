import { useEffect, useState } from 'react'
import { fetchNursingTasks, type NursingTaskRow } from '../../services/nursingTasks'

interface NursingTaskListProps {
  patient?: string
  myTasks?: boolean
  onPatientClick?: (patient: string) => void
}

const statusColors: Record<string, string> = {
  Draft: 'bg-orange-100 text-orange-800',
  Requested: 'bg-orange-100 text-orange-800',
  Received: 'bg-sky-100 text-sky-800',
  Accepted: 'bg-emerald-100 text-emerald-800',
  Ready: 'bg-sky-100 text-sky-800',
  'In Progress': 'bg-blue-100 text-blue-800',
  'On Hold': 'bg-amber-100 text-amber-800',
  Completed: 'bg-emerald-100 text-emerald-800',
  Failed: 'bg-red-100 text-red-800',
  Cancelled: 'bg-slate-100 text-slate-700',
  'Entered in Error': 'bg-red-100 text-red-800',
}

const ACTIVE_STATUSES = [
  '',
  'Requested',
  'Received',
  'Accepted',
  'Ready',
  'In Progress',
  'On Hold',
]

export const NursingTaskList = ({ patient, myTasks, onPatientClick }: NursingTaskListProps) => {
  const [tasks, setTasks] = useState<NursingTaskRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('')

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchNursingTasks(50, 0, {
          patient,
          status: statusFilter || undefined,
          my_tasks: !!myTasks,
        })
        setTasks(data)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load nursing tasks'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [patient, myTasks, statusFilter])

  if (loading) {
    return <div className="text-sm text-slate-600 p-4">Loading nursing tasks…</div>
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
        {error}
      </div>
    )
  }

  if (!tasks.length) {
    return (
      <div className="p-4 text-sm text-slate-600 border border-dashed border-slate-300 rounded-md text-center">
        No nursing tasks found.
      </div>
    )
  }

  const openForm = (name: string) => {
    window.open(`/app/nursing-task/${encodeURIComponent(name)}`, '_blank')
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="text-xs text-slate-600">
          Showing <span className="font-semibold text-slate-800">{tasks.length}</span> task
          {tasks.length !== 1 && 's'}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {ACTIVE_STATUSES.map((s) => (
              <option key={s || 'all'} value={s}>
                {s || 'All active'}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Task</th>
              {!patient && (
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Patient</th>
              )}
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Admission</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Service Unit</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Requested</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Assigned To</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tasks.map((t) => {
              const statusClass =
                statusColors[t.status] || 'bg-slate-100 text-slate-700'
              const requested =
                t.requested_start_time ??
                (t.date ? `${t.date}` : '')
              return (
                <tr
                  key={t.name}
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => openForm(t.name)}
                >
                  <td className="px-3 py-2 text-slate-900">
                    <div className="font-medium">{t.activity || t.name}</div>
                    {t.medical_department && (
                      <div className="text-[11px] text-slate-500">
                        {t.medical_department}
                      </div>
                    )}
                  </td>
                  {!patient && (
                    <td
                      className="px-3 py-2 cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); t.patient && onPatientClick?.(t.patient) }}
                    >
                      <span className="font-medium text-primary hover:underline">{t.patient_name || t.patient || '—'}</span>
                    </td>
                  )}
                  <td className="px-3 py-2 text-slate-800">{t.inpatient_record || '—'}</td>
                  <td className="px-3 py-2 text-slate-800">{t.service_unit || '—'}</td>
                  <td className="px-3 py-2 text-slate-800">
                    {requested ? new Date(requested).toLocaleString('en-GB') : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass}`}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-800">
                    {t.assigned_to || t.assigned_by || '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

