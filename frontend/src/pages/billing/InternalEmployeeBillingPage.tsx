import { useState, useEffect, useCallback } from 'react'
import { Loader2, PlusCircle, ExternalLink, Receipt, AlertCircle, Wallet } from 'lucide-react'
import { BillingSpecialtyNavCards } from '../../components/billing/BillingSpecialtyNavCards'
import { InternalEmployeeInvoiceModal } from '../../components/billing/InternalEmployeeInvoiceModal'
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

interface InternalEmployeeBillingPageProps {
  patient?: string
}

export function InternalEmployeeBillingPage({ patient }: InternalEmployeeBillingPageProps) {
  const [rows, setRows] = useState<SpecialtyInvoiceRow[]>([])
  const [summary, setSummary] = useState<InternalBillingSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

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
      toast.error(e instanceof Error ? e.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const s = summary || { invoice_count: 0, total_billed: 0, total_outstanding: 0 }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <BillingSpecialtyNavCards active="internal" patient={patient} />

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Internal employee billing</h1>
          <p className="text-slate-600 text-xs mt-1 max-w-xl">
            Invoices flagged as internal employee — staff meds and services.
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500 mb-1">Invoices</p>
              <p className="text-2xl font-bold text-slate-900">{s.invoice_count}</p>
              <p className="text-xs text-slate-400 mt-1">Draft + submitted</p>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600 shrink-0">
              <Receipt className="w-6 h-6" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-slate-500 mb-1">Total billed</p>
              <p className="text-xl font-bold text-slate-900 tabular-nums truncate">{formatMoney(s.total_billed)}</p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
              <Wallet className="w-6 h-6" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-slate-500 mb-1">Outstanding</p>
              <p className="text-xl font-bold text-slate-900 tabular-nums truncate">{formatMoney(s.total_outstanding)}</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 text-amber-600 shrink-0">
              <AlertCircle className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

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
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Employee / customer</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Collection CC</th>
                  <th className="text-right px-3 py-2 font-medium text-slate-600">Total</th>
                  <th className="text-right px-3 py-2 font-medium text-slate-600">Outstanding</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Status</th>
                  <th className="text-center px-3 py-2 font-medium text-slate-600 w-14">Desk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.name} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2 font-mono text-[11px] text-primary font-medium">{r.name}</td>
                    <td className="px-3 py-2 text-slate-700">{r.posting_date}</td>
                    <td className="px-3 py-2 text-slate-800">{r.customer_name || r.customer}</td>
                    <td className="px-3 py-2 text-slate-700">{r.collection_cost_center_name || r.custom_created_at || '—'}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatMoney(r.grand_total)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(r.outstanding_amount)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex px-1.5 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700">{r.status}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <a
                        href={`/app/sales-invoice/${encodeURIComponent(r.name)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex text-primary hover:underline"
                      >
                        <ExternalLink className="w-3.5 h-3.5 mx-auto" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <InternalEmployeeInvoiceModal isOpen={showCreate} onClose={() => setShowCreate(false)} onSuccess={() => void load()} />
    </div>
  )
}
