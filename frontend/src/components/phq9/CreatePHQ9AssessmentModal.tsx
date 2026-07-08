// components/phq9/CreatePHQ9AssessmentModal.tsx
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
import { Activity, Info, FileText } from 'lucide-react'
import {
  fetchPHQ9Templates,
  fetchPHQ9TemplateQuestions,
  fetchDefaultPHQ9Template,
  createPHQ9Assessment,
  RESPONSE_OPTIONS,
  RESPONSE_SCORE,
  type ResponseOption,
} from '../../services/phq9'
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
// Types & constants
// ─────────────────────────────────────────────────────────────────────────────
interface ResponseRowInternal {
  _id: string
  question_no: number
  question: string
  question_type: string
  response?: ResponseOption
  score: number
}

interface TemplateDetails {
  name: string
  label: string
  description?: string
  default?: boolean
}

const nowDate = () => new Date().toISOString().split('T')[0]

// ── ResponseGroup component ──────────────────────────────────────────────────
interface ResponseGroupProps {
  rows: ResponseRowInternal[]
  onSelect: (id: string, value: ResponseOption) => void
}

const ResponseGroup = ({ rows, onSelect }: ResponseGroupProps) => {
  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <div key={row._id} className="border border-slate-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold flex items-center justify-center mt-0.5">
              {row.question_no}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700 mb-3 leading-snug">{row.question}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {RESPONSE_OPTIONS.map((opt) => {
                  const isSelected = row.response === opt
                  // Parse option to get just the text part for display
                  const displayText = opt.replace(/^\d+ - /, '')
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => onSelect(row._id, opt)}
                      className={`px-3 py-2 rounded-md text-xs font-medium border transition-all text-left ${
                        isSelected
                          ? 'bg-primary border-primary text-white'
                          : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      {displayText}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
interface CreatePHQ9AssessmentModalProps {
  onClose: () => void
  onSuccess: () => void
  patient?: string
  defaultAdmission?: string
  defaultVisit?: string
}

type TabType = 'info' | 'assessment'

export const CreatePHQ9AssessmentModal = ({
  onClose,
  onSuccess,
  patient,
  defaultAdmission,
  defaultVisit,
}: CreatePHQ9AssessmentModalProps) => {
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

  const [templates, setTemplates] = useState<TemplateDetails[]>([])
  const [selectedTemplateName, setSelectedTemplateName] = useState('')
  const [loadingTemplate, setLoadingTemplate] = useState(false)
  const [loadingTemplates, setLoadingTemplates] = useState(true)

  const selectedTemplate = templates.find((t) => t.name === selectedTemplateName) || null

  // Responses
  const [responses, setResponses] = useState<ResponseRowInternal[]>([])

  // Patient combobox
  const [patientQuery, setPatientQuery] = useState('')
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientLoading, setPatientLoading] = useState(false)

  // Computed values
  const totalScore = responses.reduce((sum, r) => sum + (r.score || 0), 0)
  const answeredCount = responses.filter((r) => r.response !== undefined).length

  // Get severity based on total score
  const getSeverity = (score: number): string => {
    if (score <= 4) return "Minimal"
    if (score <= 9) return "Mild"
    if (score <= 14) return "Moderate"
    if (score <= 19) return "Moderately Severe"
    return "Severe"
  }

  const severity = getSeverity(totalScore)

  useEffect(() => {
    if (resolvedPatient) setPatientId(resolvedPatient)
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
      if (res.length > 0) setPatientQuery(res[0].patient_name)
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

  const applyTemplate = useCallback(async (tmpl: TemplateDetails) => {
    setSelectedTemplateName(tmpl.name)
    setLoadingTemplate(true)
    try {
      const data = await fetchPHQ9TemplateQuestions(tmpl.name)
      const rows: ResponseRowInternal[] = data.questions.map((q, idx) => ({
        _id: `${idx}`,
        question_no: q.question_no,
        question: q.question,
        question_type: q.question_type,
        response: undefined,
        score: 0,
      }))
      setResponses(rows)
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
        const templateList = await fetchPHQ9Templates()
        if (cancelled) return
        setTemplates(templateList)

        const defaultTemplate =
          templateList.find((t) => t.default) ||
          (await fetchDefaultPHQ9Template())

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

  // ── Update response ───────────────────────────────────────────────────────
  const updateResponse = (id: string, value: ResponseOption) => {
    setResponses((prev) =>
      prev.map((r) => {
        if (r._id !== id) return r
        const score = RESPONSE_SCORE[value]
        return { ...r, response: value, score }
      })
    )
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patientId) { setError('Patient is required'); return }
    if (!selectedTemplate) { setError('Template is required'); return }
    if (answeredCount === 0) { setError('Please answer at least one question'); return }
    
    setSaving(true); setError(null)
    try {
      const apiResponses = responses.map(({ _id, question_no, ...rest }) => rest)
      const result = await createPHQ9Assessment({
        patient: patientId,
        assessment_date: assessmentDate,
        template: selectedTemplate.name,
        notes: notes || undefined,
        practitioner: practitioner || undefined,
        inpatient_admission: inpatientAdmission || undefined,
        patient_visit: patientVisit || undefined,
        responses: apiResponses,
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

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('w-full max-w-2xl max-h-[92vh] overflow-hidden')}>
        <CreateModalHeader
          title="New PHQ9 Assessment"
          icon={<Activity className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          subtitle={patientQuery || resolvedPatient || undefined}
          onClose={onClose}
          alert={error}
        >
          <div className="-mb-px mt-3 flex border-b border-emerald-100/80 overflow-x-auto">
            <button
              type="button"
              onClick={() => selectedTemplate && setActiveTab('info')}
              disabled={!selectedTemplate}
              className={`${createModalTabButtonClass(activeTab === 'info')} ${!selectedTemplate ? 'cursor-not-allowed opacity-40' : ''}`}
            >
              <Info className="h-4 w-4" />
              Template Info
            </button>
            <button
              type="button"
              onClick={() => responses.length > 0 && setActiveTab('assessment')}
              disabled={responses.length === 0}
              className={`${createModalTabButtonClass(activeTab === 'assessment')} ${responses.length === 0 ? 'cursor-not-allowed opacity-40' : ''}`}
            >
              <FileText className="h-4 w-4" />
              Assessment
              {answeredCount > 0 && (
                <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                  {answeredCount}/{responses.length}
                </span>
              )}
            </button>
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
                        if (!e.target.value) setPatientId('')
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
                    <label className="block text-xs font-medium text-slate-600 mb-1">Doctor Name</label>
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
                  <div className="space-y-4">
                    <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-md px-3 py-2.5 text-xs text-blue-700">
                      <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>
                        Not at all = 0, Several days = 1, More than half the days = 2, Nearly every day = 3.
                      </span>
                    </div>

                    <ResponseGroup rows={responses} onSelect={updateResponse} />

                    {answeredCount > 0 && (
                      <div
                        className={`rounded-lg p-4 border ${
                          severity === 'Severe'
                            ? 'bg-red-50 border-red-200'
                            : severity === 'Moderately Severe'
                              ? 'bg-orange-50 border-orange-200'
                              : severity === 'Moderate'
                                ? 'bg-amber-50 border-amber-200'
                                : 'bg-emerald-50 border-emerald-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold text-slate-700">Total Score:</div>
                            <div className="text-2xl font-bold text-slate-800">{totalScore}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-slate-700">Severity:</div>
                            <div className="text-lg font-semibold text-slate-800">{severity}</div>
                          </div>
                        </div>
                      </div>
                    )}
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
            )}
          </div>

          <div className={`${CREATE_MODAL_FOOTER_STICKY} items-center justify-between gap-3`}>
            <div className="text-xs text-slate-500">
              {responses.length > 0 && `${answeredCount} / ${responses.length} questions answered`}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
                Cancel
              </button>
              <button type="submit" disabled={saving} className={CM_BTN_PRIMARY}>
                {saving ? 'Creating…' : 'Create Assessment'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}