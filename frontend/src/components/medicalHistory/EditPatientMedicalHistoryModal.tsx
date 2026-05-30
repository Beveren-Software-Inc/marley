import { useState } from 'react'
import type { PatientMedicalHistory } from '../../services/patients'
import { savePatientMedicalHistory } from '../../services/patients'
import { toast } from '../../hooks/useToast'
import { PastMedicalHistoryFields } from './PastMedicalHistoryFields'
import {
  emptyPastMedicalHistoryFields,
  hasPastMedicalHistoryContent,
  preparePastMedicalHistoryForSave,
  type PastMedicalHistoryFormFields,
} from './pastMedicalHistoryUtils'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_OVERLAY,
  CreateModalFooter,
  CreateModalHeader,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { ClipboardList } from 'lucide-react'

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
    no_known_allergies: history.no_known_allergies ? 1 : 0,
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
        ...preparePastMedicalHistoryForSave(fields),
        patient_history_details: history?.patient_history_details || [],
      }
      const updated = await savePatientMedicalHistory(payload)
      toast.success(
        payload.allergies?.trim()
          ? 'Past medical history saved · allergy synced to Warnings'
          : 'Past medical history saved'
      )
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
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-3xl w-full max-h-[90vh] overflow-hidden')}>
        <CreateModalHeader
          title="Edit Past Medical History"
          subtitle={patient ? `Patient: ${patient}` : undefined}
          icon={<ClipboardList className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          onClose={onClose}
        />

        <form onSubmit={handleSubmit} className={`${CREATE_MODAL_BODY_GRADIENT} flex-1 flex flex-col min-h-0`}>
          {error && (
            <div className="mx-4 mt-3 mb-1 bg-red-50 border border-red-200 rounded-md p-2 text-xs text-red-700">
              {error}
            </div>
          )}
          <div className="flex-1 overflow-auto px-4 py-3">
            <PastMedicalHistoryFields value={fields} onChange={setFields} />

            {legacyRows.length > 0 && (
              <div className="mt-6 pt-4 border-t border-emerald-100">
                <p className="text-xs font-semibold text-emerald-900 uppercase tracking-wide mb-2">
                  Legacy template data (read-only)
                </p>
                <table className="w-full text-xs border border-emerald-100 rounded-md overflow-hidden">
                  <thead className="bg-emerald-50/70 border-b border-emerald-100">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-emerald-800">Attribute</th>
                      <th className="px-3 py-2 text-left font-semibold text-emerald-800">Yes / No</th>
                      <th className="px-3 py-2 text-left font-semibold text-emerald-800">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-50">
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

          <CreateModalFooter>
            <button
              type="button"
              onClick={onClose}
              className={CM_BTN_CANCEL}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className={CM_BTN_PRIMARY}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </CreateModalFooter>
        </form>
      </div>
    </div>
  )
}
