import { useEffect, useMemo, useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { toast } from '../../hooks/useToast'
import { searchPatients, type PatientListItem } from '../../services/patients'
import { fetchCostCenters, type LinkFieldOption } from '../../services/common'
import {
  fetchInpatientRecords,
  fetchServiceUnits,
  transferToAnotherCostCenter,
  type InpatientRecord,
  type ServiceUnit,
} from '../../services/inpatientRecords'

interface CreateInternalTransferModalProps {
  onClose: () => void
  onSuccess: () => void
  initialPatient?: string
}

export const CreateInternalTransferModal = ({
  onClose,
  onSuccess,
  initialPatient,
}: CreateInternalTransferModalProps) => {
  const [submitting, setSubmitting] = useState(false)
  const [patient, setPatient] = useState(initialPatient || '')
  const [patientQuery, setPatientQuery] = useState('')
  const [patientResults, setPatientResults] = useState<PatientListItem[]>([])
  const [showPatientResults, setShowPatientResults] = useState(false)
  const [admissions, setAdmissions] = useState<InpatientRecord[]>([])
  const [admission, setAdmission] = useState('')
  const [costCenters, setCostCenters] = useState<LinkFieldOption[]>([])
  const [toCostCenter, setToCostCenter] = useState('')
  const [serviceUnits, setServiceUnits] = useState<ServiceUnit[]>([])
  const [toServiceUnit, setToServiceUnit] = useState('')
  const [reason, setReason] = useState('')
  const [transferDatetime, setTransferDatetime] = useState(() => {
    // Seed the datetime-local input from LOCAL time, not UTC, so it defaults to "now".
    const d = new Date()
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  })

  const selectedAdmission = useMemo(
    () => admissions.find((a) => a.name === admission),
    [admission, admissions]
  )

  useEffect(() => {
    fetchCostCenters().then(setCostCenters).catch(() => setCostCenters([]))
  }, [])

  useEffect(() => {
    if (!patient) {
      setAdmissions([])
      setAdmission('')
      return
    }
    fetchInpatientRecords('Admitted', undefined, patient)
      .then((response) => setAdmissions(response.data))
      .catch(() => setAdmissions([]))
  }, [patient])

  useEffect(() => {
    if (!toCostCenter) {
      setServiceUnits([])
      setToServiceUnit('')
      return
    }
    fetchServiceUnits(undefined, 'Vacant', undefined, undefined, toCostCenter)
      .then(setServiceUnits)
      .catch(() => setServiceUnits([]))
  }, [toCostCenter])

  useEffect(() => {
    if (!showPatientResults || !patientQuery.trim() || initialPatient) return
    const t = setTimeout(() => {
      searchPatients(patientQuery).then(setPatientResults).catch(() => setPatientResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [patientQuery, showPatientResults, initialPatient])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!admission) {
      toast.error('Please select inpatient admission')
      return
    }
    if (!toCostCenter) {
      toast.error('Please select target branch')
      return
    }
    if (selectedAdmission?.cost_center && selectedAdmission.cost_center === toCostCenter) {
      toast.error('Target branch must be different from current')
      return
    }

    setSubmitting(true)
    try {
      await transferToAnotherCostCenter(admission, toCostCenter, {
        toServiceUnit: toServiceUnit || undefined,
        reason: reason || undefined,
        transferDatetime: transferDatetime ? new Date(transferDatetime).toISOString() : undefined,
      })
      toast.success('Internal transfer created')
      onSuccess()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create internal transfer')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col')}>
        <div className="relative shrink-0 border-b border-emerald-100/60 bg-gradient-to-r from-emerald-100 via-teal-50 to-sky-100 p-4 sm:px-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight text-emerald-950">Create Internal Transfer</h2>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-2 text-emerald-800/70 transition hover:bg-emerald-200/50 hover:text-emerald-950"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Patient <span className="text-red-500">*</span>
            </label>
            <input
              value={patient || patientQuery}
              onChange={(e) => {
                setPatient('')
                setPatientQuery(e.target.value)
                setShowPatientResults(true)
              }}
              onFocus={() => setShowPatientResults(true)}
              placeholder="Search patient..."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              readOnly={Boolean(initialPatient)}
            />
            {showPatientResults && patientResults.length > 0 && !initialPatient && (
              <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-56 overflow-y-auto">
                {patientResults.map((p) => (
                  <button
                    type="button"
                    key={p.name}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                    onClick={() => {
                      setPatient(p.name)
                      setPatientQuery(p.patient_name || p.name)
                      setShowPatientResults(false)
                    }}
                  >
                    <div className="font-medium">{p.patient_name || p.name}</div>
                    <div className="text-xs text-slate-500">{p.name}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Inpatient Admission <span className="text-red-500">*</span>
              </label>
              <select
                value={admission}
                onChange={(e) => setAdmission(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select admission...</option>
                {admissions.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.name} - {a.patient_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Transfer Date & Time</label>
              <input
                type="datetime-local"
                value={transferDatetime}
                onChange={(e) => setTransferDatetime(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Current Branch</label>
              <input
                value={selectedAdmission?.cost_center || ''}
                readOnly
                className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                To Branch <span className="text-red-500">*</span>
              </label>
              <select
                value={toCostCenter}
                onChange={(e) => setToCostCenter(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select target branch...</option>
                {costCenters.map((cc) => (
                  <option key={cc.name} value={cc.name}>{cc.label || cc.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">To Service Unit (optional)</label>
            <select
              value={toServiceUnit}
              onChange={(e) => setToServiceUnit(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select service unit...</option>
              {serviceUnits.map((su) => (
                <option key={su.name} value={su.name}>{su.healthcare_service_unit_name || su.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for transfer..."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className={CM_BTN_CANCEL}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={CM_BTN_PRIMARY}
            >
              {submitting ? 'Creating...' : 'Create Transfer'}
            </button>
          </div>
        </form>

      </div>
    </div>
  )
}
