import { useState, useEffect } from 'react'
import { transferToAnotherCostCenter, fetchServiceUnits, type ServiceUnit } from '../../services/inpatientRecords'
import { fetchCostCenters, type LinkFieldOption } from '../../services/common'
import { toast } from '../../hooks/useToast'
import { X } from 'lucide-react'

interface TransferCostCenterModalProps {
  admission: {
    name: string
    patient?: string
    patient_name?: string
    company?: string
    cost_center?: string
  }
  onClose: () => void
  onSuccess: () => void
}

export const TransferCostCenterModal = ({ admission, onClose, onSuccess }: TransferCostCenterModalProps) => {
  const [toCostCenter, setToCostCenter] = useState('')
  const [toCostCenterQuery, setToCostCenterQuery] = useState('')
  const [toServiceUnit, setToServiceUnit] = useState('')
  const [toServiceUnitQuery, setToServiceUnitQuery] = useState('')
  const [reason, setReason] = useState('')
  const [costCenterOptions, setCostCenterOptions] = useState<LinkFieldOption[]>([])
  const [serviceUnitOptions, setServiceUnitOptions] = useState<ServiceUnit[]>([])
  const [costCenterOpen, setCostCenterOpen] = useState(false)
  const [serviceUnitOpen, setServiceUnitOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load branches (same company, exclude current)
  useEffect(() => {
    const load = async () => {
      try {
        const list = await fetchCostCenters(admission.company || undefined, toCostCenterQuery || undefined)
        const filtered = list.filter((cc) => cc.name !== admission.cost_center)
        setCostCenterOptions(filtered)
      } catch {
        setCostCenterOptions([])
      }
    }
    const t = setTimeout(load, toCostCenterQuery === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [admission.company, admission.cost_center, toCostCenterQuery])

  // Load service units (vacant, in selected branch) when branch is selected
  useEffect(() => {
    if (!toCostCenter) {
      setServiceUnitOptions([])
      setToServiceUnit('')
      setToServiceUnitQuery('')
      return
    }
    const load = async () => {
      try {
        const list = await fetchServiceUnits(
          undefined,
          'Vacant',
          toServiceUnitQuery || undefined,
          undefined,
          toCostCenter
        )
        setServiceUnitOptions(list)
      } catch {
        setServiceUnitOptions([])
      }
    }
    const t = setTimeout(load, toServiceUnitQuery === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [toCostCenter, toServiceUnitQuery])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!toCostCenter.trim()) {
      setError('To Branch is required')
      return
    }
    try {
      setSubmitting(true)
      await transferToAnotherCostCenter(admission.name, toCostCenter.trim(), {
        toServiceUnit: toServiceUnit || undefined,
        reason: reason.trim() || undefined,
      })
      toast.success(`Transferred to ${toCostCenter}`)
      onSuccess()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transfer failed'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const costCenterLabel = toCostCenter
    ? costCenterOptions.find((c) => c.name === toCostCenter)?.label ?? toCostCenter
    : toCostCenterQuery
  const serviceUnitLabel = toServiceUnit
    ? serviceUnitOptions.find((s) => s.name === toServiceUnit)?.healthcare_service_unit_name ?? toServiceUnit
    : toServiceUnitQuery

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Transfeto Another Branch</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-4 text-sm text-slate-600 border-b border-slate-100">
          {admission.patient_name || admission.patient} — {admission.name}
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
          )}

          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              To Branch <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={costCenterLabel}
              onChange={(e) => {
                setToCostCenterQuery(e.target.value)
                setToCostCenter('')
                setCostCenterOpen(true)
              }}
              onFocus={() => setCostCenterOpen(true)}
              placeholder="Select branch..."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
            {costCenterOpen && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                {costCenterOptions.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-slate-500">No branches found</div>
                ) : (
                  costCenterOptions.map((cc) => (
                    <button
                      key={cc.name}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                      onClick={() => {
                        setToCostCenter(cc.name)
                        setToCostCenterQuery(cc.label)
                        setCostCenterOpen(false)
                      }}
                    >
                      {cc.label}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">To Service Unit (optional)</label>
            <input
              type="text"
              value={serviceUnitLabel}
              onChange={(e) => {
                setToServiceUnitQuery(e.target.value)
                setToServiceUnit('')
                setServiceUnitOpen(true)
              }}
              onFocus={() => toCostCenter && setServiceUnitOpen(true)}
              placeholder={!toCostCenter ? 'Select a branch first' : 'Search bed/room...'}
              disabled={!toCostCenter}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-50 disabled:text-slate-400"
            />
            {serviceUnitOpen && toCostCenter && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                {serviceUnitOptions.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-slate-500">No vacant units in this branch</div>
                ) : (
                  serviceUnitOptions.map((su) => (
                    <button
                      key={su.name}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                      onClick={() => {
                        setToServiceUnit(su.name)
                        setToServiceUnitQuery(su.healthcare_service_unit_name)
                        setServiceUnitOpen(false)
                      }}
                    >
                      {su.healthcare_service_unit_name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reason (optional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Reason for transfer..."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? 'Transferring…' : 'Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
