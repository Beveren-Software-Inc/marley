import { useEffect, useState } from 'react'
import {
  fetchCostCenters,
  fetchHealthcarePractitioners,
  fetchInpatientAdmissionOptions,
  fetchPatientVisits,
  getCurrentUserPractitioner,
} from '../../services/common'
import {
  applyEnvironmentalChecklistTemplate,
  createEnvironmentalChecklist,
  fetchDefaultEnvironmentalChecklistTemplate,
  fetchEnvironmentalChecklist,
  fetchEnvironmentalChecklistTemplates,
  updateEnvironmentalChecklist,
  type EnvironmentalChecklistDetail,
  type EnvironmentalChecklistTemplate,
} from '../../services/environmentalChecklist'
import { toast } from '../../hooks/useToast'
import { useCareContext } from '../../providers/CareContextProvider'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_FOOTER_STICKY,
  CREATE_MODAL_OVERLAY,
  CreateModalHeader,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { ClipboardCheck } from 'lucide-react'

interface EnvironmentalChecklistModalProps {
  patient: string
  patientName?: string
  defaultAdmission?: string
  defaultVisit?: string
  checklistName?: string
  onClose: () => void
  onSuccess: () => void
}

export function EnvironmentalChecklistModal({
  patient,
  patientName,
  defaultAdmission,
  defaultVisit,
  checklistName,
  onClose,
  onSuccess,
}: EnvironmentalChecklistModalProps) {
  const { mode, userCostCenter, costCenterCompany } = useCareContext()
  const isEdit = Boolean(checklistName)
  const isCreate = !isEdit
  const hidePatientVisit = isCreate && mode === 'IP' && Boolean(defaultAdmission)
  const hideInpatientAdmission = isCreate && mode === 'OP' && Boolean(defaultVisit)
  const [inpatientAdmission, setInpatientAdmission] = useState(defaultAdmission || '')
  const [patientVisit, setPatientVisit] = useState(defaultVisit || '')
  const [costCenter, setCostCenter] = useState(userCostCenter || '')
  const [costCenterOptions, setCostCenterOptions] = useState<{ name: string; label: string }[]>([])
  const [practitioner, setPractitioner] = useState('')
  const [practitionerOptions, setPractitionerOptions] = useState<{ name: string; label: string }[]>([])
  const [templates, setTemplates] = useState<EnvironmentalChecklistTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [details, setDetails] = useState<EnvironmentalChecklistDetail[]>([])
  const [recordName, setRecordName] = useState(checklistName || '')
  const [admissionOptions, setAdmissionOptions] = useState<{ name: string; label: string }[]>([])
  const [visitOptions, setVisitOptions] = useState<{ name: string; label: string }[]>([])
  const [loading, setLoading] = useState(Boolean(checklistName))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchCostCenters(costCenterCompany)
      .then(setCostCenterOptions)
      .catch(() => setCostCenterOptions([]))
  }, [costCenterCompany])

  useEffect(() => {
    fetchHealthcarePractitioners()
      .then(setPractitionerOptions)
      .catch(() => setPractitionerOptions([]))
  }, [])

  useEffect(() => {
    if (isEdit) return
    getCurrentUserPractitioner()
      .then((id) => {
        if (id) setPractitioner(id)
      })
      .catch(() => {})
  }, [isEdit])

  useEffect(() => {
    if (!isEdit && userCostCenter && !costCenter) {
      setCostCenter(userCostCenter)
    }
  }, [isEdit, userCostCenter, costCenter])

  useEffect(() => {
    if (!patient) return
    if (!hideInpatientAdmission) {
      fetchInpatientAdmissionOptions(undefined, patient)
        .then(setAdmissionOptions)
        .catch(() => setAdmissionOptions([]))
    }
    if (!hidePatientVisit) {
      fetchPatientVisits(patient)
        .then(setVisitOptions)
        .catch(() => setVisitOptions([]))
    }
  }, [patient, hideInpatientAdmission, hidePatientVisit])

  useEffect(() => {
    if (defaultAdmission) setInpatientAdmission(defaultAdmission)
  }, [defaultAdmission])

  useEffect(() => {
    if (defaultVisit) setPatientVisit(defaultVisit)
  }, [defaultVisit])

  useEffect(() => {
    if (!isCreate) return
    if (hidePatientVisit) setPatientVisit('')
    if (hideInpatientAdmission) setInpatientAdmission('')
  }, [isCreate, hidePatientVisit, hideInpatientAdmission])

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const templateList = await fetchEnvironmentalChecklistTemplates()
        setTemplates(templateList)
        if (!isEdit) {
          const defaultTemplate =
            templateList.find((t) => t.default) ||
            (await fetchDefaultEnvironmentalChecklistTemplate())
          if (defaultTemplate?.name) {
            setSelectedTemplate(defaultTemplate.name)
          }
        }
      } catch (err) {
        console.error('Failed to load templates', err)
      }
    }
    loadTemplates()
  }, [isEdit])

  useEffect(() => {
    if (!checklistName) return
    const loadExisting = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchEnvironmentalChecklist(checklistName)
        setRecordName(data.name)
        setInpatientAdmission(data.inpatient_admission || '')
        setPatientVisit(data.patient_visit || '')
        setCostCenter(data.cost_center || userCostCenter || '')
        setPractitioner(data.practitioner || '')
        setSelectedTemplate(data.environmental_checklist_template || '')
        setDetails(data.details || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load checklist')
      } finally {
        setLoading(false)
      }
    }
    loadExisting()
  }, [checklistName])

  useEffect(() => {
    if (isEdit || !selectedTemplate || recordName) return
    const loadTemplatePreview = async () => {
      try {
        setLoading(true)
        setError(null)
        const template = templates.find((t) => t.name === selectedTemplate)
        const items = template?.checklist_items || []
        setDetails(
          items.map((item, index) => ({
            name: `preview-${index}`,
            item_name: item.item_name,
            checked: false,
          }))
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load template items')
      } finally {
        setLoading(false)
      }
    }
    loadTemplatePreview()
  }, [isEdit, selectedTemplate, templates, recordName])

  const handleTemplateChange = async (templateName: string) => {
    setSelectedTemplate(templateName)
    if (!templateName) {
      setDetails([])
      return
    }

    if (recordName) {
      try {
        setLoading(true)
        setError(null)
        const data = await applyEnvironmentalChecklistTemplate(recordName, templateName)
        setDetails(data.details || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to apply template')
      } finally {
        setLoading(false)
      }
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
    if (!patient) {
      setError('Patient is required.')
      return
    }
    if (!selectedTemplate) {
      setError('Environmental Checklist Template is required.')
      return
    }

    try {
      setSaving(true)
      setError(null)

      let activeName = recordName
      if (!activeName) {
        const created = await createEnvironmentalChecklist({
          patient,
          inpatient_admission: hideInpatientAdmission ? undefined : (inpatientAdmission || undefined),
          patient_visit: hidePatientVisit ? undefined : (patientVisit || undefined),
          template_name: selectedTemplate,
          cost_center: costCenter || undefined,
          practitioner: practitioner || undefined,
        })
        activeName = created.name
        const checkedByItem = Object.fromEntries(details.map((row) => [row.item_name, row.checked]))
        const mergedDetails = (created.details || []).map((row) => ({
          ...row,
          checked: checkedByItem[row.item_name] ?? row.checked,
        }))
        await updateEnvironmentalChecklist(activeName, mergedDetails, {
          costCenter: costCenter || undefined,
          practitioner: practitioner || undefined,
        })
      } else {
        await updateEnvironmentalChecklist(activeName, details, {
          costCenter: costCenter || undefined,
          practitioner: practitioner || undefined,
        })
      }

      toast.success(isEdit ? 'Environmental Checklist updated' : 'Environmental Checklist created')
      onSuccess()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save environmental checklist'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('w-full max-w-3xl max-h-[92vh] overflow-hidden')}>
        <CreateModalHeader
          title={isEdit ? 'Environmental Checklist' : 'New Environmental Checklist'}
          icon={<ClipboardCheck className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          subtitle={patientName || patient}
          onClose={onClose}
        />

        <div className={`${CREATE_MODAL_BODY_GRADIENT} flex flex-1 flex-col min-h-0`}>
          {error && (
            <div className="mx-5 mt-3 bg-red-50 border border-red-200 rounded-md p-2.5 text-xs text-red-700 flex-shrink-0">
              {error}
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {!hideInpatientAdmission && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Inpatient Admission</label>
                  {isCreate && mode === 'IP' && defaultAdmission ? (
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                      {defaultAdmission}
                    </div>
                  ) : (
                    <select
                      value={inpatientAdmission}
                      onChange={(e) => setInpatientAdmission(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
                    >
                      <option value="">— Optional —</option>
                      {admissionOptions.map((option) => (
                        <option key={option.name} value={option.name}>{option.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {!hidePatientVisit && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Patient Visit</label>
                  {isCreate && mode === 'OP' && defaultVisit ? (
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                      {defaultVisit}
                    </div>
                  ) : (
                    <select
                      value={patientVisit}
                      onChange={(e) => setPatientVisit(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
                    >
                      <option value="">— Optional —</option>
                      {visitOptions.map((option) => (
                        <option key={option.name} value={option.name}>{option.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Practitioner</label>
                <select
                  value={practitioner}
                  onChange={(e) => setPractitioner(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="">— Select practitioner —</option>
                  {practitionerOptions.map((option) => (
                    <option key={option.name} value={option.name}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Cost Center</label>
                <select
                  value={costCenter}
                  onChange={(e) => setCostCenter(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="">— Select cost center —</option>
                  {costCenterOptions.map((option) => (
                    <option key={option.name} value={option.name}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className={hideInpatientAdmission || hidePatientVisit ? '' : 'md:col-span-2'}>
                <label className="block text-xs font-medium text-slate-600 mb-1">Template</label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
                  disabled={loading || templates.length === 0}
                >
                  <option value="">Choose a template...</option>
                  {templates.map((template) => (
                    <option key={template.name} value={template.name}>
                      {template.name}
                      {template.default ? ' (Default)' : ''}
                      {` (${template.checklist_items?.length || 0} items)`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loading ? (
              <div className="text-sm text-slate-500">Loading checklist items...</div>
            ) : details.length === 0 ? (
              <div className="bg-blue-50 border border-blue-200 rounded-md px-4 py-3 text-sm text-blue-700">
                Select a template to load checklist items.
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 px-4 py-2">
                  <h3 className="text-sm font-semibold text-slate-700">Checklist Items</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Completed: {details.filter((d) => d.checked).length} / {details.length}
                  </p>
                </div>
                <div className="max-h-[420px] overflow-y-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase w-12">#</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Item</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-slate-600 uppercase w-24">Done</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {details.map((row, index) => (
                        <tr key={row.name} className="hover:bg-slate-50">
                          <td className="px-4 py-2 text-sm text-slate-500 text-center">{index + 1}</td>
                          <td className="px-4 py-2 text-sm text-slate-800">{row.item_name}</td>
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
              </div>
            )}
          </div>

          <div className={`${CREATE_MODAL_FOOTER_STICKY} justify-end gap-2`}>
            <button type="button" onClick={onClose} disabled={saving} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading || !selectedTemplate || details.length === 0}
              className={CM_BTN_PRIMARY}
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Checklist'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
