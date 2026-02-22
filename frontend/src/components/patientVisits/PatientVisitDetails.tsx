import { useState, useEffect } from 'react'
import { fetchPatientVisit, type PatientVisit, cancelVisit, createInvoice } from '../../services/patientVisits'
import { CreateAdmissionModal } from '../admissions/CreateAdmissionModal'
import { CancelVisitModal } from './CancelVisitModal'
import { toast } from '../../hooks/useToast'

interface PatientVisitDetailsProps {
  visitNo: string
  onUpdate?: () => void
}

export const PatientVisitDetails = ({ visitNo, onUpdate }: PatientVisitDetailsProps) => {
  const [visit, setVisit] = useState<PatientVisit | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [showAdmissionModal, setShowAdmissionModal] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

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

  useEffect(() => { loadVisit() }, [visitNo])

  const handleScheduleAdmission = () => {
    setShowAdmissionModal(true)
  }

const [showCancelModal, setShowCancelModal] = useState(false)
const [cancelLoading, setCancelLoading] = useState(false)

const handleCancelVisitConfirm = async (reason: string) => {
  if (!visit) return
  setCancelLoading(true)
  try {
    await cancelVisit(visit.name, reason)
    toast.success('Visit cancelled successfully')
    loadVisit()
    onUpdate?.()
    setShowCancelModal(false)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to cancel visit')
  } finally {
    setCancelLoading(false)
  }
}

  const handleCreateInvoice = async () => {
    if (!visit) return
    setActionLoading('invoice')
    try {
      const invoiceName = await createInvoice(visit.name)
      toast.success('Invoice created: ' + invoiceName)
      loadVisit()
      onUpdate?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create invoice')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) return <div className="flex items-center justify-center p-8 text-slate-600">Loading visit details...</div>
  if (error) return <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error.message}</div>
  if (!visit) return <div className="text-slate-500 text-center p-8">Visit not found</div>

  return (
    <div className="space-y-4">
      {/* Patient Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Patient Information</h3>
          <div className="space-y-1 text-sm">
            <div><span className="font-medium">Patient:</span> {visit.patient_name || visit.patient}</div>
            <div><span className="font-medium">Visit No:</span> {visit.name}</div>
            {visit.file_number && <div><span className="font-medium">File Number:</span> {visit.file_number}</div>}
            <div><span className="font-medium">Status:</span> {visit.status}</div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Visit Details</h3>
          <div className="space-y-1 text-sm">
            {visit.encounter_date && <div><span className="font-medium">Encounter Date:</span> {new Date(visit.encounter_date).toLocaleDateString()} {visit.encounter_time || ''}</div>}
            {visit.practitioner_name && <div><span className="font-medium">Practitioner:</span> {visit.practitioner_name}</div>}
            {visit.medical_department && <div><span className="font-medium">Department:</span> {visit.medical_department}</div>}
            {visit.visit_type && <div><span className="font-medium">Visit Type:</span> {visit.visit_type}</div>}
            {visit.inpatient_record && <div><span className="font-medium">Inpatient Admission:</span> {visit.inpatient_record} {visit.inpatient_status && `(${visit.inpatient_status})`}</div>}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="border-t border-slate-200 pt-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Actions</h3>
        <div className="flex flex-wrap gap-2">
          {/* Create Invoice (green) */}
          {visit.status === 'Completed' && (
            <button
              onClick={handleCreateInvoice}
              disabled={actionLoading === 'invoice'}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {actionLoading === 'invoice' ? 'Creating…' : 'Create Invoice'}
            </button>
          )}

          {/* Schedule Admission (blue) */}
          {!visit.inpatient_record && visit.status === 'Completed' && (
            <button
              onClick={handleScheduleAdmission}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90"
            >
              Schedule Admission
            </button>
          )}

         {visit.status !== 'Cancelled' && (
  <button
    onClick={() => setShowCancelModal(true)}
    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
  >
    Cancel Visit
  </button>
)}

{showCancelModal && visit && (
  <CancelVisitModal
    visitName={visit.name}
    onClose={() => setShowCancelModal(false)}
    onConfirm={handleCancelVisitConfirm}
    loading={cancelLoading}
  />
)}
        </div>
      </div>

      {/* Modals */}
      {showAdmissionModal && visit && (
        <CreateAdmissionModal
          patientName={visit.patient}
          encounterName={visit.name}
          onClose={() => setShowAdmissionModal(false)}
          onSuccess={() => { setShowAdmissionModal(false); loadVisit(); onUpdate?.() }}
        />
      )}
    </div>
  )
}