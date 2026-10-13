import { useCareContext } from '../../providers/CareContextProvider'
import { CreateECTAdmissionModal } from './CreateECTAdmissionModal'
import { CreateECTProcedureModal } from './CreateECTProcedureModal'
import { ECTAnesthesiaConsentModal } from './ECTAnesthesiaConsentModal'
import { ECTPatientHealthHistoryModal } from './ECTPatientHealthHistoryModal'
import { ECTProcedureConsentModal } from './ECTProcedureConsentModal'
import { PreAnesthesiaAssessmentModal } from './PreAnesthesiaAssessmentModal'
import { AnesthesiaRecordModal } from '../admissions/AnesthesiaRecordModal'
import { ModifiedAldereteScoreModal } from '../admissions/ModifiedAldereteScoreModal'
import { PreEctChecklistModal } from '../admissions/PreEctChecklistModal'
import { RecoveryRoomRecordModal } from '../admissions/RecoveryRoomRecordModal'
import { TimeOutProcedureModal } from '../admissions/TimeOutProcedureModal'

/** ECT forms that start a brand-new record (mirrors the ECT Forms dashboard cards). */
export type ECTFormActionId =
  | 'anesthesia-consent'
  | 'pre-anesthesia'
  | 'anesthesia-record'
  | 'recovery-room'
  | 'alderete'
  | 'timeout'
  | 'pre-ect'
  | 'ect-admission'
  | 'ect-procedure-consent'
  | 'ect-patient-health-history'
  | 'ect-procedure'

/**
 * Every creatable ECT form, in the same order as the ECT Forms dashboard cards.
 * The three read-only entries of that dashboard (ECT Details, Consolidated ECT
 * Details, ECT Chart) have no create action and are deliberately absent.
 */
const ECT_FORM_ACTIONS: { id: ECTFormActionId; label: string }[] = [
  { id: 'anesthesia-consent', label: 'Anesthesia Consent' },
  { id: 'pre-anesthesia', label: 'Pre-Anesthesia' },
  { id: 'anesthesia-record', label: 'Anesthesia Record' },
  { id: 'recovery-room', label: 'Recovery Room' },
  { id: 'alderete', label: 'Alderete Score' },
  { id: 'timeout', label: 'Time Out' },
  { id: 'pre-ect', label: 'Pre-ECT Checklist' },
  { id: 'ect-admission', label: 'ECT Admission' },
  { id: 'ect-procedure-consent', label: 'ECT Procedure Consent' },
  { id: 'ect-patient-health-history', label: 'Patient Health History' },
  { id: 'ect-procedure', label: 'ECT Procedure' },
]

interface ECTFormMenuItemsProps {
  /** Called with the chosen form; the caller closes its actions menu and renders the modal. */
  onSelect: (id: ECTFormActionId) => void
}

/**
 * "Create ECT Form" entries for a listing row's three-dot actions menu. Rendered
 * by {@link ECTFormModals} consumers (e.g. the ECT Service listing) so any ECT
 * form can be started straight from a service row.
 */
export function ECTFormMenuItems({ onSelect }: ECTFormMenuItemsProps) {
  const { guardClinicalCreate } = useCareContext()

  return (
    <>
      <div className="mt-1 border-t border-slate-100 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Create ECT Form
      </div>
      {ECT_FORM_ACTIONS.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={() => guardClinicalCreate(() => onSelect(action.id))}
          className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
        >
          {action.label}
        </button>
      ))}
    </>
  )
}

interface ECTFormModalsProps {
  /** Form to render, or null when no modal is open. */
  form: ECTFormActionId | null
  /** Patient pre-filled into the created form. */
  patient?: string
  /**
   * Admission to link the form to. Defaults to the focused admission from care
   * context (the ECT Forms dashboard behaviour); a listing row may pass its own.
   */
  admissionNo?: string
  onClose: () => void
}

/**
 * Renders the modal of the selected ECT form. Each modal is the same component
 * the ECT Forms dashboard uses, wired the same way (including which forms take
 * an admission number).
 */
export function ECTFormModals({ form, patient, admissionNo, onClose }: ECTFormModalsProps) {
  const { activeAdmission } = useCareContext()
  const effectiveAdmission = admissionNo || activeAdmission || ''

  switch (form) {
    case 'anesthesia-consent':
      return (
        <ECTAnesthesiaConsentModal
          admissionNo=""
          patient={patient}
          patientName=""
          onClose={onClose}
          onSuccess={onClose}
        />
      )
    case 'pre-anesthesia':
      return (
        <PreAnesthesiaAssessmentModal
          admissionNo=""
          patient={patient}
          patientName=""
          onClose={onClose}
          onSuccess={onClose}
        />
      )
    case 'anesthesia-record':
      return (
        <AnesthesiaRecordModal
          admissionNo=""
          patient={patient || ''}
          patientName=""
          onClose={onClose}
          onSuccess={onClose}
        />
      )
    case 'recovery-room':
      return (
        <RecoveryRoomRecordModal
          admissionNo=""
          patient={patient || ''}
          patientName=""
          onClose={onClose}
          onSuccess={onClose}
        />
      )
    case 'alderete':
      return (
        <ModifiedAldereteScoreModal
          admissionNo=""
          patient={patient || ''}
          patientName=""
          onClose={onClose}
          onSuccess={onClose}
        />
      )
    case 'timeout':
      return (
        <TimeOutProcedureModal
          admissionNo=""
          patient={patient || ''}
          patientName=""
          onClose={onClose}
          onSuccess={onClose}
        />
      )
    case 'pre-ect':
      return (
        <PreEctChecklistModal
          admissionNo={effectiveAdmission}
          patient={patient || ''}
          patientName=""
          onClose={onClose}
          onSuccess={onClose}
        />
      )
    case 'ect-admission':
      return (
        <CreateECTAdmissionModal
          onClose={onClose}
          onSuccess={onClose}
          initialPatient={patient}
        />
      )
    case 'ect-procedure-consent':
      return (
        <ECTProcedureConsentModal
          admissionNo={effectiveAdmission}
          patient={patient || ''}
          patientName=""
          onClose={onClose}
          onSuccess={onClose}
        />
      )
    case 'ect-patient-health-history':
      return (
        <ECTPatientHealthHistoryModal
          admissionNo={effectiveAdmission}
          patient={patient || ''}
          patientName=""
          onClose={onClose}
          onSuccess={onClose}
        />
      )
    case 'ect-procedure':
      return (
        <CreateECTProcedureModal
          onClose={onClose}
          onSuccess={onClose}
          initialPatient={patient}
        />
      )
    default:
      return null
  }
}
