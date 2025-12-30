import { useState, useEffect } from 'react'
import { fetchPatientVisit, type PatientVisit } from '../../services/patientVisits'
import { CreateAdmissionModal } from '../admissions/CreateAdmissionModal'

interface PatientVisitDetailsProps {
  visitNo: string
  onUpdate?: () => void
}

export const PatientVisitDetails = ({ visitNo, onUpdate }: PatientVisitDetailsProps) => {
  const [visit, setVisit] = useState<PatientVisit | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [showAdmissionModal, setShowAdmissionModal] = useState(false)

  useEffect(() => {
    const loadVisit = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchPatientVisit(visitNo)
        setVisit(data)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch visit details'))
      } finally {
        setLoading(false)
      }
    }

    loadVisit()
  }, [visitNo])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading visit details...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-semibold mb-2">Error Loading Visit Details</h3>
        <p className="text-red-700 text-sm">{error.message}</p>
      </div>
    )
  }

  if (!visit) {
    return (
      <div className="text-slate-500 text-center p-8">Visit not found</div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Patient Information</h3>
            <div className="space-y-1 text-sm">
              <div><span className="font-medium">Patient:</span> {visit.patient_name || visit.patient}</div>
              <div><span className="font-medium">Visit No:</span> {visit.name}</div>
              {visit.file_number && (
                <div><span className="font-medium">File Number:</span> {visit.file_number}</div>
              )}
              <div><span className="font-medium">Status:</span> {visit.status}</div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Visit Details</h3>
            <div className="space-y-1 text-sm">
              {visit.encounter_date && (
                <div>
                  <span className="font-medium">Encounter Date:</span>{' '}
                  {new Date(visit.encounter_date).toLocaleDateString()}
                  {visit.encounter_time && ` ${visit.encounter_time}`}
                </div>
              )}
              {visit.practitioner_name && (
                <div><span className="font-medium">Practitioner:</span> {visit.practitioner_name}</div>
              )}
              {visit.medical_department && (
                <div><span className="font-medium">Department:</span> {visit.medical_department}</div>
              )}
              {visit.visit_type && (
                <div><span className="font-medium">Visit Type:</span> {visit.visit_type}</div>
              )}
            </div>
          </div>

          {visit.inpatient_record && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Inpatient Admission</h3>
              <div className="text-sm">
                <div><span className="font-medium">Admission:</span> {visit.inpatient_record}</div>
                {visit.inpatient_status && (
                  <div><span className="font-medium">Status:</span> {visit.inpatient_status}</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="border-t border-slate-200 pt-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Actions</h3>
          <div className="flex flex-wrap gap-2">
            {!visit.inpatient_record && visit.status === 'Completed' && (
              <button
                onClick={() => setShowAdmissionModal(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90"
              >
                Schedule Admission
              </button>
            )}
          </div>
        </div>
      </div>

      {showAdmissionModal && visit && (
        <CreateAdmissionModal
          onClose={() => setShowAdmissionModal(false)}
          onSuccess={(admissionName) => {
            setShowAdmissionModal(false)
            // Reload visit to show updated inpatient_record
            const loadVisit = async () => {
              try {
                const data = await fetchPatientVisit(visitNo)
                setVisit(data)
                onUpdate?.()
              } catch (err) {
                console.error('Failed to reload visit:', err)
              }
            }
            loadVisit()
          }}
          patientName={visit.patient}
          encounterName={visit.name}
        />
      )}
    </>
  )
}

