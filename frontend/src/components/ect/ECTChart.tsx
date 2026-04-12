import { useEffect, useMemo, useState } from 'react'
import { fetchECTDetails, type ECTDetail } from '../../services/ectDetails'
import { fetchECTProcedures, type ECTProcedure } from '../../services/ectProcedure'

interface ECTChartProps {
  patient?: string
}

const parseNumeric = (value?: string | number) => {
  if (value == null) return undefined
  if (typeof value === 'number') return value
  const match = String(value).match(/-?\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : undefined
}

const durationLabel = (duration?: number) => {
  if (duration == null) return '-'
  return `${duration}`
}

const energyLabel = (energy?: string) => {
  if (!energy) return '-'
  return energy
}

export const ECTChart = ({ patient }: ECTChartProps) => {
  const [ectDetails, setEctDetails] = useState<ECTDetail[]>([])
  const [ectProcedures, setEctProcedures] = useState<ECTProcedure[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!patient) {
        setEctDetails([])
        setEctProcedures([])
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)
        const [details, procedures] = await Promise.all([
          fetchECTDetails(20, 0, patient),
          fetchECTProcedures(20, 0, patient),
        ])
        setEctDetails(details)
        setEctProcedures(procedures)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load ECT chart')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [patient])

  const sortedDetails = useMemo(() => {
    return [...ectDetails].sort((a, b) => {
      if (!a.date && !b.date) return 0
      if (!a.date) return 1
      if (!b.date) return -1
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    })
  }, [ectDetails])

  const sortedProcedures = useMemo(() => {
    return [...ectProcedures].sort((a, b) => {
      const aDate = a.date_of_session ?? a.date
      const bDate = b.date_of_session ?? b.date
      if (!aDate && !bDate) return 0
      if (!aDate) return 1
      if (!bDate) return -1
      return new Date(bDate).getTime() - new Date(aDate).getTime()
    })
  }, [ectProcedures])

  const recentDetails = sortedDetails.slice(0, 6)
  const recentProcedures = sortedProcedures.slice(0, 6)

  const maxEnergy = Math.max(1, ...recentDetails.map((row) => parseNumeric(row.energy) ?? 0))
  const maxDuration = Math.max(1, ...recentDetails.map((row) => row.duration ?? 0))

  const lastDetail = recentDetails[0]

  if (!patient) {
    return <div className="text-sm text-slate-600">Select a patient to view the ECT chart.</div>
  }

  if (loading) {
    return <div className="text-sm text-slate-600">Loading ECT chart...</div>
  }

  if (error) {
    return <div className="text-sm text-rose-700">{error}</div>
  }

  if (recentDetails.length === 0 && recentProcedures.length === 0) {
    return <div className="text-sm text-slate-600">No ECT records found for this patient.</div>
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">ECT Detail sessions</div>
          <div className="mt-2 text-xl font-semibold text-slate-900">{ectDetails.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">ECT Procedure sessions</div>
          <div className="mt-2 text-xl font-semibold text-slate-900">{ectProcedures.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">Last Procedure BP</div>
          <div className="mt-2 text-xl font-semibold text-slate-900">{lastDetail?.bp_1 || '-'} / {lastDetail?.max_bp_1 || '-'}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">Last BP After</div>
          <div className="mt-2 text-xl font-semibold text-slate-900">{lastDetail?.bp_2 || '-'} / {lastDetail?.max_bp2 || '-'}</div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">Last Energy</div>
          <div className="mt-2 text-xl font-semibold text-slate-900">{energyLabel(lastDetail?.energy)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">Last Duration</div>
          <div className="mt-2 text-xl font-semibold text-slate-900">{durationLabel(lastDetail?.duration)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">Last Nurse Notes</div>
          <div className="mt-2 text-sm text-slate-900 line-clamp-2">{lastDetail?.ect_nurse_notes || '-'}</div>
        </div>
      </div>

      {recentDetails.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Recent ECT Details</h3>
            <span className="text-xs uppercase tracking-wide text-slate-500">Showing {recentDetails.length}</span>
          </div>
          <div className="space-y-4">
            {recentDetails.map((session) => {
              const energyValue = parseNumeric(session.energy)
              const durationValue = session.duration
              return (
                <div key={session.name} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{session.name}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {session.date ? new Date(session.date).toLocaleDateString() : '-'}
                        {session.time ? ` ${String(session.time).slice(0, 5)}` : ''}
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <div>{session.doctors_name || session.anaesthetic_doctor || '-'}</div>
                      <div>{session.nurse_name || '-'}</div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Energy</div>
                      <div className="mt-2 text-lg font-semibold text-slate-900">{energyLabel(session.energy)}</div>
                      {energyValue != null && (
                        <div className="mt-2 h-2 rounded-full bg-slate-200">
                          <div
                            className="h-2 rounded-full bg-fuchsia-500"
                            style={{ width: `${Math.min(100, Math.round((energyValue / maxEnergy) * 100))}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Duration</div>
                      <div className="mt-2 text-lg font-semibold text-slate-900">{durationLabel(session.duration)}</div>
                      {durationValue != null && (
                        <div className="mt-2 h-2 rounded-full bg-slate-200">
                          <div
                            className="h-2 rounded-full bg-cyan-500"
                            style={{ width: `${Math.min(100, Math.round((durationValue / maxDuration) * 100))}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">BP Before</div>
                      <div className="mt-2 text-lg font-semibold text-slate-900">{session.bp_1 || '-'} / {session.max_bp_1 || '-'}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">BP After</div>
                      <div className="mt-2 text-lg font-semibold text-slate-900">{session.bp_2 || '-'} / {session.max_bp2 || '-'}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Outcome</div>
                      <div className="mt-2 text-lg font-semibold text-slate-900">{session.success || '-'}</div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Propofol</div>
                      <div className="mt-2 text-sm text-slate-900">{session.propofol_detail || '-'}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Succinylcholine</div>
                      <div className="mt-2 text-sm text-slate-900">{session.succinycholine_detail || '-'}</div>
                    </div>
                  </div>

                  {session.ect_nurse_notes && (
                    <div className="mt-4 rounded-xl bg-slate-50 p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">ECT Nurse Notes</div>
                      <div className="mt-2 text-sm text-slate-900 whitespace-pre-wrap">{session.ect_nurse_notes}</div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {recentProcedures.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Recent ECT Procedures</h3>
            <span className="text-xs uppercase tracking-wide text-slate-500">Showing {recentProcedures.length}</span>
          </div>
          <div className="grid gap-4">
            {recentProcedures.map((procedure) => (
              <div key={procedure.name} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{procedure.name}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {procedure.date_of_session
                        ? new Date(procedure.date_of_session).toLocaleDateString()
                        : procedure.date
                        ? new Date(procedure.date).toLocaleDateString()
                        : '-'}
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <div>{procedure.patient_name || procedure.patient || '-'}</div>
                    <div>{procedure.anaesthetist || '-'}</div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs uppercase tracking-wide text-slate-500">BP Before</div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">{procedure.bp || '-'}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs uppercase tracking-wide text-slate-500">BP After</div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">{procedure.bp_after || '-'}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Energy</div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">{energyLabel(procedure.energy)}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Sessions</div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">{procedure.no_of_session ?? '-'}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
