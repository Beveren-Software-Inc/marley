import { PatientMedicalHistoryList } from './PatientMedicalHistoryList'

interface MedicalHistoryViewProps {
  patient?: string
  patientName?: string
  refreshKey?: number
}

export const MedicalHistoryView = ({ patient, patientName, refreshKey }: MedicalHistoryViewProps) => {
  if (!patient) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">Please select a patient to view medical history</div>
      </div>
    )
  }

  return (
    <PatientMedicalHistoryList
      patient={patient}
      patientName={patientName}
      refreshKey={refreshKey}
    />
  )
}
