import { useCallback, useEffect, useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_FOOTER_STICKY,
  CREATE_MODAL_OVERLAY,
  CreateModalHeader,
  MODAL_FIELD_CLASS,
  MODAL_SELECT_CLASS,
  MODAL_TEXTAREA_CLASS,
  createModalShellClass,
  createModalTabButtonClass,
} from '../ui/CreateModalChrome'
import { ChevronDown, ChevronUp, Brain, Info, FileText, ClipboardList } from 'lucide-react'
import {
  fetchADHDTemplates,
  fetchADHDTemplateQuestions,
  fetchDefaultADHDTemplate,
  createADHDAssessment,
} from '../../services/adhd'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import {
  fetchInpatientAdmissionOptions,
  fetchPatientVisits,
  fetchHealthcarePractitioners,
  getCurrentUserPractitioner,
  type LinkFieldOption,
} from '../../services/common'
import { useCareContext } from '../../providers/CareContextProvider'

// ─────────────────────────────────────────────────────────────────────────────
// Types & constants — all at module level, never recreated on render
// ─────────────────────────────────────────────────────────────────────────────
const RESPONSE_OPTIONS = ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often'] as const
type ResponseOption = typeof RESPONSE_OPTIONS[number]

const RESPONSE_SCORE: Record<ResponseOption, number> = {
  Never: 0, Rarely: 0, Sometimes: 0, Often: 1, 'Very Often': 1,
}

// Each row gets a stable _id assigned once when the template loads.
// We never rely on question_no (removed from schema) or array index for identity.
interface ResponseRowInternal {
  _id: string          // e.g. "A-0", "A-1", "B-0" — assigned once, never changes
  question_no: number
  question: string
  part: 'Part A' | 'Part B'
  response?: ResponseOption
  score: number
  is_positive: boolean
}

interface TemplateDetails {
  name: string
  label: string
  description?: string
  footer_description?: string
  default?: boolean
}

const nowDate = () => new Date().toISOString().split('T')[0]

// ─────────────────────────────────────────────────────────────────────────────
// ResponseGroup — MUST be at module level.
// Defining it inside the parent causes React to see a brand-new component type
// on every render, unmounting/remounting all rows (the "broken after first" bug).
// ─────────────────────────────────────────────────────────────────────────────
interface ResponseGroupProps {
  rows: ResponseRowInternal[]
  part: string
  isExpanded: boolean
  onToggle: (part: string) => void
  onSelect: (id: string, value: ResponseOption) => void
}

