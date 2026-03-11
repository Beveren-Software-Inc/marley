import { useState } from 'react'
import type { InpatientRecord, PatientVisitorInput, PatientVisitorRow } from '../../services/inpatientRecords'
import { addPatientVisitor } from '../../services/inpatientRecords'

interface AddVisitorModalProps {
  admission: InpatientRecord
  onClose: () => void
  onSuccess: (row: PatientVisitorRow) => void
}

export const AddVisitorModal = ({ admission, onClose, onSuccess }: AddVisitorModalProps) => {
  const [form, setForm] = useState<PatientVisitorInput>({
    visitors_name: '',
    relationship_with_patient: '',
    cpr__id_no: '',
    any_remarks: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updateField = (field: keyof PatientVisitorInput, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!form.visitors_name.trim()) {
      setError('Visitor name is required')
      return
    }
    if (!form.relationship_with_patient.trim()) {
      setError('Relationship with patient is required')
      return
    }

    try {
      setSubmitting(true)
      const row = await addPatientVisitor(admission.name, {
        visitors_name: form.visitors_name.trim(),
        relationship_with_patient: form.relationship_with_patient.trim(),
        cpr__id_no: form.cpr__id_no?.trim() || undefined,
        any_remarks: form.any_remarks?.trim() || undefined,
      })
      onSuccess(row)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add visitor')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Add Visitor</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {admission.name} – {admission.patient_name || admission.patient}
            </p>
          </div>
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

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          {error && (
            <div className="px-4 pt-3 text-xs text-red-700 bg-red-50 border-b border-red-200">
              {error}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm text-slate-700">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Visitor Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.visitors_name}
                  onChange={(e) => updateField('visitors_name', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Full name"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Relationship with Patient <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.relationship_with_patient}
                  onChange={(e) => updateField('relationship_with_patient', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select relationship…</option>
                  <option value="Father">Father</option>
                  <option value="Mother">Mother</option>
                  <option value="Brother">Brother</option>
                  <option value="Sister">Sister</option>
                  <option value="Husband">Husband</option>
                  <option value="Wife">Wife</option>
                  <option value="Son">Son</option>
                  <option value="Daughter">Daughter</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  CPR / ID No
                </label>
                <input
                  type="text"
                  value={form.cpr__id_no || ''}
                  onChange={(e) => updateField('cpr__id_no', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g. 123456789"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Entered Date
                </label>
                <input
                  type="text"
                  value={new Date().toLocaleDateString()}
                  className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm bg-slate-50 text-slate-500"
                  readOnly
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Any Remarks
              </label>
              <textarea
                value={form.any_remarks || ''}
                onChange={(e) => updateField('any_remarks', e.target.value)}
                rows={3}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Notes about the visit (optional)…"
              />
            </div>
          </div>

          <div className="px-4 py-3 border-t border-slate-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary/90 disabled:opacity-60"
              disabled={submitting}
            >
              {submitting ? 'Saving…' : 'Save Visitor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

