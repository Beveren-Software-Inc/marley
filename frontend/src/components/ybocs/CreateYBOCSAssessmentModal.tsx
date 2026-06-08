// components/ybocs/CreateYBOCSAssessmentModal.tsx
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
import { Brain, Info, FileText } from 'lucide-react'
import {
  fetchYBOCSTemplates,
  fetchYBOCSTemplateQuestions,
  fetchDefaultYBOCSTemplate,
  createYBOCSAssessment,
  RESPONSE_SCORE,
  type ResponseOption,
} from '../../services/ybocs'
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
  section: 'Obsessions' | 'Compulsions'
  question: string
  option_0: string
  option_1: string
  option_2: string
  option_3: string
  option_4: string
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
  title: string
  onSelect: (id: string, value: ResponseOption) => void
}

const ResponseGroup = ({ rows, title, onSelect }: ResponseGroupProps) => {
  if (rows.length === 0) return null
  
  const totalScore = rows.reduce((sum, r) => sum + (r.score || 0), 0)
  
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="bg-slate-100 px-4 py-2 border-b border-slate-200">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <span className="text-xs font-medium text-slate-600">Total: {totalScore}</span>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((row) => (
          <div key={row._id} className="p-4">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold flex items-center justify-center mt-0.5">
                {row.question_no}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 mb-3 leading-snug">{row.question}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2">
                  <button
                    type="button"
                    onClick={() => onSelect(row._id, '0')}
                    className={`px-2 py-1.5 rounded-md text-xs font-medium border transition-all text-left ${
                      row.response === '0'
                        ? 'bg-primary border-primary text-white'
                        : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-semibold text-[10px]">0</div>
                    <div className="text-[10px] truncate">{row.option_0}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelect(row._id, '1')}
                    className={`px-2 py-1.5 rounded-md text-xs font-medium border transition-all text-left ${
                      row.response === '1'
                        ? 'bg-primary border-primary text-white'
                        : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-semibold text-[10px]">1</div>
                    <div className="text-[10px] truncate">{row.option_1}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelect(row._id, '2')}
                    className={`px-2 py-1.5 rounded-md text-xs font-medium border transition-all text-left ${
                      row.response === '2'
                        ? 'bg-primary border-primary text-white'
                        : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-semibold text-[10px]">2</div>
                    <div className="text-[10px] truncate">{row.option_2}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelect(row._id, '3')}
                    className={`px-2 py-1.5 rounded-md text-xs font-medium border transition-all text-left ${
                      row.response === '3'
                        ? 'bg-primary border-primary text-white'
                        : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-semibold text-[10px]">3</div>
                    <div className="text-[10px] truncate">{row.option_3}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelect(row._id, '4')}
                    className={`px-2 py-1.5 rounded-md text-xs font-medium border transition-all text-left ${
                      row.response === '4'
                        ? 'bg-primary border-primary text-white'
                        : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-semibold text-[10px]">4</div>
                    <div className="text-[10px] truncate">{row.option_4}</div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
interface CreateYBOCSAssessmentModalProps {
  onClose: () => void
  onSuccess: () => void
  patient?: string
  defaultAdmission?: string
  defaultVisit?: string
}

type TabType = 'info' | 'assessment'

export const CreateYBOCSAssessmentModal = ({
  onClose,
  onSuccess,
  patient,
  defaultAdmission,
  defaultVisit,
}: CreateYBOCSAssessmentModalProps) => {
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
  const obsessionRows = responses.filter(r => r.section === 'Obsessions')
  const compulsionRows = responses.filter(r => r.section === 'Compulsions')
  const totalObsessions = obsessionRows.reduce((sum, r) => sum + (r.score || 0), 0)
  const totalCompulsions = compulsionRows.reduce((sum, r) => sum + (r.score || 0), 0)
  const totalScore = totalObsessions + totalCompulsions
  const answeredCount = responses.filter((r) => r.response !== undefined).length

  // Severity interpretation
  const getSeverity = (score: number): string => {
    if (score <= 7) return "Subclinical"
    if (score <= 15) return "Mild"
    if (score <= 23) return "Moderate"
    if (score <= 31) return "Severe"
    return "Extreme"
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
      const data = await fetchYBOCSTemplateQuestions(tmpl.name)
      const rows: ResponseRowInternal[] = data.questions.map((q, idx) => ({
        _id: `${idx}`,
        question_no: q.question_no,
        section: q.section,
        question: q.question,
        option_0: q.option_0,
        option_1: q.option_1,
        option_2: q.option_2,
        option_3: q.option_3,
        option_4: q.option_4,
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
        const templateList = await fetchYBOCSTemplates()
        if (cancelled) return
        setTemplates(templateList)
        const defaultTemplate =
          templateList.find((t) => t.default) ||
          (await fetchDefaultYBOCSTemplate())
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
      const apiResponses = responses.map(({ _id, option_0, option_1, option_2, option_3, option_4, ...rest }) => rest)
      const result = await createYBOCSAssessment({
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
      <div className={createModalShellClass('w-full max-w-4xl max-h-[92vh] overflow-hidden')}>
        <CreateModalHeader
          title="New YBOCS Assessment"
          icon={<Brain className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
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
                    <label className="block text-xs font-medium text-slate-600 mb-1">Practitioner</label>
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
                      placeholder="Search practitioner…"
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
                          <label className="block text-xs font-medium text-slate-600 mb-1">Inpatient Admission</label>
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
                          <label className="block text-xs font-medium text-slate-600 mb-1">Patient Visit</label>
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
                  </div>
                </div>

                {responses.length > 0 ? (
                  <div className="space-y-4">
                    {obsessionRows.length > 0 && (
                      <ResponseGroup rows={obsessionRows} title="Obsessions" onSelect={updateResponse} />
                    )}
                    {compulsionRows.length > 0 && (
                      <ResponseGroup rows={compulsionRows} title="Compulsions" onSelect={updateResponse} />
                    )}
                    {answeredCount > 0 && (
                      <div className="rounded-lg p-4 border bg-emerald-50 border-emerald-200">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div><span className="text-slate-600">Obsessions</span><div className="font-bold">{totalObsessions}</div></div>
                          <div><span className="text-slate-600">Compulsions</span><div className="font-bold">{totalCompulsions}</div></div>
                          <div><span className="text-slate-600">Total</span><div className="font-bold">{totalScore}</div></div>
                          <div><span className="text-slate-600">Severity</span><div className="font-bold">{severity}</div></div>
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