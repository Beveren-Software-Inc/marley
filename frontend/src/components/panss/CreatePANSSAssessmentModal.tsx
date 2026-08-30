import { useEffect, useState } from 'react'
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
import { Brain, Info, FileText, TrendingUp, BookOpen } from 'lucide-react'
import {
  createPANSSAssessment,
  PANSS_QUESTIONS,
  RATING_OPTIONS,
  fetchPANSSPrinciples,
  type PANSSQuestion,
} from '../../services/panss'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import {
  fetchInpatientAdmissionOptions,
  fetchPatientVisits,
  fetchHealthcarePractitioners,
  type LinkFieldOption,
} from '../../services/common'
import { useCareContext } from '../../providers/CareContextProvider'
import {
  LOCKED_PRACTITIONER_INPUT_CLASS,
  useLockedLinkedPractitioner,
} from '../../hooks/useLockedLinkedPractitioner'
import { DateFilterInput } from '../ui/DateFilterInput'

interface ResponseRowInternal {
  _id: string
  item_code: string
  item_name: string
  category: 'Positive' | 'Negative' | 'General'
  score: number
}

const nowDate = () => new Date().toISOString().split('T')[0]

interface QuestionCardProps {
  itemCode: string
  itemName: string
  selectedScore: number
  onSelect: (score: number) => void
}

