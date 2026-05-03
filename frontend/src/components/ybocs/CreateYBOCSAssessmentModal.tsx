// components/ybocs/CreateYBOCSAssessmentModal.tsx
import { useEffect, useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_FOOTER_STICKY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { Brain, Info, FileText } from 'lucide-react'
import {
  fetchYBOCSTemplates,
  fetchYBOCSTemplateQuestions,
  createYBOCSAssessment,
  RESPONSE_SCORE,
  type ResponseOption,
} from '../../services/ybocs'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'

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
}

type TabType = 'info' | 'assessment'

export const CreateYBOCSAssessmentModal = ({
  onClose,
  onSuccess,
  patient,
}: CreateYBOCSAssessmentModalProps) => {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('info')

  // Core fields
  const [patientId, setPatientId] = useState(patient || '')
  const [, setPatientName] = useState('')
  const [assessmentDate, setAssessmentDate] = useState(nowDate())
  const [notes, setNotes] = useState('')

  // Template combobox
  const [templateQuery, setTemplateQuery] = useState('')
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateOptions, setTemplateOptions] = useState<TemplateDetails[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDetails | null>(null)
  const [loadingTemplate, setLoadingTemplate] = useState(false)

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

  // ── Patient label on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (!patient) return
    fetchPatients(1, 0, patient).then((res) => {
      if (res.length > 0) {
        setPatientQuery(res[0].patient_name)
        setPatientName(res[0].patient_name)
      }
    }).catch(() => {})
  }, [patient])

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

  // ── Template options ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!templateOpen) return
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const res = await fetchYBOCSTemplates(templateQuery || undefined)
        if (!cancelled) setTemplateOptions(res)
      } catch {
        if (!cancelled) setTemplateOptions([])
      }
    }, templateQuery.trim() ? 300 : 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [templateQuery, templateOpen])

  // ── Template selection ────────────────────────────────────────────────────
  const handleTemplateSelect = async (tmpl: TemplateDetails) => {
    setSelectedTemplate(tmpl)
    setTemplateQuery(tmpl.label)
    setTemplateOpen(false)
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
    } catch (error) {
      console.error('Error loading template questions:', error)
    } finally {
      setLoadingTemplate(false)
    }
  }

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
    setTemplateOpen(false)
  }

  const isAssessmentEnabled = !!selectedTemplate && responses.length > 0

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-4xl w-full max-h-[92vh] overflow-hidden')}>

        {/* Header */}
        <div className="relative shrink-0 border-b border-emerald-100/60 bg-gradient-to-r from-emerald-100 via-teal-50 to-sky-100 px-5 py-4 sm:px-6 flex flex-shrink-0 items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Brain className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold tracking-tight text-emerald-950">New YBOCS Assessment</h2>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-2 text-emerald-800/70 transition hover:bg-emerald-200/50 hover:text-emerald-950">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 min-h-0"
          onClick={(e) => { if (!(e.target as HTMLElement).closest('.relative')) closeAllDropdowns() }}
        >
          <div className="flex-1 overflow-y-auto min-h-0">
            {/* Top form fields */}
            <div className="p-5 space-y-4 border-b border-slate-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Patient <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={patientQuery}
                    onChange={(e) => {
                      setPatientQuery(e.target.value)
                      setPatientOpen(true)
                      if (!e.target.value) { setPatientId(''); setPatientName('') }
                    }}
                    onFocus={() => setPatientOpen(true)}
                    placeholder="Search patient…"
                    disabled={!!patient}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-50"
                  />
                  {patientLoading && (
                    <span className="absolute right-3 top-9 text-xs text-slate-400">Loading…</span>
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
                            setPatientName(p.patient_name)
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Assessment Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={assessmentDate}
                    onChange={(e) => setAssessmentDate(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Template */}
              <div className="relative">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Template <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={templateOpen ? templateQuery : (selectedTemplate?.label ?? templateQuery)}
                  onChange={(e) => {
                    setTemplateQuery(e.target.value)
                    setTemplateOpen(true)
                    if (!e.target.value) { setSelectedTemplate(null); setResponses([]); setActiveTab('info') }
                  }}
                  onFocus={() => setTemplateOpen(true)}
                  placeholder="Search YBOCS template…"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {templateOpen && templateOptions.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto top-full">
                    {templateOptions.map((t) => (
                      <button
                        key={t.name}
                        type="button"
                        onClick={() => handleTemplateSelect(t)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
                      >
                        <div className="font-medium">{t.label}</div>
                        {t.description && <div className="text-xs text-slate-500 truncate">{t.description}</div>}
                      </button>
                    ))}
                  </div>
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

            {/* Tabs */}
            {selectedTemplate && (
              <div className="border-b border-slate-200 px-5">
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setActiveTab('info')}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'info'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Info className="w-4 h-4" />
                    Template Info
                  </button>
                  <button
                    type="button"
                    onClick={() => isAssessmentEnabled && setActiveTab('assessment')}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                      !isAssessmentEnabled
                        ? 'text-slate-300 cursor-not-allowed'
                        : activeTab === 'assessment'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                    disabled={!isAssessmentEnabled}
                  >
                    <FileText className="w-4 h-4" />
                    Assessment Questions
                    {answeredCount > 0 && (
                      <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                        {answeredCount}/{responses.length}
                      </span>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Tab Content */}
            <div className="p-5 space-y-4">
              {/* Tab 1: Template Info */}
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

              {/* Tab 2: Assessment Questions */}
              {activeTab === 'assessment' && responses.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-md px-3 py-2.5 text-xs text-blue-700">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>
                      <strong>YBOCS Scoring:</strong> 0-4 per question. 
                      <strong> Severity:</strong> 0-7 Subclinical, 8-15 Mild, 16-23 Moderate, 24-31 Severe, 32-40 Extreme.
                    </span>
                  </div>

                  {obsessionRows.length > 0 && (
                    <ResponseGroup 
                      rows={obsessionRows} 
                      title="Obsessions" 
                      onSelect={updateResponse}
                    />
                  )}
                  
                  {compulsionRows.length > 0 && (
                    <ResponseGroup 
                      rows={compulsionRows} 
                      title="Compulsions" 
                      onSelect={updateResponse}
                    />
                  )}

                  {/* Live result summary */}
                  {answeredCount > 0 && (
                    <div className={`rounded-lg p-4 border ${
                      severity === 'Extreme' ? 'bg-red-50 border-red-200' :
                      severity === 'Severe' ? 'bg-orange-50 border-orange-200' :
                      severity === 'Moderate' ? 'bg-amber-50 border-amber-200' :
                      severity === 'Mild' ? 'bg-blue-50 border-blue-200' :
                      'bg-green-50 border-green-200'
                    }`}>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <div className="text-xs font-medium text-slate-600">Obsessions</div>
                          <div className="text-xl font-bold text-slate-800">{totalObsessions}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-600">Compulsions</div>
                          <div className="text-xl font-bold text-slate-800">{totalCompulsions}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-600">Total Score</div>
                          <div className={`text-xl font-bold ${
                            severity === 'Extreme' ? 'text-red-700' :
                            severity === 'Severe' ? 'text-orange-700' :
                            severity === 'Moderate' ? 'text-amber-700' :
                            severity === 'Mild' ? 'text-blue-700' :
                            'text-green-700'
                          }`}>
                            {totalScore}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-600">Severity</div>
                          <div className={`text-sm font-semibold ${
                            severity === 'Extreme' ? 'text-red-700' :
                            severity === 'Severe' ? 'text-orange-700' :
                            severity === 'Moderate' ? 'text-amber-700' :
                            severity === 'Mild' ? 'text-blue-700' :
                            'text-green-700'
                          }`}>
                            {severity}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Notes */}
              <div className="pt-4 border-t border-slate-200">
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Clinical notes or observations…"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className={`${CREATE_MODAL_FOOTER_STICKY} items-center justify-between gap-3`}>
            <div className="text-xs text-slate-400">
              {responses.length > 0 && `${answeredCount} / ${responses.length} questions answered`}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className={CM_BTN_CANCEL}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className={CM_BTN_PRIMARY}
              >
                {saving ? 'Creating…' : 'Create Assessment'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}