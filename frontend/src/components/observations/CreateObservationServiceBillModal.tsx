import { useEffect, useMemo, useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_OVERLAY,
  CreateModalFooter,
  CreateModalHeader,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import {
  createObservationSalesOrder,
  fetchObservationLevelDetails,
  type Observation,
} from '../../services/observations'
import { toast } from '../../hooks/useToast'
import { DateFilterInput } from '../ui/DateFilterInput'

interface CreateObservationServiceBillModalProps {
  observation: Observation
  onClose: () => void
  onSuccess?: () => void
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

export function CreateObservationServiceBillModal({
  observation,
  onClose,
  onSuccess,
}: CreateObservationServiceBillModalProps) {
  const [billingDate, setBillingDate] = useState(todayISO())
  const [amount, setAmount] = useState(
    observation.amount != null && Number(observation.amount) > 0
      ? String(observation.amount)
      : ''
  )
  const [discountType, setDiscountType] = useState<'Amount' | 'Percentage'>('Amount')
  const [discount, setDiscount] = useState('')
  const [loadingLevelRate, setLoadingLevelRate] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const existing = Number(observation.amount || 0)
    if (existing > 0 || !observation.observation_level) {
      return
    }
    setLoadingLevelRate(true)
    fetchObservationLevelDetails(observation.observation_level)
      .then((details) => {
        if (cancelled) return
        const rate = Number(details?.rate || 0)
        if (rate > 0) {
          setAmount(String(rate))
        }
      })
      .catch(() => {
        /* keep blank; user can type */
      })
      .finally(() => {
        if (!cancelled) setLoadingLevelRate(false)
      })
    return () => {
      cancelled = true
    }
  }, [observation.amount, observation.observation_level])

  const listAmount = Number(amount || 0)
  const discountValue = Number(discount || 0)

  const netAmount = useMemo(() => {
    if (!(listAmount > 0)) return 0
    if (!(discountValue > 0)) return listAmount
    if (discountType === 'Percentage') {
      return Math.max(0, listAmount * (1 - Math.min(100, discountValue) / 100))
    }
    return Math.max(0, listAmount - discountValue)
  }, [listAmount, discountValue, discountType])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount.trim() || !(listAmount >= 0)) {
      setError('Enter the bill amount')
      return
    }
    if (discountValue < 0) {
      setError('Discount cannot be negative')
      return
    }
    if (discountType === 'Percentage' && discountValue > 100) {
      setError('Discount percentage cannot exceed 100')
      return
    }
    if (discountType === 'Amount' && discountValue > listAmount && listAmount > 0) {
      setError('Discount amount cannot exceed the bill amount')
      return
    }

    try {
      setLoading(true)
      setError(null)
      const res = await createObservationSalesOrder(observation.name, {
        billingDate,
        amount: listAmount,
        discountPercentage: discountType === 'Percentage' ? discountValue : 0,
        discountAmount: discountType === 'Amount' ? discountValue : 0,
      })
      toast.success(
        res.existing
          ? `Sales Order ${res.sales_order} already linked`
          : `Sales Order ${res.sales_order} created`
      )
      onSuccess?.()
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create Service Bill'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-md w-full')}>
        <CreateModalHeader
          title="Create Service Bill"
          subtitle={
            observation.observation_level
              ? `${observation.observation_level} · ${observation.trans_no || observation.name}`
              : observation.trans_no || observation.name
          }
          onClose={onClose}
        />
        <form onSubmit={handleSubmit} className={`${CREATE_MODAL_BODY_GRADIENT} space-y-4 p-6`}>
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Billing date <span className="text-red-500">*</span>
            </label>
            <DateFilterInput
              value={billingDate}
              onChange={(e) => setBillingDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Amount <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={0}
              step="0.001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={loadingLevelRate}
              placeholder={loadingLevelRate ? 'Loading level rate…' : '0.000'}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-50"
            />
            <p className="mt-1 text-xs text-slate-500">
              Defaults from the observation (or observation level rate). You can change it for this bill.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Discount type</label>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as 'Amount' | 'Percentage')}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="Amount">Amount</option>
                <option value="Percentage">Percentage</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Discount {discountType === 'Percentage' ? '(%)' : ''}
              </label>
              <input
                type="number"
                min={0}
                max={discountType === 'Percentage' ? 100 : undefined}
                step="0.001"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="0"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-700">
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">List amount</span>
              <span className="tabular-nums font-medium">{formatMoney(listAmount)}</span>
            </div>
            <div className="mt-1 flex justify-between gap-2">
              <span className="text-slate-500">Net to bill</span>
              <span className="tabular-nums font-semibold text-slate-900">{formatMoney(netAmount)}</span>
            </div>
          </div>

          <CreateModalFooter>
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={loading || loadingLevelRate} className={CM_BTN_PRIMARY}>
              {loading ? 'Creating…' : 'Create Service Bill'}
            </button>
          </CreateModalFooter>
        </form>
      </div>
    </div>
  )
}
