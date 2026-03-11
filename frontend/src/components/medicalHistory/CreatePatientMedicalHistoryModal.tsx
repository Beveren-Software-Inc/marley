import { useState, useEffect } from 'react'
import type { PatientMedicalHistory, PatientMedicalHistoryRow } from '../../services/patients'
import {
  fetchPatientHealthHistoryTemplates,
  fetchPatientHealthHistoryTemplateDetails,
  savePatientMedicalHistory,
} from '../../services/patients'
import { toast } from '../../hooks/useToast'

interface CreatePatientMedicalHistoryModalProps {
  patient: string
  patientName?: string
  onClose: () => void
  onCreated: (history: PatientMedicalHistory) => void
}

export const CreatePatientMedicalHistoryModal = ({
  patient,
  patientName,
  onClose,
  onCreated,
}: CreatePatientMedicalHistoryModalProps) => {
  const [templates, setTemplates] = useState<{ name: string; label: string }[]>([])
  const [templateQuery, setTemplateQuery] = useState('')
  const [templateOpen, setTemplateOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [rows, setRows] = useState<PatientMedicalHistoryRow[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      setLoadingTemplates(true)
      try {
        const list = await fetchPatientHealthHistoryTemplates(templateQuery || undefined)
        if (!cancelled) setTemplates(list)
      } catch {
        if (!cancelled) setTemplates([])
      } finally {
        if (!cancelled) setLoadingTemplates(false)
      }
    }, templateQuery.trim() === '' ? 0 : 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [templateQuery])

  useEffect(() => {
    if (!selectedTemplate) {
      setRows([])
      return
    }
    let cancelled = false
    setLoadingDetails(true)
    fetchPatientHealthHistoryTemplateDetails(selectedTemplate)
      .then((details) => {
        if (!cancelled) setRows(details.patient_history_details || [])
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })
      .finally(() => {
        if (!cancelled) setLoadingDetails(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedTemplate])

  const handleChange = (index: number, field: keyof PatientMedicalHistoryRow, value: string) => {
    setRows((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const handleSelectTemplate = (name: string, label: string) => {
    setSelectedTemplate(name)
    setTemplateQuery(label)
    setTemplateOpen(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!selectedTemplate) {
      setError('Please select a template.')
      return
    }
    if (!rows.length) {
      setError('Template has no questions, or details are still loading.')
      return
    }
    try {
      setSaving(true)
      const payload: PatientMedicalHistory = {
        patient,
        patient_name: patientName,
        template: selectedTemplate,
        patient_history_details: rows,
      }
      const created = await savePatientMedicalHistory(payload)
      toast.success('Patient medical history created')
      onCreated(created)
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create medical history'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const selectedLabel = selectedTemplate
    ? templates.find((t) => t.name === selectedTemplate)?.label ?? selectedTemplate
    : ''

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Create Patient Medical History</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1"
            aria-label="Close"
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

          <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Template</label>
              <div className="relative">
                <input
                  type="text"
                  value={templateOpen ? templateQuery : selectedLabel}
                  onChange={(e) => {
                    setTemplateQuery(e.target.value)
                    if (!e.target.value) setSelectedTemplate(null)
                    setTemplateOpen(true)
                  }}
                  onFocus={() => setTemplateOpen(true)}
                  onBlur={() => setTimeout(() => setTemplateOpen(false), 200)}
                  placeholder="Search or select template..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {templateOpen && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {loadingTemplates ? (
                      <div className="px-3 py-2 text-sm text-slate-500">Loading...</div>
                    ) : templates.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-slate-500">No templates found</div>
                    ) : (
                      templates.map((t) => (
                        <button
                          key={t.name}
                          type="button"
                          onClick={() => handleSelectTemplate(t.name, t.label)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
                        >
                          {t.label}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {loadingDetails && selectedTemplate && (
              <div className="text-sm text-slate-500">Loading template questions...</div>
            )}

            {selectedTemplate && rows.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Complete the questions below (tick Yes/No and add description as needed)
                </label>
                <div className="border border-slate-200 rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-[40%]">
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
              disabled={saving || !selectedTemplate || loadingDetails || rows.length === 0}
              className="px-3 py-1.5 text-xs rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
