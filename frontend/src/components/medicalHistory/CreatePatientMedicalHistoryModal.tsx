import { useState, useEffect } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_OVERLAY,
  CreateModalFooter,
  CreateModalHeader,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { ClipboardList } from 'lucide-react'
import type { PatientMedicalHistory } from '../../services/patients'
import { savePatientMedicalHistory } from '../../services/patients'
import { fetchInpatientAdmissionOptions, fetchPatientVisits, type LinkFieldOption } from '../../services/common'
import { toast } from '../../hooks/useToast'
import { useCareContext } from '../../providers/CareContextProvider'
import { PastMedicalHistoryFields } from './PastMedicalHistoryFields'
import {
  emptyPastMedicalHistoryFields,
  hasPastMedicalHistoryContent,
  preparePastMedicalHistoryForSave,
  type PastMedicalHistoryFormFields,
} from './pastMedicalHistoryUtils'

interface CreatePatientMedicalHistoryModalProps {
  patient: string
  patientName?: string
  defaultAdmission?: string
  onClose: () => void
  onCreated: (history: PatientMedicalHistory) => void
}

export const CreatePatientMedicalHistoryModal = ({
  patient,
  patientName,
  defaultAdmission,
  onClose,
  onCreated,
}: CreatePatientMedicalHistoryModalProps) => {
  const { mode, activeVisit, activeAdmission } = useCareContext()
  const isIPMode = mode === 'IP'
  const isOPMode = mode === 'OP'

  const [fields, setFields] = useState<PastMedicalHistoryFormFields>(emptyPastMedicalHistoryFields)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [admissionOptions, setAdmissionOptions] = useState<LinkFieldOption[]>([])
  const [selectedAdmission, setSelectedAdmission] = useState<string>(() => {
    if (isIPMode && activeAdmission) return activeAdmission
    return defaultAdmission ?? ''
  })

  const [visitOptions, setVisitOptions] = useState<LinkFieldOption[]>([])
  const [selectedVisit, setSelectedVisit] = useState<string>(() => {
    if (isOPMode && activeVisit) return activeVisit
    return ''
  })
  const [selectedVisitLabel, setSelectedVisitLabel] = useState<string>('')

  useEffect(() => {
    if (isIPMode) {
      fetchInpatientAdmissionOptions(undefined, patient)
        .then(setAdmissionOptions)
        .catch(() => setAdmissionOptions([]))
    }
  }, [patient, isIPMode])

  useEffect(() => {
    if (isOPMode && patient) {
      fetchPatientVisits(patient, undefined)
        .then((visits) => {
          setVisitOptions(visits)
          if (activeVisit) {
            const matched = visits.find((v) => v.name === activeVisit)
            if (matched) setSelectedVisitLabel(matched.label)
          }
        })
        .catch(() => setVisitOptions([]))
    }
  }, [patient, isOPMode, activeVisit])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (isIPMode && !selectedAdmission) {
      setError('Please select an inpatient admission for this medical history.')
      return
    }

    if (isOPMode && !selectedVisit) {
      setError('Please select a patient visit for this medical history.')
      return
    }

    if (!hasPastMedicalHistoryContent(fields)) {
      setError('Please complete at least one section of the past medical history.')
      return
    }

    try {
      setSaving(true)
      const payload: PatientMedicalHistory = {
        patient,
        patient_name: patientName,
        template: null,
        inpatient_admission: selectedAdmission || null,
        patient_visit: selectedVisit || null,
        ...preparePastMedicalHistoryForSave(fields),
        patient_history_details: [],
      }
      const created = await savePatientMedicalHistory(payload)
      toast.success(
        payload.allergies?.trim()
          ? 'Past medical history saved · allergy added to Warnings'
          : 'Past medical history saved'
      )
      onCreated(created)
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create medical history'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const getModeDisplay = () => {
    if (isIPMode) return 'Inpatient Admission'
    if (isOPMode) return 'Outpatient Visit'
    return 'Select Context'
  }

  const getModeHelpText = () => {
    if (isIPMode) {
      return `Recording past medical history for IP admission: ${selectedAdmission || 'not selected'}.`
    }
    if (isOPMode) {
      return `Recording past medical history for OP visit: ${selectedVisitLabel || selectedVisit || 'not selected'}.`
    }
    return 'Select either an IP admission or OP visit from the context switcher.'
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-3xl w-full max-h-[90vh] overflow-hidden')}>
        <CreateModalHeader
          title="Past Medical History"
          subtitle={
            <>
              {patientName ? `${patientName} · ` : null}
              {isIPMode ? (
                <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                  IP Mode
                </span>
              ) : null}
              {isOPMode ? (
                <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                  OP Mode
                </span>
              ) : null}
            </>
          }
          icon={<ClipboardList className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          onClose={onClose}
        />

        <form onSubmit={handleSubmit} className={`${CREATE_MODAL_BODY_GRADIENT} flex-1 flex flex-col min-h-0`}>
          {error && (
            <div className="mx-4 mt-3 mb-1 bg-red-50 border border-red-200 rounded-md p-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-xs font-semibold text-primary mb-1">{getModeDisplay()}</p>
              <p className="text-xs text-slate-600">{getModeHelpText()}</p>
            </div>

            {isIPMode && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Inpatient Admission <span className="text-red-500">*</span>
                </label>
                {activeAdmission ? (
                  <>
                    <input
                      type="text"
                      value={selectedAdmission}
                      readOnly
                      className="w-full rounded-md border border-slate-300 bg-slate-100 text-slate-900 px-3 py-2 text-sm cursor-not-allowed"
                    />
                    <p className="text-xs text-slate-400 mt-1">Auto-selected from IP context</p>
                  </>
                ) : (
                  <select
                    value={selectedAdmission}
                    onChange={(e) => setSelectedAdmission(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    required
                  >
                    <option value="">— Select Admission —</option>
                    {admissionOptions.map((a) => (
                      <option key={a.name} value={a.name}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {isOPMode && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Patient Visit <span className="text-red-500">*</span>
                </label>
                {activeVisit ? (
                  <>
                    <input
                      type="text"
                      value={selectedVisitLabel || selectedVisit}
                      readOnly
                      className="w-full rounded-md border border-slate-300 bg-slate-100 text-slate-900 px-3 py-2 text-sm cursor-not-allowed"
                    />
                    <p className="text-xs text-slate-400 mt-1">Auto-selected from OP context</p>
                  </>
                ) : (
                  <select
                    value={selectedVisit}
                    onChange={(e) => {
                      setSelectedVisit(e.target.value)
                      const selected = visitOptions.find((v) => v.name === e.target.value)
                      if (selected) setSelectedVisitLabel(selected.label)
                    }}
                    className="w-full rounded-md border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    required
                  >
                    <option value="">— Select Visit —</option>
                    {visitOptions.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <PastMedicalHistoryFields value={fields} onChange={setFields} />
          </div>

          <CreateModalFooter>
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL} disabled={saving}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                saving ||
                !hasPastMedicalHistoryContent(fields) ||
                (isIPMode && !selectedAdmission) ||
                (isOPMode && !selectedVisit)
              }
              className={CM_BTN_PRIMARY}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </CreateModalFooter>
        </form>
      </div>
    </div>
  )
}
