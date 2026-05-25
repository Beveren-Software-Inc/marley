import { useEffect, useState } from 'react'
import { DischargePatientForm } from './DischargeModal'
import { fetchInpatientRecord } from '../../services/inpatientRecords'

interface DischargeAdmissionViewProps {
  admissionName: string
  patientHint?: string
  patientNameHint?: string
  onClose: () => void
  onSuccess: () => void
}

/** Loads admission and renders the discharge workflow in the content area below the portal top bar. */
export const DischargeAdmissionView = ({
  admissionName,
  patientHint,
  patientNameHint,
  onClose,
  onSuccess,
}: DischargeAdmissionViewProps) => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [admission, setAdmission] = useState<{
    name: string
    patient: string
    patient_name?: string
    discharge_practitioner?: string
    primary_practitioner?: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const record = await fetchInpatientRecord(admissionName)
        if (cancelled) return
        setAdmission({
          name: record.name,
          patient: record.patient,
          patient_name: record.patient_name,
          discharge_practitioner: record.discharge_practitioner,
          primary_practitioner: record.primary_practitioner,
        })
      } catch (err) {
        if (cancelled) return
        if (patientHint) {
          setAdmission({
            name: admissionName,
            patient: patientHint,
            patient_name: patientNameHint,
          })
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load admission')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [admissionName, patientHint, patientNameHint])

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[750px] text-slate-600">
        Loading discharge form…
      </div>
    )
  }

  if (error || !admission) {
    return (
      <div className="flex flex-1 flex-col p-6 min-h-[750px]">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error || 'Admission not found'}
        </div>
        <button type="button" onClick={onClose} className="mt-4 text-sm text-primary hover:underline w-fit">
          Back to list
        </button>
      </div>
    )
  }

  return (
    <DischargePatientForm admission={admission} onClose={onClose} onSuccess={onSuccess} />
  )
}
