import { useState, useEffect } from 'react'
import {
  fetchIOPEnrollment,
  updateIOPEnrollmentSessions,
  fetchIOPSessionTypes,
  type IOPEnrollmentWithSessions,
  type IOPSessionType,
  type IOPEnrollmentSessionRow
} from '../../services/iop'
import { toast } from '../../hooks/useToast'
import { X } from 'lucide-react'

interface EditIOPEnrollmentModalProps {
  enrollmentName: string
  onClose: () => void
  onSuccess: () => void
}

export const EditIOPEnrollmentModal = ({
  enrollmentName,
  onClose,
  onSuccess
}: EditIOPEnrollmentModalProps) => {
  const [enrollment, setEnrollment] = useState<IOPEnrollmentWithSessions | null>(null)
  const [sessions, setSessions] = useState<IOPEnrollmentSessionRow[]>([])
  const [sessionTypes, setSessionTypes] = useState<IOPSessionType[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([fetchIOPEnrollment(enrollmentName), fetchIOPSessionTypes()])
      .then(([enr, types]) => {
        if (cancelled) return
        setEnrollment(enr)
        setSessionTypes(types)
        const rows = (enr.iop_session && enr.iop_session.length) ? enr.iop_session : [{ session_type: '', from_time: '', to_time: '', notes: '' }]
        setSessions(rows)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load enrollment')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [enrollmentName])

  const addSession = () => {
    setSessions((prev) => [...prev, { session_type: '', from_time: '', to_time: '', notes: '' }])
  }

  const updateSession = (idx: number, field: keyof IOPEnrollmentSessionRow, value: string) => {
    setSessions((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  const removeSession = (idx: number) => {
    setSessions((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const validSessions = sessions
      .filter((s) => s.session_type)
      .map((s) => ({
        session_type: s.session_type,
        from_time: s.from_time || undefined,
        to_time: s.to_time || undefined,
        notes: s.notes || undefined
      }))
    try {
      setSaving(true)
      await updateIOPEnrollmentSessions(enrollmentName, validSessions)
      toast.success('Sessions updated')
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update')
      toast.error(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">
            Edit sessions — {enrollment?.patient_name || enrollmentName}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="p-6 text-slate-500 text-sm">Loading…</div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">{error}</div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-slate-700">Sessions</label>
                <button type="button" onClick={addSession} className="text-sm text-primary hover:underline">
                  + Add session
                </button>
              </div>
              <div className="space-y-2">
                {sessions.map((row, idx) => (
                  <div key={idx} className="flex flex-wrap items-start gap-2 p-2 border border-slate-200 rounded-md">
                    <select
                      value={row.session_type}
                      onChange={(e) => updateSession(idx, 'session_type', e.target.value)}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm flex-1 min-w-[120px]"
                    >
                      <option value="">Type</option>
                      {sessionTypes.map((st) => (
                        <option key={st.name} value={st.name}>{st.session_type_name || st.name}</option>
                      ))}
                    </select>
                    <input
                      type="time"
                      value={row.from_time || ''}
                      onChange={(e) => updateSession(idx, 'from_time', e.target.value)}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm w-28"
                      placeholder="From"
                    />
                    <input
                      type="time"
                      value={row.to_time || ''}
                      onChange={(e) => updateSession(idx, 'to_time', e.target.value)}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm w-28"
                      placeholder="To"
                    />
                    <input
                      type="text"
                      value={row.notes || ''}
                      onChange={(e) => updateSession(idx, 'notes', e.target.value)}
                      placeholder="Notes"
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm flex-1 min-w-[80px]"
                    />
                    <button
                      type="button"
                      onClick={() => removeSession(idx)}
                      className="text-slate-500 hover:text-red-600 p-1"
                      title="Remove"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save sessions'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
