import { useEffect, useState } from 'react'
import { fetchSleepingPatterns, type SleepingPattern } from '../../services/sleepingPattern'
import { fetchInpatientAdmissions, type LinkFieldOption } from '../../services/common'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { SleepingPatternDetail } from './SleepingPatternDetail'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'

interface SleepingPatternListProps {
  patient?: string
  refreshKey?: string | number
  onRowClick?: (name: string) => void
}

export const SleepingPatternList = ({ patient, refreshKey, onRowClick }: SleepingPatternListProps) => {
  const [rows, setRows] = useState<SleepingPattern[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [admissionFilter, setAdmissionFilter] = useState('')
  const [admissionQuery, setAdmissionQuery] = useState('')
  const [admissionOptions, setAdmissionOptions] = useState<LinkFieldOption[]>([])
  const [admissionOpen, setAdmissionOpen] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchSleepingPatterns(50, 0, patient)
        setRows(data)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load Sleeping Pattern'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [patient, refreshKey])

  // Load Inpatient Admissions for link-style filter
  useEffect(() => {
    if (!admissionOpen) return
    const t = setTimeout(async () => {
      try {
        const opts = await fetchInpatientAdmissions(patient || undefined, admissionQuery || undefined)
        setAdmissionOptions(opts)
      } catch {
        setAdmissionOptions([])
      }
    }, admissionQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [admissionOpen, admissionQuery, patient])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading Sleeping Pattern...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Sleeping Pattern</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
        </div>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">No Sleeping Pattern records found</div>
      </div>
    )
  }

  const filteredRows = rows.filter((row) =>
    admissionFilter ? row.admission_no === admissionFilter : true
  )

  // Helper to safely convert totals (which may come as strings) to numbers
  const toNumber = (value: unknown): number => {
    if (typeof value === 'number') return value
    if (value === null || value === undefined || value === '') return 0
    const n = parseFloat(String(value))
    return Number.isFinite(n) ? n : 0
  }

  return (
    <>
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 pt-3 pb-2 border-b border-slate-200 flex flex-wrap items-end gap-3">
          <div className="flex flex-col relative" data-filter-dropdown>
            <label className="text-xs font-medium text-slate-600 mb-1">IP Admission</label>
            <input
              type="text"
              value={admissionFilter || admissionQuery}
              onChange={(e) => {
                const value = e.target.value
                setAdmissionQuery(value)
                setAdmissionFilter('')
                setAdmissionOpen(true)
              }}
              onFocus={() => setAdmissionOpen(true)}
              placeholder="Search admission..."
              className="w-40 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {admissionOpen && admissionOptions.length > 0 && (
              <div className="absolute z-20 mt-1 w-56 max-w-xs bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {admissionOptions.map((opt) => (
                  <button
                    key={opt.name}
                    type="button"
                    onClick={() => {
                      setAdmissionFilter(opt.name)
                      setAdmissionQuery(opt.label || opt.name)
                      setAdmissionOpen(false)
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100"
                  >
                    <div className="font-medium text-slate-800 text-[11px] truncate">
                      {opt.name}
                    </div>
                    {opt.label && opt.label !== opt.name && (
                      <div className="text-[10px] text-slate-500 truncate">{opt.label}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {admissionFilter && (
            <button
              type="button"
              onClick={() => {
                setAdmissionFilter('')
                setAdmissionQuery('')
                setAdmissionOpen(false)
              }}
              className="text-xs text-slate-600 hover:text-slate-900 px-2 py-1 rounded-md border border-slate-200 hover:border-slate-400"
            >
              Clear
            </button>
          )}

          {/* Print button — top of Sleeping Pattern document */}
          <div className="ml-auto">
            <PrintFormatDropdown
              doctype="Sleeping Pattern"
              docName={admissionFilter || (rows[0]?.name ?? '')}
              noLetterhead={0}
              triggerPrint={1}
              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-primary hover:bg-slate-100 transition-colors"
            />
          </div>
        </div>

        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Admission</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Patient</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Total Hours</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">User</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredRows.map((row) => (
              <tr
                key={row.name}
                className="hover:bg-slate-50 cursor-pointer"
                onClick={() => {
                  if (onRowClick) {
                    onRowClick(row.name)
                  } else {
                    setDetailName(row.name)
                  }
                }}
              >
                <td className="px-4 py-3 text-sm text-slate-800">
                  {row.date ? new Date(row.date).toLocaleDateString() : '-'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">{row.admission_no}</td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {row.patient_name || row.file_no || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {typeof row.total_hours === 'number' ? row.total_hours.toFixed(2) : '-'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {row.user || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Simple timeline-style visualisation */}
      <div className="mt-4 border border-slate-200 rounded-lg bg-white">
        <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
            Sleeping Pattern Overview
          </span>
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-1.5 rounded-full bg-sky-400" /> Morning
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-1.5 rounded-full bg-emerald-400" /> Evening
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-1.5 rounded-full bg-indigo-500" /> Night
            </span>
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto px-4 py-3 space-y-3">
          {filteredRows.map((row) => {
            const m = toNumber(row.morning_total)
            const e = toNumber(row.evening_total)
            const n = toNumber(row.night_total)
            const total = m + e + n || 1
            return (
              <div key={row.name} className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>
                    {row.date ? new Date(row.date).toLocaleDateString() : '-'} —{' '}
                    {row.patient_name || row.file_no || '-'}
                  </span>
                  <span className="text-slate-500">
                    {row.admission_no} • {row.total_hours ? row.total_hours.toFixed(2) : '-'}h
                  </span>
                </div>
                <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden flex">
                  {m > 0 && (
                    <div
                      className="bg-sky-400 h-full"
                      style={{ flex: m / total }}
                      title={`Morning: ${m.toFixed(2)}h`}
                    />
                  )}
                  {e > 0 && (
                    <div
                      className="bg-emerald-400 h-full"
                      style={{ flex: e / total }}
                      title={`Evening: ${e.toFixed(2)}h`}
                    />
                  )}
                  {n > 0 && (
                    <div
                      className="bg-indigo-500 h-full"
                      style={{ flex: n / total }}
                      title={`Night: ${n.toFixed(2)}h`}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {detailName && (
        <DetailSlideOver
          title="Sleeping Pattern"
          subtitle={detailName}
          onClose={() => setDetailName(null)}
        >
          <SleepingPatternDetail name={detailName} />
        </DetailSlideOver>
      )}
    </>
  )
}