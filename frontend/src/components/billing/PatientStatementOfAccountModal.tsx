import { useEffect, useState } from 'react'
import { FileText, Loader2, Printer, X } from 'lucide-react'
import {
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import {
  fetchPatientStatementOfAccount,
  type PatientStatementOfAccount,
} from '../../services/serviceOrders'
import { useFormatMoney } from '../../hooks/useFormatMoney'
import { toast } from '../../hooks/useToast'

interface PatientStatementOfAccountModalProps {
  patient: string
  patientName?: string
  fromDate?: string
  toDate?: string
  onClose: () => void
}

function formatDisplayDate(value?: string | null): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('en-GB')
  } catch {
    return value
  }
}

export function PatientStatementOfAccountModal({
  patient,
  patientName,
  fromDate,
  toDate,
  onClose,
}: PatientStatementOfAccountModalProps) {
  const formatCurrency = useFormatMoney()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statement, setStatement] = useState<PatientStatementOfAccount | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchPatientStatementOfAccount({
          patient,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        })
        if (!cancelled) setStatement(data)
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load statement of account'
          setError(msg)
          toast.error(msg)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [patient, fromDate, toDate])

  const displayPatientLabel = () => {
    const name = patientName || statement?.patient_name
    return name ? `${patient}: ${name}` : patient
  }

  const handlePrint = () => {
    if (!statement) return
    const win = window.open('', '_blank', 'width=1200,height=800')
    if (!win) return

    const title = `Statement of Account — ${displayPatientLabel()}`
    const rows = statement.entries
      .map((row) => {
        if (row.is_section_row) {
          return `<tr><td colspan="7" style="font-weight:600;background:#f8fafc;">${row.account || ''}</td></tr>`
        }
        return `<tr>
          <td>${formatDisplayDate(row.posting_date)}</td>
          <td>${row.account || ''}</td>
          <td>${row.voucher_type || ''}</td>
          <td>${row.voucher_no || ''}</td>
          <td style="text-align:right">${row.debit ? formatCurrency(row.debit) : ''}</td>
          <td style="text-align:right">${row.credit ? formatCurrency(row.credit) : ''}</td>
          <td style="text-align:right;font-weight:600">${formatCurrency(row.balance || 0)}</td>
        </tr>`
      })
      .join('')

    win.document.write(`<html><head><title>${title}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#0f172a} table{border-collapse:collapse;width:100%;font-size:12px} th,td{border:1px solid #cbd5e1;padding:8px} th{background:#f1f5f9;text-align:left}</style>
      </head><body>
      <h2>${title}</h2>
      <p>Patient: ${displayPatientLabel()}</p>
      <p>Period: ${formatDisplayDate(statement.from_date)} to ${formatDisplayDate(statement.to_date)}</p>
      <table>
        <thead><tr><th>Date</th><th>Account</th><th>Voucher Type</th><th>Voucher No</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:16px;font-weight:600">Closing balance: ${formatCurrency(statement.closing_balance || 0)}</p>
      </body></html>`)
    win.document.close()
    win.print()
  }

  const openInErpnext = () => {
    if (!statement) return
    const params = new URLSearchParams({
      party_type: 'Customer',
      party: JSON.stringify([statement.customer]),
      from_date: statement.from_date,
      to_date: statement.to_date,
      company: statement.company,
    })
    window.open(`/app/query-report/General%20Ledger?${params.toString()}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className={CREATE_MODAL_OVERLAY} onClick={onClose} role="presentation">
      <div
        className={createModalShellClass('max-w-6xl w-full max-h-[92vh]')}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="patient-soa-title"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 id="patient-soa-title" className="text-lg font-semibold text-slate-900 truncate">
                Statement of Account
              </h2>
              <p className="text-sm text-slate-500 truncate">
                {displayPatientLabel()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {statement && (
              <>
                <button
                  type="button"
                  onClick={openInErpnext}
                  className="hidden sm:inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  Open in ERPNext
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading statement of account…
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : statement ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <div className="text-slate-600">
                  Period:{' '}
                  <span className="font-medium text-slate-900">
                    {formatDisplayDate(statement.from_date)} — {formatDisplayDate(statement.to_date)}
                  </span>
                </div>
                <div className="font-semibold text-slate-900">
                  Closing balance: {formatCurrency(statement.closing_balance || 0)}
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm min-w-[900px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Account</th>
                      <th className="px-3 py-2 text-left">Voucher</th>
                      <th className="px-3 py-2 text-left">Against</th>
                      <th className="px-3 py-2 text-right">Debit</th>
                      <th className="px-3 py-2 text-right">Credit</th>
                      <th className="px-3 py-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {statement.entries.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                          No ledger entries for this period.
                        </td>
                      </tr>
                    ) : (
                      statement.entries.map((row, index) =>
                        row.is_section_row ? (
                          <tr key={`section-${index}`} className="bg-slate-50">
                            <td colSpan={7} className="px-3 py-2 font-semibold text-slate-700">
                              {row.account}
                            </td>
                          </tr>
                        ) : (
                          <tr key={`${row.voucher_no || 'row'}-${index}`} className="hover:bg-slate-50/80">
                            <td className="px-3 py-2 whitespace-nowrap">
                              {formatDisplayDate(row.posting_date)}
                            </td>
                            <td className="px-3 py-2">{row.account || '—'}</td>
                            <td className="px-3 py-2">
                              <div className="text-slate-800">{row.voucher_type || '—'}</div>
                              <div className="text-xs text-slate-500 font-mono">{row.voucher_no || ''}</div>
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-600">{row.against_voucher || '—'}</td>
                            <td className="px-3 py-2 text-right">
                              {row.debit ? formatCurrency(row.debit) : '—'}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {row.credit ? formatCurrency(row.credit) : '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-medium">
                              {formatCurrency(row.balance || 0)}
                            </td>
                          </tr>
                        )
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
