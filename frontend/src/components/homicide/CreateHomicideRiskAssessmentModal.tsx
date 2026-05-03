// components/homicideRisk/CreateHomicideRiskAssessmentModal.tsx
import { useEffect, useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_FOOTER_STICKY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { Shield, AlertTriangle, Brain, Heart, Users, FileText, Clock, Target } from 'lucide-react'
import { createHomicideRiskAssessment, type ContactRow } from '../../services/homicideRisk'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
const nowDate = () => new Date().toISOString().split('T')[0]

type TabType = 'basic' | 'reason' | 'episode' | 'ideation' | 'history' | 'symptoms' | 'summary' | 'safety' | 'contacts' | 'signatures'

// ── Main modal ────────────────────────────────────────────────────────────────
interface CreateHomicideRiskAssessmentModalProps {
  onClose: () => void
  onSuccess: () => void
  patient?: string
}

export const CreateHomicideRiskAssessmentModal = ({
  onClose,
  onSuccess,
  patient,
}: CreateHomicideRiskAssessmentModalProps) => {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('basic')

  // Basic Info
  const [patientId, setPatientId] = useState(patient || '')
  const [patientName, setPatientName] = useState('')
  const [assessmentDate, setAssessmentDate] = useState(nowDate())
  const [clinician, setClinician] = useState('')

  // Reason for Assessment
  const [reasonClinician, setReasonClinician] = useState(false)
  const [reasonReferral, setReasonReferral] = useState(false)
  const [reasonSocial, setReasonSocial] = useState(false)
  const [reasonIntake, setReasonIntake] = useState(false)
  const [reasonCrisis, setReasonCrisis] = useState(false)
  const [reasonCurrent, setReasonCurrent] = useState(false)
  const [reasonRecentEvent, setReasonRecentEvent] = useState(false)
  const [reasonOtherCheck, setReasonOtherCheck] = useState(false)
  const [otherReason, setOtherReason] = useState('')
  const [reasonFor, setReasonFor] = useState('')

  // Current Episode
  const [intentSubjective, setIntentSubjective] = useState('')
  const [intentObjective, setIntentObjective] = useState('')
  const [planWhen, setPlanWhen] = useState('')
  const [planWhere, setPlanWhere] = useState('')
  const [planHow, setPlanHow] = useState('')
  const [intendedVictim, setIntendedVictim] = useState('')
  const [accessToMeans, setAccessToMeans] = useState('')
  const [preparation, setPreparation] = useState('')
  const [rehearsal, setRehearsal] = useState('')

  // Ideation Characteristics
  const [frequency, setFrequency] = useState('')
  const [intensity, setIntensity] = useState('')
  const [duration, setDuration] = useState('')

  // History
  const [historySelfHarm, setHistorySelfHarm] = useState('')
  const [historyViolence, setHistoryViolence] = useState('')
  const [recentDischarge, setRecentDischarge] = useState('')

  // Symptom Severity
  const [depression, setDepression] = useState<number>(0)
  const [anxiety, setAnxiety] = useState<number>(0)
  const [anger, setAnger] = useState<number>(0)
  const [agitation, setAgitation] = useState<number>(0)
  const [insomnia, setInsomnia] = useState<number>(0)
  const [hopelessness, setHopelessness] = useState<number>(0)
  const [burdensomeness, setBurdensomeness] = useState<number>(0)
  const [impulsivity, setImpulsivity] = useState<number>(0)

  // Clinical Summary
  const [subjectiveReport, setSubjectiveReport] = useState('')
  const [objectiveSigns, setObjectiveSigns] = useState('')
  const [chronicRisk, setChronicRisk] = useState('')
  const [chronicSummary, setChronicSummary] = useState('')

  // Therapeutic Alliance
  const [therapeuticAlliance, setTherapeuticAlliance] = useState('')
  const [riskLevel, setRiskLevel] = useState('')

  // Crisis Safety Plan
  const [pastSafetyStrategies, setPastSafetyStrategies] = useState('')
  const [copingStrategies, setCopingStrategies] = useState('')
  const [treatmentPreferences, setTreatmentPreferences] = useState('')
  const [staffResponsibilities, setStaffResponsibilities] = useState('')

  // Contacts
  const [contacts, setContacts] = useState<ContactRow[]>([])

  // Signatures
  const [clientSignature, setClientSignature] = useState('')
  const [staffSignature, setStaffSignature] = useState('')
  const [guardianSignature, setGuardianSignature] = useState('')
  const [witnessSignature, setWitnessSignature] = useState('')

  // Follow Up
  const [followupDate, setFollowupDate] = useState('')
  const [followupTime, setFollowupTime] = useState('')

  // Patient search
  const [patientQuery, setPatientQuery] = useState('')
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [, setPatientLoading] = useState(false)

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

  // Add contact
  const addContact = () => {
    setContacts([...contacts, {
      relative_name: '',
      relationship_with_patient: '',
      cpr__id_no: '',
      relative_phone_no: '',
      relative_alternative_phone_no: '',
      relative_alternative_phone_no_2: '',
      any_remarks: '',
      entered_by: '',
      entered_date: nowDate(),
    }])
  }

  const updateContact = (index: number, field: keyof ContactRow, value: string) => {
    const updated = [...contacts]
    updated[index][field] = value
    setContacts(updated)
  }

  const removeContact = (index: number) => {
    setContacts(contacts.filter((_, i) => i !== index))
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patientId) { setError('Patient is required'); return }
    
    setSaving(true); setError(null)
    try {
      const result = await createHomicideRiskAssessment({
        patient: patientId,
        assessment_date: assessmentDate,
        clinician: clinician || undefined,
        
        reason_clinician: reasonClinician,
        reason_referral: reasonReferral,
        reason_social: reasonSocial,
        reason_intake: reasonIntake,
        reason_crisis: reasonCrisis,
        reason_current: reasonCurrent,
        reason_recent_event: reasonRecentEvent,
        reason_other_check: reasonOtherCheck,
        other_reason: otherReason || undefined,
        reason_for: reasonFor || undefined,
        
        intent_subjective: intentSubjective || undefined,
        intent_objective: intentObjective || undefined,
        plan_when: planWhen || undefined,
        plan_where: planWhere || undefined,
        plan_how: planHow || undefined,
        intended_victim: intendedVictim || undefined,
        access_to_means: accessToMeans || undefined,
        preparation: preparation || undefined,
        rehearsal: rehearsal || undefined,
        
        frequency: frequency || undefined,
        intensity: intensity || undefined,
        duration: duration || undefined,
        
        history_self_harm: historySelfHarm || undefined,
        history_violence: historyViolence || undefined,
        recent_discharge: recentDischarge || undefined,
        
        depression: depression || undefined,
        anxiety: anxiety || undefined,
        anger: anger || undefined,
        agitation: agitation || undefined,
        insomnia: insomnia || undefined,
        hopelessness: hopelessness || undefined,
        burdensomeness: burdensomeness || undefined,
        impulsivity: impulsivity || undefined,
        
        subjective_report: subjectiveReport || undefined,
        objective_signs: objectiveSigns || undefined,
        chronic_risk: chronicRisk || undefined,
        chronic_summary: chronicSummary || undefined,
        
        therapeutic_alliance: therapeuticAlliance || undefined,
        risk_level: riskLevel || undefined,
        
        past_safety_strategies: pastSafetyStrategies || undefined,
        coping_strategies: copingStrategies || undefined,
        treatment_preferences: treatmentPreferences || undefined,
        staff_responsibilities: staffResponsibilities || undefined,
        
        contacts: contacts.length > 0 ? contacts : undefined,
        
        client_signature: clientSignature || undefined,
        staff_signature: staffSignature || undefined,
        guardian_signature: guardianSignature || undefined,
        witness_signature: witnessSignature || undefined,
        
        followup_date: followupDate || undefined,
        followup_time: followupTime || undefined,
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


  // Tab configuration
  const tabs = [
    { id: 'basic', label: 'Basic Info', icon: Shield },
    { id: 'reason', label: 'Reason', icon: FileText },
    { id: 'episode', label: 'Current Episode', icon: Target },
    { id: 'ideation', label: 'Ideation', icon: Brain },
    { id: 'history', label: 'History', icon: Clock },
    { id: 'symptoms', label: 'Symptoms', icon: AlertTriangle },
    { id: 'summary', label: 'Summary', icon: FileText },
    { id: 'safety', label: 'Safety Plan', icon: Heart },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'signatures', label: 'Signatures', icon: FileText },
  ]

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-4xl w-full max-h-[92vh] overflow-hidden')}>

        {/* Header */}
        <div className="relative shrink-0 border-b border-emerald-100/60 bg-gradient-to-r from-emerald-100 via-teal-50 to-sky-100 px-5 py-4 sm:px-6 flex flex-shrink-0 items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold tracking-tight text-emerald-950">Homicide Risk Assessment</h2>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-2 text-emerald-800/70 transition hover:bg-emerald-200/50 hover:text-emerald-950">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Patient and Date - Always visible */}
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">Patient *</label>
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
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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

        {/* Tabs */}
        <div className="border-b border-slate-200 px-4 overflow-x-auto">
          <div className="flex gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            
            {/* Tab: Basic Info */}
            {activeTab === 'basic' && (
              <div className="space-y-4">
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <h3 className="text-md font-semibold text-slate-800 mb-4">Basic Information</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Patient Name</label>
                      <input
                        type="text"
                        value={patientName}
                        disabled
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-50"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Reason for Assessment */}
            {activeTab === 'reason' && (
              <div className="space-y-4">
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <h3 className="text-md font-semibold text-slate-800 mb-4">Reason for Assessment</h3>
                  <div className="space-y-3">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={reasonClinician} onChange={(e) => setReasonClinician(e.target.checked)} className="rounded" />
                      <span>Clinician judgment (disclosure)</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={reasonReferral} onChange={(e) => setReasonReferral(e.target.checked)} className="rounded" />
                      <span>Referral source identified risk</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={reasonSocial} onChange={(e) => setReasonSocial(e.target.checked)} className="rounded" />
                      <span>Social support identified risk</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={reasonIntake} onChange={(e) => setReasonIntake(e.target.checked)} className="rounded" />
                      <span>Reported on intake paperwork</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={reasonCrisis} onChange={(e) => setReasonCrisis(e.target.checked)} className="rounded" />
                      <span>Reported to crisis line</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={reasonCurrent} onChange={(e) => setReasonCurrent(e.target.checked)} className="rounded" />
                      <span>Current ideation during interview</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={reasonRecentEvent} onChange={(e) => setReasonRecentEvent(e.target.checked)} className="rounded" />
                      <span>Recent event occurred</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={reasonOtherCheck} onChange={(e) => setReasonOtherCheck(e.target.checked)} className="rounded" />
                      <span>Other</span>
                    </label>
                    {reasonOtherCheck && (
                      <textarea
                        value={otherReason}
                        onChange={(e) => setOtherReason(e.target.value)}
                        placeholder="Specify other reason"
                        rows={2}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    )}
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Reason for (Additional context)</label>
                      <textarea
                        value={reasonFor}
                        onChange={(e) => setReasonFor(e.target.value)}
                        rows={3}
                        placeholder="Additional context about the reason for assessment..."
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Current Episode */}
            {activeTab === 'episode' && (
              <div className="space-y-4">
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <h3 className="text-md font-semibold text-slate-800 mb-4">Current Episode Details</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Current Intent (Subjective)</label>
                      <textarea
                        value={intentSubjective}
                        onChange={(e) => setIntentSubjective(e.target.value)}
                        rows={2}
                        placeholder="Patient's reported intent..."
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Current Intent (Objective)</label>
                      <textarea
                        value={intentObjective}
                        onChange={(e) => setIntentObjective(e.target.value)}
                        rows={2}
                        placeholder="Clinician's objective assessment..."
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Plan - When</label>
                        <input
                          type="text"
                          value={planWhen}
                          onChange={(e) => setPlanWhen(e.target.value)}
                          placeholder="Timing of plan"
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Plan - Where</label>
                        <input
                          type="text"
                          value={planWhere}
                          onChange={(e) => setPlanWhere(e.target.value)}
                          placeholder="Location of plan"
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Plan - How</label>
                      <input
                        type="text"
                        value={planHow}
                        onChange={(e) => setPlanHow(e.target.value)}
                        placeholder="Method planned"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Intended Victim (if homicide)</label>
                      <input
                        type="text"
                        value={intendedVictim}
                        onChange={(e) => setIntendedVictim(e.target.value)}
                        placeholder="Who is the intended target?"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Access to Means</label>
                      <textarea
                        value={accessToMeans}
                        onChange={(e) => setAccessToMeans(e.target.value)}
                        rows={2}
                        placeholder="What means/weapons are accessible?"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Preparation</label>
                      <textarea
                        value={preparation}
                        onChange={(e) => setPreparation(e.target.value)}
                        rows={2}
                        placeholder="Any preparations made?"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Rehearsal</label>
                      <textarea
                        value={rehearsal}
                        onChange={(e) => setRehearsal(e.target.value)}
                        rows={2}
                        placeholder="Has the patient rehearsed the plan?"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Ideation Characteristics */}
            {activeTab === 'ideation' && (
              <div className="space-y-4">
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <h3 className="text-md font-semibold text-slate-800 mb-4">Ideation Characteristics</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Frequency</label>
                      <select
                        value={frequency}
                        onChange={(e) => setFrequency(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">Select...</option>
                        <option value="Never">Never</option>
                        <option value="Rarely">Rarely</option>
                        <option value="Sometimes">Sometimes</option>
                        <option value="Frequently">Frequently</option>
                        <option value="Always">Always</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Intensity</label>
                      <select
                        value={intensity}
                        onChange={(e) => setIntensity(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">Select...</option>
                        <option value="Brief and fleeting">Brief and fleeting</option>
                        <option value="Focused deliberation">Focused deliberation</option>
                        <option value="Intense rumination">Intense rumination</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Duration</label>
                      <select
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">Select...</option>
                        <option value="Seconds">Seconds</option>
                        <option value="Minutes">Minutes</option>
                        <option value="Hours">Hours</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: History */}
            {activeTab === 'history' && (
              <div className="space-y-4">
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <h3 className="text-md font-semibold text-slate-800 mb-4">History</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">History of Self Harm</label>
                      <textarea
                        value={historySelfHarm}
                        onChange={(e) => setHistorySelfHarm(e.target.value)}
                        rows={3}
                        placeholder="Any past self-harm behavior?"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">History of Violence</label>
                      <textarea
                        value={historyViolence}
                        onChange={(e) => setHistoryViolence(e.target.value)}
                        rows={3}
                        placeholder="Any past violent behavior?"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Recent Hospital Discharge Date</label>
                      <input
                        type="date"
                        value={recentDischarge}
                        onChange={(e) => setRecentDischarge(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Symptom Severity */}
            {activeTab === 'symptoms' && (
              <div className="space-y-4">
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <h3 className="text-md font-semibold text-slate-800 mb-4">Symptom Severity (1-10)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { label: 'Depression', value: depression, set: setDepression },
                      { label: 'Anxiety', value: anxiety, set: setAnxiety },
                      { label: 'Anger', value: anger, set: setAnger },
                      { label: 'Agitation', value: agitation, set: setAgitation },
                      { label: 'Insomnia', value: insomnia, set: setInsomnia },
                      { label: 'Hopelessness', value: hopelessness, set: setHopelessness },
                      { label: 'Perceived Burdensomeness', value: burdensomeness, set: setBurdensomeness },
                      { label: 'Impulsivity', value: impulsivity, set: setImpulsivity },
                    ].map((item) => (
                      <div key={item.label}>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{item.label}</label>
                        <input
                          type="number"
                          min="0"
                          max="10"
                          value={item.value}
                          onChange={(e) => item.set(parseInt(e.target.value) || 0)}
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Clinical Summary */}
            {activeTab === 'summary' && (
              <div className="space-y-4">
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <h3 className="text-md font-semibold text-slate-800 mb-4">Clinical Summary</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Subjective Report</label>
                      <textarea
                        value={subjectiveReport}
                        onChange={(e) => setSubjectiveReport(e.target.value)}
                        rows={3}
                        placeholder="Patient's subjective report..."
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Objective Signs</label>
                      <textarea
                        value={objectiveSigns}
                        onChange={(e) => setObjectiveSigns(e.target.value)}
                        rows={3}
                        placeholder="Clinician's objective observations..."
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Chronic Risk Present</label>
                        <select
                          value={chronicRisk}
                          onChange={(e) => setChronicRisk(e.target.value)}
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="">Select...</option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Therapeutic Alliance</label>
                        <select
                          value={therapeuticAlliance}
                          onChange={(e) => setTherapeuticAlliance(e.target.value)}
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="">Select...</option>
                          <option value="Good">Good</option>
                          <option value="Neutral">Neutral</option>
                          <option value="Bad">Bad</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Chronic Risk Summary</label>
                      <textarea
                        value={chronicSummary}
                        onChange={(e) => setChronicSummary(e.target.value)}
                        rows={2}
                        placeholder="Summary of chronic risk factors..."
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Current Risk Level</label>
                      <select
                        value={riskLevel}
                        onChange={(e) => setRiskLevel(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">Select...</option>
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Crisis Safety Plan */}
            {activeTab === 'safety' && (
              <div className="space-y-4">
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <h3 className="text-md font-semibold text-slate-800 mb-4">Crisis Safety Plan</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">What has worked in the past (1,2,3)</label>
                      <textarea
                        value={pastSafetyStrategies}
                        onChange={(e) => setPastSafetyStrategies(e.target.value)}
                        rows={3}
                        placeholder="Previous successful coping strategies..."
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">What I can do now</label>
                      <textarea
                        value={copingStrategies}
                        onChange={(e) => setCopingStrategies(e.target.value)}
                        rows={3}
                        placeholder="Current coping strategies..."
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Treatment Preferences</label>
                      <textarea
                        value={treatmentPreferences}
                        onChange={(e) => setTreatmentPreferences(e.target.value)}
                        rows={3}
                        placeholder="Patient's treatment preferences..."
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Staff Responsibilities</label>
                      <textarea
                        value={staffResponsibilities}
                        onChange={(e) => setStaffResponsibilities(e.target.value)}
                        rows={3}
                        placeholder="Staff actions and responsibilities..."
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Follow Up Date</label>
                        <input
                          type="date"
                          value={followupDate}
                          onChange={(e) => setFollowupDate(e.target.value)}
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Follow Up Time</label>
                        <input
                          type="time"
                          value={followupTime}
                          onChange={(e) => setFollowupTime(e.target.value)}
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Contacts */}
            {activeTab === 'contacts' && (
              <div className="space-y-4">
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-md font-semibold text-slate-800">Emergency Contacts</h3>
                    <button
                      type="button"
                      onClick={addContact}
                      className="px-3 py-1 text-sm bg-primary text-white rounded-md hover:bg-primary/90"
                    >
                      + Add Contact
                    </button>
                  </div>
                  <div className="space-y-4">
                    {contacts.map((contact, idx) => (
                      <div key={idx} className="border border-slate-200 rounded-lg p-4 relative">
                        <button
                          type="button"
                          onClick={() => removeContact(idx)}
                          className="absolute top-2 right-2 text-red-500 hover:text-red-700"
                        >
                          ×
                        </button>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
                            <input
                              type="text"
                              value={contact.relative_name}
                              onChange={(e) => updateContact(idx, 'relative_name', e.target.value)}
                              className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Relationship</label>
                            <select
                              value={contact.relationship_with_patient}
                              onChange={(e) => updateContact(idx, 'relationship_with_patient', e.target.value)}
                              className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                            >
                              <option value="">Select...</option>
                              <option value="Father">Father</option>
                              <option value="Mother">Mother</option>
                              <option value="Brother">Brother</option>
                              <option value="Sister">Sister</option>
                              <option value="Husband">Husband</option>
                              <option value="Wife">Wife</option>
                              <option value="Son">Son</option>
                              <option value="Daughter">Daughter</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Phone No</label>
                            <input
                              type="text"
                              value={contact.relative_phone_no}
                              onChange={(e) => updateContact(idx, 'relative_phone_no', e.target.value)}
                              className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Alternative Phone</label>
                            <input
                              type="text"
                              value={contact.relative_alternative_phone_no}
                              onChange={(e) => updateContact(idx, 'relative_alternative_phone_no', e.target.value)}
                              className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-slate-600 mb-1">Remarks</label>
                            <textarea
                              value={contact.any_remarks}
                              onChange={(e) => updateContact(idx, 'any_remarks', e.target.value)}
                              rows={2}
                              className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    {contacts.length === 0 && (
                      <p className="text-center text-slate-500 py-4">No contacts added. Click "Add Contact" to add emergency contacts.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Signatures */}
            {activeTab === 'signatures' && (
              <div className="space-y-4">
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <h3 className="text-md font-semibold text-slate-800 mb-4">Signatures</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Client Signature</label>
                      <input
                        type="text"
                        value={clientSignature}
                        onChange={(e) => setClientSignature(e.target.value)}
                        placeholder="Client signature"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Staff Signature</label>
                      <input
                        type="text"
                        value={staffSignature}
                        onChange={(e) => setStaffSignature(e.target.value)}
                        placeholder="Staff signature"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Guardian Signature</label>
                      <input
                        type="text"
                        value={guardianSignature}
                        onChange={(e) => setGuardianSignature(e.target.value)}
                        placeholder="Guardian signature (if applicable)"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Witness Signature</label>
                      <input
                        type="text"
                        value={witnessSignature}
                        onChange={(e) => setWitnessSignature(e.target.value)}
                        placeholder="Witness signature"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={`${CREATE_MODAL_FOOTER_STICKY} items-center justify-between gap-3`}>
            <div className="text-xs text-slate-400">
              Complete all relevant sections
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