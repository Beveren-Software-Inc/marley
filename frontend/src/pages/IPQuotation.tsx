import { useEffect, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { fetchIPQuotations, type IPQuotationRow } from '../services/ipQuotation'
import { useFormatMoney } from '../hooks/useFormatMoney'
import { toast } from '../hooks/useToast'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function minusDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export const IPQuotationPage = () => {
  const formatMoney = useFormatMoney()
  const [rows, setRows] = useState<IPQuotationRow[]>([])
  const [loading, setLoading] = useState(false)
  const [fromDate, setFromDate] = useState(minusDays(today(), 30))
  const [toDate, setToDate] = useState(today())
  const [status, setStatus] = useState('Draft')

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
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">To Date</label>
              <input
                type="date"
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
                  <tr key={row.name} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2 font-mono text-xs">{row.name}</td>
                    <td className="px-3 py-2">{row.date || '-'}</td>
                    <td className="px-3 py-2">{row.status || '-'}</td>
                    <td className="px-3 py-2">{row.patient ? `${row.patient}: ${row.patient_name || '-'}` : '-'}</td>
                    <td className="px-3 py-2">{row.inpatient_admission || '-'}</td>
                    <td className="px-3 py-2">{row.package_name || '-'}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(row.grand_total || 0)}</td>
                    <td className="px-3 py-2 text-center">
                      <a
                        href={`/app/quotation/${encodeURIComponent(row.name)}`}
                        target="_blank"
                        rel="noreferrer"
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
    </div>
  )
}

