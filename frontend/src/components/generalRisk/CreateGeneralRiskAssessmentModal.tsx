// components/generalRisk/CreateGeneralRiskAssessmentModal.tsx
import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, ClipboardList, Target, Users } from 'lucide-react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_OVERLAY,
  CreateModalFooter,
  CreateModalHeader,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { DateFilterInput } from '../ui/DateFilterInput'
import { YesNoSelect } from '../ui/YesNoSelect'
import { selectFromYesNo, type YesNoChoice } from '../ui/yesNoValue'
import {
  GENERAL_RISK_ITEMS,
  GENERAL_RISK_SECTIONS,
  createGeneralRiskAssessment,
  generalRiskReasonField,
  notifyRiskGapsChanged,
} from '../../services/generalRisk'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import {
  fetchHealthcarePractitioners,
  fetchPatientVisits,
  type LinkFieldOption,
} from '../../services/common'
import { useCareContext } from '../../providers/CareContextProvider'
import {
  LOCKED_PRACTITIONER_INPUT_CLASS,
  useLockedLinkedPractitioner,
} from '../../hooks/useLockedLinkedPractitioner'

const nowDate = () => new Date().toISOString().split('T')[0]

const SECTION_ICONS = [
  <AlertTriangle key="self" className="w-4 h-4 text-rose-500" />,
  <Target key="others" className="w-4 h-4 text-amber-500" />,
  <Users key="from" className="w-4 h-4 text-purple-500" />,
]

interface CreateGeneralRiskAssessmentModalProps {
  onClose: () => void
  onSuccess: () => void
  patient?: string
  defaultAdmission?: string
  defaultVisit?: string
}

