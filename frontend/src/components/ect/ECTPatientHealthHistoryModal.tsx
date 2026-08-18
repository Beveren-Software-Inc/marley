import { useState, useEffect, useRef } from 'react'
import { apiRequest } from '../../services/apiClient'
import { getCurrentUserPractitionerOption, type LinkFieldOption } from '../../services/common'
import {
  fetchPatientHealthHistoryTemplate2Details,
  fetchPatientHealthHistoryTemplate2Options,
} from '../../services/patients'
import { toast } from '../../hooks/useToast'
import { ChevronDown, Plus } from 'lucide-react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY_STACK,
  CreateModalHeader,
  createModalShellClass,
  MODAL_FIELD_CLASS,
  MODAL_LABEL_CLASS,
  MODAL_SECTION_CLASS,
  MODAL_SECTION_TITLE_CLASS,
} from '../ui/CreateModalChrome'
import {
  linkComboboxDropdownClass,
  linkComboboxInputWithClearClass,
  linkComboboxOptionClassCompact,
} from '../ui/linkComboboxStyles'
import { useCareContext } from '../../providers/CareContextProvider'

interface ECTPatientHealthHistoryModalProps {
  patient?: string
  patientName?: string
  admissionNo?: string
  onClose: () => void
  onSuccess?: () => void
}

interface HealthHistoryRow {
  _key: string
  history: string
  yes: boolean
  remarks: string
  no_format: number
  is_diabetic: boolean
  type: string
  specify: boolean
  speficication: string
}

const lc = 'block text-xs font-semibold text-slate-600 mb-1'
const ic = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white'

function nowDate() {
  return new Date().toISOString().slice(0, 10)
}
function nowTime() {
  return new Date().toTimeString().slice(0, 5)
}

