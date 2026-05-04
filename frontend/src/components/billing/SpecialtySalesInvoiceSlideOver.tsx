import { useState, useEffect } from 'react'
import { Loader2, ExternalLink } from 'lucide-react'
import { fetchSalesInvoiceDetail, submitSalesInvoiceDoc, cancelOrDeleteSalesInvoice, type SalesInvoiceDetail } from '../../services/billingSpecialty'
import { toast } from '../../hooks/useToast'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { useFormatMoney } from '../../hooks/useFormatMoney'
import { PaymentModal } from './PaymentModal'
import { canRecordPaymentAgainstSalesInvoice } from '../../utils/specialtyInvoiceActions'

/** API / JSON may send docstatus as string; strict === 0 fails in TS otherwise. */
function normalizeDocstatus(ds: unknown): number | undefined {
  if (ds === null || ds === undefined) return undefined
  if (typeof ds === 'string' && ds.trim() === '') return undefined
  const n = Number(ds)
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

function docstatusLabel(ds: unknown): string {
  const n = normalizeDocstatus(ds)
  if (n === 0) return 'Draft'
  if (n === 1) return 'Submitted'
  if (n === 2) return 'Cancelled'
  if (n !== undefined) return String(n)
  return '—'
}

function isDraftInvoiceDetail(d: SalesInvoiceDetail): boolean {
  const n = normalizeDocstatus(d.docstatus)
  if (n === 0) return true
  if (n !== undefined) return false
  return String(d.status || '').toLowerCase() === 'draft'
}

function isSubmittedInvoiceDetail(d: SalesInvoiceDetail): boolean {
  return normalizeDocstatus(d.docstatus) === 1
}

interface SpecialtySalesInvoiceSlideOverProps {
  invoiceName: string | null
  onClose: () => void
  onUpdated?: () => void
}

export function SpecialtySalesInvoiceSlideOver({
  invoiceName,
  onClose,
  onUpdated,
}: SpecialtySalesInvoiceSlideOverProps) {
  const [detail, setDetail] = useState<SalesInvoiceDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState<'submit' | 'cancel' | null>(null)
  const [showPayment, setShowPayment] = useState(false)
  const formatMoney = useFormatMoney(detail?.company ?? null)

  const load = async () => {
    if (!invoiceName) return
    try {
      setLoading(true)
      setError(null)
      setDetail(await fetchSalesInvoiceDetail(invoiceName))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invoice')
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!invoiceName) {
      setDetail(null)
      setError(null)
      setShowPayment(false)
      return
    }
    void load()
  }, [invoiceName])

  if (!invoiceName) return null

  const deskUrl = `/app/sales-invoice/${encodeURIComponent(invoiceName)}`

  const handleSubmit = async () => {
    try {
      setActionBusy('submit')
      await submitSalesInvoiceDoc(invoiceName)
      toast.success('Invoice submitted')
      await load()
      onUpdated?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setActionBusy(null)
    }
  }

  const handleCancel = async () => {
    const isDraft = detail ? isDraftInvoiceDetail(detail) : false
    const msg = isDraft
      ? 'Discard this draft invoice? This cannot be undone.'
      : 'Cancel this submitted invoice? ERPNext may block this if payments exist.'
    if (!window.confirm(msg)) return
    try {
      setActionBusy('cancel')
      await cancelOrDeleteSalesInvoice(invoiceName)
      toast.success(isDraft ? 'Draft discarded' : 'Invoice cancelled')
      onUpdated?.()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cancel failed')
    } finally {
      setActionBusy(null)
    }
  }

  return (
    <>
    <div className="fixed inset-0 z-[70] flex items-start justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative z-10 flex h-screen min-h-0 w-full max-w-2xl flex-col bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50 shrink-0 gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-slate-500 uppercase tracking-wide">Sales Invoice</p>
            <p className="text-sm font-semibold text-slate-900 font-mono truncate">{invoiceName}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href={deskUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              title="Open in Desk"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <PrintFormatDropdown
              doctype="Sales Invoice"
              docName={invoiceName}
              noLetterhead={0}
              triggerPrint={1}
            />
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-12 justify-center">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading invoice…
            </div>
          )}
          {!loading && error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
          )}
          {!loading && detail && (
            <div className="space-y-5 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    normalizeDocstatus(detail.docstatus) === 0
                      ? 'bg-amber-100 text-amber-900'
                      : normalizeDocstatus(detail.docstatus) === 1
                        ? 'bg-emerald-100 text-emerald-900'
                        : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {docstatusLabel(detail.docstatus)}
                </span>
                <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">
                  {detail.status}
                </span>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-[11px] font-medium text-slate-500 uppercase">Customer</dt>
                  <dd className="text-slate-900">{detail.customer_name || detail.customer}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium text-slate-500 uppercase">Company</dt>
                  <dd className="text-slate-900">{detail.company || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium text-slate-500 uppercase">Posting / Due</dt>
                  <dd className="text-slate-900">
                    {detail.posting_date || '—'}
                    {detail.due_date ? ` · Due ${detail.due_date}` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium text-slate-500 uppercase">Totals</dt>
                  <dd className="text-slate-900 font-medium tabular-nums">
                    {formatMoney(detail.grand_total)}
                    <span className="text-slate-500 font-normal">
                      {' '}
                      · Outst. {formatMoney(detail.outstanding_amount)}
                    </span>
                  </dd>
                </div>
                {(detail.collection_cost_center_name || detail.custom_created_at) && (
                  <div className="sm:col-span-2">
                    <dt className="text-[11px] font-medium text-slate-500 uppercase">Collection cost center</dt>
                    <dd className="text-slate-900">{detail.collection_cost_center_name || detail.custom_created_at}</dd>
                  </div>
                )}
                {(detail.custom_reference_name || detail.patient) && (
                  <div className="sm:col-span-2">
                    <dt className="text-[11px] font-medium text-slate-500 uppercase">Reference / Patient</dt>
                    <dd className="text-slate-900 text-xs">
                      {detail.custom_reference_type && detail.custom_reference_name
                        ? `${detail.custom_reference_type} ${detail.custom_reference_name}`
                        : '—'}
                      {detail.patient ? ` · Patient: ${detail.patient}` : ''}
                    </dd>
                  </div>
                )}
              </dl>

              <div>
                <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Items</h3>
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-slate-600">Item</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-600">Qty</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-600">Rate</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-600">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detail.items?.length ? (
                        detail.items.map((line, i) => (
                          <tr key={`${line.item_code}-${i}`}>
                            <td className="px-3 py-2 text-slate-800">
                              <div className="font-medium">{line.item_name || line.item_code}</div>
                              <div className="text-[10px] font-mono text-slate-500">{line.item_code}</div>
                              {line.description ? (
                                <div className="text-[11px] text-slate-500 mt-0.5">{line.description}</div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{line.qty}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Number(line.rate || 0))}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">
                              {formatMoney(Number(line.amount ?? line.net_amount ?? 0))}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                            No lines
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Fixed Footer with Buttons */}
        {detail && (isDraftInvoiceDetail(detail) || isSubmittedInvoiceDetail(detail)) && (
          <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-4 shadow-lg">
            <div className="flex flex-wrap gap-2 justify-end">
              <a
                href={deskUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 inline-flex items-center gap-1.5 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Edit in Desk
              </a>
              {isDraftInvoiceDetail(detail) && (
                <button
                  type="button"
                  disabled={!!actionBusy}
                  onClick={() => void handleSubmit()}
                  className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2 transition-colors"
                >
                  {actionBusy === 'submit' && <Loader2 className="w-4 h-4 animate-spin" />}
                  Submit invoice
                </button>
              )}
              {isSubmittedInvoiceDetail(detail) && canRecordPaymentAgainstSalesInvoice(detail) && (
                <button
                  type="button"
                  disabled={!!actionBusy}
                  onClick={() => setShowPayment(true)}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  Record payment
                </button>
              )}
              {isDraftInvoiceDetail(detail) && (
                <button
                  type="button"
                  disabled={!!actionBusy}
                  onClick={() => void handleCancel()}
                  className="px-4 py-2 rounded-lg border border-red-300 text-red-700 text-sm font-semibold hover:bg-red-50 disabled:opacity-50 inline-flex items-center gap-2 transition-colors"
                >
                  {actionBusy === 'cancel' && <Loader2 className="w-4 h-4 animate-spin" />}
                  Discard draft
                </button>
              )}
              {isSubmittedInvoiceDetail(detail) && (
                <button
                  type="button"
                  disabled={!!actionBusy}
                  onClick={() => void handleCancel()}
                  className="px-4 py-2 rounded-lg border border-red-300 text-red-700 text-sm font-semibold hover:bg-red-50 disabled:opacity-50 inline-flex items-center gap-2 transition-colors"
                >
                  {actionBusy === 'cancel' && <Loader2 className="w-4 h-4 animate-spin" />}
                  Cancel invoice
                </button>
              )}
            </div>
          </div>
        )}
      </div>

    </div>

      <PaymentModal
        isOpen={showPayment}
        onClose={() => setShowPayment(false)}
        invoiceName={invoiceName}
        customerName={detail?.customer_name || detail?.customer || ''}
        outstandingAmount={detail?.outstanding_amount ?? 0}
        defaultCompany={detail?.company}
        defaultCostCenter={detail?.custom_created_at || undefined}
        onPaymentSuccess={() => {
          setShowPayment(false)
          void load()
          onUpdated?.()
        }}
      />
    </>
  )
}