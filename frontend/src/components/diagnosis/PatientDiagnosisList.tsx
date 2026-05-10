import { useState, useEffect } from 'react'
import { getAllPatientDiagnoses, type PatientDiagnosisAggRow } from '../../services/common'

interface PatientDiagnosisListProps {
  patient?: string
  refreshKey?: number | string
}

function formatDate(val?: string): string {
  if (!val) return '—'
  try {
    return new Date(val).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return val
  }
}

export function PatientDiagnosisList({ patient, refreshKey }: PatientDiagnosisListProps) {
  const [rows, setRows] = useState<PatientDiagnosisAggRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!patient) { setRows([]); return }
    let cancelled = false
    setLoading(true)
    setError(null)
    getAllPatientDiagnoses(patient)
      .then((data) => { if (!cancelled) setRows(data) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [patient, refreshKey])

  if (!patient) {
    return <p className="text-sm text-slate-400 italic px-1">No patient selected.</p>
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-slate-400 text-sm">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Loading…
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-red-500 px-1">{error}</p>
  }

  if (rows.length === 0) {
    return <p className="text-sm text-slate-400 italic px-1">No diagnoses recorded yet.</p>
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100">
          <th className="text-left px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap">No.</th>
          <th className="text-left px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Name</th>
          <th className="text-left px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Group</th>
          <th className="text-left px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Details</th>
          <th className="text-left px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap">Date</th>
          <th className="text-left px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Source</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={row.name || idx} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
            <td className="px-2 py-2 font-mono text-sm text-slate-800 whitespace-nowrap">
              {row.disease_no || row.diagnosis || '—'}
            </td>
            <td className="px-2 py-2 font-medium text-slate-800">
              {row.diagnosis_name?.trim() || row.diagnosis || '—'}
            </td>
            <td className="px-2 py-2 text-sm text-slate-600">{row.diagnosis_group_name || '—'}</td>
            <td className="px-2 py-2 text-slate-600 max-w-[180px] truncate" title={row.details || ''}>
              {row.details || <span className="text-slate-300">—</span>}
            </td>
            <td className="px-2 py-2 text-slate-500 whitespace-nowrap">{formatDate(row.posting_date)}</td>
            <td className="px-2 py-2">
              <span className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 ${
                row.parent_type === 'Patient Visit'
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-emerald-50 text-emerald-700'
              }`}>
                {row.parent_type === 'Patient Visit' ? 'OP' : 'IP'}
                <span className="opacity-70">{row.parent}</span>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
