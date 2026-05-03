// components/panss/CreatePANSSAssessmentModal.tsx
import { useEffect, useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_FOOTER_STICKY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { Brain, Info, FileText, TrendingUp, BookOpen } from 'lucide-react'
import {
  createPANSSAssessment,
  PANSS_QUESTIONS,
  RATING_OPTIONS,
  fetchPANSSPrinciples,
  type PANSSQuestion,
} from '../../services/panss'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'

// ─────────────────────────────────────────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────────────────────────────────────────
interface ResponseRowInternal {
  _id: string
  item_code: string
  item_name: string
  category: 'Positive' | 'Negative' | 'General'
  score: number
}

const nowDate = () => new Date().toISOString().split('T')[0]

// ── QuestionCard component ──────────────────────────────────────────────────
interface QuestionCardProps {
  itemCode: string
  itemName: string
  selectedScore: number
  onSelect: (score: number) => void
}

const QuestionCard = ({ itemCode, itemName, selectedScore, onSelect }: QuestionCardProps) => {
  return (
    <div className="border border-slate-200 rounded-lg p-3 hover:bg-slate-50 transition-colors">
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center">
          {itemCode}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 mb-2">{itemName}</p>
          <div className="flex flex-wrap gap-1.5">
            {RATING_OPTIONS.map((opt) => (
              <button
                key={opt.score}
                type="button"
                onClick={() => onSelect(opt.score)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                  selectedScore === opt.score
                    ? 'bg-primary border-primary text-white'
                    : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-50'
                }`}
              >
                {opt.score}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── CategorySection component ───────────────────────────────────────────────
interface CategorySectionProps {
  title: string
  items: PANSSQuestion[]
  responses: ResponseRowInternal[]
  onUpdate: (itemCode: string, score: number) => void
}

const CategorySection = ({ title, items, responses, onUpdate }: CategorySectionProps) => {
  const sectionTotal = responses
    .filter(r => items.some(item => item.code === r.item_code))
    .reduce((sum, r) => sum + (r.score || 0), 0)
  
  const possibleMax = items.length * 7
  const answeredCount = responses.filter(r => items.some(item => item.code === r.item_code) && r.score > 0).length
  
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="bg-slate-100 px-4 py-3 border-b border-slate-200">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{items.length} questions</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">Total Score</div>
            <div className="text-lg font-bold text-primary">{sectionTotal} / {possibleMax}</div>
            <div className="text-xs text-slate-400">{answeredCount}/{items.length} answered</div>
          </div>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {items.map((item) => {
          const response = responses.find(r => r.item_code === item.code)
          return (
            <QuestionCard
              key={item.code}
              itemCode={item.code}
              itemName={item.name}
              selectedScore={response?.score || 0}
              onSelect={(score) => onUpdate(item.code, score)}
            />
          )
        })}
      </div>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
interface CreatePANSSAssessmentModalProps {
  onClose: () => void
  onSuccess: () => void
  patient?: string
}

type TabType = 'header' | 'assessment' | 'footer'

export const CreatePANSSAssessmentModal = ({
  onClose,
  onSuccess,
  patient,
}: CreatePANSSAssessmentModalProps) => {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('header')

  // Core fields
  const [patientId, setPatientId] = useState(patient || '')
  const [, setPatientName] = useState('')
  const [assessmentDate, setAssessmentDate] = useState(nowDate())
  const [clinician, setClinician] = useState('')
  const [notes, setNotes] = useState('')

  // Responses
  const [responses, setResponses] = useState<ResponseRowInternal[]>(() =>
    PANSS_QUESTIONS.map((q, idx) => ({
      _id: `${idx}`,
      item_code: q.code,
      item_name: q.name,
      category: q.category,
      score: 0,
    }))
  )

  // PANSS Terms
  const [generalInstructions, setGeneralInstructions] = useState<string>('')
  const [scoringInstructions, setScoringInstructions] = useState<string>('')

  // Patient combobox
  const [patientQuery, setPatientQuery] = useState('')
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientLoading, setPatientLoading] = useState(false)

  // Computed values
  const positiveItems = PANSS_QUESTIONS.filter(q => q.category === 'Positive')
  const negativeItems = PANSS_QUESTIONS.filter(q => q.category === 'Negative')
  const generalItems = PANSS_QUESTIONS.filter(q => q.category === 'General')
  
  const positiveTotal = responses.filter(r => r.category === 'Positive').reduce((sum, r) => sum + r.score, 0)
  const negativeTotal = responses.filter(r => r.category === 'Negative').reduce((sum, r) => sum + r.score, 0)
  const generalTotal = responses.filter(r => r.category === 'General').reduce((sum, r) => sum + r.score, 0)
  const totalScore = positiveTotal + negativeTotal + generalTotal
  const compositeScore = positiveTotal - negativeTotal
  const answeredCount = responses.filter(r => r.score > 0).length

  // ── Fetch PANSS terms on mount ────────────────────────────────────────
  useEffect(() => {
    const loadTerms = async () => {
      const terms = await fetchPANSSPrinciples()
      if (terms.general_instructions) setGeneralInstructions(terms.general_instructions)
      if (terms.scoring_instructions) setScoringInstructions(terms.scoring_instructions)
    }
    loadTerms()
  }, [])

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

  // ── Update response ───────────────────────────────────────────────────────
  const updateResponse = (itemCode: string, score: number) => {
    setResponses((prev) =>
      prev.map((r) => {
        if (r.item_code !== itemCode) return r
        return { ...r, score }
      })
    )
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patientId) { setError('Patient is required'); return }
    if (answeredCount === 0) { setError('Please answer at least one question'); return }
    
    setSaving(true); setError(null)
    try {
      const apiResponses = responses.map(({ _id, ...rest }) => rest)
      const result = await createPANSSAssessment({
        patient: patientId,
        assessment_date: assessmentDate,
        clinician: clinician || undefined,
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
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-4xl w-full max-h-[92vh] overflow-hidden')}>

        {/* Header */}
        <div className="relative shrink-0 border-b border-emerald-100/60 bg-gradient-to-r from-emerald-100 via-teal-50 to-sky-100 px-5 py-4 sm:px-6 flex flex-shrink-0 items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Brain className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold tracking-tight text-emerald-950">New PANSS Assessment</h2>
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Clinician</label>
                  <input
                    type="text"
                    value={clinician}
                    onChange={(e) => setClinician(e.target.value)}
                    placeholder="Clinician name"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            {/* Tabs - 3 tabs now */}
            <div className="border-b border-slate-200 px-5">
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('header')}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'header'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  Header / Instructions
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('assessment')}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'assessment'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Assessment Questions
                  {answeredCount > 0 && (
                    <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                      {answeredCount}/{PANSS_QUESTIONS.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('footer')}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'footer'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Info className="w-4 h-4" />
                  Footer / Scoring
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="p-5 space-y-4">
              {/* Tab 1: Header / General Instructions */}
              {activeTab === 'header' && (
                <div className="space-y-4">
                  {generalInstructions ? (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
                        <BookOpen className="w-4 h-4" />
                        General Instructions
                      </h3>
                      <div 
                        className="text-sm text-blue-800 prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: generalInstructions }}
                      />
                    </div>
                  ) : (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-blue-900 mb-2">PANSS Overview</h3>
                      <div className="text-sm text-blue-800 space-y-2">
                        <p>The Positive and Negative Syndrome Scale (PANSS) is a medical scale used for measuring symptom severity of patients with schizophrenia and other psychotic disorders.</p>
                        <p className="font-semibold mt-3">Rating Scale:</p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                          <li>1 - Absent</li>
                          <li>2 - Minimal</li>
                          <li>3 - Mild</li>
                          <li>4 - Moderate</li>
                          <li>5 - Moderate Severe</li>
                          <li>6 - Severe</li>
                          <li>7 - Extreme</li>
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Assessment Questions */}
              {activeTab === 'assessment' && (
                <div className="space-y-4">
                  <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-md px-3 py-2.5 text-xs text-blue-700">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>
                      <strong>PANSS Rating Scale:</strong> 1=Absent, 2=Minimal, 3=Mild, 4=Moderate, 5=Moderate Severe, 6=Severe, 7=Extreme.
                      Rate each item based on the past 7 days.
                    </span>
                  </div>

                  <CategorySection
                    title="Positive Scale (P1-P7)"
                    items={positiveItems}
                    responses={responses}
                    onUpdate={updateResponse}
                  />

                  <CategorySection
                    title="Negative Scale (N1-N7)"
                    items={negativeItems}
                    responses={responses}
                    onUpdate={updateResponse}
                  />

                  <CategorySection
                    title="General Psychopathology Scale (G1-G16)"
                    items={generalItems}
                    responses={responses}
                    onUpdate={updateResponse}
                  />

                  {/* Live result summary */}
                  {answeredCount > 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-slate-800 mb-3">Current Scores</h3>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div className="bg-white rounded-lg p-2 text-center border border-slate-200">
                          <div className="text-xs text-slate-500">Positive</div>
                          <div className="text-lg font-bold text-primary">{positiveTotal}</div>
                          <div className="text-[10px] text-slate-400">/49</div>
                        </div>
                        <div className="bg-white rounded-lg p-2 text-center border border-slate-200">
                          <div className="text-xs text-slate-500">Negative</div>
                          <div className="text-lg font-bold text-primary">{negativeTotal}</div>
                          <div className="text-[10px] text-slate-400">/49</div>
                        </div>
                        <div className="bg-white rounded-lg p-2 text-center border border-slate-200">
                          <div className="text-xs text-slate-500">General</div>
                          <div className="text-lg font-bold text-primary">{generalTotal}</div>
                          <div className="text-[10px] text-slate-400">/112</div>
                        </div>
                        <div className="bg-white rounded-lg p-2 text-center border border-slate-200">
                          <div className="text-xs text-slate-500">Total</div>
                          <div className="text-lg font-bold text-primary">{totalScore}</div>
                          <div className="text-[10px] text-slate-400">/210</div>
                        </div>
                        <div className="bg-white rounded-lg p-2 text-center border border-slate-200">
                          <div className="text-xs text-slate-500">Composite</div>
                          <div className={`text-lg font-bold ${compositeScore >= 0 ? 'text-primary' : 'text-amber-600'}`}>
                            {compositeScore >= 0 ? `+${compositeScore}` : compositeScore}
                          </div>
                          <div className="text-[10px] text-slate-400">P - N</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Footer / Scoring Instructions */}
              {activeTab === 'footer' && (
                <div className="space-y-4">
                  {scoringInstructions ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-green-900 mb-3 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        Scoring Instructions
                      </h3>
                      <div 
                        className="text-sm text-green-800 prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: scoringInstructions }}
                      />
                    </div>
                  ) : (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-green-900 mb-2">Scoring Information</h3>
                      <div className="text-sm text-green-800 space-y-2">
                        <p>Of the 30 items included in the PANSS, 7 constitute a Positive Scale, 7 a Negative Scale, and the remaining 16 a General Psychopathology Scale.</p>
                        <p className="font-semibold mt-3">Score Ranges:</p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                          <li>Positive Scale: 7 to 49</li>
                          <li>Negative Scale: 7 to 49</li>
                          <li>General Psychopathology Scale: 16 to 112</li>
                          <li>Total Score: 30 to 210</li>
                        </ul>
                        <p className="mt-3">The Composite Scale is scored by subtracting the negative score from the positive score, yielding a bipolar index that ranges from -42 to +42.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Notes - always visible on all tabs */}
              <div className="pt-4 border-t border-slate-200">
                <label className="block text-sm font-medium text-slate-700 mb-1">Clinical Notes</label>
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
              {answeredCount} / {PANSS_QUESTIONS.length} questions answered
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