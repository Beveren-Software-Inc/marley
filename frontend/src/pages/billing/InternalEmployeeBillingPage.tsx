import { useState, useEffect, useCallback } from 'react'
import { Loader2, PlusCircle } from 'lucide-react'
import { BillingSpecialtyNavCards } from '../../components/billing/BillingSpecialtyNavCards'
import { InternalEmployeeInvoiceModal } from '../../components/billing/InternalEmployeeInvoiceModal'
import { SpecialtySalesInvoiceSlideOver } from '../../components/billing/SpecialtySalesInvoiceSlideOver'
import { SpecialtyBillingInvoiceRowActions } from '../../components/billing/SpecialtyBillingInvoiceRowActions'
import {
  fetchInternalEmployeeInvoices,
  fetchInternalEmployeeBillingSummary,
  type SpecialtyInvoiceRow,
  type InternalBillingSummary,
} from '../../services/billingSpecialty'
import { toast } from '../../hooks/useToast'

function formatMoney(n: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n)
}

function getStatusColor(status: string): string {
  const s = status.toLowerCase()
  if (s === 'draft') return 'bg-gray-100 text-gray-600 border border-gray-200'
  if (s === 'unpaid' || s === 'overdue') return 'bg-red-100 text-red-700 border border-red-200'
  if (s === 'paid') return 'bg-green-100 text-green-700 border border-green-200'
  if (s === 'partially paid') return 'bg-yellow-100 text-yellow-700 border border-yellow-200'
  if (s === 'cancelled') return 'bg-gray-100 text-gray-500 border border-gray-200 line-through'
  if (s === 'return') return 'bg-orange-100 text-orange-700 border border-orange-200'
  if (s === 'credit note issued') return 'bg-purple-100 text-purple-700 border border-purple-200'
  return 'bg-slate-100 text-slate-700 border border-slate-200'
}

interface InternalEmployeeBillingPageProps {
  patient?: string
}

export function InternalEmployeeBillingPage({ patient }: InternalEmployeeBillingPageProps) {
  const [rows, setRows] = useState<SpecialtyInvoiceRow[]>([])
  const [summary, setSummary] = useState<InternalBillingSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [detailInvoice, setDetailInvoice] = useState<string | null>(null)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [inv, sum] = await Promise.all([
        fetchInternalEmployeeInvoices(),
        fetchInternalEmployeeBillingSummary(),
      ])
      setRows(inv)
      setSummary(sum)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <BillingSpecialtyNavCards active="internal" patient={patient} />

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Internal employee billing</h1>
          <p className="text-slate-600 text-xs mt-1 max-w-xl">
            Staff invoices flagged internal employee. Create new invoices from the button below.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-medium disabled:opacity-50"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 text-xs font-semibold shadow-sm"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            New invoice
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Invoices</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">{summary.invoice_count}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total billed</p>
            <p className="text-xl font-semibold text-slate-900 mt-1 tabular-nums">{formatMoney(summary.total_billed)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Outstanding</p>
            <p className="text-xl font-semibold text-slate-900 mt-1 tabular-nums">{formatMoney(summary.total_outstanding)}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="flex justify-center py-12 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">No internal employee invoices yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Invoice</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Date</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Customer</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Collection CC</th>
                  <th className="text-right px-3 py-2 font-medium text-slate-600">Total</th>
                  <th className="text-right px-3 py-2 font-medium text-slate-600">Outstanding</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Status</th>
                  <th className="text-center px-3 py-2 font-medium text-slate-600 w-[132px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.name} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setDetailInvoice(r.name)}
                        className="font-mono text-[11px] text-primary font-medium hover:underline text-left"
                      >
                        {r.name}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{r.posting_date}</td>
                    <td className="px-3 py-2 text-slate-800">{r.customer_name || r.customer}</td>
                    <td className="px-3 py-2 text-slate-700">{r.collection_cost_center_name || r.custom_created_at || '—'}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatMoney(r.grand_total)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(r.outstanding_amount)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {r.docstatus === 0 && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-900 border border-amber-200">
                            Draft
                          </span>
                        )}
                        <span
                          className={`inline-flex px-2 py-1 rounded-full text-[11px] font-medium ${getStatusColor(r.status)}`}
                        >
                          {r.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <SpecialtyBillingInvoiceRowActions
                        row={r}
                        openMenuRow={openActionRow}
                        onOpenMenuRow={setOpenActionRow}
                        onViewDetails={() => setDetailInvoice(r.name)}
                        onRefresh={() => void load()}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <InternalEmployeeInvoiceModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={() => void load()}
      />

      <SpecialtySalesInvoiceSlideOver
        invoiceName={detailInvoice}
        onClose={() => setDetailInvoice(null)}
        onUpdated={() => void load()}
      />
    </div>
  )
}
