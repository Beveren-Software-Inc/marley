import { useState, useEffect } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { createIOPEnrollment, fetchIOPDays, fetchIOPSessionTypes, type IOPDay, type IOPSessionType, type IOPEnrollmentSessionRow } from '../../services/iop'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { fetchHealthcarePractitioners, getCurrentUserPractitioner, type LinkFieldOption } from '../../services/common'
import { toast } from '../../hooks/useToast'
import { X } from 'lucide-react'

interface CreateIOPEnrollmentModalProps {
  onClose: () => void
  onSuccess: () => void
  initialPatient?: string
}

export const CreateIOPEnrollmentModal = ({ onClose, onSuccess, initialPatient }: CreateIOPEnrollmentModalProps) => {
  const [patient, setPatient] = useState(initialPatient || '')
  const [patientQuery, setPatientQuery] = useState('')
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)

  const [iop_day, setIopDay] = useState('')
  const [iopDays, setIopDays] = useState<IOPDay[]>([])

  // Practitioner
  const [practitioner, setPractitioner] = useState('')
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [practitioners, setPractitioners] = useState<LinkFieldOption[]>([])
  const [practitionerOpen, setPractitionerOpen] = useState(false)

  const [status, setStatus] = useState('Scheduled')
  const [notes, setNotes] = useState('')
  const [sessionTypes, setSessionTypes] = useState<IOPSessionType[]>([])
  const [sessions, setSessions] = useState<IOPEnrollmentSessionRow[]>([{ session_type: '', from_time: '', to_time: '', notes: '' }])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchIOPDays(100, 0).then(setIopDays).catch(() => setIopDays([]))
    fetchIOPSessionTypes().then(setSessionTypes).catch(() => setSessionTypes([]))
  }, [])

  // Search patients
  useEffect(() => {
    if (!patientOpen) return
    const search = async () => {
      try {
        const list = patientQuery.trim()
          ? await searchPatients(patientQuery, 20)
          : await fetchPatients(20, 0)
        setPatientOptions(list)
      } catch {
        setPatientOptions([])
      }
    }
    const t = setTimeout(search, patientQuery.trim() ? 300 : 0)
    return () => clearTimeout(t)
  }, [patientOpen, patientQuery])

  // Search practitioners
  useEffect(() => {
    if (!practitionerOpen && !practitionerQuery) return
    const search = async () => {
      try {
        const results = await fetchHealthcarePractitioners(practitionerQuery || undefined)
        setPractitioners(results)
      } catch {
        setPractitioners([])
      }
    }
    const t = setTimeout(search, 300)
    return () => clearTimeout(t)
  }, [practitionerOpen, practitionerQuery])

  // Auto-populate current user's practitioner
  useEffect(() => {
    const autoPopulatePractitioner = async () => {
      try {
        const currentPractitioner = await getCurrentUserPractitioner()
        if (currentPractitioner) {
          setPractitioner(currentPractitioner)
          // Also set the query for display
          const practitionerOption = practitioners.find(p => p.name === currentPractitioner)
          if (practitionerOption) {
            setPractitionerQuery(practitionerOption.label)
          }
        }
      } catch (err) {
        console.error('Failed to auto-populate practitioner:', err)
      }
    }
    autoPopulatePractitioner()
  }, [practitioners])

  const handleSelectPatient = (p: PatientListItem) => {
    setPatient(p.name)
    setPatientQuery((p as { patient_name?: string }).patient_name || p.name)
    setPatientOpen(false)
  }

  const handleSelectPractitioner = (p: LinkFieldOption) => {
    setPractitioner(p.name)
    setPractitionerQuery(p.label)
    setPractitionerOpen(false)
  }

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
    if (!patient) {
      setError('Patient is required')
      return
    }
    const validSessions = sessions
      .filter((s) => s.session_type)
      .map((s) => ({
        session_type: s.session_type,
        from_time: s.from_time || undefined,
        to_time: s.to_time || undefined,
        notes: s.notes || undefined
      }))
    try {
      setLoading(true)
      await createIOPEnrollment({
        patient,
        ...(iop_day ? { iop_day } : {}),
        status,
        notes: notes || undefined,
        ...(practitioner ? { practitioner } : {}),
        iop_session: validSessions.length ? validSessions : undefined
      })
      toast.success('Enrollment created')
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create enrollment')
      toast.error(err instanceof Error ? err.message : 'Failed to create enrollment')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-md w-full max-h-[90vh] overflow-y-auto')}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-emerald-950">Enroll in IOP Day</h2>
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-2 text-emerald-800/70 transition hover:bg-emerald-200/50 hover:text-emerald-950">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">{error}</div>
          )}

          {/* Patient */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Patient <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={patientQuery}
                onChange={(e) => {
                  setPatientQuery(e.target.value)
                  setPatientOpen(true)
                  if (patient) setPatient('')
                }}
                onFocus={() => setPatientOpen(true)}
                placeholder="Search patient..."
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {patientOpen && patientOptions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {patientOptions.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => handleSelectPatient(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
                    >
                      {(p as { patient_name?: string }).patient_name || p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>


        {/* Healthcare Practitioner */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Healthcare Practitioner
            </label>
            <div className="relative">
              <input
                type="text"
                value={practitionerQuery}
                onChange={(e) => {
                  setPractitionerQuery(e.target.value)
                  setPractitionerOpen(true)
                  if (practitioner) setPractitioner('')
                }}
                onFocus={() => setPractitionerOpen(true)}
                placeholder="Search practitioner..."
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {practitionerOpen && practitioners.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {practitioners.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => handleSelectPractitioner(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
                    >
                      <div className="font-medium">{p.label}</div>
                      <div className="text-xs text-slate-500">
                        {[p.name, p.department].filter(Boolean).join(' · ')}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* IOP Day (optional) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">IOP Day (slot)</label>
            <select
              value={iop_day}
              onChange={(e) => setIopDay(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            >
              <option value="">Select day (optional)</option>
              {iopDays.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.posting_date ? `${d.posting_date} — ${d.name}` : d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="Scheduled">Scheduled</option>
              <option value="Attended">Attended</option>
              <option value="Absent">Absent</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* IOP Session child table */}
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
            <button
              type="button"
              onClick={onClose}
              className={CM_BTN_CANCEL}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={CM_BTN_PRIMARY}
            >
              {loading ? 'Creating…' : 'Enroll'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}