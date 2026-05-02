import { useState, useEffect, useCallback } from 'react'
import { Loader2, PlusCircle, ExternalLink } from 'lucide-react'
import { BillingSpecialtyNavCards } from '../../components/billing/BillingSpecialtyNavCards'
import { AdditionalCollectionInvoiceModal } from '../../components/billing/AdditionalCollectionInvoiceModal'
import { fetchAdditionalCollectionInvoices, type SpecialtyInvoiceRow } from '../../services/billingSpecialty'
import { toast } from '../../hooks/useToast'

function formatMoney(n: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n)
}

interface AdditionalCollectionBillingPageProps {
  patient?: string
}

export function AdditionalCollectionBillingPage({ patient }: AdditionalCollectionBillingPageProps) {
  const [rows, setRows] = useState<SpecialtyInvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchAdditionalCollectionInvoices()
      setRows(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <BillingSpecialtyNavCards active="additional" patient={patient} />

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Additional collection invoices</h1>
          <p className="text-slate-600 text-xs mt-1 max-w-xl">
            Invoices with a collection cost center (excludes internal employee). Use the button to create.
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

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="flex justify-center py-12 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">No additional collection invoices yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Invoice</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Date</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Customer</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Collection CC</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Reference</th>
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
                    <td className="px-3 py-2 text-[11px] text-slate-600 max-w-[160px] truncate" title={`${r.custom_reference_type || ''} ${r.custom_reference_name || ''}`}>
                      {r.custom_reference_name ? `${r.custom_reference_type || ''} ${r.custom_reference_name}` : '—'}
                    </td>
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
                        title="Open in desk"
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

      <AdditionalCollectionInvoiceModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={() => void load()}
        initialPatient={patient}
      />
    </div>
  )
}
