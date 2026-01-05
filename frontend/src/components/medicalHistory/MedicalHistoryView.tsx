import { useState, useEffect } from 'react'
import { fetchPatientMedicalHistory, type PatientMedicalHistory } from '../../services/patients'

interface MedicalHistoryViewProps {
  patient?: string
}

export const MedicalHistoryView = ({ patient }: MedicalHistoryViewProps) => {
  const [medicalHistory, setMedicalHistory] = useState<PatientMedicalHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const loadMedicalHistory = async () => {
      if (!patient) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)
        const response = await fetchPatientMedicalHistory(patient)
        setMedicalHistory(response)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch medical history'))
      } finally {
        setLoading(false)
      }
    }

    loadMedicalHistory()
  }, [patient])

  if (!patient) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">Please select a patient to view medical history</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading medical history...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Medical History</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
        </div>
      </div>
    )
  }

  if (!medicalHistory) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">No medical history found</div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Patient Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-600">Patient Name</label>
            <p className="text-sm text-slate-900 mt-1">{medicalHistory.patient_name || '-'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600">File Number</label>
            <p className="text-sm text-slate-900 mt-1">{medicalHistory.file_no || '-'}</p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Allergies & Medication</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-600">Allergies</label>
            <p className="text-sm text-slate-900 mt-1 whitespace-pre-wrap">{medicalHistory.allergies || '-'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600">Medication</label>
            <p className="text-sm text-slate-900 mt-1 whitespace-pre-wrap">{medicalHistory.medication || '-'}</p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Medical & Surgical History</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-600">Medical History</label>
            <p className="text-sm text-slate-900 mt-1 whitespace-pre-wrap">{medicalHistory.medical_history || '-'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600">Surgical History</label>
            <p className="text-sm text-slate-900 mt-1 whitespace-pre-wrap">{medicalHistory.surgical_history || '-'}</p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Personal and Social History</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-600">Occupation</label>
            <p className="text-sm text-slate-900 mt-1">{medicalHistory.occupation || '-'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600">Marital Status</label>
            <p className="text-sm text-slate-900 mt-1">{medicalHistory.marital_status || '-'}</p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Risk Factors</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-600">Tobacco Consumption (Past)</label>
            <p className="text-sm text-slate-900 mt-1">{medicalHistory.tobacco_past_use || '-'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600">Tobacco Consumption (Present)</label>
            <p className="text-sm text-slate-900 mt-1">{medicalHistory.tobacco_current_use || '-'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600">Alcohol Consumption (Past)</label>
            <p className="text-sm text-slate-900 mt-1">{medicalHistory.alcohol_past_use || '-'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600">Alcohol Consumption (Present)</label>
            <p className="text-sm text-slate-900 mt-1">{medicalHistory.alcohol_current_use || '-'}</p>
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-slate-600">Occupational Hazards and Environmental Factors</label>
            <p className="text-sm text-slate-900 mt-1 whitespace-pre-wrap">{medicalHistory.surrounding_factors || '-'}</p>
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-slate-600">Other Risk Factors</label>
            <p className="text-sm text-slate-900 mt-1 whitespace-pre-wrap">{medicalHistory.other_risk_factors || '-'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

