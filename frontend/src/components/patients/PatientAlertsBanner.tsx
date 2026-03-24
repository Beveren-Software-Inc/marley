import { useState, useEffect } from 'react'
import { X, AlertTriangle, FileText, Plus } from 'lucide-react'
import { useWarningMessages } from '../../hooks/useWarningMessages'
import { fetchPatientMedicalHistory, type PatientMedicalHistory } from '../../services/patients'
import { CreateWarningMessageModal } from '../warnings/CreateWarningMessageModal'
import { CreatePatientMedicalHistoryModal } from '../medicalHistory/CreatePatientMedicalHistoryModal'

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
  autoDismissMs?: number
}

export const PatientAlertsBanner = ({
  patient,
  patientName,
  dismissed,
  onDismiss,
  visible,
  autoDismissMs = 10000,
}: PatientAlertsBannerProps) => {
  const { warnings, loading: warningsLoading, refetch: refetchWarnings } = useWarningMessages(patient)
  const [medicalHistory, setMedicalHistory] = useState<PatientMedicalHistory | null>(null)
  const [medicalLoading, setMedicalLoading] = useState(false)
  const [showWarningModal, setShowWarningModal] = useState(false)
  const [showCreateMedicalHistoryModal, setShowCreateMedicalHistoryModal] = useState(false)

  // Auto-dismiss timer
  useEffect(() => {
    if (!visible || dismissed || autoDismissMs <= 0) {
      return
    }

    const timer = setTimeout(() => {
      onDismiss()
    }, autoDismissMs)

    // Cleanup timer if banner is dismissed or unmounts
    return () => clearTimeout(timer)
  }, [visible, dismissed, autoDismissMs, onDismiss])

  useEffect(() => {
    if (!patient) {
      setMedicalHistory(null)
      return
    }
    const load = async () => {
      setMedicalLoading(true)
      try {
        const data = await fetchPatientMedicalHistory(patient)
        setMedicalHistory(data)
      } catch {
        setMedicalHistory(null)
      } finally {
        setMedicalLoading(false)
      }
    }
    load()
  }, [patient])

  if (!patient || !visible || dismissed) return null

  const hasWarnings = warnings.length > 0
  const hasMedicalHistory = medicalHistory?.patient_history_details && medicalHistory.patient_history_details.length > 0

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
            </div>
            <button
              type="button"
              onClick={onDismiss}
              className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
              aria-label="Close alerts"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 p-4 bg-green-50">
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
                <p className="text-sm text-slate-500">No warnings or allergies recorded.</p>
              )}
            </div>

            {/* Medical History summary */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Medical History
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
              {medicalLoading ? (
                <p className="text-xs text-slate-500">Loading…</p>
              ) : hasMedicalHistory ? (
                <ul className="max-h-28 space-y-1.5 overflow-y-auto text-sm text-slate-700">
                  {medicalHistory.patient_history_details!.slice(0, 5).map((row, idx) => (
                    <li key={idx} className="flex gap-2">
                      <FileText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                      <span className="min-w-0">
                        <span className="font-medium text-slate-700">{row.attributes || '—'}</span>
                        {row.yesno && (
                          <span className="text-slate-600"> · {row.yesno}</span>
                        )}
                        {row.description && (
                          <span className="block truncate text-slate-500 text-xs">{row.description}</span>
                        )}
                      </span>
                    </li>
                  ))}
                  {(medicalHistory.patient_history_details?.length ?? 0) > 5 && (
                    <li className="text-xs text-slate-500 pt-0.5">
                      +{(medicalHistory.patient_history_details?.length ?? 0) - 5} more
                    </li>
                  )}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No medical history recorded.</p>
              )}
            </div>
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