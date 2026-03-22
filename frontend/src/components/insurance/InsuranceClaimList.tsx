import { useState, useEffect, useCallback } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { fetchInsuranceClaims, type InsuranceClaimRow } from '../../services/common'

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-slate-100 text-slate-600',
  Submitted: 'bg-blue-100 text-blue-700',
  'Partially Paid': 'bg-amber-100 text-amber-700',
  Paid: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-600',
}

function fmt(amount: number | null | undefined, currency: string = 'BHD'): string {
  if (amount == null || amount === 0) return '—'
  return amount.toLocaleString('en-BH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-slate-900">{value ?? <span className="text-slate-400 italic">—</span>}</p>
    </div>
  )
}

interface InsuranceClaimListProps {
  refreshKey?: number
  patient?: string
  currency?: string
}

export const InsuranceClaimList = ({
  refreshKey = 0,
  patient,
  currency = 'BHD',
}: InsuranceClaimListProps) => {
  const [rows, setRows] = useState<InsuranceClaimRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [detailRow, setDetailRow] = useState<InsuranceClaimRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchInsuranceClaims(search || undefined, patient)
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load claims')
    } finally {
      setLoading(false)
    }
  }, [search, patient, refreshKey])

  useEffect(() => { load() }, [load])

  const totalClaimed = rows.reduce((s, r) => s + (r.total_claimed || 0), 0)
  const totalApproved = rows.reduce((s, r) => s + (r.total_approved || 0), 0)

  return (
    <div className="flex flex-col gap-3">
      {/* Summary strip */}
      {rows.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-center">
            <div className="text-xs text-slate-500 mb-0.5">Total Claims</div>
            <div className="font-semibold text-slate-800">{rows.length}</div>
          </div>
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-center">
            <div className="text-xs text-blue-500 mb-0.5">Total Claimed</div>
            <div className="font-semibold text-blue-800">{fmt(totalClaimed, currency)}</div>
          </div>
          <div className="rounded-lg bg-green-50 border border-green-100 p-3 text-center">
            <div className="text-xs text-green-500 mb-0.5">Total Approved</div>
            <div className="font-semibold text-green-800">{fmt(totalApproved, currency)}</div>
          </div>
        </div>
      )}

      <div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by claim number…"
          className="w-full max-w-xs rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {loading && <div className="text-center text-sm text-slate-400 py-6">Loading…</div>}
      {error && <div className="text-sm text-red-600 py-2">{error}</div>}

      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-3 py-2 text-xs font-semibold text-slate-600">Claim No</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-600">Patient</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-600">Health Insurance</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-600">Insurer / Payor</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-600">Claim Date</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-600 text-right">Claimed</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-600 text-right">Approved</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-600 text-right">Rejected</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center text-slate-400 py-8">No insurance claims found</td>
                </tr>
              )}
              {rows.map(row => (
                <tr key={row.name} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setDetailRow(row)}
                      className="text-primary font-medium hover:underline text-xs text-left"
                    >
                      {row.name}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800 text-xs">{row.patient_name || row.patient}</div>
                    {row.patient_name && <div className="text-slate-400 text-xs">{row.patient}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{row.health_insurance || '—'}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{row.insurance_payor || '—'}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{row.claim_date || '—'}</td>
                  <td className="px-3 py-2 text-xs text-right font-mono text-slate-700">{fmt(row.total_claimed, currency)}</td>
                  <td className="px-3 py-2 text-xs text-right font-mono text-green-700">{fmt(row.total_approved, currency)}</td>
                  <td className="px-3 py-2 text-xs text-right font-mono text-red-600">{fmt(row.total_rejected, currency)}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[row.status] || 'bg-slate-100 text-slate-600'}`}>
                      {row.status || 'Draft'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail slide-over */}
      {detailRow && (
        <div className="fixed inset-0 z-50 flex items-start justify-end" onClick={() => setDetailRow(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative z-10 h-full w-full max-w-2xl bg-white shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="shrink-0 flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-200">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-800">{detailRow.name}</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[detailRow.status] || 'bg-slate-100 text-slate-600'}`}>
                    {detailRow.status || 'Draft'}
                  </span>
                  <a
                    href={`/app/insurance-claim/${encodeURIComponent(detailRow.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline flex-shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Open in Frappe
                  </a>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{detailRow.patient_name || detailRow.patient}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailRow(null)}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {/* Financial summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-3 text-center">
                  <p className="text-base font-bold text-blue-800">{fmt(detailRow.total_claimed, currency)}</p>
                  <p className="text-xs text-blue-500 mt-0.5">Claimed</p>
                </div>
                <div className="rounded-lg bg-green-50 border border-green-100 px-3 py-3 text-center">
                  <p className="text-base font-bold text-green-800">{fmt(detailRow.total_approved, currency)}</p>
                  <p className="text-xs text-green-500 mt-0.5">Approved</p>
                </div>
                <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-3 text-center">
                  <p className="text-base font-bold text-red-700">{fmt(detailRow.total_rejected, currency)}</p>
                  <p className="text-xs text-red-400 mt-0.5">Rejected</p>
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-3 text-center">
                  <p className="text-base font-bold text-amber-800">{fmt(detailRow.total_patient_liability, currency)}</p>
                  <p className="text-xs text-amber-500 mt-0.5">Patient Liability</p>
                </div>
              </div>

              {/* Details */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Claim Details</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Patient" value={detailRow.patient_name || detailRow.patient} />
                  <Field label="Patient ID" value={detailRow.patient} />
                  <Field label="Health Insurance" value={detailRow.health_insurance} />
                  <Field label="Insurer / Payor" value={detailRow.insurance_payor} />
                  <Field label="Claim Date" value={detailRow.claim_date} />
                  <Field label="Sales Invoice" value={detailRow.sales_invoice} />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 px-6 py-4 border-t border-slate-200 bg-slate-50 flex gap-3">
              <a
                href={`/app/insurance-claim/${encodeURIComponent(detailRow.name)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition"
              >
                <ExternalLink className="w-4 h-4" /> Open in Frappe
              </a>
              <button
                type="button"
                onClick={() => setDetailRow(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-100 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
