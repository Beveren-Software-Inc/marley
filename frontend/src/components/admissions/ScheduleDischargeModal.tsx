import { useState } from 'react'
import { scheduleDischarge } from '../../services/inpatientRecords'

interface ScheduleDischargeModalProps {
  admission: {
    name: string
    patient: string
    patient_name?: string
  }
  onClose: () => void
  onSuccess: (dischargeData: any) => void
}

export const ScheduleDischargeModal = ({ admission, onClose, onSuccess }: ScheduleDischargeModalProps) => {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    discharge_practitioner: '',
    discharge_ordered_datetime: new Date().toISOString().slice(0, 16),
    followup_date: '',
    discharge_instructions: '',
    discharge_note: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    try {
      setSubmitting(true)

      const dischargeData = {
        patient: admission.patient,
        inpatient_record: admission.name,
        discharge_practitioner: formData.discharge_practitioner || undefined,
        discharge_ordered_datetime: formData.discharge_ordered_datetime || undefined,
        followup_date: formData.followup_date || undefined,
        discharge_instructions: formData.discharge_instructions || undefined,
        discharge_note: formData.discharge_note || undefined
      }

      await scheduleDischarge(dischargeData)
      onSuccess(dischargeData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule discharge')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Schedule Discharge</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-slate-50 rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-slate-900 mb-2">Patient Information</h3>
            <div className="text-sm text-slate-700">
              <p><span className="font-medium">Patient:</span> {admission.patient_name || admission.patient}</p>
              <p><span className="font-medium">Admission No:</span> {admission.name}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Discharge Practitioner
              </label>
              <input
                type="text"
                value={formData.discharge_practitioner}
                onChange={(e) => setFormData({ ...formData, discharge_practitioner: e.target.value })}
                placeholder="Healthcare Practitioner"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Discharge Ordered DateTime
              </label>
              <input
                type="datetime-local"
                value={formData.discharge_ordered_datetime}
                onChange={(e) => setFormData({ ...formData, discharge_ordered_datetime: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Followup Date
              </label>
              <input
                type="date"
                value={formData.followup_date}
                onChange={(e) => setFormData({ ...formData, followup_date: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Discharge Instructions
            </label>
            <textarea
              value={formData.discharge_instructions}
              onChange={(e) => setFormData({ ...formData, discharge_instructions: e.target.value })}
              rows={3}
              placeholder="Discharge instructions..."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Discharge Note
            </label>
            <textarea
              value={formData.discharge_note}
              onChange={(e) => setFormData({ ...formData, discharge_note: e.target.value })}
              rows={4}
              placeholder="Discharge summary note..."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 disabled:opacity-50"
            >
              {submitting ? 'Scheduling...' : 'Schedule Discharge'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