const ResponseGroup = ({ rows, part, isExpanded, onToggle, onSelect }: ResponseGroupProps) => {
  const answered = rows.filter((r) => r.response).length
  const positives = rows.filter((r) => r.is_positive).length

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(part)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-800">{part}</span>
          <span className="text-xs text-slate-500">{answered}/{rows.length} answered</span>
          {part === 'Part A' && positives > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
              {positives} positive
            </span>
          )}
        </div>
        <div className="text-slate-400">
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {isExpanded && (
        <div className="divide-y divide-slate-100">
          {rows.map((row, i) => (
            <div key={row._id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 mb-2 leading-snug">{row.question}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {RESPONSE_OPTIONS.map((opt) => {
                      const isSelected = row.response === opt
                      const isPositiveOpt = RESPONSE_SCORE[opt] === 1
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => onSelect(row._id, opt)}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                            isSelected
                              ? isPositiveOpt && part === 'Part A'
                                ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                                : 'bg-primary border-primary text-white shadow-sm'
                              : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-50'
                          }`}
                        >
                          {opt}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {row.is_positive && (
                  <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 mt-0.5">
                    +
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main modal
// ─────────────────────────────────────────────────────────────────────────────
interface CreateADHDAssessmentModalProps {
  onClose: () => void
  onSuccess: () => void
  patient?: string
  defaultAdmission?: string
  defaultVisit?: string
}

type TabType = 'assessment' | 'info' | 'footer'

const ADHD_TABS: { id: TabType; label: string }[] = [
  { id: 'assessment', label: 'Assessment' },
  { id: 'info', label: 'Template Info' },
  { id: 'footer', label: 'Additional Info' },
]

export const CreateADHDAssessmentModal = ({
  onClose,
  onSuccess,
  patient,
  defaultAdmission,
  defaultVisit,
}: CreateADHDAssessmentModalProps) => {
  const {
    mode,
    activeVisit,
    activeAdmission,
    selectedPatient: contextPatient,
  } = useCareContext()

  const lockedAdmission = activeAdmission || defaultAdmission || ''
  const lockedVisit = activeVisit || defaultVisit || ''
  const isIPMode = mode === 'IP'
  const isOPMode = mode === 'OP'
  const hidePatientVisit = isIPMode
  const hideInpatientAdmission = isOPMode
  const resolvedPatient = patient || contextPatient || ''

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('assessment')

  // Core fields
  const [patientId, setPatientId] = useState(resolvedPatient)
  const [assessmentDate, setAssessmentDate] = useState(nowDate())
  const [notes, setNotes] = useState('')
  const [inpatientAdmission, setInpatientAdmission] = useState(lockedAdmission)
  const [patientVisit, setPatientVisit] = useState(lockedVisit)
  const [admissionOptions, setAdmissionOptions] = useState<LinkFieldOption[]>([])
  const [visitOptions, setVisitOptions] = useState<LinkFieldOption[]>([])
  const [practitioner, setPractitioner] = useState('')
  const [practitionerLabel, setPractitionerLabel] = useState('')
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])

  // Template dropdown
  const [templates, setTemplates] = useState<TemplateDetails[]>([])
  const [selectedTemplateName, setSelectedTemplateName] = useState('')
  const [loadingTemplate, setLoadingTemplate] = useState(false)
  const [loadingTemplates, setLoadingTemplates] = useState(true)

  const selectedTemplate =
    templates.find((t) => t.name === selectedTemplateName) || null

  // Responses keyed by stable _id
  const [responses, setResponses] = useState<ResponseRowInternal[]>([])
  const [expandedParts, setExpandedParts] = useState<Set<string>>(new Set(['Part A', 'Part B']))

  // Patient combobox
  const [patientQuery, setPatientQuery] = useState('')
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientLoading, setPatientLoading] = useState(false)

  // ── Patient label on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (resolvedPatient) {
      setPatientId(resolvedPatient)
    }
  }, [resolvedPatient])

  useEffect(() => {
    getCurrentUserPractitioner()
      .then(async (id) => {
        if (!id) return
        setPractitioner(id)
        try {
          const opts = await fetchHealthcarePractitioners(id)
          const match = opts.find((o) => o.name === id)
          setPractitionerLabel(match?.label || id)
        } catch {
          setPractitionerLabel(id)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!practitionerOpen) return
    const t = setTimeout(async () => {
      try {
        const opts = await fetchHealthcarePractitioners(practitionerQuery || undefined)
        setPractitionerOptions(opts)
      } catch {
        setPractitionerOptions([])
      }
    }, practitionerQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [practitionerQuery, practitionerOpen])

  useEffect(() => {
    if (lockedAdmission) setInpatientAdmission(lockedAdmission)
  }, [lockedAdmission])

  useEffect(() => {
    if (lockedVisit) setPatientVisit(lockedVisit)
  }, [lockedVisit])

  useEffect(() => {
    if (!resolvedPatient) return
    if (!hideInpatientAdmission) {
      fetchInpatientAdmissionOptions(undefined, resolvedPatient)
        .then(setAdmissionOptions)
        .catch(() => setAdmissionOptions([]))
    }
    if (!hidePatientVisit) {
      fetchPatientVisits(resolvedPatient)
        .then(setVisitOptions)
        .catch(() => setVisitOptions([]))
    }
  }, [resolvedPatient, hideInpatientAdmission, hidePatientVisit])

  useEffect(() => {
    if (!resolvedPatient) return
    fetchPatients(1, 0, resolvedPatient).then((res) => {
      if (res.length > 0) {
        setPatientQuery(res[0].patient_name)
      }
    }).catch(() => {})
  }, [resolvedPatient])

  // ── Patient options ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!patientOpen) return
    let cancelled = false
    const run = async () => {
      setPatientLoading(true)
      try {
        const res = patientQuery.trim()
          ? await searchPatients(patientQuery, 20)
          : await fetchPatients(20, 0)
        if (!cancelled) setPatientOptions(res)
      } catch {
        if (!cancelled) setPatientOptions([])
      } finally {
        if (!cancelled) setPatientLoading(false)
      }
    }
    const t = setTimeout(run, patientQuery.trim() ? 300 : 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [patientQuery, patientOpen])

  // ── Template selection — stable _id assigned here, once ──────────────────
  const applyTemplate = useCallback(async (tmpl: TemplateDetails) => {
    setSelectedTemplateName(tmpl.name)
    setLoadingTemplate(true)
    try {
      const data = await fetchADHDTemplateQuestions(tmpl.name)
      const partCounters: Record<string, number> = {}
      const rows: ResponseRowInternal[] = data.questions.map((q) => {
        const letter = q.part === 'Part A' ? 'A' : 'B'
        const idx = partCounters[letter] ?? 0
        partCounters[letter] = idx + 1
        return {
          _id: `${letter}-${idx}`,
          question_no: q.question_no,
          question: q.question,
          part: q.part,
          response: undefined,
          score: 0,
          is_positive: false,
        }
      })
      setResponses(rows)
      setExpandedParts(new Set(['Part A', 'Part B']))
      setActiveTab('assessment')
    } catch {
      setResponses([])
    } finally {
      setLoadingTemplate(false)
    }
  }, [])

  const handleTemplateChange = (templateName: string) => {
    if (!templateName) {
      setSelectedTemplateName('')
      setResponses([])
      setActiveTab('assessment')
      return
    }
    const tmpl = templates.find((t) => t.name === templateName)
    if (tmpl) void applyTemplate(tmpl)
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingTemplates(true)
      try {
        const templateList = await fetchADHDTemplates()
        if (cancelled) return
        setTemplates(templateList)

        const defaultTemplate =
          templateList.find((t) => t.default) ||
          (await fetchDefaultADHDTemplate())

        if (defaultTemplate?.name) {
          await applyTemplate(defaultTemplate)
        }
      } catch {
        if (!cancelled) setTemplates([])
      } finally {
        if (!cancelled) setLoadingTemplates(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [applyTemplate])

  // ── Update a single response by its stable _id ────────────────────────────
  const updateResponse = (id: string, value: ResponseOption) => {
    setResponses((prev) =>
      prev.map((r) => {
        if (r._id !== id) return r
        const score = RESPONSE_SCORE[value]
        const is_positive = r.part === 'Part A' && score === 1
        return { ...r, response: value, score, is_positive }
      })
    )
  }

  const togglePart = (part: string) =>
    setExpandedParts((prev) => {
      const n = new Set(prev)
      n.has(part) ? n.delete(part) : n.add(part)
      return n
    })

  // ── Derived stats ─────────────────────────────────────────────────────────
  const partARows = responses.filter((r) => r.part === 'Part A')
  const partBRows = responses.filter((r) => r.part === 'Part B')
  const positiveCount = responses.filter((r) => r.is_positive).length
  const answeredCount = responses.filter((r) => r.response).length
  const screeningResult = positiveCount >= 4 ? 'Positive' : 'Negative'

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patientId) { setError('Patient is required'); return }
    if (!selectedTemplate) { setError('Template is required'); return }
    if (answeredCount === 0) { setError('Please answer at least one question'); return }
    setSaving(true); setError(null)
    try {
      const result = await createADHDAssessment({
        patient: patientId,
        assessment_date: assessmentDate,
        template: selectedTemplate.name,
        notes: notes || undefined,
        inpatient_admission: inpatientAdmission || undefined,
        patient_visit: patientVisit || undefined,
        practitioner: practitioner || undefined,
        // Strip _id before sending — backend needs question_no + rest
        responses: responses.map(({ _id, ...rest }) => rest),
      })
      if (result.success) {
        onSuccess()
      } else {
        setError(result.message || 'Failed to create assessment')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create assessment')
    } finally {
      setSaving(false)
    }
  }

  const closeAllDropdowns = () => {
    setPatientOpen(false)
    setPractitionerOpen(false)
  }

  const isFooterEnabled = !!selectedTemplate?.footer_description

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('w-full max-w-2xl max-h-[92vh] overflow-hidden')}>
        <CreateModalHeader
          title="New ADHD Assessment"
          icon={<Brain className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          subtitle={patientQuery || resolvedPatient || undefined}
          onClose={onClose}
          alert={error}
        >
          <div className="-mb-px mt-3 flex border-b border-emerald-100/80 overflow-x-auto">
            {ADHD_TABS.map((tab) => {
              const disabled =
                (tab.id === 'info' && !selectedTemplate) ||
                (tab.id === 'footer' && !isFooterEnabled)
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => !disabled && setActiveTab(tab.id)}
                  disabled={disabled}
                  className={`${createModalTabButtonClass(activeTab === tab.id)} ${
                    disabled ? 'cursor-not-allowed opacity-40' : ''
                  }`}
                >
                  {tab.id === 'info' && <Info className="h-4 w-4" />}
                  {tab.id === 'assessment' && <FileText className="h-4 w-4" />}
                  {tab.id === 'footer' && <ClipboardList className="h-4 w-4" />}
                  {tab.label}
                  {tab.id === 'assessment' && answeredCount > 0 && (
                    <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                      {answeredCount}/{responses.length}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </CreateModalHeader>

        <form
          onSubmit={handleSubmit}
          className={`${CREATE_MODAL_BODY_GRADIENT} flex flex-1 flex-col min-h-0`}
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest('.relative')) closeAllDropdowns()
          }}
        >
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 min-h-0">
            {activeTab === 'assessment' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="relative">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Patient <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={patientQuery}
                      onChange={(e) => {
                        setPatientQuery(e.target.value)
                        setPatientOpen(true)
                        if (!e.target.value) {
                          setPatientId('')
                          setPatientQuery('')
                        }
                      }}
                      onFocus={() => setPatientOpen(true)}
                      placeholder="Search patient…"
                      disabled={!!resolvedPatient}
                      className={`${MODAL_FIELD_CLASS} disabled:bg-slate-50 disabled:text-slate-400`}
                    />
                    {patientLoading && (
                      <span className="absolute right-3 top-8 text-xs text-slate-400">Loading…</span>
                    )}
                    {patientOpen && patientOptions.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto top-full">
                        {patientOptions.map((p) => (
                          <button
                            key={p.name}
                            type="button"
                            onClick={() => {
                              setPatientId(p.name)
                              setPatientQuery(p.patient_name)
                              setPatientOpen(false)
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
                          >
                            <div className="font-medium">{p.patient_name}</div>
                            {p.mobile && <div className="text-xs text-slate-500">{p.mobile}</div>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Assessment Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={assessmentDate}
                      onChange={(e) => setAssessmentDate(e.target.value)}
                      className={MODAL_FIELD_CLASS}
                    />
                  </div>

                  <div className="relative md:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Doctor</label>
                    <input
                      type="text"
                      value={practitioner ? practitionerLabel : practitionerQuery}
                      onChange={(e) => {
                        setPractitionerQuery(e.target.value)
                        setPractitioner('')
                        setPractitionerLabel('')
                        setPractitionerOpen(true)
                      }}
                      onFocus={() => setPractitionerOpen(true)}
                      placeholder="Search doctor…"
                      className={MODAL_FIELD_CLASS}
                    />
                    {practitionerOpen && practitionerOptions.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto top-full">
                        {practitionerOptions.map((p) => (
                          <button
                            key={p.name}
                            type="button"
                            onClick={() => {
                              setPractitioner(p.name)
                              setPractitionerLabel(p.label || p.name)
                              setPractitionerQuery(p.label || p.name)
                              setPractitionerOpen(false)
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
                          >
                            <div className="font-medium">{p.label || p.name}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {(isIPMode || isOPMode) && (
                    <>
                      {!hideInpatientAdmission && (
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Inpatient Admission
                          </label>
                          {lockedAdmission ? (
                            <div className={`${MODAL_FIELD_CLASS} bg-slate-50`}>{lockedAdmission}</div>
                          ) : (
                            <select
                              value={inpatientAdmission}
                              onChange={(e) => setInpatientAdmission(e.target.value)}
                              className={MODAL_SELECT_CLASS}
                            >
                              <option value="">— Select admission —</option>
                              {admissionOptions.map((a) => (
                                <option key={a.name} value={a.name}>{a.label}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}

                      {!hidePatientVisit && (
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Patient Visit
                          </label>
                          {lockedVisit ? (
                            <div className={`${MODAL_FIELD_CLASS} bg-slate-50`}>{lockedVisit}</div>
                          ) : (
                            <select
                              value={patientVisit}
                              onChange={(e) => setPatientVisit(e.target.value)}
                              className={MODAL_SELECT_CLASS}
                            >
                              <option value="">— Select visit —</option>
                              {visitOptions.map((v) => (
                                <option key={v.name} value={v.name}>{v.label}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Template <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedTemplateName}
                      onChange={(e) => handleTemplateChange(e.target.value)}
                      disabled={loadingTemplates || loadingTemplate}
                      className={`${MODAL_SELECT_CLASS} disabled:bg-slate-50 disabled:text-slate-400`}
                    >
                      <option value="">
                        {loadingTemplates ? 'Loading templates…' : 'Choose a template…'}
                      </option>
                      {templates.map((t) => (
                        <option key={t.name} value={t.name}>
                          {t.label}
                          {t.default ? ' (Default)' : ''}
                        </option>
                      ))}
                    </select>
                    {!loadingTemplates && templates.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">
                        No ADHD Assessment Templates found. Create one on the desk.
                      </p>
                    )}
                    {selectedTemplate && (
                      <p className="text-xs text-slate-500 mt-1">
                        {loadingTemplate
                          ? 'Loading questions…'
                          : `${responses.length} questions loaded — ${answeredCount} answered`}
                      </p>
                    )}
                  </div>
                </div>

                {responses.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-md px-3 py-2.5 text-xs text-blue-700">
                      <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>
                        Part A: <strong>Often</strong> or <strong>Very Often</strong> = positive.
                        4+ positives in Part A = positive screening result.
                      </span>
                    </div>

                    {partARows.length > 0 && (
                      <ResponseGroup
                        rows={partARows}
                        part="Part A"
                        isExpanded={expandedParts.has('Part A')}
                        onToggle={togglePart}
                        onSelect={updateResponse}
                      />
                    )}
                    {partBRows.length > 0 && (
                      <ResponseGroup
                        rows={partBRows}
                        part="Part B"
                        isExpanded={expandedParts.has('Part B')}
                        onToggle={togglePart}
                        onSelect={updateResponse}
                      />
                    )}

                    {answeredCount > 0 && (
                      <div
                        className={`flex items-center justify-between rounded-lg px-4 py-3 border ${
                          screeningResult === 'Positive'
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-emerald-50 border-emerald-200'
                        }`}
                      >
                        <div className="text-sm">
                          <span className="font-semibold text-slate-700">Part A Positive Count:</span>{' '}
                          <span
                            className={`font-bold text-base ${
                              positiveCount >= 4 ? 'text-amber-700' : 'text-slate-700'
                            }`}
                          >
                            {positiveCount}
                          </span>
                        </div>
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                            screeningResult === 'Positive'
                              ? 'bg-amber-100 text-amber-700 border border-amber-300'
                              : 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                          }`}
                        >
                          {screeningResult}
                        </span>
                      </div>
                    )}
                  </div>
                ) : selectedTemplate && !loadingTemplate ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-md px-4 py-3 text-sm text-blue-700">
                    Select a template with questions to begin the assessment.
                  </div>
                ) : null}

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Clinical notes or observations…"
                    className={MODAL_TEXTAREA_CLASS}
                  />
                </div>
              </>
            )}

            {activeTab === 'info' && selectedTemplate && (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    Template Description
                  </h3>
                  {selectedTemplate.description ? (
                    <div
                      className="text-sm text-blue-800 prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: selectedTemplate.description }}
                    />
                  ) : (
                    <p className="text-sm text-blue-600 italic">No description provided for this template.</p>
                  )}
                </div>

                {responses.length > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-2">Questions Overview</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Part A Questions:</span>
                        <span className="font-medium text-slate-800">{partARows.length}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Part B Questions:</span>
                        <span className="font-medium text-slate-800">{partBRows.length}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Total Questions:</span>
                        <span className="font-medium text-slate-800">{responses.length}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'footer' && selectedTemplate?.footer_description && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4" />
                  Additional Information
                </h3>
                <div
                  className="text-sm text-gray-700 prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: selectedTemplate.footer_description }}
                />
              </div>
            )}
          </div>

          <div className={`${CREATE_MODAL_FOOTER_STICKY} items-center justify-between`}>
            <div className="flex items-center gap-3">
              {answeredCount > 0 && (
                <>
                  <span className="text-sm font-semibold text-emerald-900">
                    Answered:{' '}
                    <span className="text-emerald-700">
                      {answeredCount}/{responses.length}
                    </span>
                  </span>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                      screeningResult === 'Positive'
                        ? 'bg-amber-100 text-amber-700 border-amber-300'
                        : 'bg-emerald-100 text-emerald-700 border-emerald-300'
                    }`}
                  >
                    {screeningResult}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} disabled={saving} className={CM_BTN_CANCEL}>
                Cancel
              </button>
              {activeTab === 'assessment' ? (
                <button type="submit" disabled={saving} className={CM_BTN_PRIMARY}>
                  {saving ? 'Creating…' : 'Create Assessment'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveTab('assessment')}
                  className={CM_BTN_PRIMARY}
                >
                  Back to Assessment
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}