export const CreateGeneralRiskAssessmentModal = ({
  onClose,
  onSuccess,
  patient,
  defaultAdmission,
  defaultVisit,
}: CreateGeneralRiskAssessmentModalProps) => {
  const { mode, activeVisit, activeAdmission, selectedPatient: contextPatient } = useCareContext()
  const isIPMode = mode === 'IP'
  const isOPMode = mode === 'OP'

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Basic Info
  const [patientId, setPatientId] = useState(patient || contextPatient || '')
  const [, setPatientName] = useState('')
  const [assessmentDate, setAssessmentDate] = useState(nowDate())
  const [clinician, setClinician] = useState('')
  const [clinicianQuery, setClinicianQuery] = useState('')
  const [clinicianOpen, setClinicianOpen] = useState(false)
  const [clinicianOptions, setClinicianOptions] = useState<LinkFieldOption[]>([])
  const {
    locked: practitionerLocked,
    practitionerId: linkedPractitionerId,
    practitionerLabel: linkedPractitionerLabel,
  } = useLockedLinkedPractitioner()
  const [inpatientAdmission, setInpatientAdmission] = useState(
    isIPMode && activeAdmission ? activeAdmission : defaultAdmission || ''
  )
  const [patientVisit, setPatientVisit] = useState(
    isOPMode && activeVisit ? activeVisit : defaultVisit || ''
  )
  const [patientVisitLabel, setPatientVisitLabel] = useState('')

  // Risk answers (Yes/No per item) + reason captured when the answer is Yes
  const [answers, setAnswers] = useState<Record<string, YesNoChoice>>({})
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')

  // Patient search
  const [patientQuery, setPatientQuery] = useState('')
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [, setPatientLoading] = useState(false)

  const handleAnswer = (key: string, value: YesNoChoice) => {
    setAnswers((prev) => ({ ...prev, [key]: value }))
    if (value !== 'yes') setReasons((prev) => ({ ...prev, [key]: '' }))
  }


  // ── Patient label on mount ────────────────────────────────────────────────
  useEffect(() => {
    const pid = patient || contextPatient
    if (!pid) return
    setPatientId(pid)
    fetchPatients(1, 0, pid)
      .then((res) => {
        if (res.length > 0) {
          setPatientQuery(res[0].patient_name)
          setPatientName(res[0].patient_name)
        }
      })
      .catch(() => {})
  }, [patient, contextPatient])

  // ── Practitioner options + auto-fill ───────────────────────────────────────
  useEffect(() => {
    if (!clinicianOpen) return
    const t = setTimeout(() => {
      fetchHealthcarePractitioners(clinicianQuery.trim() || undefined)
        .then(setClinicianOptions)
        .catch(() => setClinicianOptions([]))
    }, clinicianQuery.trim() ? 300 : 0)
    return () => clearTimeout(t)
  }, [clinicianQuery, clinicianOpen])

  useEffect(() => {
    if (!linkedPractitionerId) return
    setClinician((prev) => prev || linkedPractitionerId)
    setClinicianQuery((q) => q.trim() || linkedPractitionerLabel || linkedPractitionerId)
  }, [linkedPractitionerId, linkedPractitionerLabel])

  useEffect(() => {
    if (isIPMode && activeAdmission) setInpatientAdmission(activeAdmission)
    if (isOPMode && activeVisit) setPatientVisit(activeVisit)
  }, [isIPMode, isOPMode, activeAdmission, activeVisit])

  // ── Visit label when auto-filled ───────────────────────────────────────────
  useEffect(() => {
    if (!patientVisit || !patientId) return
    fetchPatientVisits(patientId)
      .then((visits) => {
        const match = visits.find((v) => v.name === patientVisit)
        if (match) setPatientVisitLabel(match.label || match.name)
      })
      .catch(() => {})
  }, [patientVisit, patientId])

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
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [patientQuery, patientOpen])

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patientId) {
      setError('Patient is required')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const riskAnswers: Record<string, string | undefined> = {}
      for (const item of GENERAL_RISK_ITEMS) {
        const answer = answers[item.key] ?? ''
        // A question the clinician left alone stays blank instead of being "No".
        riskAnswers[item.key] = selectFromYesNo(answer)
        riskAnswers[generalRiskReasonField(item.key)] =
          answer === 'yes' ? reasons[item.key]?.trim() || '' : ''
      }

      const result = await createGeneralRiskAssessment({
        patient: patientId,
        assessment_date: assessmentDate,
        practitioner: clinician || undefined,
        inpatient_admission: inpatientAdmission || undefined,
        patient_visit: patientVisit || undefined,
        notes: notes.trim() || undefined,
        ...riskAnswers,
      })

      if (result.success) {
        // A Yes on Suicidal risk / Homicide flags the matching sidebar screen red
        // (via the risk-gaps endpoint) until that follow-up assessment exists for
        // this care episode — refresh it as soon as the GRA is saved.
        notifyRiskGapsChanged()
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

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-4xl w-full max-h-[92vh] overflow-hidden')}>
        <CreateModalHeader
          title="General Risk Assessment"
          subtitle="Screening risk towards self, towards others and from others"
          icon={<ClipboardList className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          onClose={onClose}
        />

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className={`${CREATE_MODAL_BODY_GRADIENT} p-5 space-y-6`}>
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
                      if (!e.target.value) {
                        setPatientId('')
                        setPatientName('')
                      }
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
                  <DateFilterInput
                    value={assessmentDate}
                    onChange={(e) => setAssessmentDate(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {isIPMode ? (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Inpatient Admission</label>
                    <input
                      type="text"
                      value={inpatientAdmission}
                      readOnly
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-50 cursor-not-allowed"
                    />
                    <p className="text-xs text-slate-400 mt-1">From current IP context</p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Inpatient Admission</label>
                    <input
                      type="text"
                      value={inpatientAdmission}
                      onChange={(e) => setInpatientAdmission(e.target.value)}
                      placeholder="Optional admission no."
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                )}
                {isOPMode ? (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Patient Visit</label>
                    <input
                      type="text"
                      value={patientVisitLabel || patientVisit}
                      readOnly
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-50 cursor-not-allowed"
                    />
                    <p className="text-xs text-slate-400 mt-1">From current OP context</p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Patient Visit</label>
                    <input
                      type="text"
                      value={patientVisit}
                      onChange={(e) => setPatientVisit(e.target.value)}
                      placeholder="Optional visit no."
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                )}
                <div className="md:col-span-2 relative">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Clinician (Healthcare Practitioner)
                  </label>
                  <input
                    type="text"
                    value={clinicianQuery}
                    readOnly={practitionerLocked}
                    onChange={(e) => {
                      if (practitionerLocked) return
                      setClinicianQuery(e.target.value)
                      setClinician('')
                      setClinicianOpen(true)
                    }}
                    onFocus={() => {
                      if (!practitionerLocked) setClinicianOpen(true)
                    }}
                    placeholder="Search doctor…"
                    title={practitionerLocked ? 'Locked to your linked practitioner' : undefined}
                    className={
                      practitionerLocked
                        ? LOCKED_PRACTITIONER_INPUT_CLASS
                        : 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary'
                    }
                  />
                  {clinicianOpen && !practitionerLocked && clinicianOptions.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto top-full">
                      {clinicianOptions.map((p) => (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => {
                            setClinician(p.name)
                            setClinicianQuery(p.label || p.name)
                            setClinicianOpen(false)
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
                        >
                          <div className="font-medium">{p.label || p.name}</div>
                          {p.department && <div className="text-xs text-slate-500">{p.department}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Risk sections — Yes / No per item, reason captured when Yes */}
            {GENERAL_RISK_SECTIONS.map((section, index) => (
              <div key={section.title} className="bg-white border border-slate-200 rounded-lg p-4">
                <h3 className="text-md font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  {SECTION_ICONS[index]}
                  {section.title}
                </h3>
                <div className="space-y-3">
                  {section.items.map((item) => (
                    <div
                      key={item.key}
                      className="rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-sm font-medium text-slate-700">{item.label}</span>
                        <YesNoSelect
                          compact
                          value={answers[item.key] ?? ''}
                          onChange={(value) => handleAnswer(item.key, value)}
                        />
                      </div>
                      {answers[item.key] === 'yes' && (
                        <textarea
                          rows={2}
                          value={reasons[item.key] ?? ''}
                          onChange={(e) =>
                            setReasons((prev) => ({ ...prev, [item.key]: e.target.value }))
                          }
                          placeholder={`Reason / details for ${item.label.toLowerCase()}…`}
                          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Notes */}
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <h3 className="text-md font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-primary" />
                Additional Notes
              </h3>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observations, management plan or referrals…"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          <CreateModalFooter hint="Answer Yes / No for each risk item">
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={CM_BTN_PRIMARY}>
              {saving ? 'Creating…' : 'Create Assessment'}
            </button>
          </CreateModalFooter>
        </form>
      </div>
    </div>
  )
}

