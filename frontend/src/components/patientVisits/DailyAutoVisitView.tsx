import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Settings } from 'lucide-react'
import { toast } from '../../hooks/useToast'
import { PatientVisitList } from './PatientVisitList'
import {
  createDailyPatientVisitSetup,
  fetchDailyPatientVisitSetups,
  stopDailyPatientVisitSetup,
  type DailyPatientVisitSetup,
} from '../../services/dailyPatientVisitSetup'

interface DailyAutoVisitViewProps {
  patient?: string
}

const CARDS = [
  {
    id: 'setups',
    title: 'Daily Patient Visit Setup',
    desc: 'Create and manage auto-visit schedules',
    icon: Settings,
  },
  {
    id: 'visits',
    title: 'Daily Auto Visits',
    desc: 'Patient visits with Visit Type: Daily Auto Visit',
    icon: ClipboardList,
  },
] as const

type TabId = (typeof CARDS)[number]['id']

const CreateSetupModal = ({
  patient,
  onClose,
  onCreated,
}: {
  patient?: string
  onClose: () => void
  onCreated: () => void
}) => {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<DailyPatientVisitSetup>({
    patient: patient || '',
    from_date: '',
    to_date: '',
    time: '',
    session: '',
    is_active: true,
    amount: 0,
  })

  const update = (patch: Partial<DailyPatientVisitSetup>) => setForm((prev) => ({ ...prev, ...patch }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.patient || !form.from_date || !form.to_date || !form.time) {
      toast.error('Patient, From Date, To Date and Time are required')
      return
    }
    try {
      setSaving(true)
      await createDailyPatientVisitSetup(form)
      toast.success('Daily Patient Visit Setup created')
      onCreated()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create setup')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Create Daily Patient Visit Setup</h3>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-700">
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Patient — full width */}
          <div className="md:col-span-2 flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">
              Patient <span className="text-red-500">*</span>
            </label>
            <input
              value={form.patient}
              onChange={(e) => update({ patient: e.target.value })}
              placeholder="Patient"
              className="border border-slate-300 rounded px-3 py-2 text-sm"
            />
          </div>

          {/* From Date */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">
              From Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={form.from_date}
              onChange={(e) => update({ from_date: e.target.value })}
              className="border border-slate-300 rounded px-3 py-2 text-sm"
            />
          </div>

          {/* To Date */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">
              To Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={form.to_date}
              onChange={(e) => update({ to_date: e.target.value })}
              className="border border-slate-300 rounded px-3 py-2 text-sm"
            />
          </div>

          {/* Time */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">
              Time <span className="text-red-500">*</span>
            </label>
            <input
              type="time"
              value={form.time}
              onChange={(e) => update({ time: e.target.value })}
              className="border border-slate-300 rounded px-3 py-2 text-sm"
            />
          </div>

          {/* Session */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Session</label>
            <input
              value={form.session || ''}
              onChange={(e) => update({ session: e.target.value })}
              placeholder="Optional"
              className="border border-slate-300 rounded px-3 py-2 text-sm"
            />
          </div>

          {/* Amount */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Amount</label>
            <input
              type="number"
              value={form.amount || 0}
              onChange={(e) => update({ amount: Number(e.target.value) || 0 })}
              placeholder="0.00"
              min={0}
              step="0.01"
              className="border border-slate-300 rounded px-3 py-2 text-sm"
            />
          </div>

          {/* Is Active */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Status</label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 py-2">
              <input
                type="checkbox"
                checked={!!form.is_active}
                onChange={(e) => update({ is_active: e.target.checked })}
              />
              Is Active
            </label>
          </div>

          {/* Actions */}
          <div className="md:col-span-2 flex justify-end gap-2 pt-1 border-t border-slate-100 mt-1">
            <button type="button" onClick={onClose} className="px-3 py-2 text-sm border border-slate-300 rounded">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-3 py-2 text-sm bg-primary text-white rounded">
              {saving ? 'Saving...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export const DailyAutoVisitView = ({ patient }: DailyAutoVisitViewProps) => {
  const [activeTab, setActiveTab] = useState<TabId>('setups')
  const [setups, setSetups] = useState<DailyPatientVisitSetup[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showCreate, setShowCreate] = useState(false)
  const [stopping, setStopping] = useState<string | null>(null)

  const activeCount = useMemo(() => setups.filter((s) => !!s.is_active).length, [setups])

  const loadSetups = async () => {
    try {
      setLoading(true)
      const rows = await fetchDailyPatientVisitSetups(patient || undefined, false)
      setSetups(rows)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load daily auto visit setups')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSetups()
  }, [patient, refreshKey])

  const stopSetup = async (name?: string) => {
    if (!name) return
    try {
      setStopping(name)
      await stopDailyPatientVisitSetup(name)
      toast.success('Daily auto visit stopped')
      setRefreshKey((k) => k + 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to stop')
    } finally {
      setStopping(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {CARDS.map((card) => {
          const Icon = card.icon
          const isActive = activeTab === card.id
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => setActiveTab(card.id)}
              className={`text-left rounded-lg border px-4 py-3 transition ${
                isActive ? 'border-primary bg-primary/5' : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded bg-slate-100">
                  <Icon className="w-4 h-4 text-slate-700" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">{card.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{card.desc}</div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {activeTab === 'setups' && (
        <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Daily Patient Visit Setup</h3>
              <p className="text-xs text-slate-500 mt-0.5">Active setups: {activeCount}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-base font-bold"
              title="Create Daily Patient Visit Setup"
            >
              +
            </button>
          </div>

          {loading ? (
            <div className="py-8 text-sm text-slate-500 text-center">Loading setups...</div>
          ) : setups.length === 0 ? (
            <div className="py-8 text-sm text-slate-400 text-center">No Daily Patient Visit Setup found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Setup</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Patient</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">From</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">To</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Time</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Amount</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Status</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {setups.map((row) => (
                    <tr key={row.name}>
                      <td className="px-3 py-2 text-sm text-slate-700">{row.name}</td>
                      <td className="px-3 py-2 text-sm text-slate-700">{row.patient_name || row.patient}</td>
                      <td className="px-3 py-2 text-sm text-slate-700">{row.from_date}</td>
                      <td className="px-3 py-2 text-sm text-slate-700">{row.to_date}</td>
                      <td className="px-3 py-2 text-sm text-slate-700">{row.time}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 text-right">{(row.amount || 0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-sm">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs ${
                            row.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {row.is_active ? 'Patient Visit Active' : 'Stopped'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm">
                        <button
                          type="button"
                          disabled={!row.is_active || stopping === row.name}
                          onClick={() => stopSetup(row.name)}
                          className="px-2.5 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {stopping === row.name ? 'Stopping...' : 'Stop'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === 'visits' && (
        <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-800">Daily Auto Visits</h3>
            <p className="text-xs text-slate-500 mt-0.5">Shows Patient Visits where Visit Type is Daily Auto Visit.</p>
          </div>
          <PatientVisitList patient={patient} refreshKey={refreshKey} visitType="Daily Auto Visit" />
        </section>
      )}

      {showCreate && (
        <CreateSetupModal
          patient={patient}
          onClose={() => setShowCreate(false)}
          onCreated={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  )
}
