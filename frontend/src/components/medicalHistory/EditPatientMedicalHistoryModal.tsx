import { useState } from 'react'
import type { PatientMedicalHistory } from '../../services/patients'
import { savePatientMedicalHistory } from '../../services/patients'
import { toast } from '../../hooks/useToast'
import { PastMedicalHistoryFields } from './PastMedicalHistoryFields'
import {
  emptyPastMedicalHistoryFields,
  hasPastMedicalHistoryContent,
  type PastMedicalHistoryFormFields,
} from './pastMedicalHistoryUtils'

interface EditPatientMedicalHistoryModalProps {
  patient: string
  history: PatientMedicalHistory | null
  onClose: () => void
  onSaved: (updated: PatientMedicalHistory) => void
}

function fieldsFromHistory(history: PatientMedicalHistory | null): PastMedicalHistoryFormFields {
  if (!history) return emptyPastMedicalHistoryFields()
  return {
    heart_disease: history.heart_disease || '',
    diabetes: history.diabetes || '',
    asthma: history.asthma || '',
    strokes: history.strokes || '',
    other_ongoing_illness: history.other_ongoing_illness || '',
    previous_surgical_history: history.previous_surgical_history || '',
    current_and_past_medications: history.current_and_past_medications || '',
    allergies: history.allergies || '',
    social_history: history.social_history || '',
    addiction: history.addiction ? 1 : 0,
    smoking: history.smoking ? 1 : 0,
  }
}

export const EditPatientMedicalHistoryModal = ({
  patient,
  history,
  onClose,
  onSaved,
}: EditPatientMedicalHistoryModalProps) => {
  const [fields, setFields] = useState<PastMedicalHistoryFormFields>(() => fieldsFromHistory(history))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const legacyRows = history?.patient_history_details?.filter((r) => r.attributes) ?? []

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!hasPastMedicalHistoryContent(fields) && legacyRows.length === 0) {
      setError('Please complete at least one section of the past medical history.')
      return
    }

    try {
      setSaving(true)
      const payload: PatientMedicalHistory = {
        ...(history || {}),
        patient,
        template: history?.template || null,
        ...fields,
        patient_history_details: history?.patient_history_details || [],
      }
      const updated = await savePatientMedicalHistory(payload)
      toast.success('Past medical history saved')
      onSaved(updated)
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save medical history'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Edit Past Medical History</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          {error && (
            <div className="mx-4 mt-3 mb-1 bg-red-50 border border-red-200 rounded-md p-2 text-xs text-red-700">
              {error}
            </div>
          )}
          <div className="flex-1 overflow-auto px-4 py-3">
            <PastMedicalHistoryFields value={fields} onChange={setFields} />

            {legacyRows.length > 0 && (
              <div className="mt-6 pt-4 border-t border-slate-200">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Legacy template data (read-only)
                </p>
                <table className="w-full text-xs border border-slate-200 rounded-md overflow-hidden">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Attribute</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Yes / No</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {legacyRows.map((row, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 text-slate-800">{row.attributes}</td>
                        <td className="px-3 py-2 text-slate-600">{row.yesno || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{row.description || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-md border border-slate-300 text-slate-700 hover:bg-white"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 text-xs rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
