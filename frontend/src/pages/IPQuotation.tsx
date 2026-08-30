import { useEffect, useState } from 'react'
import { ExternalLink, RefreshCw, FileText } from 'lucide-react'
import { fetchIPQuotations, fetchIPQuotationDetail, type IPQuotationRow, type IPQuotationDetail } from '../services/ipQuotation'
import { useFormatMoney } from '../hooks/useFormatMoney'
import { toast } from '../hooks/useToast'
import { DetailSlideOver } from '../components/ui/CreateModalChrome'
import { DateFilterInput } from '../components/ui/DateFilterInput'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function minusDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

const STATUS_STYLES: Record<string, string> = {
  'Draft': 'border-slate-200 bg-slate-100 text-slate-600',
  'Open': 'border-blue-200 bg-blue-100 text-blue-800',
  'Ordered': 'border-green-200 bg-green-100 text-green-800',
  'Lost': 'border-red-200 bg-red-100 text-red-800',
  'Expired': 'border-amber-200 bg-amber-100 text-amber-800',
  'Cancelled': 'border-gray-300 bg-gray-200 text-gray-600',
}

function StatusBadge({ status }: { status?: string }) {
  const s = status || 'Draft'
  const cls = STATUS_STYLES[s] || 'border-slate-200 bg-slate-100 text-slate-600'
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {s}
    </span>
  )
}

export const IPQuotationPage = () => {
  const formatMoney = useFormatMoney()
  const [rows, setRows] = useState<IPQuotationRow[]>([])
  const [loading, setLoading] = useState(false)
  const [fromDate, setFromDate] = useState(minusDays(today(), 30))
  const [toDate, setToDate] = useState(today())
  const [status, setStatus] = useState('Draft')

  // Detail slide-over
  const [detailRow, setDetailRow] = useState<IPQuotationDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      const data = await fetchIPQuotations({
        fromDate,
        toDate,
        status,
        limit: 200,
      })
      setRows(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load IP quotations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openDetail = async (row: IPQuotationRow) => {
    setDetailLoading(true)
    try {
      const detail = await fetchIPQuotationDetail(row.name)
      setDetailRow(detail)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load quotation details')
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <header className="sticky top-0 z-10 bg-primary text-white px-4 py-3 border-b border-white/20">
        <h1 className="text-base md:text-lg font-semibold">IP Quotation</h1>
        <p className="text-xs md:text-sm text-white/85">
          CEO approval visibility for package quotations. Open quotation to take action in Desk.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <section className="bg-white border border-slate-200 rounded-lg shadow-sm p-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">From Date</label>
              <DateFilterInput
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">To Date</label>
              <DateFilterInput
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
              >
                <option value="Draft">Draft</option>
                <option value="Open">Open</option>
                <option value="Ordered">Ordered</option>
                <option value="Lost">Lost</option>
                <option value="Expired">Expired</option>
                <option value="Cancelled">Cancelled</option>
                <option value="All">All</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Loading…' : 'Apply'}
              </button>
            </div>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Package Quotations</h2>
            <div className="text-xs text-slate-500">{rows.length} records</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[980px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-left">Quotation</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Patient</th>
                  <th className="px-3 py-2 text-left">Admission</th>
                  <th className="px-3 py-2 text-left">Package</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-center">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.name} className="hover:bg-slate-50/80 cursor-pointer" onClick={() => void openDetail(row)}>
                    <td className="px-3 py-2 font-mono text-xs text-primary hover:underline">{row.name}</td>
                    <td className="px-3 py-2">{row.date || '-'}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-3 py-2">{row.patient ? `${row.patient}: ${row.patient_name || '-'}` : '-'}</td>
                    <td className="px-3 py-2">{row.inpatient_admission || '-'}</td>
                    <td className="px-3 py-2">{row.package_name || '-'}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(row.grand_total || 0)}</td>
                    <td className="px-3 py-2 text-center">
                      <a
                        href={`/app/quotation/${encodeURIComponent(row.name)}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Desk
                      </a>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && !loading && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                      No package quotations found for selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Detail slide-over from right */}
      {detailRow && (
        <DetailSlideOver
          title="Package Quotation"
          subtitle={detailRow.name}
          icon={<FileText className="w-5 h-5" />}
          onClose={() => setDetailRow(null)}
          maxWidthClass="max-w-2xl"
          headerActions={
            <a
              href={`/app/quotation/${encodeURIComponent(detailRow.name)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
            >
              <ExternalLink className="h-3 w-3" />
              Open in Desk
            </a>
          }
        >
          {detailLoading ? (
            <div className="py-12 text-center text-sm text-slate-500">Loading quotation details…</div>
          ) : (
            <div className="space-y-5">
              {/* Status + Amount */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Status</p>
                  <div className="mt-1">
                    <StatusBadge status={detailRow.status} />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Grand Total</p>
                  <p className="text-sm font-semibold text-slate-900 mt-0.5">
                    {formatMoney(detailRow.grand_total || 0)}
                  </p>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Transaction Date</p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">{detailRow.transaction_date || detailRow.date || '-'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Valid Till</p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">{detailRow.valid_till || '-'}</p>
                </div>
              </div>

              {/* Patient + Package */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Patient</p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">
                    {detailRow.patient ? `${detailRow.patient}: ${detailRow.patient_name || ''}` : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Package</p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">{detailRow.package_name || '-'}</p>
                </div>
              </div>

              {/* Admission + Company */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Inpatient Admission</p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">{detailRow.inpatient_admission || '-'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Company</p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">{detailRow.company || '-'}</p>
                </div>
              </div>

              {/* Items */}
              {detailRow.items && detailRow.items.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">Items</p>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Item</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600">Qty</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600">Rate</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {detailRow.items.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="px-3 py-1.5">
                              <div className="font-medium text-slate-800">{item.item_name || item.item_code || '-'}</div>
                              {item.item_code && item.item_name && (
                                <div className="text-[10px] text-slate-500">{item.item_code}</div>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-right">{item.qty ?? '-'}</td>
                            <td className="px-3 py-1.5 text-right">{formatMoney(item.rate || 0)}</td>
                            <td className="px-3 py-1.5 text-right font-medium">{formatMoney(item.amount || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Remarks */}
              {detailRow.remarks && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-slate-500 mb-2">Remarks</p>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap">{detailRow.remarks}</p>
                </div>
              )}

              {/* Footer info */}
              <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400">
                Created: {detailRow.creation ? new Date(detailRow.creation).toLocaleString('en-GB') : '-'} · Last modified:{' '}
                {detailRow.modified ? new Date(detailRow.modified).toLocaleString('en-GB') : '-'}
              </div>
            </div>
          )}
        </DetailSlideOver>
      )}
    </div>
  )
}