export const ECTPatientHealthHistoryModal = ({
  patient = '',
  patientName = '',
  admissionNo = '',
  onClose,
  onSuccess,
}: ECTPatientHealthHistoryModalProps) => {
  const { activeAdmission, selectedPatient: contextPatient } = useCareContext()

  // ── General
  const [patientField] = useState(patient || contextPatient || '')
  const [patientNameField] = useState(patientName || '')
  const [admissionField] = useState(admissionNo || activeAdmission || '')
  const [historyDate, setHistoryDate] = useState(nowDate())
  const [historyTime, setHistoryTime] = useState(nowTime())
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [username, setUsername] = useState('')

  // ── Template
  const [templateOptions, setTemplateOptions] = useState<LinkFieldOption[]>([])
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateQuery, setTemplateQuery] = useState('')
  const [templateSelected, setTemplateSelected] = useState<LinkFieldOption | null>(null)
  const [templateLoading, setTemplateLoading] = useState(false)
  const [healthRows, setHealthRows] = useState<HealthHistoryRow[]>([])
  const templateRef = useRef<HTMLDivElement>(null)

  const [submitting, setSubmitting] = useState(false)

  const loadTemplateRows = async (opt: LinkFieldOption) => {
    setTemplateSelected(opt)
    setTemplateQuery(opt.label)
    setTemplateOpen(false)
    setTemplateLoading(true)
    try {
      const details = await fetchPatientHealthHistoryTemplate2Details(opt.name)
      const items = details?.templates || []
      if (items.length > 0) {
        setHealthRows(
          items.map((r, idx) => ({
            _key: Math.random().toString(36).slice(2),
            history: r.history || '',
            yes: Boolean(r.yes),
            remarks: r.remarks || '',
            no_format: r.no_format || idx + 1,
            is_diabetic: Boolean(r.is_diabetic),
            type: r.type || '',
            specify: Boolean(r.specify),
            speficication: r.speficication || '',
          }))
        )
        toast.success(`Loaded ${items.length} item${items.length !== 1 ? 's' : ''} from template.`)
      } else {
        toast.error('Template has no items.')
      }
    } catch {
      toast.error('Failed to load template.')
    } finally {
      setTemplateLoading(false)
    }
  }

  // Auto-select default template on mount
  useEffect(() => {
    let cancelled = false
    const loadDefault = async () => {
      try {
        const options = await fetchPatientHealthHistoryTemplate2Options()
        if (cancelled) return
        const def = options.find((o) => Boolean(o.default))
        if (def) {
          await loadTemplateRows(def)
        }
      } catch {
        /* ignore */
      }
    }
    void loadDefault()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-select current user's practitioner as username
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const pract = await getCurrentUserPractitionerOption()
        if (cancelled || !pract) return
        setUsername(pract.name)
      } catch {
        /* ignore */
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  // Template options
  useEffect(() => {
    if (!templateOpen) return
    const id = setTimeout(async () => {
      try {
        setTemplateOptions(await fetchPatientHealthHistoryTemplate2Options(templateQuery.trim() || undefined))
      } catch { setTemplateOptions([]) }
    }, templateQuery.trim() ? 300 : 0)
    return () => clearTimeout(id)
  }, [templateOpen, templateQuery])

  // Close dropdowns
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (templateRef.current && !templateRef.current.contains(e.target as Node)) setTemplateOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleTemplateSelect = async (opt: LinkFieldOption) => {
    await loadTemplateRows(opt)
  }

  const clearTemplate = () => {
    setTemplateSelected(null)
    setTemplateQuery('')
    setTemplateOpen(false)
  }

  const addHealthRow = () =>
    setHealthRows((prev) => [
      ...prev,
      { _key: Math.random().toString(36).slice(2), history: '', yes: false, remarks: '', no_format: prev.length + 1, is_diabetic: false, type: '', specify: false, speficication: '' },
    ])

  const updateHealthRow = (key: string, field: keyof Omit<HealthHistoryRow, '_key'>, value: string | boolean | number) =>
    setHealthRows((prev) => prev.map((r) => (r._key === key ? { ...r, [field]: value } : r)))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!patientField) {
      toast.error('Patient is required')
      return
    }
    for (const r of healthRows) {
      if (r.is_diabetic && !r.type.trim()) {
        toast.error(`Diabetic Type is required for "${r.history || 'item'}"`)
        return
      }
      if (r.specify && !r.speficication.trim()) {
        toast.error(`Specification is required for "${r.history || 'item'}"`)
        return
      }
    }
    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        patient: patientField,
        patient_name: patientNameField || undefined,
        inpatient_admission: admissionField || undefined,
        date: historyDate || undefined,
        time: historyTime || undefined,
        height: height || undefined,
        weight: weight || undefined,
        username: username || undefined,
        template: templateSelected?.name || undefined,
        template_feedback: healthRows.map((r) => ({
          history: r.history,
          yes: r.yes ? 1 : 0,
          remarks: r.remarks,
          no_format: r.no_format,
          is_diabetic: r.is_diabetic ? 1 : 0,
          type: r.type,
          specify: r.specify ? 1 : 0,
          speficication: r.speficication,
        })),
      }
      await apiRequest<{ name: string }>('/api/resource/Patient%20Health%20History', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      toast.success('Patient Health History saved successfully.')
      onSuccess?.()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save Patient Health History.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY_STACK} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={createModalShellClass('max-w-4xl max-h-[92vh] overflow-hidden')} onMouseDown={(e) => e.stopPropagation()}>
        <CreateModalHeader title="Patient Health History" onClose={onClose} />
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {/* Top: Patient info + Date/Time + Height/Weight */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={lc}>Patient *</label>
                <input type="text" value={patientNameField || patientField} readOnly className={`${ic} bg-slate-100 cursor-not-allowed`} />
              </div>
              <div>
                <label className={lc}>Admission / Patient Visit</label>
                <input type="text" value={admissionField} readOnly className={`${ic} bg-slate-100`} />
              </div>
              <div>
                <label className={lc}>Date</label>
                <input type="date" value={historyDate} onChange={(e) => setHistoryDate(e.target.value)} className={ic} />
              </div>
              <div>
                <label className={lc}>Time</label>
                <input type="time" value={historyTime} onChange={(e) => setHistoryTime(e.target.value)} className={ic} />
              </div>
              <div>
                <label className={lc}>Height</label>
                <input type="text" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="e.g. 170 cm" className={ic} />
              </div>
              <div>
                <label className={lc}>Weight</label>
                <input type="text" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g. 70 kg" className={ic} />
              </div>
            </div>

            {/* Middle: Template section + child table */}
            <div className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>Template</h3>
              <div ref={templateRef} className="mb-3">
                <label className={lc}>Template</label>
                <div className="relative">
                  <input
                    type="text"
                    value={templateSelected ? templateSelected.label : templateQuery}
                    onChange={(e) => { setTemplateQuery(e.target.value); setTemplateOpen(true); if (templateSelected) clearTemplate() }}
                    onFocus={() => setTemplateOpen(true)}
                    placeholder="Search template..."
                    className={`${linkComboboxInputWithClearClass} pr-9`}
                  />
                  <span className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-slate-400">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </span>
                  {templateOpen && templateOptions.length > 0 && (
                    <div className={linkComboboxDropdownClass}>
                      {templateOptions.map((opt) => (
                        <button key={opt.name} type="button" onClick={() => handleTemplateSelect(opt)} className={linkComboboxOptionClassCompact}>
                          <span className="font-medium text-slate-800">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {templateLoading && <p className="mt-1.5 text-xs text-slate-500">Loading template items…</p>}
              </div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-slate-600">{healthRows.length} item{healthRows.length !== 1 ? 's' : ''}</p>
                <button type="button" onClick={addHealthRow} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100">
                  <Plus className="h-3.5 w-3.5" /> Add Item
                </button>
              </div>
              {healthRows.length === 0 ? (
                <p className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-sm text-slate-400">
                  No history items yet — select a template or add manually.
                </p>
              ) : (
                <div className="space-y-2">
                  {healthRows.map((row, idx) => (
                    <div key={row._key} className="rounded-md border border-slate-200 bg-white p-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500">
                          {idx + 1}
                        </span>
                        <div className="flex-1">
                          <label className={`${MODAL_LABEL_CLASS} text-[10px]`}>History</label>
                          <input type="text" value={row.history} onChange={(e) => updateHealthRow(row._key, 'history', e.target.value)} className={`${MODAL_FIELD_CLASS} px-2 py-1 text-sm`} placeholder="e.g. Diabetic, Hypertension…" />
                        </div>
                        <div className="flex items-center gap-1.5 pt-4">
                          <input type="checkbox" checked={row.yes} onChange={(e) => updateHealthRow(row._key, 'yes', e.target.checked)} className="h-4 w-4" />
                          <span className="text-xs font-medium text-slate-700">Yes</span>
                        </div>
                      </div>
                      {row.is_diabetic && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide w-24">Diabetic Type *</span>
                          <select value={row.type} onChange={(e) => updateHealthRow(row._key, 'type', e.target.value)} className={`${MODAL_FIELD_CLASS} w-32 px-2 py-1 text-xs`} required>
                            <option value="">Select Type</option>
                            <option value="Type 1">Type 1</option>
                            <option value="Type 2">Type 2</option>
                          </select>
                        </div>
                      )}
                      {row.specify && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide w-24">Specification *</span>
                          <input type="text" value={row.speficication} onChange={(e) => updateHealthRow(row._key, 'speficication', e.target.value)} className={`${MODAL_FIELD_CLASS} flex-1 px-2 py-1 text-xs`} placeholder="Specify e.g. which cancer…" required />
                        </div>
                      )}
                      <div className="mt-1.5">
                        <label className={`${MODAL_LABEL_CLASS} text-[10px]`}>Remarks</label>
                        <textarea rows={1} value={row.remarks} onChange={(e) => updateHealthRow(row._key, 'remarks', e.target.value)} className={`${MODAL_FIELD_CLASS} w-full resize-y px-2 py-1 text-sm`} placeholder="Optional remarks…" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-3 bg-white">
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>Cancel</button>
            <button type="submit" disabled={submitting} className={CM_BTN_PRIMARY}>{submitting ? 'Saving…' : 'Save History'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}