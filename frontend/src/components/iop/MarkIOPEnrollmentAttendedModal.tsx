import { useState, useEffect } from 'react'
import { IOPHealthcareServiceTemplateSelect } from '../ui/IOPHealthcareServiceTemplateSelect'
import {
  fetchIOPEnrollment,
  updateIOPEnrollment,
  fetchIOPHealthcareServiceTemplates,
  type IOPEnrollmentWithSessions,
  type IOPHealthcareServiceTemplate,
  type IOPEnrollmentSessionRow,
} from '../../services/iop'
import { toast } from '../../hooks/useToast'
import { X } from 'lucide-react'

interface MarkIOPEnrollmentAttendedModalProps {
  enrollmentName: string
  onClose: () => void
  onSuccess: () => void
}

export const MarkIOPEnrollmentAttendedModal = ({
  enrollmentName,
  onClose,
  onSuccess,
}: MarkIOPEnrollmentAttendedModalProps) => {
  const [enrollment, setEnrollment] = useState<IOPEnrollmentWithSessions | null>(null)
  const [notes, setNotes] = useState('')
  const [sessions, setSessions] = useState<IOPEnrollmentSessionRow[]>([])
  const [sessionTemplates, setSessionTemplates] = useState<IOPHealthcareServiceTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([fetchIOPEnrollment(enrollmentName), fetchIOPHealthcareServiceTemplates()])
      .then(([enr, templates]) => {
        if (cancelled) return
        setEnrollment(enr)
        setNotes(enr.notes || '')
        setSessionTemplates(templates)
        const rows = enr.iop_session?.length
          ? enr.iop_session.map((s) => ({ session_type: s.session_type, notes: s.notes || '' }))
          : [{ session_type: '', notes: '' }]
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
    return () => {
      cancelled = true
    }
  }, [enrollmentName])

  const addSession = () => {
    setSessions((prev) => [...prev, { session_type: '', notes: '' }])
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
        notes: s.notes || undefined,
      }))
    try {
      setSaving(true)
      await updateIOPEnrollment(enrollmentName, {
        status: 'Attended',
        notes: notes || undefined,
        iop_session: validSessions,
      })
      toast.success('Marked as attended')
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
            Mark attended — {enrollment?.patient_name || enrollmentName}
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm min-h-[6rem] focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="General notes for this enrollment…"
              />
            </div>

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
                    <IOPHealthcareServiceTemplateSelect
                      value={row.session_type}
                      onChange={(value) => updateSession(idx, 'session_type', value)}
                      templates={sessionTemplates}
                      onTemplatesUpdated={setSessionTemplates}
                      className="flex-1 min-w-[140px]"
                      placeholder="Select healthcare service..."
                    />
                    <textarea
                      value={row.notes || ''}
                      onChange={(e) => updateSession(idx, 'notes', e.target.value)}
                      placeholder="Session notes"
                      rows={2}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm flex-1 min-w-[120px] min-h-[3rem] resize-y"
                    />
                    <button
                      type="button"
                      onClick={() => removeSession(idx)}
                      className="text-slate-500 hover:text-red-600 p-1 shrink-0"
                      title="Remove"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Mark attended'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
