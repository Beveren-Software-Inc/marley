import { useState, useEffect } from 'react'
import { fetchInpatientRecord, type InpatientRecord, scheduleDischarge, cancelAdmission } from '../../services/inpatientRecords'
import { PackageSelectionModal } from './PackageSelectionModal'
import { AdmissionFormModal } from './AdmissionFormModal'
import { ScheduleDischargeModal } from './ScheduleDischargeModal'
import { DischargeModal } from './DischargeModal'
import { toast } from '../../hooks/useToast'

interface AdmissionDetailsProps {
  admissionNo: string
  onUpdate?: () => void
}

export const AdmissionDetails = ({ admissionNo, onUpdate }: AdmissionDetailsProps) => {
  const [admission, setAdmission] = useState<InpatientRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [showScheduleDischarge, setShowScheduleDischarge] = useState(false)
  const [showDischargeModal, setShowDischargeModal] = useState(false)
  const [showAdmitModal, setShowAdmitModal] = useState(false)
  const [showPackages, setShowPackages] = useState(false)
  const [selectedPackage, setSelectedPackage] = useState<any>(null)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    const loadAdmission = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchInpatientRecord(admissionNo)
        setAdmission(data)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch admission details'))
      } finally {
        setLoading(false)
      }
    }

    loadAdmission()
  }, [admissionNo])

  const handleScheduleDischarge = async (dischargeData: any) => {
    if (!admission) return

    try {
      setActionLoading(true)
      await scheduleDischarge({
        patient: admission.patient,
        inpatient_record: admission.name,
        ...dischargeData
      })
      setShowScheduleDischarge(false)
      // Reload admission data
      const data = await fetchInpatientRecord(admissionNo)
      setAdmission(data)
      onUpdate?.()
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to schedule discharge'))
    } finally {
      setActionLoading(false)
    }
  }

  const handleDischarge = () => {
    setShowDischargeModal(true)
  }

  const handleDischargeComplete = async () => {
    setShowDischargeModal(false)
    // Reload admission data
    try {
      const data = await fetchInpatientRecord(admissionNo)
      setAdmission(data)
      onUpdate?.()
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to reload admission data'))
    }
  }

  const handleCancelAdmission = async () => {
    if (!admission) return

    if (!confirm('Are you sure you want to cancel this admission?')) {
      return
    }

    try {
      setActionLoading(true)
      await cancelAdmission(admission.name)
      // Reload admission data
      const data = await fetchInpatientRecord(admissionNo)
      setAdmission(data)
      onUpdate?.()
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to cancel admission'))
    } finally {
      setActionLoading(false)
    }
  }

  const handleAdmit = () => {
    setShowPackages(true)
  }

  const handlePackageSelect = (pkg: any) => {
    setSelectedPackage(pkg)
    setShowPackages(false)
    setShowAdmitModal(true)
  }

  const handleAdmissionComplete = async () => {
    setShowAdmitModal(false)
    setSelectedPackage(null)
    // Reload admission data
    const data = await fetchInpatientRecord(admissionNo)
    setAdmission(data)
    onUpdate?.()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading admission details...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-semibold mb-2">Error Loading Admission Details</h3>
        <p className="text-red-700 text-sm">{error.message}</p>
      </div>
    )
  }

  if (!admission) {
    return (
      <div className="text-slate-500 text-center p-8">Admission not found</div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Patient Information</h3>
          <div className="space-y-1 text-sm">
            <div><span className="font-medium">Patient:</span> {admission.patient_name || admission.patient}</div>
            <div><span className="font-medium">Admission No:</span> {admission.name}</div>
            <div><span className="font-medium">Status:</span> {admission.status}</div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Admission Details</h3>
          <div className="space-y-1 text-sm">
            {admission.scheduled_date && (
              <div><span className="font-medium">Scheduled Date:</span> {new Date(admission.scheduled_date).toLocaleDateString()}</div>
            )}
            {admission.admitted_datetime && (
              <div><span className="font-medium">Admitted:</span> {new Date(admission.admitted_datetime).toLocaleString()}</div>
            )}
            {admission.expected_discharge && (
              <div><span className="font-medium">Expected Discharge:</span> {new Date(admission.expected_discharge).toLocaleDateString()}</div>
            )}
          </div>
        </div>

        {admission.medical_department && (
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Department</h3>
            <div className="text-sm">{admission.medical_department}</div>
          </div>
        )}

        {admission.admission_service_unit_type && (
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Service Unit Type</h3>
            <div className="text-sm">{admission.admission_service_unit_type}</div>
          </div>
        )}

        {admission.primary_practitioner && (
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Primary Practitioner</h3>
            <div className="text-sm">{admission.primary_practitioner}</div>
          </div>
        )}

        {admission.secondary_practitioner && (
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Secondary Practitioner</h3>
            <div className="text-sm">{admission.secondary_practitioner}</div>
          </div>
        )}

        {admission.current_occupancy && (
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Current Bed/Service Unit</h3>
            <div className="space-y-1 text-sm">
              <div><span className="font-medium">Service Unit:</span> {admission.current_occupancy.service_unit_name || admission.current_occupancy.service_unit || '-'}</div>
              {admission.current_occupancy.check_in && (
                <div><span className="font-medium">Check In:</span> {new Date(admission.current_occupancy.check_in).toLocaleString()}</div>
              )}
              {admission.current_occupancy.check_out && (
                <div><span className="font-medium">Check Out:</span> {new Date(admission.current_occupancy.check_out).toLocaleString()}</div>
              )}
            </div>
          </div>
        )}

        {admission.charges && (
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Charges</h3>
            <div className="space-y-1 text-sm">
              {admission.charges.admission_cost !== undefined && (
                <div><span className="font-medium">Admission Cost:</span> {admission.charges.admission_cost?.toFixed(2) || '0.00'}</div>
              )}
              {admission.charges.case_management_fee !== undefined && (
                <div><span className="font-medium">Case Management Fee:</span> {admission.charges.case_management_fee?.toFixed(2) || '0.00'}</div>
              )}
              {admission.charges.room_charges !== undefined && (
                <div><span className="font-medium">Room Charges:</span> {admission.charges.room_charges?.toFixed(2) || '0.00'}</div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 pt-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Vital Signs & Other Information</h3>
        <div className="text-sm text-slate-600">
          <p>Vital signs and other clinical information can be displayed here.</p>
          <p className="mt-2 text-xs">Note: Additional fields can be added based on requirements.</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="border-t border-slate-200 pt-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Actions</h3>
        <div className="flex flex-wrap gap-2">
          {admission.status === 'Admitted' && (
            <button
              onClick={() => setShowScheduleDischarge(true)}
              disabled={actionLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 disabled:opacity-50"
            >
              Schedule Discharge
            </button>
          )}
            {admission.status === 'Admission Scheduled' && (
              <>
                <button
                  onClick={handleAdmit}
                  disabled={actionLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
                >
                  Admit
                </button>
              <button
                onClick={handleCancelAdmission}
                disabled={actionLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                Cancel Admission
              </button>
            </>
          )}
          {admission.status === 'Discharge Scheduled' && (
            <button
              onClick={handleDischarge}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
            >
              Discharge
            </button>
          )}
        </div>
      </div>

      {/* Modals */}
      {showScheduleDischarge && admission && (
        <ScheduleDischargeModal
          admission={admission}
          onClose={() => setShowScheduleDischarge(false)}
          onSuccess={handleScheduleDischarge}
        />
      )}

      {showPackages && admission && (
        <PackageSelectionModal
          admissionNo={admission.name}
          onSelect={handlePackageSelect}
          onClose={() => {
            setShowPackages(false)
          }}
        />
      )}

      {showAdmitModal && admission && selectedPackage && (
        <AdmissionFormModal
          admissionNo={admission.name}
          selectedPackage={selectedPackage}
          onComplete={handleAdmissionComplete}
          onClose={() => {
            setShowAdmitModal(false)
            setSelectedPackage(null)
          }}
        />
      )}

      {showDischargeModal && admission && (
        <DischargeModal
          admission={{
            name: admission.name,
            patient: admission.patient,
            patient_name: admission.patient_name
          }}
          onClose={() => setShowDischargeModal(false)}
          onSuccess={handleDischargeComplete}
        />
      )}
    </div>
  )
}

