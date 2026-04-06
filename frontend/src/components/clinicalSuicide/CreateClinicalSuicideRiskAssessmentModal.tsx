// components/suicideRisk/CreateSuicideRiskAssessmentModal.tsx
import { useEffect, useState } from 'react'
import { Shield, AlertTriangle, Heart, Brain, Users, Target, Activity } from 'lucide-react'
import { createSuicideRiskAssessment } from '../../services/suicideRisk'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
const nowDate = () => new Date().toISOString().split('T')[0]

// ── Main modal ────────────────────────────────────────────────────────────────
interface CreateSuicideRiskAssessmentModalProps {
  onClose: () => void
  onSuccess: () => void
  patient?: string
}

export const CreateSuicideRiskAssessmentModal = ({
  onClose,
  onSuccess,
  patient,
}: CreateSuicideRiskAssessmentModalProps) => {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Basic Info
  const [patientId, setPatientId] = useState(patient || '')
  const [patientName, setPatientName] = useState('')
  const [assessmentDate, setAssessmentDate] = useState(nowDate())
  const [clinician, setClinician] = useState('')

  // Section 1: Suicidal Ideation
  const [hasIdeation, setHasIdeation] = useState(false)
  const [ideationFrequency, setIdeationFrequency] = useState('')
  const [ideationDuration, setIdeationDuration] = useState('')
  const [ideationIncreasing, setIdeationIncreasing] = useState('')
  const [ideation24h, setIdeation24h] = useState(false)

  // Section 2: Current Plan
  const [hasPlan, setHasPlan] = useState(false)
  const [planMethod, setPlanMethod] = useState('')
  const [planLocation, setPlanLocation] = useState('')
  const [planImmediacy, setPlanImmediacy] = useState('')
  const [accessLethalMeans, setAccessLethalMeans] = useState(false)
  const [riskBehavior, setRiskBehavior] = useState(false)

  // Section 3: History
  const [hasHistory, setHasHistory] = useState(false)
  const [attemptCount, setAttemptCount] = useState<number>(0)
  const [lastAttempt, setLastAttempt] = useState('')
  const [psychiatricHistory, setPsychiatricHistory] = useState('')

  // Section 4: Stressors
  const [hasStressors, setHasStressors] = useState(false)
  const [stressorsDescription, setStressorsDescription] = useState('')

  // Section 5: Support
  const [hasSupport, setHasSupport] = useState(false)
  const [supportPeople, setSupportPeople] = useState('')

  // Section 6: Coping
  const [hasCoping, setHasCoping] = useState(false)
  const [copingStrategies, setCopingStrategies] = useState('')
  const [reasonsToLive, setReasonsToLive] = useState('')
  const [personalStrengths, setPersonalStrengths] = useState('')

  // Actions
  const [actionsRequired, setActionsRequired] = useState('')

  // Patient search
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

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patientId) { setError('Patient is required'); return }
    
    setSaving(true); setError(null)
    try {
      const result = await createSuicideRiskAssessment({
        patient: patientId,
        assessment_date: assessmentDate,
        clinician: clinician || undefined,
        
        has_ideation: hasIdeation,
        ideation_frequency: ideationFrequency || undefined,
        ideation_duration: ideationDuration || undefined,
        ideation_increasing: ideationIncreasing || undefined,
        ideation_24h: ideation24h || undefined,
        
        has_plan: hasPlan,
        plan_method: planMethod || undefined,
        plan_location: planLocation || undefined,
        plan_immediacy: planImmediacy || undefined,
        access_lethal_means: accessLethalMeans || undefined,
        risk_behavior: riskBehavior || undefined,
        
        has_history: hasHistory,
        attempt_count: attemptCount || undefined,
        last_attempt: lastAttempt || undefined,
        psychiatric_history: psychiatricHistory || undefined,
        
        has_stressors: hasStressors,
        stressors_description: stressorsDescription || undefined,
        
        has_support: hasSupport,
        support_people: supportPeople || undefined,
        
        has_coping: hasCoping,
        coping_strategies: copingStrategies || undefined,
        reasons_to_live: reasonsToLive || undefined,
        personal_strengths: personalStrengths || undefined,
        
        actions_required: actionsRequired || undefined,
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[92vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex-shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-slate-900">Clinical Suicide Risk Assessment</h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            
            {/* Basic Information */}
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <h3 className="text-md font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Basic Information
              </h3>
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
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Assessment Date</label>
                  <input
                    type="date"
                    value={assessmentDate}
                    onChange={(e) => setAssessmentDate(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Clinician</label>
                  <input
                    type="text"
                    value={clinician}
                    onChange={(e) => setClinician(e.target.value)}
                    placeholder="Enter clinician name"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            {/* Section 1: Suicidal Ideation */}
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-md font-semibold text-slate-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  1. Suicidal Ideation
                </h3>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={hasIdeation}
                    onChange={(e) => setHasIdeation(e.target.checked)}
                    className="rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-slate-600">Evidence of suicidal ideation</span>
                </label>
              </div>
              
              {hasIdeation && (
                <div className="space-y-4 mt-4 pl-6 border-l-2 border-amber-200">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">How often do you have these thoughts?</label>
                    <input
                      type="text"
                      value={ideationFrequency}
                      onChange={(e) => setIdeationFrequency(e.target.value)}
                      placeholder="e.g., Daily, Weekly, Occasionally"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">How long have you had these thoughts?</label>
                    <input
                      type="text"
                      value={ideationDuration}
                      onChange={(e) => setIdeationDuration(e.target.value)}
                      placeholder="e.g., Days, Weeks, Months, Years"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Are the thoughts getting stronger?</label>
                    <select
                      value={ideationIncreasing}
                      onChange={(e) => setIdeationIncreasing(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">Select...</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ideation24h}
                      onChange={(e) => setIdeation24h(e.target.checked)}
                      className="rounded border-slate-300 text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-slate-600">Thoughts in past 24 hours</span>
                  </label>
                </div>
              )}
            </div>

            {/* Section 2: Current Plan */}
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-md font-semibold text-slate-800 flex items-center gap-2">
                  <Target className="w-4 h-4 text-red-500" />
                  2. Current Plan
                </h3>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={hasPlan}
                    onChange={(e) => setHasPlan(e.target.checked)}
                    className="rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-slate-600">Current plan to take own life</span>
                </label>
              </div>
              
              {hasPlan && (
                <div className="space-y-4 mt-4 pl-6 border-l-2 border-red-200">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Planned method</label>
                    <input
                      type="text"
                      value={planMethod}
                      onChange={(e) => setPlanMethod(e.target.value)}
                      placeholder="Describe the method"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Where would it occur?</label>
                    <input
                      type="text"
                      value={planLocation}
                      onChange={(e) => setPlanLocation(e.target.value)}
                      placeholder="Location details"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">How immediate is the plan?</label>
                    <select
                      value={planImmediacy}
                      onChange={(e) => setPlanImmediacy(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">Select...</option>
                      <option value="Immediate">Immediate</option>
                      <option value="Next 24 hours">Next 24 hours</option>
                      <option value="Week">Week</option>
                      <option value="Nonspecific">Nonspecific</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
              )}
              
              <div className="mt-4 space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={accessLethalMeans}
                    onChange={(e) => setAccessLethalMeans(e.target.checked)}
                    className="rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-slate-600">Access to lethal means</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={riskBehavior}
                    onChange={(e) => setRiskBehavior(e.target.checked)}
                    className="rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-slate-600">Taking more risks lately (substance use, reckless behavior)</span>
                </label>
              </div>
            </div>

            {/* Section 3: History */}
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-md font-semibold text-slate-800 flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-500" />
                  3. History / Previous Attempts
                </h3>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={hasHistory}
                    onChange={(e) => setHasHistory(e.target.checked)}
                    className="rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-slate-600">History of previous attempts</span>
                </label>
              </div>
              
              {hasHistory && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pl-6 border-l-2 border-purple-200">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">How many attempts?</label>
                    <input
                      type="number"
                      value={attemptCount}
                      onChange={(e) => setAttemptCount(parseInt(e.target.value) || 0)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">How long ago?</label>
                    <input
                      type="text"
                      value={lastAttempt}
                      onChange={(e) => setLastAttempt(e.target.value)}
                      placeholder="e.g., Last week, 3 months ago"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              )}
              
              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Prior diagnosis or psychiatric episode</label>
                <select
                  value={psychiatricHistory}
                  onChange={(e) => setPsychiatricHistory(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select...</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                  <option value="Unsure">Unsure</option>
                </select>
              </div>
            </div>

            {/* Section 4: Stressors */}
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-md font-semibold text-slate-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-500" />
                  4. Current Stressors
                </h3>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={hasStressors}
                    onChange={(e) => setHasStressors(e.target.checked)}
                    className="rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-slate-600">Current stressors present</span>
                </label>
              </div>
              
              {hasStressors && (
                <div className="mt-4 pl-6 border-l-2 border-orange-200">
                  <textarea
                    rows={3}
                    value={stressorsDescription}
                    onChange={(e) => setStressorsDescription(e.target.value)}
                    placeholder="Describe stressors (relationship, job loss, grief, etc.)"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              )}
            </div>

            {/* Section 5: Support System */}
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-md font-semibold text-slate-800 flex items-center gap-2">
                  <Users className="w-4 h-4 text-green-500" />
                  5. Protective Factors - Support System
                </h3>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={hasSupport}
                    onChange={(e) => setHasSupport(e.target.checked)}
                    className="rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-slate-600">Has support system</span>
                </label>
              </div>
              
              {hasSupport && (
                <div className="mt-4 pl-6 border-l-2 border-green-200">
                  <textarea
                    rows={2}
                    value={supportPeople}
                    onChange={(e) => setSupportPeople(e.target.value)}
                    placeholder="Support system (family, friends, GP, etc.)"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              )}
            </div>

            {/* Section 6: Coping Strategies */}
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-md font-semibold text-slate-800 flex items-center gap-2">
                  <Heart className="w-4 h-4 text-teal-500" />
                  6. Protective Factors - Coping
                </h3>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={hasCoping}
                    onChange={(e) => setHasCoping(e.target.checked)}
                    className="rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-slate-600">Has coping strategies</span>
                </label>
              </div>
              
              <div className="space-y-4">
                {hasCoping && (
                  <div className="pl-6 border-l-2 border-teal-200">
                    <textarea
                      rows={2}
                      value={copingStrategies}
                      onChange={(e) => setCopingStrategies(e.target.value)}
                      placeholder="What has helped before?"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary mb-3"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Reasons to live</label>
                  <textarea
                    rows={2}
                    value={reasonsToLive}
                    onChange={(e) => setReasonsToLive(e.target.value)}
                    placeholder="What keeps you going?"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Personal strengths</label>
                  <textarea
                    rows={2}
                    value={personalStrengths}
                    onChange={(e) => setPersonalStrengths(e.target.value)}
                    placeholder="What are your strengths?"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            {/* Actions Required */}
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <h3 className="text-md font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Recommended Actions
              </h3>
              <textarea
                rows={4}
                value={actionsRequired}
                onChange={(e) => setActionsRequired(e.target.value)}
                placeholder="Actions / Referral Notes / Safety Plan"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-200 bg-white px-5 py-4 flex items-center justify-between gap-3 flex-shrink-0">
            <div className="text-xs text-slate-400">
              Complete all relevant sections
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