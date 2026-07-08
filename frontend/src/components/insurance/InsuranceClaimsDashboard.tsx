import { useEffect, useState } from 'react'
import { fetchInsuranceClaimsDashboard, type InsuranceClaimsDashboard } from '../../services/common'
import { formatMoneyAmount } from '../../utils/currencyFormat'

interface Props {
  patient?: string
  currency?: string
  refreshKey?: number
}

function fmt(amount: number, currency: string) {
  return formatMoneyAmount(amount, currency)
}

export function InsuranceClaimsDashboard({ patient, currency = 'USD', refreshKey = 0 }: Props) {
  const [data, setData] = useState<InsuranceClaimsDashboard | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchInsuranceClaimsDashboard(patient)
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [patient, refreshKey])

  if (loading) {
    return <div className="text-sm text-slate-400 py-4 text-center">Loading dashboard…</div>
  }
  if (!data) return null

  const { totals, by_insurance, by_category } = data

  return (
    <div className="space-y-4">
      {/* Overall totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard label="Total Claims" value={String(totals.claims)} />
        <StatCard label="Pending" value={String(totals.pending)} accent="text-amber-700 bg-amber-50 border-amber-100" />
        <StatCard label="Submitted" value={String(totals.submitted)} accent="text-blue-700 bg-blue-50 border-blue-100" />
        <StatCard label="Paid" value={String(totals.paid)} accent="text-green-700 bg-green-50 border-green-100" />
        <StatCard label="Unpaid Amount" value={fmt(totals.total_unpaid, currency)} accent="text-orange-700 bg-orange-50 border-orange-100" />
        <StatCard label="Invoices Need Claim" value={String(data.invoices_needing_claim)} accent="text-purple-700 bg-purple-50 border-purple-100" />
      </div>

      {/* By Health Insurance — first card emphasis */}
      {by_insurance.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">By Health Insurance</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {by_insurance.map(row => (
              <div key={row.health_insurance} className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="text-sm font-semibold text-slate-800 truncate">{row.health_insurance}</p>
                <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                  <div><span className="text-slate-500">Claims</span><div className="font-medium">{row.total}</div></div>
                  <div><span className="text-slate-500">Pending</span><div className="font-medium text-amber-700">{row.total > 0 && (row.legacy ?? 0) === row.total ? '—' : row.pending}</div></div>
                  <div><span className="text-slate-500">Submitted</span><div className="font-medium text-blue-700">{row.submitted}</div></div>
                  <div><span className="text-slate-500">Paid</span><div className="font-medium text-green-700">{row.paid}</div></div>
                  <div><span className="text-slate-500">Claimed</span><div className="font-medium">{fmt(row.total_claimed, currency)}</div></div>
                  <div><span className="text-slate-500">Unpaid</span><div className="font-medium text-orange-700">{fmt(row.unpaid_amount, currency)}</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By Patient Category */}
      {by_category.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">By Patient Category</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {by_category.map(row => (
              <div key={row.category} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                <p className="font-medium text-slate-800 truncate">{row.category}</p>
                <p className="text-slate-500 mt-0.5">{row.count} claim{row.count !== 1 ? 's' : ''} · {fmt(row.total_claimed, currency)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className={`rounded-lg border p-3 text-center ${accent || 'bg-slate-50 border-slate-200'}`}>
      <div className="text-xs text-slate-500 mb-0.5">{label}</div>
      <div className="font-semibold text-sm">{value}</div>
    </div>
  )
}
