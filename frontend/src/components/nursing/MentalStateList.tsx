import { useEffect, useRef, useState } from 'react'
import { fetchMentalStates, type MentalStateRow } from '../../services/mentalState'

interface MentalStateListProps {
  patient?: string
  refreshKey?: number
  onCreateNew?: () => void
}

const Tick = ({ v }: { v: 0 | 1 | undefined | null }) =>
  v ? (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">✓</span>
  ) : (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-400 text-xs">—</span>
  )

const DetailRow = ({ label, value }: { label: string; value: 0 | 1 | undefined | null }) => (
  <div className="flex items-center justify-between py-1 border-b border-slate-100 last:border-0">
    <span className="text-xs text-slate-600">{label}</span>
    <Tick v={value} />
  </div>
)

const SectionTitle = ({ title }: { title: string }) => (
  <div className="text-sm font-semibold text-slate-800 mb-3">{title}</div>
)

const SubLabel = ({ label }: { label: string }) => (
  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1 mt-2">{label}</div>
)

const DataField = ({ label, value }: { label: string; value: string | number | null | undefined }) => (
  <div>
    <div className="text-[11px] text-slate-500 uppercase tracking-wide font-semibold mb-0.5">{label}</div>
    <div className="text-sm font-semibold text-slate-800">{value ?? '—'}</div>
  </div>
)

