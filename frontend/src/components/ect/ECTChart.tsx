import { Fragment, useEffect, useMemo, useState } from 'react'
import { fetchECTProcedures, type ECTProcedure, type ECTProcedureEnergyRow } from '../../services/ectProcedure'
import { DateFilterInput } from '../ui/DateFilterInput'

interface ECTChartProps {
  patient?: string
}

const fmtDate = (value?: string) => {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('en-GB')
  } catch {
    return value
  }
}

const cell = (value?: string | number | null) => {
  if (value == null || value === '') return '—'
  return String(value)
}

const energySlots = (proc: ECTProcedure): ECTProcedureEnergyRow[] => {
  const rows = Array.isArray(proc.energies) ? proc.energies.filter(Boolean) : []
  if (rows.length) return rows
  if (proc.energy || proc.gtcs_for || proc.strength) {
    return [
      {
        energy: proc.energy,
        duration: proc.gtcs_for,
        strength: proc.strength,
        gtcs_for: proc.gtcs_for,
      },
    ]
  }
  return [{}]
}

export const ECTChart = ({ patient }: ECTChartProps) => {
  const [rows, setRows] = useState<ECTProcedure[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [anaesthetist, setAnaesthetist] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchECTProcedures(200, 0, {
          patient,
          from_date: fromDate.trim() || undefined,
          to_date: toDate.trim() || undefined,
          anaesthetist: anaesthetist.trim() || undefined,
        })
        if (!cancelled) setRows(data)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load ECT chart')
          setRows([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [patient, fromDate, toDate, anaesthetist])

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aDate = a.date_of_session || a.date
      const bDate = b.date_of_session || b.date
      if (!aDate && !bDate) return 0
      if (!aDate) return 1
      if (!bDate) return -1
      return new Date(bDate).getTime() - new Date(aDate).getTime()
    })
  }, [rows])

  const maxEnergyCount = useMemo(() => {
    const longest = sorted.reduce((max, proc) => Math.max(max, energySlots(proc).length), 0)
    // Legacy chart usually shows three stimulations; grow if any row has more.
    return Math.max(longest, 3)
  }, [sorted])

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
        <label className="flex min-w-[140px] flex-col gap-1 text-[11px] font-medium text-slate-600">
          From
          <DateFilterInput
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            placeholder="DD/MM/YYYY"
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800"
          />
        </label>
        <label className="flex min-w-[140px] flex-col gap-1 text-[11px] font-medium text-slate-600">
          To
          <DateFilterInput
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            placeholder="DD/MM/YYYY"
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800"
          />
        </label>
        <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-[11px] font-medium text-slate-600">
          Search By Anaesth. Doc.
          <input
            value={anaesthetist}
            onChange={(e) => setAnaesthetist(e.target.value)}
            placeholder="Anaesthetist name / ID"
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setFromDate('')
            setToDate('')
            setAnaesthetist('')
          }}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
        >
          Clear
        </button>
      </div>

      {!patient ? (
        <p className="text-xs text-slate-500">
          Showing all ECT Procedures (optionally filter by date range / anaesthetist). Select a patient in the
          navbar to narrow the chart.
        </p>
      ) : null}

      {loading ? <div className="text-sm text-slate-600">Loading ECT chart…</div> : null}
      {error ? <div className="text-sm text-rose-700">{error}</div> : null}

      {!loading && !error && sorted.length === 0 ? (
        <div className="text-sm text-slate-600">No ECT Procedure records found.</div>
      ) : null}

      {!loading && !error && sorted.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-300 bg-white">
          <table className="min-w-max w-full border-collapse text-[11px]">
            <thead className="sticky top-0 z-10 bg-teal-700 text-white">
              <tr>
                <th className="border border-teal-800 px-2 py-1.5 text-left font-semibold">Date</th>
                <th className="border border-teal-800 px-2 py-1.5 text-left font-semibold">File No.</th>
                <th className="border border-teal-800 px-2 py-1.5 text-left font-semibold">Patient Name</th>
                <th className="border border-teal-800 px-2 py-1.5 text-center font-semibold">Ses No.</th>
                {Array.from({ length: maxEnergyCount }).map((_, i) => (
                  <th
                    key={`ehead-${i}`}
                    colSpan={3}
                    className="border border-teal-800 px-2 py-1.5 text-center font-semibold"
                  >
                    Energy {maxEnergyCount > 1 ? i + 1 : ''}
                  </th>
                ))}
                <th className="border border-teal-800 px-2 py-1.5 text-center font-semibold">Propofol</th>
                <th className="border border-teal-800 px-2 py-1.5 text-center font-semibold">Succinylcholine</th>
                <th className="border border-teal-800 px-2 py-1.5 text-center font-semibold">ECG</th>
                <th className="border border-teal-800 px-2 py-1.5 text-center font-semibold">BP Before</th>
                <th className="border border-teal-800 px-2 py-1.5 text-center font-semibold">BP After</th>
                <th className="border border-teal-800 px-2 py-1.5 text-left font-semibold">Psych. Doctor</th>
                <th className="border border-teal-800 px-2 py-1.5 text-left font-semibold">Assis Doctor</th>
                <th className="border border-teal-800 px-2 py-1.5 text-left font-semibold">Anaes Doctor</th>
                <th className="border border-teal-800 px-2 py-1.5 text-left font-semibold">Nurses Notes</th>
                <th className="border border-teal-800 px-2 py-1.5 text-left font-semibold">Nurse Name</th>
              </tr>
              <tr className="bg-teal-600">
                <th className="border border-teal-800 px-2 py-1" colSpan={4} />
                {Array.from({ length: maxEnergyCount }).map((_, i) => (
                  <Fragment key={`eh-${i}`}>
                    <th className="border border-teal-800 px-2 py-1 font-medium">Energy</th>
                    <th className="border border-teal-800 px-2 py-1 font-medium">Duration</th>
                    <th className="border border-teal-800 px-2 py-1 font-medium">Strgth</th>
                  </Fragment>
                ))}
                <th className="border border-teal-800 px-2 py-1" colSpan={9} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((proc, rowIdx) => {
                const slots = energySlots(proc)
                const padded: ECTProcedureEnergyRow[] = [
                  ...slots,
                  ...Array.from({ length: Math.max(0, maxEnergyCount - slots.length) }).map(
                    () => ({} as ECTProcedureEnergyRow),
                  ),
                ].slice(0, maxEnergyCount)
                const stripe = rowIdx % 2 === 0 ? 'bg-white' : 'bg-emerald-50/40'
                return (
                  <tr key={proc.name} className={`${stripe} hover:bg-amber-50/60`}>
                    <td className="whitespace-nowrap border border-slate-300 px-2 py-1.5">
                      {fmtDate(proc.date_of_session || proc.date)}
                    </td>
                    <td className="whitespace-nowrap border border-slate-300 px-2 py-1.5">{cell(proc.file_no)}</td>
                    <td className="whitespace-nowrap border border-slate-300 px-2 py-1.5 font-medium text-slate-900">
                      {cell(proc.patient_name || proc.patient)}
                    </td>
                    <td className="whitespace-nowrap border border-slate-300 px-2 py-1.5 text-center">
                      {cell(proc.no_of_session)}
                    </td>
                    {padded.map((slot, i) => (
                      <Fragment key={`${proc.name}-slot-${i}`}>
                        <td className="whitespace-nowrap border border-slate-300 px-2 py-1.5 text-center tabular-nums">
                          {cell(slot.energy)}
                        </td>
                        <td className="whitespace-nowrap border border-slate-300 px-2 py-1.5 text-center tabular-nums">
                          {cell(slot.duration || slot.gtcs_for)}
                        </td>
                        <td className="whitespace-nowrap border border-slate-300 px-2 py-1.5 text-center">
                          {cell(slot.strength)}
                        </td>
                      </Fragment>
                    ))}
                    <td className="whitespace-nowrap border border-slate-300 px-2 py-1.5 text-center tabular-nums">
                      {cell(proc.propofol_detail)}
                    </td>
                    <td className="whitespace-nowrap border border-slate-300 px-2 py-1.5 text-center tabular-nums">
                      {cell(proc.succinylcholine_detail)}
                    </td>
                    <td className="whitespace-nowrap border border-slate-300 px-2 py-1.5 text-center">
                      {cell(proc.ecg)}
                    </td>
                    <td className="whitespace-nowrap border border-slate-300 px-2 py-1.5 text-center tabular-nums">
                      {cell(proc.bp)}
                    </td>
                    <td className="whitespace-nowrap border border-slate-300 px-2 py-1.5 text-center tabular-nums">
                      {cell(proc.bp_after)}
                    </td>
                    <td className="whitespace-nowrap border border-slate-300 bg-amber-50/70 px-2 py-1.5">
                      {cell(proc.psych_doctor_label)}
                    </td>
                    <td className="whitespace-nowrap border border-slate-300 px-2 py-1.5">
                      {cell(proc.assist_doctor_label)}
                    </td>
                    <td className="whitespace-nowrap border border-slate-300 px-2 py-1.5">
                      {cell(proc.anaes_doctor_label)}
                    </td>
                    <td className="min-w-[160px] max-w-[240px] border border-slate-300 px-2 py-1.5">
                      <span className="line-clamp-3">{cell(proc.ect_nurse_notes)}</span>
                    </td>
                    <td className="whitespace-nowrap border border-slate-300 bg-emerald-100/70 px-2 py-1.5 font-medium">
                      {cell(proc.nurse_name)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
