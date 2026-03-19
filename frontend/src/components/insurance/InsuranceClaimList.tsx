import { useState, useEffect, useCallback } from 'react'
import { fetchInsuranceClaims, type InsuranceClaimRow } from '../../services/common'

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-slate-100 text-slate-600',
  Submitted: 'bg-blue-100 text-blue-700',
  'Partially Paid': 'bg-amber-100 text-amber-700',
  Paid: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-600',
}

/**
 * Format currency amount with BHD (Bahraini Dinar) or custom currency
 * @param amount - The numeric amount to format
 * @param currency - ISO 4217 currency code (default: 'BHD')
 * @returns Formatted currency string or '—' if amount is null/0
 */
function fmt(amount: number | null | undefined, currency: string = 'BHD'): string {
  if (amount == null || amount === 0) return '—'
  return amount.toLocaleString('en-BH', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
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

  useEffect(() => {
    load()
  }, [load])

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

      {/* Search Input */}
      <div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by claim number…"
          className="w-full max-w-xs rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Loading State */}
      {loading && <div className="text-center text-sm text-slate-400 py-6">Loading…</div>}

      {/* Error State */}
      {error && <div className="text-sm text-red-600 py-2">{error}</div>}

      {/* Claims Table */}
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
                  <td colSpan={9} className="text-center text-slate-400 py-8">
                    No insurance claims found
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr
                  key={row.name}
                  className="border-t border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <td className="px-3 py-2">
                    <a
                      href={`/app/insurance-claim/${row.name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary font-medium hover:underline text-xs"
                    >
                      {row.name}
                    </a>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800 text-xs">
                      {row.patient_name || row.patient}
                    </div>
                    {row.patient_name && (
                      <div className="text-slate-400 text-xs">{row.patient}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {row.health_insurance || '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {row.insurance_payor || '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{row.claim_date || '—'}</td>
                  <td className="px-3 py-2 text-xs text-right font-mono text-slate-700">
                    {fmt(row.total_claimed, currency)}
                  </td>
                  <td className="px-3 py-2 text-xs text-right font-mono text-green-700">
                    {fmt(row.total_approved, currency)}
                  </td>
                  <td className="px-3 py-2 text-xs text-right font-mono text-red-600">
                    {fmt(row.total_rejected, currency)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        STATUS_COLORS[row.status] || 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {row.status || 'Draft'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}