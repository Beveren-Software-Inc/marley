// components/ymrs/CreateYMRSAssessmentModal.tsx
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
  fetchYMRSTemplates,
  fetchYMRSTemplateQuestions,
  createYMRSAssessment,
  type YMRSQuestionOption,
} from '../../services/ymrs'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'

// ─────────────────────────────────────────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────────────────────────────────────────
interface ResponseRowInternal {
  _id: string
  question_no: number
  question: string
  options: YMRSQuestionOption[]
  selected_score: number
  selected_text: string
}

interface TemplateDetails {
  name: string
  label: string
  description?: string
}

const nowDate = () => new Date().toISOString().split('T')[0]

// ── QuestionCard component ──────────────────────────────────────────────────
interface QuestionCardProps {
  questionNo: number
  question: string
  options: YMRSQuestionOption[]
  selectedScore: number
  onSelect: (score: number, text: string) => void
}

const QuestionCard = ({ questionNo, question, options, selectedScore, onSelect }: QuestionCardProps) => {
  return (
    <div className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors">
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center mt-0.5">
          {questionNo}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 mb-3">{question}</p>
          <div className="space-y-2">
            {options.map((opt) => (
              <button
                key={opt.score}
                type="button"
                onClick={() => onSelect(opt.score, opt.text)}
                className={`w-full text-left px-3 py-2 rounded-md text-xs font-medium border transition-all ${
                  selectedScore === opt.score
                    ? 'bg-primary border-primary text-white'
                    : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-50'
                }`}
              >
                <span className="font-bold inline-block w-6 text-sm">{opt.score}</span>
                <span className="ml-2">{opt.text}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
interface CreateYMRSAssessmentModalProps {
  onClose: () => void
  onSuccess: () => void
  patient?: string
}

type TabType = 'info' | 'assessment'

export const CreateYMRSAssessmentModal = ({
  onClose,
  onSuccess,
  patient,
}: CreateYMRSAssessmentModalProps) => {
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
  const totalScore = responses.reduce((sum, r) => sum + (r.selected_score || 0), 0)
  const answeredCount = responses.filter((r) => r.selected_score !== undefined && r.selected_score !== null).length

  // Get severity based on total score
  const getSeverity = (score: number): string => {
    if (score <= 12) return "No Mania"
    if (score <= 19) return "Hypomania"
    if (score <= 25) return "Mild Mania"
    if (score <= 37) return "Moderate Mania"
    return "Severe Mania"
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
        const res = await fetchYMRSTemplates(templateQuery || undefined)
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
      const data = await fetchYMRSTemplateQuestions(tmpl.name)
      
      const rows: ResponseRowInternal[] = data.questions.map((q, idx) => ({
        _id: `${idx}`,
        question_no: q.question_no,
        question: q.question,
        options: q.options,
        selected_score: 0,
        selected_text: q.options[0]?.text || "",
      }))
      
      setResponses(rows)
      setActiveTab('assessment')
    } catch (error) {
      console.error('Error loading template questions:', error)
      setError('Failed to load template questions')
    } finally {
      setLoadingTemplate(false)
    }
  }

  // ── Update response ───────────────────────────────────────────────────────
  const updateResponse = (questionId: string, score: number, text: string) => {
    setResponses((prev) =>
      prev.map((r) => {
        if (r._id !== questionId) return r
        return { ...r, selected_score: score, selected_text: text }
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
      const apiResponses = responses.map(({ _id, options, selected_score, selected_text, ...rest }) => ({
        ...rest,
        response: selected_text,
        score: selected_score,
      }))
      
      const result = await createYMRSAssessment({
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
      <div className={createModalShellClass('max-w-3xl w-full max-h-[92vh] overflow-hidden')}>

        {/* Header */}
        <div className="relative shrink-0 border-b border-emerald-100/60 bg-gradient-to-r from-emerald-100 via-teal-50 to-sky-100 px-5 py-4 sm:px-6 flex flex-shrink-0 items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Brain className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold tracking-tight text-emerald-950">New YMRS Assessment</h2>
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
                  placeholder="Search YMRS template…"
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
                      <strong>YMRS Scoring:</strong> 0-60 total. 
                      <strong> Severity:</strong> 0-12 No Mania, 13-19 Hypomania, 20-25 Mild, 26-37 Moderate, 38-60 Severe.
                    </span>
                  </div>

                  <div className="space-y-3">
                    {responses.map((response) => (
                      <QuestionCard
                        key={response._id}
                        questionNo={response.question_no}
                        question={response.question}
                        options={response.options}
                        selectedScore={response.selected_score}
                        onSelect={(score, text) => updateResponse(response._id, score, text)}
                      />
                    ))}
                  </div>

                  {/* Live result summary */}
                  {answeredCount > 0 && (
                    <div className={`rounded-lg p-4 border ${
                      severity === 'Severe Mania' ? 'bg-red-50 border-red-200' :
                      severity === 'Moderate Mania' ? 'bg-orange-50 border-orange-200' :
                      severity === 'Mild Mania' ? 'bg-amber-50 border-amber-200' :
                      severity === 'Hypomania' ? 'bg-yellow-50 border-yellow-200' :
                      'bg-green-50 border-green-200'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-700">Total Score:</div>
                          <div className={`text-2xl font-bold ${
                            severity === 'Severe Mania' ? 'text-red-700' :
                            severity === 'Moderate Mania' ? 'text-orange-700' :
                            severity === 'Mild Mania' ? 'text-amber-700' :
                            severity === 'Hypomania' ? 'text-yellow-700' :
                            'text-green-700'
                          }`}>
                            {totalScore}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-slate-700">Severity:</div>
                          <div className={`text-lg font-semibold ${
                            severity === 'Severe Mania' ? 'text-red-700' :
                            severity === 'Moderate Mania' ? 'text-orange-700' :
                            severity === 'Mild Mania' ? 'text-amber-700' :
                            severity === 'Hypomania' ? 'text-yellow-700' :
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