export const MentalStateList = ({ patient, refreshKey, onCreateNew }: MentalStateListProps) => {
  const [records, setRecords] = useState<MentalStateRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<MentalStateRow | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = async (q?: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchMentalStates(patient, q)
      setRecords(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load mental state records')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient, refreshKey])

  const handleSearchChange = (q: string) => {
    setSearch(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(q), 350)
  }

  useEffect(() => {
    if (!selected) return
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setSelected(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [selected])

  const formatDate = (val: string | null | undefined) => {
    if (!val) return '—'
    try { return new Date(val).toLocaleString() } catch { return val }
  }

  const countChecks = (row: MentalStateRow, keys: (keyof MentalStateRow)[]) =>
    keys.filter((k) => !!row[k]).length

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Search Patient</label>
          <input
            type="search"
            placeholder="Search by patient name…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        {onCreateNew && (
          <div className="flex items-end">
            {/* <button
              onClick={onCreateNew}
              className="px-3 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 transition-colors flex items-center gap-2"
              title="New Mental State"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Record
            </button> */}
          </div>
        )}
      </div>

      {loading && <div className="text-sm text-slate-500 py-4 text-center">Loading…</div>}
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">{error}</div>}

      {!loading && !error && records.length === 0 && (
        <div className="p-4 text-sm text-slate-600 border border-dashed border-slate-300 rounded-md text-center">
          No mental state records found.
        </div>
      )}

      {!loading && records.length > 0 && (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Patient</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Admission No</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Branch</th>
                <th className="px-3 py-2 text-center font-semibold text-slate-600">Trans Shift</th>
                <th className="px-3 py-2 text-center font-semibold text-slate-600">Behaviour</th>
                <th className="px-3 py-2 text-center font-semibold text-slate-600">Sleep</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => {
                const behaviourCount = countChecks(r, [
                  'cooperative','aggressive','paranoid','demanding','preoccupied','defence','impulsive','sedative',
                ])
                const sleepCount = countChecks(r, ['normal_sleep','disturbed','intermittent','excessive','a_little'])
                return (
                  <tr key={r.name} className="hover:bg-slate-50 cursor-pointer" onClick={() => setSelected(r)}>
                    <td className="px-3 py-2 text-slate-900 font-medium">{formatDate(r.creation)}</td>
                    <td className="px-3 py-2 text-slate-800">{r.patient_name || r.file_no || '—'}</td>
                    <td className="px-3 py-2 text-slate-700">{r.admission_no || '—'}</td>
                    <td className="px-3 py-2 text-slate-700">{r.branch || '—'}</td>
                    <td className="px-3 py-2 text-center text-slate-700">{r.trans_shift ?? '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${behaviourCount >= 5 ? 'bg-emerald-100 text-emerald-700' : behaviourCount >= 2 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                        {behaviourCount}/8
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${sleepCount >= 3 ? 'bg-emerald-100 text-emerald-700' : sleepCount >= 1 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                        {sleepCount}/5
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Right-side detail slide-over */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" aria-modal="true">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelected(null)} />
          <div
            ref={panelRef}
            className="relative z-10 flex flex-col bg-white shadow-2xl w-full max-w-2xl h-full overflow-y-auto"
            style={{ scrollbarWidth: 'thin' }}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
              <div>
                <div className="text-base font-semibold text-slate-900">Mental State</div>
                <div className="text-xs text-slate-500 mt-0.5">{selected.name}</div>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={`/app/mental-state/${encodeURIComponent(selected.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  Open in Frappe ↗
                </a>
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700 text-xl leading-none" aria-label="Close">×</button>
              </div>
            </div>

            <div className="p-5 flex flex-col gap-5">
              {/* Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Patient', value: selected.patient_name || selected.file_no || '—' },
                  { label: 'Admission', value: selected.admission_no || '—' },
                  { label: 'Branch', value: selected.branch || '—' },
                  { label: 'Trans Shift', value: selected.trans_shift != null ? String(selected.trans_shift) : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
                    <div className="text-sm font-semibold text-slate-800 mt-1 truncate" title={value}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Behaviour & Speech */}
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <SectionTitle title="Behaviour & Speech" />
                {selected.normal_at && (
                  <div className="mb-3"><DataField label="Normal AT" value={selected.normal_at} /></div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6">
                  <div>
                    <SubLabel label="Behaviour" />
                    <DetailRow label="Cooperative" value={selected.cooperative} />
                    <DetailRow label="Aggressive" value={selected.aggressive} />
                    <DetailRow label="Paranoid" value={selected.paranoid} />
                    <DetailRow label="Demanding" value={selected.demanding} />
                    <DetailRow label="Preoccupied" value={selected.preoccupied} />
                    <DetailRow label="Defence" value={selected.defence} />
                    <DetailRow label="Impulsive" value={selected.impulsive} />
                    <DetailRow label="Sedative" value={selected.sedative} />
                  </div>
                  <div>
                    <SubLabel label="Speech" />
                    <DetailRow label="Normal S" value={selected.normal_s} />
                    <DetailRow label="Rapid" value={selected.rapid} />
                    <DetailRow label="Slow" value={selected.slow} />
                    <DetailRow label="Poor SP" value={selected.poor_sp} />
                    <DetailRow label="Slurred" value={selected.slurred} />
                    <DetailRow label="Coherent" value={selected.coherent} />
                    <DetailRow label="Incoherent" value={selected.incoherent} />
                    <DetailRow label="Talkative" value={selected.talkative} />
                    <SubLabel label="Mood / Affect" />
                    <DetailRow label="Anxious" value={selected.anxious} />
                    <DetailRow label="Angry" value={selected.angry} />
                    <DetailRow label="Depressed" value={selected.depressed} />
                    <DetailRow label="Elated" value={selected.elated} />
                    <DetailRow label="Euthymic" value={selected.euthymic} />
                    <DetailRow label="Irritable" value={selected.irritable} />
                  </div>
                  <div>
                    <SubLabel label="Motor" />
                    <DetailRow label="Twitches" value={selected.twitches} />
                    <DetailRow label="Hyperactive" value={selected.hyperactive} />
                    <DetailRow label="Stereotypes" value={selected.stereotypes} />
                    <DetailRow label="Restless" value={selected.restless} />
                    <DetailRow label="Gait" value={selected.gait} />
                    <DetailRow label="Tics" value={selected.tics} />
                    <DetailRow label="Agitated" value={selected.agitated} />
                    <DetailRow label="Abnormal" value={selected.abnormal} />
                    <DetailRow label="Hallucinatory Behaviour" value={selected.hallucinatory_behaviour} />
                  </div>
                </div>
              </div>

              {/* Orientation & Appetite */}
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <SectionTitle title="Orientation & Appetite" />
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <DataField label="Place" value={selected.place} />
                  <DataField label="Time" value={selected.time} />
                  <DataField label="Person" value={selected.person} />
                  <DataField label="Reported Type" value={selected.reported_type} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6">
                  <DetailRow label="Normal AP" value={selected.normal_ap} />
                  <DetailRow label="Increased" value={selected.increased} />
                  <DetailRow label="Poor AP" value={selected.poor_ap} />
                  <DetailRow label="Reported" value={selected.reported} />
                  <DetailRow label="Non Reported" value={selected.non_reported} />
                  <DetailRow label="Normal B" value={selected.normal_b} />
                </div>
              </div>

              {/* Sleep & Consciousness */}
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <SectionTitle title="Sleep & Consciousness" />
                <div className="mb-3"><DataField label="Sleep Duration (hrs)" value={selected.sleep_duration} /></div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6">
                  <DetailRow label="Normal Sleep" value={selected.normal_sleep} />
                  <DetailRow label="Disturbed" value={selected.disturbed} />
                  <DetailRow label="Intermittent" value={selected.intermittent} />
                  <DetailRow label="Excessive" value={selected.excessive} />
                  <DetailRow label="A Little" value={selected.a_little} />
                  <DetailRow label="Conscious" value={selected.conscious} />
                  <DetailRow label="Alert" value={selected.alert} />
                  <DetailRow label="Disturbed Con" value={selected.disturbed_con} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
