import { useState, useEffect, useCallback, useMemo } from 'react'
import { X, AlertTriangle, FileText, Plus } from 'lucide-react'
import { useWarningMessages } from '../../hooks/useWarningMessages'
import { fetchPatientMedicalHistory, type PatientMedicalHistory } from '../../services/patients'
import { fetchPatientAllergies, type PatientAllergies } from '../../services/allergyRegistry'
import { CreateWarningMessageModal } from '../warnings/CreateWarningMessageModal'
import { CreatePatientMedicalHistoryModal } from '../medicalHistory/CreatePatientMedicalHistoryModal'
import { LegacyPatientMedicalHistoryPanel, hasLegacyPatientHistory } from '../medicalHistory/LegacyPatientMedicalHistoryPanel'
import { ILLNESS_FIELDS, yesNoBadgeClass } from '../medicalHistory/pastMedicalHistoryUtils'
import { toast } from '../../hooks/useToast'
import { useAuth } from '../../providers/AuthProvider'
import { canViewClinicalPatientHistory } from '../../config/permissions'
import { recordNoKnownAllergy } from '../../services/warningMessages'
import { CreateAllergyModal } from '../allergies/CreateAllergyModal'

const stripHtml = (html: string | undefined): string => {
  if (!html) return '-'
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  const text = tmp.textContent || tmp.innerText || ''
  return text.trim().replace(/\s+/g, ' ') || '-'
}

interface PatientAlertsBannerProps {
  patient: string | undefined
  patientName?: string
  dismissed: boolean
  onDismiss: () => void
  visible: boolean
  /** Doctors must record warnings or allergies when the patient has an active admission. */
  enforceWarnings?: boolean
  /** While checking for an active admission, close stays blocked when enforceWarnings applies. */
  enforceWarningsPending?: boolean
  onDismissabilityChange?: (canDismiss: boolean) => void
}

