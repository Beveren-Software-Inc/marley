import { useState, useEffect } from 'react'
import { transferToAnotherCostCenter } from '../../services/inpatientRecords'
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
  const [reason, setReason] = useState('')
  const [costCenterOptions, setCostCenterOptions] = useState<LinkFieldOption[]>([])
  const [costCenterOpen, setCostCenterOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const list = await fetchCostCenters(admission.company || undefined, toCostCenterQuery || undefined, {
          isHospital: true,
        })
        const filtered = list.filter((cc) => cc.name !== admission.cost_center)
        setCostCenterOptions(filtered)
      } catch {
        setCostCenterOptions([])
      }
    }
    const t = setTimeout(load, toCostCenterQuery === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [admission.company, admission.cost_center, toCostCenterQuery])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!toCostCenter.trim()) {
      setError('To Branch is required')
      return
    }
    try {
      setSubmitting(true)
      const result = await transferToAnotherCostCenter(admission.name, toCostCenter.trim(), {
        reason: reason.trim() || undefined,
      })
      const billing = result.billing
      if (billing && !billing.skipped && billing.invoices && billing.invoices.length > 0) {
        if (billing.invoices.length === 1) {
          toast.success(`Transferred to ${toCostCenter}. Invoice ${billing.invoices[0]} created.`)
        } else {
          toast.success(
            `Transferred to ${toCostCenter}. Created ${billing.invoices.length} branch invoices: ${billing.invoices.join(', ')}`,
          )
        }
      } else {
        toast.success(`Transferred to ${toCostCenter}`)
      }
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Transfer to Another Branch</h2>
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
          {admission.cost_center ? (
            <div className="mt-1 text-xs text-slate-500">From branch: {admission.cost_center}</div>
          ) : null}
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
                  <div className="px-3 py-2 text-xs text-slate-500">NO BRANCHES FOUND</div>
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
