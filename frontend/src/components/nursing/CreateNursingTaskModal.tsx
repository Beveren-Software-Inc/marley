import { useEffect, useState } from 'react'
import { apiRequest } from '../../services/apiClient'
import { toast } from '../../hooks/useToast'
import { CreateHealthcareActivityModal } from '../activities/CreateHealthcareActivityModal'
import { fetchHealthcarePractitioners } from '../../services/common'

interface CreateNursingTaskModalProps {
  onClose: () => void
  onSuccess: () => void
  patient?: string
}

interface ActivityOption {
  name: string
  label: string
}

interface NurseOption {
  name: string
  label?: string
  department?: string
}

export const CreateNursingTaskModal = ({ onClose, onSuccess, patient }: CreateNursingTaskModalProps) => {
  const [activityQuery, setActivityQuery] = useState('')
  const [activityOptions, setActivityOptions] = useState<ActivityOption[]>([])
  const [activity, setActivity] = useState('')
  const [activityOpen, setActivityOpen] = useState(false)
  const [assignedTo, setAssignedTo] = useState('')
  const [nurseQuery, setNurseQuery] = useState('')
  const [nurseOptions, setNurseOptions] = useState<NurseOption[]>([])
  const [nurseOpen, setNurseOpen] = useState(false)
  const [requestedStart, setRequestedStart] = useState(() => {
    const now = new Date()
    const iso = now.toISOString().slice(0, 16) // yyyy-MM-ddTHH:mm
    return iso
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreateActivity, setShowCreateActivity] = useState(false)

  // Activity (Healthcare Activity) search
  useEffect(() => {
    if (!activityOpen) return
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams()
        if (activityQuery) params.append('search', activityQuery)
        const res = await fetch(
          `/api/method/healthcare.api.common.get_healthcare_activities${params.toString() ? `?${params.toString()}` : ''}`
        )
        const data = await res.json()
        if (Array.isArray(data?.message)) {
          setActivityOptions(
            data.message.map((r: any) => ({
              name: r.name,
              label: r.activity_type || r.activity || r.name,
            }))
          )
        } else {
          setActivityOptions([])
        }
      } catch {
        setActivityOptions([])
      }
    }, activityQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [activityQuery, activityOpen])

  // Assigned To (Healthcare Practitioner) search
  useEffect(() => {
    if (!nurseOpen) return
    const t = setTimeout(async () => {
      try {
        const results = await fetchHealthcarePractitioners(nurseQuery || undefined)
        setNurseOptions(results as NurseOption[])
      } catch {
        setNurseOptions([])
      }
    }, nurseQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [nurseQuery, nurseOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!patient) {
      setError('Select a patient in the header before assigning a task.')
      return
    }
    if (!activity) {
      setError('Activity is required.')
      return
    }

    try {
      setSubmitting(true)
      await apiRequest(
        '/api/method/healthcare.api.nursing_task.create_nursing_task',
        {
          method: 'POST',
          body: JSON.stringify({
            patient,
            activity,
            assigned_to: assignedTo || undefined,
            requested_start_time: requestedStart ? new Date(requestedStart).toISOString() : undefined,
          }),
        }
      )
      toast.success('Nursing task created.')
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create nursing task')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">New Nursing Task</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {error && (
            <div className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-200">
              {error}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm text-slate-800">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Patient</label>
              <div className="px-3 py-2 rounded-md border border-slate-200 bg-slate-50 text-sm">
                {patient || 'Select a patient in the header'}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Activity (Nursing Task) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={activityQuery || activity}
                  onChange={(e) => {
                    setActivityQuery(e.target.value)
                    setActivity('')
                    setActivityOpen(true)
                  }}
                  onFocus={() => setActivityOpen(true)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Search Healthcare Activity..."
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowCreateActivity(true)
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-primary hover:text-primary/80"
                  title="Create Healthcare Activity"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
              {activityOpen && activityOptions.length > 0 && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg text-sm">
                  {activityOptions.map((opt) => (
                    <button
                      key={opt.name}
                      type="button"
                      className="block w-full text-left px-3 py-1.5 hover:bg-slate-50"
                      onClick={() => {
                        setActivity(opt.name)
                        setActivityQuery(opt.label)
                        setActivityOpen(false)
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Assigned To (Healthcare Practitioner)</label>
              <input
                type="text"
                value={nurseQuery || assignedTo}
                onChange={(e) => {
                  setNurseQuery(e.target.value)
                  setAssignedTo('')
                  setNurseOpen(true)
                }}
                onFocus={() => setNurseOpen(true)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Search Healthcare Practitioner..."
              />
              {nurseOpen && nurseOptions.length > 0 && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg text-sm">
                  {nurseOptions.map((u) => (
                    <button
                      key={u.name}
                      type="button"
                      className="block w-full text-left px-3 py-1.5 hover:bg-slate-50"
                      onClick={() => {
                        setAssignedTo(u.name)
                        setNurseQuery(u.label || u.name)
                        setNurseOpen(false)
                      }}
                    >
                      <div className="font-medium">{u.label || u.name}</div>
                      {u.department && (
                        <div className="text-[11px] text-slate-500">{u.department}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Requested Start</label>
              <input
                type="datetime-local"
                value={requestedStart}
                onChange={(e) => setRequestedStart(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="px-4 py-3 border-t border-slate-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </form>
        {showCreateActivity && (
          <CreateHealthcareActivityModal
            onClose={() => setShowCreateActivity(false)}
            onSuccess={(activityName, label) => {
              setActivity(activityName)
              setActivityQuery(label)
              setShowCreateActivity(false)
            }}
          />
        )}
      </div>
    </div>
  )
}

