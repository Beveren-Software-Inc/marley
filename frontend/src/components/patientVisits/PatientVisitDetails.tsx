import { useState, useEffect } from 'react'
import { fetchPatientVisit, type PatientVisit, cancelVisit, createInvoiceForVisit } from '../../services/patientVisits'
import { CreateAdmissionModal } from '../admissions/CreateAdmissionModal'
import { CancelVisitModal } from './CancelVisitModal'
import { CreateVitalSignModal } from '../vitalSigns/CreateVitalSignModal'
import { CreateObservationModal } from '../observations/CreateObservationModal'
import { EditPatientVisitModal } from './EditPatientVisitModal'
import { toast } from '../../hooks/useToast'
import { useCareContext } from '../../providers/CareContextProvider'
import { observationsAllowedForMode } from '../../config/costCenterCareScope'

interface PatientVisitDetailsProps {
  visitNo: string
  onUpdate?: () => void
}

export const PatientVisitDetails = ({ visitNo, onUpdate }: PatientVisitDetailsProps) => {
  const { mode } = useCareContext()
  const [visit, setVisit] = useState<PatientVisit | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [showAdmissionModal, setShowAdmissionModal] = useState(false)
  const [showVitalSignModal, setShowVitalSignModal] = useState(false)
  const [showObservationModal, setShowObservationModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'details' | 'documents'>('details')

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
      const invoiceName = await createInvoiceForVisit(visit.name)
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

  const hasDocuments = !!visit.documents && visit.documents.length > 0

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="border-b border-slate-200 mb-2">
        <nav className="-mb-px flex gap-4 text-sm">
          <button
            type="button"
            className={`pb-2 border-b-2 ${
              activeTab === 'details'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            onClick={() => setActiveTab('details')}
          >
            Details
          </button>
          <button
            type="button"
            className={`pb-2 border-b-2 flex items-center gap-1 ${
              activeTab === 'documents'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            onClick={() => setActiveTab('documents')}
          >
            Documents
            {hasDocuments && (
              <span className="inline-flex items-center justify-center rounded-full bg-slate-100 px-1.5 text-[11px] font-medium text-slate-700">
                {visit.documents!.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {activeTab === 'details' && (
        <>
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
                {visit.encounter_date && (
                  <div>
                    <span className="font-medium">Encounter Date:</span>{' '}
                    {new Date(visit.encounter_date).toLocaleDateString()} {visit.encounter_time || ''}
                  </div>
                )}
                {visit.practitioner_name || visit.practitioner ? (
                  <div>
                    <span className="font-medium">Practitioner:</span>{' '}
                    {visit.practitioner_name || visit.practitioner}
                  </div>
                ) : null}
                {visit.medical_department && <div><span className="font-medium">Department:</span> {visit.medical_department}</div>}
                {visit.visit_type && <div><span className="font-medium">Visit Type:</span> {visit.visit_type}</div>}
                {visit.inpatient_record && (
                  <div>
                    <span className="font-medium">Inpatient Admission:</span> {visit.inpatient_record}{' '}
                    {visit.inpatient_status && `(${visit.inpatient_status})`}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Actions</h3>
            <div className="flex flex-wrap gap-2">
              {visit.status !== 'Cancelled' && (
                <button
                  type="button"
                  onClick={() => setShowEditModal(true)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                >
                  Edit Visit
                </button>
              )}

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

              {/* Create Vital Sign */}
              {visit.status !== 'Cancelled' && (
                <button
                  onClick={() => setShowVitalSignModal(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  Create Vital Sign
                </button>
              )}

              {/* Create Observation */}
              {visit.status !== 'Cancelled' && observationsAllowedForMode(mode) && (
                <button
                  onClick={() => setShowObservationModal(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-md hover:bg-violet-700"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  Create Observation
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
        </>
      )}

      {activeTab === 'documents' && (
        <div className="space-y-3">
          {!hasDocuments && (
            <div className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
              No documents uploaded for this visit.
            </div>
          )}
          {hasDocuments && (
            <div className="space-y-2">
              {visit.documents!.map((doc) => (
                <div
                  key={doc.name || `${doc.document}-${doc.file_name}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">
                      {doc.file_name || (doc as { document_name?: string }).document_name || doc.document || 'Document'}
                    </div>
                    <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                      {doc.document_type && <span>Type: {doc.document_type}</span>}
                      {doc.transaction_no && <span>Txn: {doc.transaction_no}</span>}
                    </div>
                    {doc.upload_remarks && (
                      <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                        {doc.upload_remarks}
                      </div>
                    )}
                  </div>
                  {doc.document && (
                    <a
                      href={doc.document}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 inline-flex items-center px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 rounded-md hover:bg-primary/5"
                    >
                      Open
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showAdmissionModal && visit && (
        <CreateAdmissionModal
          patientName={visit.patient}
          encounterName={visit.name}
          onClose={() => setShowAdmissionModal(false)}
          onSuccess={() => { setShowAdmissionModal(false); loadVisit(); onUpdate?.() }}
        />
      )}

      {showVitalSignModal && visit && (
        <CreateVitalSignModal
          initialPatient={visit.patient}
          onClose={() => setShowVitalSignModal(false)}
          onSuccess={() => setShowVitalSignModal(false)}
        />
      )}

      {showObservationModal && visit && (
        <CreateObservationModal
          initialPatient={visit.patient}
          onClose={() => setShowObservationModal(false)}
          onSuccess={() => setShowObservationModal(false)}
        />
      )}

      {showEditModal && visit && (
        <EditPatientVisitModal
          visitName={visit.name}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false)
            loadVisit()
            onUpdate?.()
          }}
        />
      )}
    </div>
  )
}