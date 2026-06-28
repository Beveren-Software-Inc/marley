import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  fetchLongActingMedicineGiveOuts,
  type LongActingMedicineGiveOutRow,
} from '../../services/longActingMedicine'

function formatDate(value?: string): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString(undefined, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return value
  }
}

function formatTime(value?: string): string {
  if (!value) return '—'
  const parts = value.split(':')
  if (parts.length >= 2) return `${parts[0]}:${parts[1]}`
  return value
}

interface GiveOutExpandToggleProps {
  expanded: boolean
  onToggle: (e: React.MouseEvent) => void
  countHint?: number
}

export function GiveOutExpandToggle({ expanded, onToggle, countHint }: GiveOutExpandToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center justify-center w-7 h-7 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shrink-0"
      title={expanded ? 'Hide give-outs' : 'Show give-outs'}
      aria-label={expanded ? 'Hide give-outs' : 'Show give-outs'}
      aria-expanded={expanded}
    >
      {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      {countHint != null && countHint > 0 ? (
        <span className="sr-only">{countHint} give-outs</span>
      ) : null}
    </button>
  )
}

interface LongActingMedicineGiveOutsInlineProps {
  lamName: string
  expanded: boolean
  colSpan: number
  refreshKey?: string | number
}

function GiveOutsTable({ rows }: { rows: LongActingMedicineGiveOutRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500 py-2">No give-outs recorded yet.</p>
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
      <table className="min-w-full text-xs">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
            <th className="px-2.5 py-2 font-semibold">Date</th>
            <th className="px-2.5 py-2 font-semibold">Time</th>
            <th className="px-2.5 py-2 font-semibold">Scheduled</th>
            <th className="px-2.5 py-2 font-semibold">Medication</th>
            <th className="px-2.5 py-2 font-semibold">Dosage</th>
            <th className="px-2.5 py-2 font-semibold">Given by</th>
            <th className="px-2.5 py-2 font-semibold">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, idx) => {
            const cancelled = row.is_cancelled === 1 || row.is_cancelled === true
            return (
              <tr
                key={row.name || `give-out-${idx}`}
                className={cancelled ? 'bg-red-50/60 text-slate-600' : undefined}
              >
                <td className="px-2.5 py-2 whitespace-nowrap">{formatDate(row.date)}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{formatTime(row.time)}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{formatDate(row.scheduled_run_date)}</td>
                <td className="px-2.5 py-2 max-w-[160px] truncate" title={row.medication || undefined}>
                  {row.medication || '—'}
                </td>
                <td className="px-2.5 py-2 whitespace-nowrap">{row.dose || '—'}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{row.user || '—'}</td>
                <td className="px-2.5 py-2 text-slate-600 max-w-[200px]">
                  {cancelled ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="rounded bg-red-100 px-1 py-0.5 text-[10px] font-semibold text-red-700">
                        Cancelled
                      </span>
                      {row.cancelled_notes || row.notes || '—'}
                    </span>
                  ) : (
                    row.notes || '—'
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function LongActingMedicineGiveOutsInline({
  lamName,
  expanded,
  colSpan,
  refreshKey,
}: LongActingMedicineGiveOutsInlineProps) {
  const [giveOuts, setGiveOuts] = useState<LongActingMedicineGiveOutRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!expanded) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchLongActingMedicineGiveOuts(lamName)
      .then((rows) => {
        if (!cancelled) setGiveOuts(rows)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load give-outs')
          setGiveOuts([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [lamName, expanded, refreshKey])

  if (!expanded) return null

  return (
    <tr className="bg-slate-50/80">
      <td colSpan={colSpan} className="px-3 py-2.5 border-t border-slate-100">
        <div className="pl-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Give-outs
          </p>
          {loading ? (
            <p className="text-sm text-slate-500 py-2">Loading give-outs…</p>
          ) : error ? (
            <p className="text-sm text-red-600 py-2">{error}</p>
          ) : (
            <GiveOutsTable rows={giveOuts} />
          )}
        </div>
      </td>
    </tr>
  )
}
