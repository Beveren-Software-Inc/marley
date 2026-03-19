import { useState, useCallback, useRef, useEffect } from 'react'
import { apiRequest } from '../../services/apiClient'
import { fetchPatientVisits, fetchPatientOptions, fetchInpatientAdmissionOptions, type LinkFieldOption } from '../../services/common'
import { toast } from '../../hooks/useToast'
import { X, ChevronDown, Plus, Trash2, Check, AlertCircle, BookOpen } from 'lucide-react'

// ─── Link Combobox ────────────────────────────────────────────────────────────

interface LinkComboboxProps {
  label: string
  value: string
  onSelect: (opt: LinkFieldOption) => void
  onClear: () => void
  fetchOptions: (s: string) => Promise<LinkFieldOption[]>
  placeholder?: string
  required?: boolean
}

const LinkCombobox = ({ label, value, onSelect, onClear, fetchOptions, placeholder, required }: LinkComboboxProps) => {
  const [query, setQuery] = useState(value)
  const [options, setOptions] = useState<LinkFieldOption[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(value) }, [value])
  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      setLoading(true)
      try { setOptions(await fetchOptions(query)) } catch { setOptions([]) } finally { setLoading(false) }
    }, query.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [query, open, fetchOptions])
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-semibold text-slate-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="relative">
        <input type="text" value={query}
          onChange={e => { setQuery(e.target.value); onClear(); setOpen(true) }}
          onFocus={() => setOpen(true)} placeholder={placeholder ?? 'Search...'} autoComplete="off"
          className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white" />
        <span className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-slate-400">
          {loading
            ? <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-primary rounded-full animate-spin" />
            : <ChevronDown className="w-3.5 h-3.5" />}
        </span>
      </div>
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-52 overflow-y-auto">
          {options.length === 0
            ? <div className="px-3 py-2 text-xs text-slate-400">{loading ? 'Searching…' : 'No results found'}</div>
            : options.map(opt => (
              <button key={opt.name} type="button"
                onClick={() => { onSelect(opt); setQuery(opt.label); setOpen(false) }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-primary/5">
                <span className="font-medium text-slate-800">{opt.label}</span>
                {opt.label !== opt.name && <span className="ml-1.5 text-xs text-slate-400">{opt.name}</span>}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface HistoryRow {
  _key: string
  attribute: string
  description: string
}

interface PatientHistoryModalProps {
  admissionNo?: string
  patient?: string
  patientName?: string
  onClose: () => void
  onSuccess?: () => void
}

type TabId = 'general' | 'history'

const TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'history', label: 'History Details' },
]

const ic = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white'
const lc = 'block text-xs font-semibold text-slate-600 mb-1'

async function fetchHistoryTemplates(search: string): Promise<LinkFieldOption[]> {
  try {
    const params = new URLSearchParams({
      doctype: 'Patient History Template',
      txt: search || '',
      page_length: '20',
    })
    const res = await fetch(`/api/method/frappe.client.get_list?${params}`)
    const data = await res.json()
    const list = Array.isArray(data?.message) ? data.message : []
    return list.map((r: any) => ({ name: r.name, label: r.template || r.name }))
  } catch { return [] }
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export const PatientHistoryModal = ({
  admissionNo = '',
  patient = '',
  patientName = '',
  onClose,
  onSuccess,
}: PatientHistoryModalProps) => {
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const [submitting, setSubmitting] = useState(false)

  // General
  const [inpatientAdmission, setInpatientAdmission] = useState(admissionNo)
  const [patientVisit, setPatientVisit] = useState('')
  const [patientVisitLabel, setPatientVisitLabel] = useState('')
  const [patientField, setPatientField] = useState(patient)
  const [patientNameField, setPatientNameField] = useState(patientName || '')
  const isLockedContext = Boolean(admissionNo)

  const DEFAULT_TEMPLATE = 'Default History Form'

  // Template
  const [templateName, setTemplateName] = useState(DEFAULT_TEMPLATE)
  const [templateLabel, setTemplateLabel] = useState(DEFAULT_TEMPLATE)
  const [templateLoading, setTemplateLoading] = useState(false)

  // Child table
  const [rows, setRows] = useState<HistoryRow[]>([])

  const fetchVisits = useCallback(
    (search: string) => fetchPatientVisits(patientField, search || undefined),
    [patientField]
  )

  const fetchPatientOpts = useCallback((s: string) => fetchPatientOptions(s || undefined), [])
  const fetchAdmissionOpts = useCallback(
    (s: string) => fetchInpatientAdmissionOptions(s || undefined, patientField || undefined),
    [patientField]
  )

  // Auto-load default template on mount
  useEffect(() => {
    const loadDefault = async () => {
      setTemplateLoading(true)
      try {
        const res = await fetch(
          `/api/resource/Patient%20History%20Template/${encodeURIComponent(DEFAULT_TEMPLATE)}`
        )
        if (!res.ok) return
        const data = await res.json()
        const doc = data?.data ?? data?.message
        const items: any[] = Array.isArray(doc?.history_detail) ? doc.history_detail : []
        if (items.length > 0) {
          setRows(items.map(r => ({
            _key: Math.random().toString(36).slice(2),
            attribute: r.attribute ?? '',
            description: r.description ?? '',
          })))
        }
      } catch { /* silently ignore if template not found */ } finally {
        setTemplateLoading(false)
      }
    }
    loadDefault()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleTemplateSelect = async (opt: LinkFieldOption) => {
    setTemplateName(opt.name)
    setTemplateLabel(opt.label)
    setTemplateLoading(true)
    try {
      const res = await fetch(
        `/api/resource/Patient%20History%20Template/${encodeURIComponent(opt.name)}`
      )
      const data = await res.json()
      const doc = data?.data ?? data?.message
      const items: any[] = Array.isArray(doc?.history_detail) ? doc.history_detail : []
      if (items.length > 0) {
        setRows(items.map(r => ({
          _key: Math.random().toString(36).slice(2),
          attribute: r.attribute ?? '',
          description: r.description ?? '',
        })))
        toast.success(`Loaded ${items.length} item${items.length !== 1 ? 's' : ''} from template.`)
        setActiveTab('history')
      } else {
        toast.error('Template has no items.')
      }
    } catch {
      toast.error('Failed to load template.')
    } finally {
      setTemplateLoading(false)
    }
  }

  const addRow = () =>
    setRows(prev => [...prev, { _key: Math.random().toString(36).slice(2), attribute: '', description: '' }])

  const removeRow = (key: string) => setRows(prev => prev.filter(r => r._key !== key))

  const updateRow = (key: string, field: 'attribute' | 'description', value: string) =>
    setRows(prev => prev.map(r => r._key === key ? { ...r, [field]: value } : r))

  const filledCount = rows.filter(r => r.description.trim().length > 0).length

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); e.stopPropagation()
    setSubmitting(true)
    try {
      const payload = {
        inpatient_admission: inpatientAdmission || undefined,
        patient_visit: patientVisit || undefined,
        patient: patientField || undefined,
        history_detail: rows.map(({ _key: _unused, ...rest }) => rest),
      }
      await apiRequest('/api/resource/Patient%20History', {
        method: 'POST',
        body: JSON.stringify({ data: payload }),
      })
      toast.success('Patient History saved successfully.')
      onSuccess?.()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save record.')
    } finally {
      setSubmitting(false)
    }
  }

  const currentTabIdx = TABS.findIndex(t => t.id === activeTab)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative z-10 w-full max-w-3xl max-h-[92vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onMouseDown={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Patient History</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {patientName ? `${patientName} · ` : ''}{admissionNo || 'New Record'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200 ml-4 shrink-0"
            aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-white shrink-0">
          {TABS.map(tab => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}>
              {tab.label}
              {tab.id === 'history' && rows.length > 0 && (
                <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
                  filledCount === rows.length ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {filledCount}/{rows.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} noValidate className="flex-1 overflow-y-auto">
          <div className="px-6 py-5">

            {/* ── Tab 1: General ── */}
            {activeTab === 'general' && (
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-semibold text-slate-800 border-b border-slate-200 pb-1.5 mb-4">Patient & Visit Information</p>
                  <div className="grid grid-cols-2 gap-4 mb-5">
                    {isLockedContext ? (
                      <div>
                        <label className={lc}>Inpatient Admission</label>
                        <input type="text" value={inpatientAdmission} readOnly className={`${ic} bg-slate-100 cursor-not-allowed`} />
                      </div>
                    ) : (
                      <LinkCombobox
                        label="Inpatient Admission"
                        value={inpatientAdmission}
                        onSelect={opt => setInpatientAdmission(opt.name)}
                        onClear={() => setInpatientAdmission('')}
                        fetchOptions={fetchAdmissionOpts}
                        placeholder="Search admissions..."
                      />
                    )}
                    <LinkCombobox
                      label="Patient Visit"
                      value={patientVisitLabel}
                      onSelect={opt => { setPatientVisit(opt.name); setPatientVisitLabel(opt.label) }}
                      onClear={() => { setPatientVisit(''); setPatientVisitLabel('') }}
                      fetchOptions={fetchVisits}
                      placeholder="Search patient visits..."
                    />
                    {isLockedContext ? (
                      <div>
                        <label className={lc}>Patient</label>
                        <input type="text" value={patientField} readOnly className={`${ic} bg-slate-100 cursor-not-allowed`} />
                      </div>
                    ) : (
                      <LinkCombobox
                        label="Patient"
                        value={patientNameField || patientField}
                        onSelect={opt => { setPatientField(opt.name); setPatientNameField(opt.label) }}
                        onClear={() => { setPatientField(''); setPatientNameField('') }}
                        fetchOptions={fetchPatientOpts}
                        placeholder="Search patients..."
                      />
                    )}
                    <div>
                      <label className={lc}>Patient Name</label>
                      <input type="text" value={patientNameField} readOnly className={`${ic} bg-slate-100 cursor-not-allowed`} />
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-800 border-b border-slate-200 pb-1.5 mb-4">Load From Template</p>
                  <p className="text-xs text-slate-500 mb-3 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
                    Select a template to auto-populate the history attributes. You will then fill in the description for each item in the <strong>History Details</strong> tab.
                  </p>
                  <LinkCombobox
                    label="History Template"
                    value={templateLabel}
                    onSelect={handleTemplateSelect}
                    onClear={() => { setTemplateName(''); setTemplateLabel('') }}
                    fetchOptions={fetchHistoryTemplates}
                    placeholder="Search templates..."
                  />
                  {templateLoading && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-primary">
                      <span className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      Loading template items…
                    </div>
                  )}
                  {templateName && !templateLoading && rows.length > 0 && (
                    <p className="mt-2 text-xs text-green-600 flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-green-500 text-white inline-flex items-center justify-center text-[10px] shrink-0">✓</span>
                      {rows.length} item{rows.length !== 1 ? 's' : ''} loaded — go to <strong className="ml-0.5">History Details</strong> tab to fill descriptions.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── Tab 2: History Details ── */}
            {activeTab === 'history' && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">History Detail Items</h3>
                    {rows.length > 0 && filledCount < rows.length && (
                      <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {rows.length - filledCount} item{rows.length - filledCount !== 1 ? 's' : ''} still need a description
                      </p>
                    )}
                    {rows.length > 0 && filledCount === rows.length && (
                      <p className="text-xs text-green-600 flex items-center gap-1 mt-0.5">
                        <Check className="w-3.5 h-3.5" /> All items have descriptions
                      </p>
                    )}
                  </div>
                  <button type="button" onClick={addRow}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary rounded-md hover:bg-primary/90 transition-colors shrink-0">
                    <Plus className="w-3.5 h-3.5" /> Add Item
                  </button>
                </div>

                {rows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50">
                    <BookOpen className="w-8 h-8 text-slate-300 mb-2" />
                    <p className="text-sm text-slate-500 mb-1">No history items yet</p>
                    <p className="text-xs text-slate-400 mb-4">Choose a template on the General tab or add items manually</p>
                    <button type="button" onClick={addRow}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-primary border border-primary rounded-md hover:bg-primary/5 transition-colors">
                      <Plus className="w-4 h-4" /> Add First Item
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {rows.map((row, idx) => (
                      <div key={row._key}
                        className={`rounded-lg border p-4 transition-colors group ${
                          row.description.trim() ? 'border-green-200 bg-green-50/40' : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}>
                        <div className="flex items-start gap-3">
                          {/* Index badge */}
                          <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <div className="flex-1 space-y-2 min-w-0">
                            {/* Attribute */}
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Attribute / Topic</label>
                              <input
                                type="text"
                                value={row.attribute}
                                onChange={e => updateRow(row._key, 'attribute', e.target.value)}
                                placeholder="e.g. Chief Complaint, Past Medical History…"
                                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                              />
                            </div>
                            {/* Description */}
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                                Description
                                {!row.description.trim() && (
                                  <span className="ml-1.5 text-amber-500 normal-case font-normal">(required)</span>
                                )}
                              </label>
                              <textarea
                                value={row.description}
                                onChange={e => updateRow(row._key, 'description', e.target.value)}
                                rows={3}
                                placeholder="Enter detailed description for this history item…"
                                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white resize-none"
                              />
                            </div>
                          </div>
                          {/* Remove */}
                          <button type="button" onClick={() => removeRow(row._key)}
                            className="inline-flex items-center justify-center w-7 h-7 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 mt-0.5 shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {row.description.trim() && (
                          <div className="mt-1.5 ml-9">
                            <span className="inline-flex items-center gap-1 text-[11px] text-green-600">
                              <Check className="w-3 h-3" /> Documented
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Summary */}
                {rows.length > 0 && (
                  <div className="mt-4 flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-xs text-slate-600">
                    <span>Total: <strong>{rows.length}</strong></span>
                    <span className="text-green-600">Filled: <strong>{filledCount}</strong></span>
                    {rows.length - filledCount > 0 && (
                      <span className="text-amber-600">Pending: <strong>{rows.length - filledCount}</strong></span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between gap-3 shrink-0">
            <div className="flex gap-1">
              {TABS.map((tab, i) => (
                <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                  className={`w-2 h-2 rounded-full transition-colors ${activeTab === tab.id ? 'bg-primary' : 'bg-slate-300 hover:bg-slate-400'}`}
                  aria-label={`${i + 1}. ${tab.label}`} />
              ))}
            </div>
            <div className="flex gap-3">
              {currentTabIdx > 0 && (
                <button type="button" onClick={() => setActiveTab(TABS[currentTabIdx - 1].id)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">
                  ← Previous
                </button>
              )}
              {currentTabIdx < TABS.length - 1 && (
                <button type="button" onClick={() => setActiveTab(TABS[currentTabIdx + 1].id)}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90">
                  Next →
                </button>
              )}
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={submitting}
                className="px-5 py-2 text-sm font-semibold text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed">
                {submitting ? 'Saving...' : 'Save History'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
