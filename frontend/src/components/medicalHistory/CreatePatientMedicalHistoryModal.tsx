import { useState, useEffect, useRef } from 'react'
import type { PatientMedicalHistory, PatientMedicalHistoryRow } from '../../services/patients'
import {
  fetchPatientHealthHistoryTemplates,
  fetchPatientHealthHistoryTemplateDetails,
  savePatientMedicalHistory,
} from '../../services/patients'
import { fetchInpatientAdmissionOptions, type LinkFieldOption } from '../../services/common'
import { toast } from '../../hooks/useToast'

interface CreatePatientMedicalHistoryModalProps {
  patient: string
  patientName?: string
  defaultAdmission?: string
  onClose: () => void
  onCreated: (history: PatientMedicalHistory) => void
}

export const CreatePatientMedicalHistoryModal = ({
  patient,
  patientName,
  defaultAdmission,
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
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  // Inpatient admission
  const [admissionOptions, setAdmissionOptions] = useState<LinkFieldOption[]>([])
  const [selectedAdmission, setSelectedAdmission] = useState<string>(defaultAdmission ?? '')

  useEffect(() => {
    fetchInpatientAdmissionOptions(undefined, patient)
      .then(setAdmissionOptions)
      .catch(() => setAdmissionOptions([]))
  }, [patient])

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

  const handleInputFocus = () => {
    setTemplateOpen(true)
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
      })
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTemplateQuery(e.target.value)
    if (!e.target.value) setSelectedTemplate(null)
    setTemplateOpen(true)
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
      })
    }
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
        inpatient_admission: selectedAdmission || null,
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
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Create Patient Medical History</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 p-1 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          {error && (
            <div className="mx-4 mt-3 mb-1 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-2 text-xs text-red-700 dark:text-red-400">
              <div className="flex items-start gap-2">
                <svg className="w-3 h-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Inpatient Admission</label>
              <select
                value={selectedAdmission}
                onChange={(e) => setSelectedAdmission(e.target.value)}
                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors"
              >
                <option value="">— None —</option>
                {admissionOptions.map((a) => (
                  <option key={a.name} value={a.name}>{a.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Template</label>
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={templateOpen ? templateQuery : selectedLabel}
                  onChange={handleInputChange}
                  onFocus={handleInputFocus}
                  onBlur={() => setTimeout(() => setTemplateOpen(false), 200)}
                  placeholder="Search or select template..."
                  className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-2 text-sm placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors"
                />
                
                {/* Portal-like dropdown that appears outside modal */}
                {templateOpen && dropdownPosition && (
                  <div
                    ref={dropdownRef}
                    className="fixed z-[9999] bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-lg max-h-48 overflow-y-auto"
                    style={{
                      top: `${dropdownPosition.top}px`,
                      left: `${dropdownPosition.left}px`,
                      width: `${inputRef.current?.offsetWidth}px`,
                    }}
                  >
                    {loadingTemplates ? (
                      <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">Loading...</div>
                    ) : templates.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No templates found</div>
                    ) : (
                      templates.map((t) => (
                        <button
                          key={t.name}
                          type="button"
                          onClick={() => handleSelectTemplate(t.name, t.label)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-900 dark:text-white transition-colors"
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
              <div className="text-sm text-slate-500 dark:text-slate-400">Loading template questions...</div>
            )}

            {selectedTemplate && rows.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Complete the questions below (tick Yes/No and add description as needed)
                </label>
                <div className="border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300 w-[40%]">
                          Attribute
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300 w-[15%]">
                          Yes / No
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
                          Description / Reason
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {rows.map((row, idx) => (
                        <tr key={idx} className="align-top">
                          <td className="px-3 py-2 text-slate-800 dark:text-slate-200">
                            {row.attributes || '-'}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors"
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
                              className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-2 py-1 text-xs min-h-[48px] placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors"
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

          <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !selectedTemplate || loadingDetails || rows.length === 0}
              className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
