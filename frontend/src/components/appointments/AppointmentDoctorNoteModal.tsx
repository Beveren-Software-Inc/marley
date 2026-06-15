import { useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { updateAppointmentDoctorNote, type Appointment } from '../../services/appointments'
import { toast } from '../../hooks/useToast'

interface AppointmentDoctorNoteModalProps {
  appointment: Appointment
  onClose: () => void
  onSuccess: () => void
}

export const AppointmentDoctorNoteModal = ({
  appointment,
  onClose,
  onSuccess,
}: AppointmentDoctorNoteModalProps) => {
  const [note, setNote] = useState(appointment.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const label = appointment.patient_name || appointment.temporary_patient_name || appointment.name

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updateAppointmentDoctorNote(appointment.name, note.trim())
      toast.success("Doctor's note saved")
      onSuccess()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save note'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-md w-full')}>
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Doctor&apos;s Note</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="mt-1 text-sm text-slate-600">{label}</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Doctor&apos;s note
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="Add clinical notes for this appointment…"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className={CM_BTN_PRIMARY} disabled={saving}>
              {saving ? 'Saving…' : 'Save note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
