import { useState, useEffect } from 'react'
import { createIOPEnrollment, fetchIOPDays, type IOPDay } from '../../services/iop'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
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
  const [status, setStatus] = useState('Scheduled')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchIOPDays(100, 0).then(setIopDays).catch(() => setIopDays([]))
  }, [])

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

  const handleSelectPatient = (p: PatientListItem) => {
    setPatient(p.name)
    setPatientQuery((p as { patient_name?: string }).patient_name || p.name)
    setPatientOpen(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!patient) {
      setError('Patient is required')
      return
    }
    if (!iop_day) {
      setError('IOP Day (slot) is required')
      return
    }
    try {
      setLoading(true)
      await createIOPEnrollment({ patient, iop_day, status, notes: notes || undefined })
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Enroll in IOP Day</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Patient <span className="text-red-500">*</span></label>
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
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">IOP Day (slot) <span className="text-red-500">*</span></label>
            <select
              value={iop_day}
              onChange={(e) => setIopDay(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
            >
              <option value="">Select day</option>
              {iopDays.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.posting_date ? `${d.posting_date} — ${d.name}` : d.name}
                </option>
              ))}
            </select>
          </div>
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
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50">
              {loading ? 'Creating…' : 'Enroll'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