const QuestionCard = ({ itemCode, itemName, selectedScore, onSelect }: QuestionCardProps) => (
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

interface CategorySectionProps {
  title: string
  items: PANSSQuestion[]
  responses: ResponseRowInternal[]
  onUpdate: (itemCode: string, score: number) => void
}

const CategorySection = ({ title, items, responses, onUpdate }: CategorySectionProps) => {
  const sectionTotal = responses
    .filter((r) => items.some((item) => item.code === r.item_code))
    .reduce((sum, r) => sum + (r.score || 0), 0)
  const possibleMax = items.length * 7
  const answeredCount = responses.filter(
    (r) => items.some((item) => item.code === r.item_code) && r.score > 0
  ).length

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
          const response = responses.find((r) => r.item_code === item.code)
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

interface CreatePANSSAssessmentModalProps {
  onClose: () => void
  onSuccess: () => void
  patient?: string
  defaultAdmission?: string
  defaultVisit?: string
}

type TabType = 'header' | 'assessment' | 'footer'

const PANSS_TABS: { id: TabType; label: string }[] = [
  { id: 'header', label: 'Instructions' },
  { id: 'assessment', label: 'Assessment' },
  { id: 'footer', label: 'Scoring Info' },
]

export const CreatePANSSAssessmentModal = ({
  onClose,
  onSuccess,
  patient,
  defaultAdmission,
  defaultVisit,
}: CreatePANSSAssessmentModalProps) => {
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
  const {
    locked: practitionerLocked,
    practitionerId: linkedPractitionerId,
    practitionerLabel: linkedPractitionerLabel,
  } = useLockedLinkedPractitioner()
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])

  const [responses, setResponses] = useState<ResponseRowInternal[]>(() =>
    PANSS_QUESTIONS.map((q, idx) => ({
      _id: `${idx}`,
      item_code: q.code,
      item_name: q.name,
      category: q.category,
      score: 0,
    }))
  )

  const [generalInstructions, setGeneralInstructions] = useState<string>('')
  const [scoringInstructions, setScoringInstructions] = useState<string>('')

  const [patientQuery, setPatientQuery] = useState('')
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientLoading, setPatientLoading] = useState(false)

  const positiveItems = PANSS_QUESTIONS.filter((q) => q.category === 'Positive')
  const negativeItems = PANSS_QUESTIONS.filter((q) => q.category === 'Negative')
  const generalItems = PANSS_QUESTIONS.filter((q) => q.category === 'General')

  const positiveTotal = responses.filter((r) => r.category === 'Positive').reduce((sum, r) => sum + r.score, 0)
  const negativeTotal = responses.filter((r) => r.category === 'Negative').reduce((sum, r) => sum + r.score, 0)
  const generalTotal = responses.filter((r) => r.category === 'General').reduce((sum, r) => sum + r.score, 0)
  const totalScore = positiveTotal + negativeTotal + generalTotal
  const compositeScore = positiveTotal - negativeTotal
  const answeredCount = responses.filter((r) => r.score > 0).length

  useEffect(() => {
    if (resolvedPatient) setPatientId(resolvedPatient)
  }, [resolvedPatient])

  useEffect(() => {
    fetchPANSSPrinciples().then((terms) => {
      if (terms.general_instructions) setGeneralInstructions(terms.general_instructions)
      if (terms.scoring_instructions) setScoringInstructions(terms.scoring_instructions)
      if (terms.header_description && !terms.general_instructions) {
        setGeneralInstructions(terms.header_description)
      }
      if (terms.footer_description && !terms.scoring_instructions) {
        setScoringInstructions(terms.footer_description)
      }
    })
  }, [])

  useEffect(() => {
    if (!linkedPractitionerId) return
    setPractitioner((prev) => prev || linkedPractitionerId)
    setPractitionerLabel((prev) => prev || linkedPractitionerLabel || linkedPractitionerId)
    setPractitionerQuery((q) => q.trim() || linkedPractitionerLabel || linkedPractitionerId)
  }, [linkedPractitionerId, linkedPractitionerLabel])

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

  const updateResponse = (itemCode: string, score: number) => {
    setResponses((prev) =>
      prev.map((r) => (r.item_code === itemCode ? { ...r, score } : r))
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patientId) { setError('Patient is required'); return }
    if (answeredCount === 0) { setError('Please answer at least one question'); return }

    setSaving(true)
    setError(null)
    try {
      const ratings: Record<string, number> = {}
      for (const r of responses) {
        ratings[r.item_code] = r.score || 1
      }

      const result = await createPANSSAssessment({
        patient: patientId,
        assessment_date: assessmentDate,
        practitioner: practitioner || undefined,
        inpatient_admission: inpatientAdmission || undefined,
        patient_visit: patientVisit || undefined,
        clinical_notes: notes || undefined,
        p1: ratings.p1, p2: ratings.p2, p3: ratings.p3, p4: ratings.p4, p5: ratings.p5, p6: ratings.p6, p7: ratings.p7,
        n1: ratings.n1, n2: ratings.n2, n3: ratings.n3, n4: ratings.n4, n5: ratings.n5, n6: ratings.n6, n7: ratings.n7,
        g1: ratings.g1, g2: ratings.g2, g3: ratings.g3, g4: ratings.g4, g5: ratings.g5, g6: ratings.g6,
        g7: ratings.g7, g8: ratings.g8, g9: ratings.g9, g10: ratings.g10, g11: ratings.g11, g12: ratings.g12,
        g13: ratings.g13, g14: ratings.g14, g15: ratings.g15, g16: ratings.g16,
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
          title="New PANSS Assessment"
          icon={<Brain className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          subtitle={patientQuery || resolvedPatient || undefined}
          onClose={onClose}
          alert={error}
        >
          <div className="-mb-px mt-3 flex border-b border-emerald-100/80 overflow-x-auto">
            {PANSS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={createModalTabButtonClass(activeTab === tab.id)}
              >
                {tab.id === 'header' && <BookOpen className="h-4 w-4" />}
                {tab.id === 'assessment' && <FileText className="h-4 w-4" />}
                {tab.id === 'footer' && <Info className="h-4 w-4" />}
                {tab.label}
                {tab.id === 'assessment' && answeredCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                    {answeredCount}/{PANSS_QUESTIONS.length}
                  </span>
                )}
              </button>
            ))}
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
                    <DateFilterInput
                      value={assessmentDate}
                      onChange={(e) => setAssessmentDate(e.target.value)}
                      className={MODAL_FIELD_CLASS}
                    />
                  </div>

                  <div className="relative md:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Rater</label>
                    <input
                      type="text"
                      value={practitioner ? practitionerLabel : practitionerQuery}
                      readOnly={practitionerLocked}
                      onChange={(e) => {
                        if (practitionerLocked) return
                        setPractitionerQuery(e.target.value)
                        setPractitioner('')
                        setPractitionerLabel('')
                        setPractitionerOpen(true)
                      }}
                      onFocus={() => {
                        if (!practitionerLocked) setPractitionerOpen(true)
                      }}
                      placeholder="Search doctor…"
                      title={practitionerLocked ? 'Locked to your linked practitioner' : undefined}
                      className={practitionerLocked ? LOCKED_PRACTITIONER_INPUT_CLASS : MODAL_FIELD_CLASS}
                    />
                    {practitionerOpen && !practitionerLocked && practitionerOptions.length > 0 && (
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
                      {!hideInpatientAdmission && !hidePatientVisit && <div className="hidden md:block" />}
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
                </div>

                <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-md px-3 py-2.5 text-xs text-blue-700">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>
                    <strong>PANSS Rating Scale:</strong> 1=Absent through 7=Extreme. Rate each item based on the past 7 days.
                  </span>
                </div>

                <CategorySection
                  title="Positive Scale (P1–P7)"
                  items={positiveItems}
                  responses={responses}
                  onUpdate={updateResponse}
                />
                <CategorySection
                  title="Negative Scale (N1–N7)"
                  items={negativeItems}
                  responses={responses}
                  onUpdate={updateResponse}
                />
                <CategorySection
                  title="General Psychopathology Scale (G1–G16)"
                  items={generalItems}
                  responses={responses}
                  onUpdate={updateResponse}
                />

                {answeredCount > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-slate-800 mb-3">Current Scores</h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {[
                        { label: 'Positive', value: positiveTotal, suffix: '/49' },
                        { label: 'Negative', value: negativeTotal, suffix: '/49' },
                        { label: 'General', value: generalTotal, suffix: '/112' },
                        { label: 'Total', value: totalScore, suffix: '/210' },
                      ].map(({ label, value, suffix }) => (
                        <div key={label} className="bg-white rounded-lg p-2 text-center border border-slate-200">
                          <div className="text-xs text-slate-500">{label}</div>
                          <div className="text-lg font-bold text-primary">{value}</div>
                          <div className="text-[10px] text-slate-400">{suffix}</div>
                        </div>
                      ))}
                      <div className="bg-white rounded-lg p-2 text-center border border-slate-200">
                        <div className="text-xs text-slate-500">Composite</div>
                        <div className={`text-lg font-bold ${compositeScore >= 0 ? 'text-primary' : 'text-amber-600'}`}>
                          {compositeScore >= 0 ? `+${compositeScore}` : compositeScore}
                        </div>
                        <div className="text-[10px] text-slate-400">P − N</div>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Clinical Notes</label>
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
                      <p>The Positive and Negative Syndrome Scale (PANSS) measures symptom severity in schizophrenia and other psychotic disorders.</p>
                      <p className="font-semibold mt-3">Rating Scale:</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        {RATING_OPTIONS.map((opt) => (
                          <li key={opt.score}>{opt.label}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}

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
                      <p>Positive (7–49), Negative (7–49), General (16–112), Total (30–210). Composite = Positive − Negative.</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={`${CREATE_MODAL_FOOTER_STICKY} items-center justify-between`}>
            <div className="flex items-center gap-3">
              {answeredCount > 0 && (
                <span className="text-sm font-semibold text-emerald-900">
                  Answered:{' '}
                  <span className="text-emerald-700">
                    {answeredCount}/{PANSS_QUESTIONS.length}
                  </span>
                </span>
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
                <button type="button" onClick={() => setActiveTab('assessment')} className={CM_BTN_PRIMARY}>
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