export const PatientAlertsBanner = ({
  patient,
  patientName,
  dismissed,
  onDismiss,
  visible,
  enforceWarnings = false,
  enforceWarningsPending = false,
  onDismissabilityChange,
}: PatientAlertsBannerProps) => {
  const { user } = useAuth()
  const canViewClinical = useMemo(() => {
    const roles = user?.roles?.length
      ? user.roles
      : ([user?.role, user?.role_profile_name].filter(Boolean) as string[])
    return canViewClinicalPatientHistory(roles)
  }, [user])
  const { warnings, loading: warningsLoading, refetch: refetchWarnings } = useWarningMessages(
    patient,
    'all',
    undefined,
    1,
    50,
  )
  const [medicalHistory, setMedicalHistory] = useState<PatientMedicalHistory | null>(null)
  const [medicalLoading, setMedicalLoading] = useState(false)
  const [allergyRegistry, setAllergyRegistry] = useState<PatientAllergies | null>(null)
  const [showWarningModal, setShowWarningModal] = useState(false)
  const [showAllergyModal, setShowAllergyModal] = useState(false)
  const [showCreateMedicalHistoryModal, setShowCreateMedicalHistoryModal] = useState(false)
  const [noAllergyChecked, setNoAllergyChecked] = useState(false)
  const [submittingNoAllergy, setSubmittingNoAllergy] = useState(false)

  useEffect(() => {
    if (!patient || !canViewClinical) {
      setMedicalHistory(null)
      return
    }
    const load = async () => {
      setMedicalLoading(true)
      try {
        const [data, allergies] = await Promise.all([
          fetchPatientMedicalHistory(patient),
          fetchPatientAllergies(patient).catch(() => null),
        ])
        setMedicalHistory(data)
        setAllergyRegistry(allergies)
      } catch {
        setMedicalHistory(null)
        setAllergyRegistry(null)
      } finally {
        setMedicalLoading(false)
      }
    }
    load()
  }, [patient, canViewClinical])

  useEffect(() => {
    setNoAllergyChecked(false)
  }, [patient])

  const clinicalWarnings = warnings.filter((w) => !Number(w.no_allergy) && !Number(w.is_allergy))
  const hasWarnings = clinicalWarnings.length > 0
  const allergyEntries = allergyRegistry?.positive ?? []
  const hasAllergyEntries = allergyEntries.length > 0
  const hasDocumentedNoAllergy = Boolean(
    warnings.some((w) => Number(w.no_allergy)) || allergyRegistry?.no_known_allergies,
  )
  const hasDocumentedAllergies = hasAllergyEntries || hasDocumentedNoAllergy
  const hasRequiredAlerts = hasWarnings || (canViewClinical && hasDocumentedAllergies)
  const alertsDataLoading =
    warningsLoading || (enforceWarnings && canViewClinical && medicalLoading)
  const showNoAllergyTick =
    !alertsDataLoading && !hasAllergyEntries && !hasDocumentedNoAllergy
  const canDismiss =
    !enforceWarnings ||
    (!enforceWarningsPending && !alertsDataLoading && hasRequiredAlerts)

  useEffect(() => {
    onDismissabilityChange?.(canDismiss)
  }, [canDismiss, onDismissabilityChange])

  const handleDismissAttempt = useCallback(() => {
    if (!canDismiss) {
      toast.error('Record at least one warning or allergy before closing.')
      return
    }
    onDismiss()
  }, [canDismiss, onDismiss])

  const handleSubmitNoAllergy = useCallback(async () => {
    if (!patient || !noAllergyChecked || submittingNoAllergy) return
    setSubmittingNoAllergy(true)
    try {
      await recordNoKnownAllergy(patient)
      toast.success('No known allergies recorded.')
      await refetchWarnings()
      const allergies = await fetchPatientAllergies(patient).catch(() => null)
      setAllergyRegistry(allergies)
      onDismiss()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record no known allergies.')
    } finally {
      setSubmittingNoAllergy(false)
    }
  }, [patient, noAllergyChecked, submittingNoAllergy, refetchWarnings, onDismiss])

  if (!patient || !visible || dismissed) return null

  const hasMedicalHistory = Boolean(
    medicalHistory?.name &&
      (ILLNESS_FIELDS.some(({ key }) => medicalHistory[key]) ||
        medicalHistory.other_ongoing_illness?.trim() ||
        medicalHistory.previous_surgical_history?.trim() ||
        medicalHistory.current_and_past_medications?.trim() ||
        medicalHistory.allergies?.trim() ||
        medicalHistory.no_known_allergies ||
        medicalHistory.social_history?.trim() ||
        medicalHistory.addiction ||
        medicalHistory.smoking ||
        (medicalHistory.patient_history_details?.length ?? 0) > 0)
  )

  return (
    <>
      <div
        className="animate-slide-down px-4 pt-1"
        role="alert"
        aria-live="polite"
      >
        {/* Hanging card: rounded bottom, shadow, sits in body below header */}
        <div className="mx-auto max-w-4xl rounded-b-xl border border-slate-200/80 border-t-2 border-t-primary/30 bg-white shadow-lg">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600" />
                <span>Patient alerts — {patientName || patient}</span>
              </div>
              {enforceWarnings && !canDismiss && !alertsDataLoading && !enforceWarningsPending && (
                <p className="mt-1 text-xs font-medium text-amber-800">
                  Warnings or allergies are required for admitted patients. Record a warning or an allergy below, then close.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleDismissAttempt}
              disabled={!canDismiss}
              className={`flex-shrink-0 rounded-lg p-1.5 transition-colors ${
                canDismiss
                  ? 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'
                  : 'cursor-not-allowed text-slate-300'
              }`}
              aria-label={canDismiss ? 'Close alerts' : 'Close alerts — warnings required'}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className={`grid gap-4 p-4 bg-green-50 ${canViewClinical ? 'sm:grid-cols-2' : ''}`}>
            <div className="flex flex-col gap-3">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Warnings
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowWarningModal(true)}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-600 text-white hover:bg-amber-700"
                    title="Create warning"
                    aria-label="Create warning"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
                {warningsLoading ? (
                  <p className="text-xs text-slate-500">Loading…</p>
                ) : hasWarnings ? (
                  <ul className="max-h-28 space-y-1.5 overflow-y-auto text-sm text-slate-700">
                    {clinicalWarnings.slice(0, 5).map((w) => (
                      <li key={w.name} className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
                        <span className="line-clamp-2">{stripHtml(w.warning)}</span>
                      </li>
                    ))}
                    {clinicalWarnings.length > 5 && (
                      <li className="text-xs text-slate-500 pt-0.5">+{clinicalWarnings.length - 5} more</li>
                    )}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">NO WARNINGS RECORDED.</p>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Allergies
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAllergyModal(true)}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700"
                    title="Create allergy"
                    aria-label="Create allergy"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
                {medicalLoading ? (
                  <p className="text-xs text-slate-500">Loading…</p>
                ) : hasAllergyEntries ? (
                  <ul className="max-h-28 space-y-1.5 overflow-y-auto">
                    {allergyEntries.map((entry, idx) => (
                      <li key={`allergy-${idx}`} className="text-sm text-red-900">
                        <span className="font-semibold">{entry.allergen || entry.text}</span>
                        {entry.severity ? (
                          <span className="ml-1.5 rounded bg-red-200 px-1 py-0.5 text-[10px] font-semibold">
                            {entry.severity}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : hasDocumentedNoAllergy ? (
                  <p className="text-sm text-slate-600">
                    <span className="font-semibold text-slate-700">No known allergies</span>
                    <span className="text-slate-500"> — recorded</span>
                  </p>
                ) : (
                  <p className="text-sm text-slate-500">NO ALLERGIES RECORDED.</p>
                )}
                {showNoAllergyTick ? (
                  <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-slate-200 pt-3">
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-primary focus:ring-primary"
                        checked={noAllergyChecked}
                        disabled={submittingNoAllergy}
                        onChange={(e) => setNoAllergyChecked(e.target.checked)}
                      />
                      <span>No allergies</span>
                    </label>
                    <button
                      type="button"
                      disabled={!noAllergyChecked || submittingNoAllergy}
                      onClick={() => void handleSubmitNoAllergy()}
                      className="rounded-md border border-primary bg-white px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {submittingNoAllergy ? 'Saving…' : 'Submit'}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            {canViewClinical && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Past Medical History
                </span>
                {!hasMedicalHistory && (
                  <button
                    type="button"
                    onClick={() => setShowCreateMedicalHistoryModal(true)}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white hover:bg-primary/90"
                    title="Add past medical history"
                    aria-label="Add past medical history"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                )}
              </div>
              {medicalLoading ? (
                <p className="text-xs text-slate-500">Loading…</p>
              ) : (
                <>
                  {hasMedicalHistory && medicalHistory ? (
                    <ul className="max-h-28 space-y-1.5 overflow-y-auto text-sm text-slate-700">
                      {ILLNESS_FIELDS.filter(({ key }) => medicalHistory[key]).map(({ key, label }) => (
                        <li key={key} className="flex gap-2 items-center">
                          <FileText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                          <span className="font-medium text-slate-700">{label}</span>
                          <span
                            className={`inline-flex px-1.5 py-0.5 rounded text-[10px] ${yesNoBadgeClass(medicalHistory[key])}`}
                          >
                            {medicalHistory[key]}
                          </span>
                        </li>
                      ))}
                      {medicalHistory.other_ongoing_illness?.trim() ? (
                        <li className="flex gap-2">
                          <FileText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                          <span className="truncate">{medicalHistory.other_ongoing_illness}</span>
                        </li>
                      ) : null}
                      {(medicalHistory.addiction || medicalHistory.smoking) && (
                        <li className="flex flex-wrap gap-1">
                          {medicalHistory.addiction ? (
                            <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                              Addiction
                            </span>
                          ) : null}
                          {medicalHistory.smoking ? (
                            <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                              Smoking
                            </span>
                          ) : null}
                        </li>
                      )}
                      {medicalHistory.patient_history_details?.slice(0, 3).map((row, idx) => (
                        <li key={`legacy-${idx}`} className="flex gap-2">
                          <FileText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                          <span className="min-w-0">
                            <span className="font-medium text-slate-700">{row.attributes || '—'}</span>
                            {row.yesno === 'Yes' ? (
                              <span className={`ml-1 inline-flex px-1.5 py-0.5 rounded text-[10px] ${yesNoBadgeClass('Yes')}`}>
                                Yes
                              </span>
                            ) : row.yesno ? (
                              <span className="text-slate-600"> · {row.yesno}</span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {hasLegacyPatientHistory(medicalHistory?.legacy_from_patient) ? (
                    <div className={hasMedicalHistory ? 'mt-2 overflow-hidden rounded-md border border-amber-200' : ''}>
                      <LegacyPatientMedicalHistoryPanel
                        legacy={medicalHistory?.legacy_from_patient}
                        compact
                        defaultOpen={!hasMedicalHistory}
                      />
                    </div>
                  ) : null}
                  {!hasMedicalHistory && !hasLegacyPatientHistory(medicalHistory?.legacy_from_patient) ? (
                    <p className="text-sm text-slate-500">NO PAST MEDICAL HISTORY RECORDED.</p>
                  ) : null}
                </>
              )}
            </div>
            )}
          </div>
        </div>
      </div>

      {showWarningModal && (
        <CreateWarningMessageModal
          initialPatient={patient}
          onClose={() => setShowWarningModal(false)}
          onSuccess={() => {
            refetchWarnings()
            setShowWarningModal(false)
          }}
        />
      )}

      {showAllergyModal && (
        <CreateAllergyModal
          initialPatient={patient}
          onClose={() => setShowAllergyModal(false)}
          onSuccess={() => {
            void refetchWarnings()
            void fetchPatientAllergies(patient).then(setAllergyRegistry).catch(() => null)
            setShowAllergyModal(false)
          }}
        />
      )}

      {showCreateMedicalHistoryModal && patient && (
        <CreatePatientMedicalHistoryModal
          patient={patient}
          patientName={medicalHistory?.patient_name}
          onClose={() => setShowCreateMedicalHistoryModal(false)}
          onCreated={(created) => {
            setMedicalHistory(created)
            setShowCreateMedicalHistoryModal(false)
          }}
        />
      )}
    </>
  )
}