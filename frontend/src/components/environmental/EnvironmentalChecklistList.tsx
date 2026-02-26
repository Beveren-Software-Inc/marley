import { useEffect, useState } from 'react'
import { fetchInpatientAdmissions, type LinkFieldOption } from '../../services/common'
import {
  fetchEnvironmentalChecklist,
  applyEnvironmentalChecklistTemplate,
  updateEnvironmentalChecklist,
  type EnvironmentalChecklistDetail,
} from '../../services/environmentalChecklist'
import { toast } from '../../hooks/useToast'

interface EnvironmentalChecklistListProps {
  patient?: string
}

export const EnvironmentalChecklistList = ({ patient }: EnvironmentalChecklistListProps) => {
  const [admissions, setAdmissions] = useState<LinkFieldOption[]>([])
  const [selectedAdmission, setSelectedAdmission] = useState<string>('')
  const [details, setDetails] = useState<EnvironmentalChecklistDetail[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!patient) {
      setAdmissions([])
      setSelectedAdmission('')
      setDetails([])
      return
    }

    const loadAdmissions = async () => {
      try {
        const opts = await fetchInpatientAdmissions(patient)
        setAdmissions(opts)
        if (opts.length > 0 && !selectedAdmission) {
          setSelectedAdmission(opts[0].name)
        }
      } catch (err) {
        console.error('Failed to load inpatient admissions for environmental checklist', err)
      }
    }

    loadAdmissions()
  }, [patient])

  useEffect(() => {
    if (!selectedAdmission) {
      setDetails([])
      return
    }
    const loadChecklist = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchEnvironmentalChecklist(selectedAdmission)
        setDetails(data.details || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load environmental checklist')
        setDetails([])
      } finally {
        setLoading(false)
      }
    }
    loadChecklist()
  }, [selectedAdmission])

  const handleApplyTemplate = async () => {
    if (!selectedAdmission) return
    try {
      setLoading(true)
      setError(null)
      const data = await applyEnvironmentalChecklistTemplate(selectedAdmission)
      setDetails(data.details || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply template')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleChecked = (rowName: string) => {
    setDetails((prev) =>
      prev.map((row) =>
        row.name === rowName ? { ...row, checked: !row.checked } : row
      )
    )
  }

  const handleSave = async () => {
    if (!selectedAdmission) return
    try {
      setSaving(true)
      setError(null)
      const data = await updateEnvironmentalChecklist(selectedAdmission, details)
      setDetails(data.details || [])
      toast.success('Environmental Checklist updated')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update environmental checklist'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  if (!patient) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-md px-4 py-3 text-sm">
        Select a patient to view Environmental Checklist.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <div className="flex flex-col">
          <label className="text-xs font-medium text-slate-600 mb-1">Inpatient Admission</label>
          <select
            value={selectedAdmission}
            onChange={(e) => setSelectedAdmission(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm min-w-[220px]"
          >
            <option value="">Select admission...</option>
            {admissions.map((adm) => (
              <option key={adm.name} value={adm.name}>
                {adm.label || adm.name}
              </option>
            ))}
          </select>
        </div>
        {selectedAdmission && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleApplyTemplate}
              className="inline-flex items-center px-3 py-2 rounded-md bg-primary text-white text-sm hover:bg-primary/90"
            >
              + Load From Template
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="inline-flex items-center px-3 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="text-slate-600 text-sm">Loading environmental checklist...</div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {!loading && !error && selectedAdmission && (
        details.length === 0 ? (
          <div className="text-slate-500 text-sm">No checklist items found for this admission.</div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                    Item
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                    Checked
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {details.map((row) => (
                  <tr key={row.name}>
                    <td className="px-4 py-2 text-sm text-slate-800">{row.item_name}</td>
                    <td className="px-4 py-2 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-primary border-slate-300 rounded"
                        checked={row.checked}
                        onChange={() => handleToggleChecked(row.name)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}

