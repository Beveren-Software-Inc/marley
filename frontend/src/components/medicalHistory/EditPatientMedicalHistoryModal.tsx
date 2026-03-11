import { useState } from 'react'
import type { PatientMedicalHistory, PatientMedicalHistoryRow } from '../../services/patients'
import { savePatientMedicalHistory } from '../../services/patients'
import { toast } from '../../hooks/useToast'

interface EditPatientMedicalHistoryModalProps {
  patient: string
  history: PatientMedicalHistory | null
  onClose: () => void
  onSaved: (updated: PatientMedicalHistory) => void
}

export const EditPatientMedicalHistoryModal = ({
  patient,
  history,
  onClose,
  onSaved,
}: EditPatientMedicalHistoryModalProps) => {
  const initialRows: PatientMedicalHistoryRow[] =
    history?.patient_history_details && history.patient_history_details.length > 0
      ? history.patient_history_details
      : []

  const [rows, setRows] = useState<PatientMedicalHistoryRow[]>(initialRows)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleChange = (index: number, field: keyof PatientMedicalHistoryRow, value: string) => {
    setRows(prev => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      setSaving(true)
      const payload: PatientMedicalHistory = {
        ...(history || {}),
        patient,
        patient_history_details: rows,
      }
      const updated = await savePatientMedicalHistory(payload)
      toast.success('Patient medical history saved')
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
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Edit Patient Medical History
            </h2>
            {history?.template && (
              <p className="text-xs text-slate-500 mt-0.5">
                Template: {history.template}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
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
            {rows.length === 0 ? (
              <div className="text-sm text-slate-500">
                No questions are defined on this patient medical history. Please configure the template on the desk.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-[45%]">
                        Attribute
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 w-[15%]">
                        Yes / No
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">
                        Description / Reason
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row, idx) => (
                      <tr key={idx} className="align-top">
                        <td className="px-3 py-2 text-slate-800">
                          {row.attributes || '-'}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="w-full rounded border border-slate-300 px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                            value={row.yesno || ''}
                            onChange={(e) => handleChange(idx, 'yesno', e.target.value)}
                          >
                            <option value="">-</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <textarea
                            className="w-full rounded border border-slate-300 px-2 py-1 text-xs min-h-[48px] focus:outline-none focus:ring-1 focus:ring-primary"
                            value={row.description || ''}
                            onChange={(e) => handleChange(idx, 'description', e.target.value)}
                            placeholder="Description / reason"
                          />
                        </td>
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
              disabled={saving || rows.length === 0}
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

