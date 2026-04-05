import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Brain, Info, FileText, ClipboardList } from 'lucide-react'
import {
  fetchADHDTemplates,
  fetchADHDTemplateQuestions,
  createADHDAssessment,
} from '../../services/adhd'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'

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
}

type TabType = 'info' | 'assessment' | 'footer'

export const CreateADHDAssessmentModal = ({
  onClose,
  onSuccess,
  patient,
}: CreateADHDAssessmentModalProps) => {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('info')

  // Core fields
  const [patientId, setPatientId] = useState(patient || '')
  const [assessmentDate, setAssessmentDate] = useState(nowDate())
  const [notes, setNotes] = useState('')

  // Template combobox
  const [templateQuery, setTemplateQuery] = useState('')
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateOptions, setTemplateOptions] = useState<TemplateDetails[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDetails | null>(null)
  const [loadingTemplate, setLoadingTemplate] = useState(false)

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
    if (!patient) return
    fetchPatients(1, 0, patient).then((res) => {
      if (res.length > 0) {
        setPatientQuery(res[0].patient_name)
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
        const res = await fetchADHDTemplates(templateQuery || undefined)
        if (!cancelled) setTemplateOptions(res)
      } catch {
        if (!cancelled) setTemplateOptions([])
      }
    }, templateQuery.trim() ? 300 : 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [templateQuery, templateOpen])

  // ── Template selection — stable _id assigned here, once ──────────────────
  const handleTemplateSelect = async (tmpl: TemplateDetails) => {
    setSelectedTemplate(tmpl)
    setTemplateQuery(tmpl.label)
    setTemplateOpen(false)
    setLoadingTemplate(true)
    try {
      const data = await fetchADHDTemplateQuestions(tmpl.name)
      // Assign _id = "{partLetter}-{indexWithinPart}" — stable for the lifetime of this form
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
      // Switch to assessment tab after template loads
      setActiveTab('assessment')
    } catch {
      // leave responses as-is
    } finally {
      setLoadingTemplate(false)
    }
  }

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
    setTemplateOpen(false)
  }

  // Check if assessment tab should be enabled
  const isAssessmentEnabled = !!selectedTemplate && responses.length > 0
  const isFooterEnabled = !!selectedTemplate?.footer_description

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[92vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex-shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Brain className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-slate-900">New ADHD Assessment</h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
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
            {/* Top form fields - always visible */}
            <div className="p-5 space-y-4 border-b border-slate-200">
              {/* Patient + Date */}
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
                      if (!e.target.value) { setPatientId(''); setPatientQuery('') }
                    }}
                    onFocus={() => setPatientOpen(true)}
                    placeholder="Search patient…"
                    disabled={!!patient}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-50 disabled:text-slate-400"
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
                  placeholder="Search ADHD assessment template…"
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
                  <button
                    type="button"
                    onClick={() => isFooterEnabled && setActiveTab('footer')}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                      !isFooterEnabled
                        ? 'text-slate-300 cursor-not-allowed'
                        : activeTab === 'footer'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                    disabled={!isFooterEnabled}
                  >
                    <ClipboardList className="w-4 h-4" />
                    Additional Info
                  </button>
                </div>
              </div>
            )}

            {/* Tab Content */}
            <div className="p-5 space-y-4">
              {/* Tab 1: Template Info */}
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

              {/* Tab 2: Assessment Questions */}
              {activeTab === 'assessment' && responses.length > 0 && (
                <div className="space-y-3">
                  {/* Scoring info banner */}
                  <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-md px-3 py-2.5 text-xs text-blue-700">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

                  {/* Live result */}
                  {answeredCount > 0 && (
                    <div className={`flex items-center justify-between rounded-lg px-4 py-3 border ${
                      screeningResult === 'Positive' ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'
                    }`}>
                      <div className="text-sm">
                        <span className="font-semibold text-slate-700">Part A Positive Count:</span>{' '}
                        <span className={`font-bold text-base ${positiveCount >= 4 ? 'text-amber-700' : 'text-slate-700'}`}>
                          {positiveCount}
                        </span>
                      </div>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                        screeningResult === 'Positive'
                          ? 'bg-amber-100 text-amber-700 border border-amber-300'
                          : 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                      }`}>
                        {screeningResult}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Additional Info (Footer) */}
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

              {/* Notes - always visible */}
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
          <div className="border-t border-slate-200 bg-white px-5 py-4 flex items-center justify-between gap-3 flex-shrink-0">
            <div className="text-xs text-slate-400">
              {responses.length > 0 && `${answeredCount} / ${responses.length} questions answered`}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
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