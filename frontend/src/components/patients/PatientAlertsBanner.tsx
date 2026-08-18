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
  const [showCreateMedicalHistoryModal, setShowCreateMedicalHistoryModal] = useState(false)

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

  const hasWarnings = warnings.length > 0
  // Allergies live in five stores; the medical-history field alone covers one
  // patient site-wide, so the registry read is what makes this reliable.
  const hasDocumentedAllergies = Boolean(
    medicalHistory?.allergies?.trim() || allergyRegistry?.checked
  )
  const hasRequiredAlerts = hasWarnings || (canViewClinical && hasDocumentedAllergies)
  const alertsDataLoading =
    warningsLoading || (enforceWarnings && canViewClinical && medicalLoading)
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

  if (!patient || !visible || dismissed) return null

  const hasMedicalHistory = Boolean(
    medicalHistory?.name &&
      (ILLNESS_FIELDS.some(({ key }) => medicalHistory[key]) ||
        medicalHistory.other_ongoing_illness?.trim() ||
        medicalHistory.previous_surgical_history?.trim() ||
        medicalHistory.current_and_past_medications?.trim() ||
        medicalHistory.allergies?.trim() ||
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
                  Warnings or allergies are required for admitted patients. Use &ldquo;Create one&rdquo; below, then close.
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
            {/* Warnings & Allergies */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Warnings & Allergies
                </span>
                {!hasWarnings && (
                  <button
                    type="button"
                    onClick={() => setShowWarningModal(true)}
                    className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-700 shrink-0"
                  >
                    <Plus className="h-3 w-3" />
                    Create one
                  </button>
                )}
              </div>
              {warningsLoading ? (
                <p className="text-xs text-slate-500">Loading…</p>
              ) : hasWarnings ? (
                <ul className="max-h-28 space-y-1.5 overflow-y-auto text-sm text-slate-700">
                  {warnings.slice(0, 5).map((w) => (
                    <li key={w.name} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
                      <span className="line-clamp-2">{stripHtml(w.warning)}</span>
                    </li>
                  ))}
                  {warnings.length > 5 && (
                    <li className="text-xs text-slate-500 pt-0.5">+{warnings.length - 5} more</li>
                  )}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">NO WARNINGS OR ALLERGIES RECORDED.</p>
              )}
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
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary/90 shrink-0"
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </button>
                )}
              </div>
              {/* Allergies first and always shown: a blank panel must never be
                  mistaken for "no allergies". Sources are labelled because most
                  entries are legacy free text, not structured records. */}
              {!medicalLoading && allergyRegistry && (
                allergyRegistry.positive.length > 0 ? (
                  <div className="mb-2 rounded-md border border-red-300 bg-red-50 px-2.5 py-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-red-800">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Allergies ({allergyRegistry.positive.length})
                    </div>
                    <ul className="mt-1 max-h-24 space-y-1 overflow-y-auto">
                      {allergyRegistry.positive.map((entry, idx) => (
                        <li key={`allergy-${idx}`} className="text-xs text-red-900">
                          <span className="font-semibold">
                            {entry.allergen || entry.text}
                          </span>
                          {entry.severity && (
                            <span className="ml-1.5 rounded bg-red-200 px-1 py-0.5 text-[10px] font-semibold">
                              {entry.severity}
                            </span>
                          )}
                          <span className="ml-1.5 text-[10px] text-red-700/80">
                            {entry.source}
                            {entry.is_legacy ? ' · free text' : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : allergyRegistry.no_known_allergies ? (
                  <p className="mb-2 text-xs text-slate-600">
                    <span className="font-semibold text-slate-700">No known allergies</span>
                    <span className="text-slate-500"> — recorded ({allergyRegistry.sources.join(', ')})</span>
                  </p>
                ) : (
                  <p className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900">
                    No allergy record for this patient — allergy status has not been documented.
                  </p>
                )
              )}
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
                      {medicalHistory.allergies?.trim() && (
                        <li className="flex gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
                          <span className="min-w-0">
                            <span className="font-semibold text-amber-800">Allergies</span>
                            <span className="block truncate text-xs text-amber-900">
                              {medicalHistory.allergies}
                            </span>
                          </span>
                        </li>
                      )}
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