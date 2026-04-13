// EnvironmentalChecklistList.tsx
import { useEffect, useState } from 'react'
import { useCareContext } from '../../providers/CareContextProvider'
import {
  fetchEnvironmentalChecklist,
  fetchEnvironmentalChecklistTemplates,
  applyEnvironmentalChecklistTemplate,
  updateEnvironmentalChecklist,
  type EnvironmentalChecklistDetail,
  type EnvironmentalChecklistTemplate,
} from '../../services/environmentalChecklist'
import { toast } from '../../hooks/useToast'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'

interface EnvironmentalChecklistListProps {
  patient?: string
}

export const EnvironmentalChecklistList = ({ patient }: EnvironmentalChecklistListProps) => {
  const { mode, activeAdmission, activeVisit } = useCareContext()
  const [templates, setTemplates] = useState<EnvironmentalChecklistTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [details, setDetails] = useState<EnvironmentalChecklistDetail[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Get the active admission (for IP) or visit (for OP)
  const activeEncounter = mode === 'IP' ? activeAdmission : activeVisit
  const isIP = mode === 'IP'

  // Load templates when component mounts
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const templatesList = await fetchEnvironmentalChecklistTemplates()
        setTemplates(templatesList)
      } catch (err) {
        console.error('Failed to load templates', err)
      }
    }
    loadTemplates()
  }, [])

  // Load checklist when active encounter changes
  useEffect(() => {
    if (!activeEncounter || !isIP) {
      setDetails([])
      setSelectedTemplate('')
      return
    }
    
    const loadChecklist = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchEnvironmentalChecklist(activeEncounter)
        setDetails(data.details || [])
        setSelectedTemplate(data.environmental_checklist_template || '')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load environmental checklist')
        setDetails([])
      } finally {
        setLoading(false)
      }
    }
    loadChecklist()
  }, [activeEncounter, isIP])

  // Auto-apply template when selected
  useEffect(() => {
    const autoApplyTemplate = async () => {
      if (!activeEncounter || !selectedTemplate) return
      
      // Only auto-apply if the selected template is different from current or if no details exist
      const currentTemplate = selectedTemplate
      const hasNoDetails = details.length === 0
      
      if (hasNoDetails || currentTemplate) {
        try {
          setLoading(true)
          setError(null)
          const data = await applyEnvironmentalChecklistTemplate(activeEncounter, selectedTemplate)
          setDetails(data.details || [])
          if (data.details && data.details.length > 0) {
            toast.success(`Template "${selectedTemplate}" loaded with ${data.details.length} items`)
          }
        } catch (err) {
          console.error('Failed to auto-apply template:', err)
          setError(err instanceof Error ? err.message : 'Failed to load template')
        } finally {
          setLoading(false)
        }
      }
    }

    autoApplyTemplate()
  }, [selectedTemplate, activeEncounter]) // Re-run when template selection changes

  const handleToggleChecked = (rowName: string) => {
    setDetails((prev) =>
      prev.map((row) =>
        row.name === rowName ? { ...row, checked: !row.checked } : row
      )
    )
  }

  const handleSave = async () => {
    if (!activeEncounter) return
    
    try {
      setSaving(true)
      setError(null)
      const data = await updateEnvironmentalChecklist(activeEncounter, details)
      setDetails(data.details || [])
      toast.success('Environmental Checklist saved successfully')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update environmental checklist'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  // Show message if no patient
  if (!patient) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-md px-4 py-3 text-sm">
        Select a patient to view Environmental Checklist.
      </div>
    )
  }

  // Show message if not in IP mode
  if (!isIP) {
    return (
      <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-md px-4 py-3 text-sm">
        Environmental Checklist is only available for Inpatient Admissions.
      </div>
    )
  }

  // Show message if no active admission
  if (!activeEncounter) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-md px-4 py-3 text-sm">
        No active inpatient admission found for this patient.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div className="flex items-end gap-3 flex-wrap">
            {/* Admission Info (read-only) */}
            <div className="flex flex-col">
              <label className="text-xs font-medium text-slate-600 mb-1">Inpatient Admission</label>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm min-w-[220px]">
                {activeEncounter}
              </div>
            </div>

            {/* Template Selection - Auto-applies when changed */}
            {templates.length > 0 && (
              <div className="flex flex-col">
                <label className="text-xs font-medium text-slate-600 mb-1">Select Template</label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm min-w-[220px] bg-white"
                  disabled={loading}
                >
                  <option value="">Choose a template...</option>
                  {templates.map((template) => (
                    <option key={template.name} value={template.name}>
                      {template.name} ({template.checklist_items?.length || 0} items)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Save Button */}
            {details.length > 0 && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || loading}
                  className="inline-flex items-center px-3 py-2 rounded-md bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Checklist'}
                </button>
              </div>
            )}
          </div>

          {/* Print button */}
          <PrintFormatDropdown
            doctype="Inpatient Admission"
            docName={activeEncounter}
            noLetterhead={0}
            triggerPrint={1}
            className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-primary hover:bg-slate-50"
          />
        </div>
      </div>

      {/* Loading and Error States */}
      {loading && (
        <div className="text-slate-600 text-sm">Loading environmental checklist...</div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Checklist Table */}
      {!loading && !error && (
        details.length === 0 ? (
          <div className="bg-blue-50 border border-blue-200 rounded-md px-4 py-3 text-sm text-blue-700">
            Select a template from the dropdown above to load checklist items.
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2">
              <h3 className="text-sm font-semibold text-slate-700">Environmental Checklist Items</h3>
              {selectedTemplate && (
                <p className="text-xs text-slate-500 mt-0.5">
                  Template: {selectedTemplate} ({details.length} items)
                </p>
              )}
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase w-12">
                      #
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                      Checklist Item
                    </th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-slate-600 uppercase w-24">
                      Completed
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {details.map((row, index) => (
                    <tr key={row.name} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-sm text-slate-500 text-center">
                        {index + 1}
                      </td>
                      <td className="px-4 py-2 text-sm text-slate-800">
                        {row.item_name}
                      </td>
                      <td className="px-4 py-2 text-sm text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 text-primary border-slate-300 rounded focus:ring-primary"
                          checked={row.checked}
                          onChange={() => handleToggleChecked(row.name)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-slate-50 border-t border-slate-200 px-4 py-2">
              <div className="text-xs text-slate-500">
                Completed: {details.filter(d => d.checked).length} / {details.length} items
              </div>
            </div>
          </div>
        )
      )}
    </div>
  )
}