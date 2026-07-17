import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, ClipboardList, Settings, Eye, EyeOff, CalendarRange, X, Play } from 'lucide-react'
import { toast } from '../../hooks/useToast'
import { useCareContext } from '../../providers/CareContextProvider'
import { PatientVisitList } from './PatientVisitList'
import { DailyPatientVisitSetupDetailPanel } from './DailyPatientVisitSetupDetailPanel'
import { EditDailyPatientVisitSetupModal } from './EditDailyPatientVisitSetupModal'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import {
  createDailyPatientVisitSetup,
  fetchDailyPatientVisitSetups,
  stopDailyPatientVisitSetup,
  updateDailyPatientVisitSetup,
  runDailyPatientVisitsBackfill,
  type DailyPatientVisitSetup,
  type DailyPatientVisitSetupServiceLine,
} from '../../services/dailyPatientVisitSetup'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { fetchHealthcarePractitioners, getCurrentUserPractitioner, type LinkFieldOption } from '../../services/common'
import { SetupServicesEditor } from './SetupServicesEditor'
import { InventoryBranchField } from '../nursingInventory/InventoryBranchField'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_OVERLAY,
  CreateModalFooter,
  CreateModalHeader,
  MODAL_FIELD_CLASS,
  MODAL_LABEL_CLASS,
  MODAL_SECTION_CLASS,
  MODAL_SECTION_TITLE_CLASS,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import {
  linkComboboxDropdownClassShort,
  linkComboboxInputClass,
  linkComboboxOptionClass,
} from '../ui/linkComboboxStyles'

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

function formatSetupDate(value?: string | null): string {
  if (!value) return '—'
  if (value === 'Today') {
    return new Date().toLocaleDateString('en-GB')
  }
  try {
    return new Date(value).toLocaleDateString('en-GB')
  } catch {
    return value
  }
}

function formatEntryDate(value?: string | null): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('en-GB')
  } catch {
    return value
  }
}

const BackfillVisitsModal = ({
  setupName,
  setupLabel,
  defaultFrom,
  defaultTo,
  onClose,
  onDone,
}: {
  setupName?: string
  setupLabel?: string
  defaultFrom?: string
  defaultTo?: string
  onClose: () => void
  onDone: () => void
}) => {
  const todayStr = new Date().toISOString().slice(0, 10)
  const [fromDate, setFromDate] = useState(defaultFrom || todayStr)
  const [toDate, setToDate] = useState(defaultTo || todayStr)
  const [includeStopped, setIncludeStopped] = useState(!!setupName)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!fromDate || !toDate) {
      setError('From Date and To Date are required')
      return
    }
    if (toDate < fromDate) {
      setError('To Date cannot be before From Date')
      return
    }
    try {
      setRunning(true)
      const result = await runDailyPatientVisitsBackfill({
        fromDate,
        toDate,
        setupName,
        includeStopped: setupName ? true : includeStopped,
      })
      toast.success(
        `Backfill done: ${result.visits_created} visit(s) created` +
          (result.visits_already_existed
            ? `, ${result.visits_already_existed} already existed`
            : '') +
          (result.errors ? `, ${result.errors} error(s)` : ''),
      )
      if (result.errors) {
        toast.error(`${result.errors} error(s) — check Error Log`)
      }
      onDone()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Backfill failed'
      setError(msg)
      toast.error(msg)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-md w-full')}>
        <CreateModalHeader
          title="Run Daily Auto Visits"
          subtitle={
            setupLabel
              ? `Catch up missed visits for ${setupLabel}`
              : 'Catch up missed visits for active setups in a date range'
          }
          icon={<Play className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          onClose={onClose}
          alert={error}
        />
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className={`${CREATE_MODAL_BODY_GRADIENT} px-5 py-5 sm:px-6 space-y-4`}>
            <p className="text-xs text-slate-600">
              Creates Patient Visits (Daily Auto Visit) and sales orders for days in this range that
              are missing. Existing visits are skipped (billing is still checked).
            </p>
            <div>
              <label className={MODAL_LABEL_CLASS}>
                From Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={fromDate}
                max={todayStr}
                onChange={(e) => setFromDate(e.target.value)}
                className={MODAL_FIELD_CLASS}
                required
              />
            </div>
            <div>
              <label className={MODAL_LABEL_CLASS}>
                To Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={toDate}
                max={todayStr}
                onChange={(e) => setToDate(e.target.value)}
                className={MODAL_FIELD_CLASS}
                required
              />
            </div>
            {!setupName && (
              <label className="inline-flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white/70 px-3 py-2.5 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeStopped}
                  onChange={(e) => setIncludeStopped(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                Include stopped setups
              </label>
            )}
          </div>
          <CreateModalFooter>
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL} disabled={running}>
              Cancel
            </button>
            <button type="submit" disabled={running} className={CM_BTN_PRIMARY}>
              {running ? 'Running…' : 'Run backfill'}
            </button>
          </CreateModalFooter>
        </form>
      </div>
    </div>
  )
}

const CreateSetupModal = ({
  patient: initialPatient,
  onClose,
  onCreated,
}: {
  patient?: string
  onClose: () => void
  onCreated: () => void
}) => {
  const { userCostCenter } = useCareContext()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<DailyPatientVisitSetup>({
    patient: initialPatient || '',
    from_date: '',
    to_date: '',
    time: '',
    practioner: '',
    branch: userCostCenter || '',
    is_active: true,
    amount: 0,
    services: [{ session: '', amount: 0 }],
  })

  const [patientQuery, setPatientQuery] = useState('')
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)

  const [doctorQuery, setDoctorQuery] = useState('')
  const [doctorOptions, setDoctorOptions] = useState<LinkFieldOption[]>([])
  const [doctorOpen, setDoctorOpen] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)

  const update = (patch: Partial<DailyPatientVisitSetup>) => setForm((prev) => ({ ...prev, ...patch }))

  useEffect(() => {
    if (userCostCenter) {
      update({ branch: userCostCenter })
    }
  }, [userCostCenter])

  useEffect(() => {
    if (!initialPatient) return
    fetchPatients(1, 0, initialPatient).then((list) => {
      if (list.length > 0) {
        const p = list[0]
        update({ patient: p.name })
        setPatientQuery((p as { patient_name?: string }).patient_name || p.name)
      } else {
        update({ patient: initialPatient })
        setPatientQuery(initialPatient)
      }
    }).catch(() => {
      update({ patient: initialPatient })
      setPatientQuery(initialPatient)
    })
  }, [initialPatient])

  useEffect(() => {
    getCurrentUserPractitioner().then((practId) => {
      if (!practId) return
      fetchHealthcarePractitioners(practId).then((options) => {
        const match = options.find((p) => p.name === practId)
        update({ practioner: practId })
        setDoctorQuery(match?.label || practId)
      }).catch(() => {
        update({ practioner: practId })
        setDoctorQuery(practId)
      })
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!patientOpen) return
    const search = async () => {
      try {
        const list = patientQuery.trim()
          ? await searchPatients(patientQuery, 20)
          : await fetchPatients(20, 0)
        setPatientOptions(list)
      } catch {
        setPatientOptions([])
      }
    }
    const t = setTimeout(search, patientQuery.trim() ? 300 : 0)
    return () => clearTimeout(t)
  }, [patientOpen, patientQuery])

  useEffect(() => {
    if (!doctorOpen && !doctorQuery) return
    const search = async () => {
      try {
        setDoctorOptions(await fetchHealthcarePractitioners(doctorQuery || undefined))
      } catch {
        setDoctorOptions([])
      }
    }
    const t = setTimeout(search, 300)
    return () => clearTimeout(t)
  }, [doctorOpen, doctorQuery])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPatientOpen(false)
        setDoctorOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.patient || !form.from_date) {
      setError('Patient and Start Date are required')
      return
    }
    if (!form.branch) {
      setError('Please select a branch from the top navbar')
      return
    }
    try {
      setSaving(true)
      const services = (form.services || []).filter((line) => line.session || line.amount)
      const payload = {
        ...form,
        branch: form.branch || userCostCenter || null,
        to_date: form.to_date || null,
        time: form.time || null,
        services,
        amount: services.reduce((sum, line) => sum + (Number(line.amount) || 0), 0),
      }
      await createDailyPatientVisitSetup(payload as DailyPatientVisitSetup)
      toast.success('Daily Patient Visit Setup created')
      onCreated()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create setup'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div ref={containerRef} className={createModalShellClass('max-w-2xl w-full max-h-[90vh]')}>
        <CreateModalHeader
          title="Create Daily Patient Visit Setup"
          subtitle="Schedule automatic daily patient visits for a date range"
          icon={<CalendarClock className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          onClose={onClose}
          alert={error}
        />

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className={`${CREATE_MODAL_BODY_GRADIENT} px-5 py-5 sm:px-6 space-y-5`}>
            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>Patient &amp; doctor</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 relative">
                  <label className={MODAL_LABEL_CLASS}>
                    Patient <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={patientQuery}
                    onChange={(e) => {
                      setPatientQuery(e.target.value)
                      setPatientOpen(true)
                      if (form.patient) update({ patient: '' })
                    }}
                    onFocus={() => setPatientOpen(true)}
                    placeholder="Search patient..."
                    className={linkComboboxInputClass}
                    autoComplete="off"
                  />
                  {patientOpen && patientOptions.length > 0 && (
                    <div className={linkComboboxDropdownClassShort}>
                      {patientOptions.map((p) => (
                        <button
                          key={p.name}
                          type="button"
                          className={linkComboboxOptionClass}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            update({ patient: p.name })
                            setPatientQuery((p as { patient_name?: string }).patient_name || p.name)
                            setPatientOpen(false)
                          }}
                        >
                          {(p as { patient_name?: string }).patient_name || p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="md:col-span-2 relative">
                  <label className={MODAL_LABEL_CLASS}>Doctor</label>
                  <input
                    type="text"
                    value={doctorQuery}
                    onChange={(e) => {
                      setDoctorQuery(e.target.value)
                      setDoctorOpen(true)
                      if (form.practioner) update({ practioner: '' })
                    }}
                    onFocus={() => setDoctorOpen(true)}
                    placeholder="Search doctor..."
                    className={linkComboboxInputClass}
                    autoComplete="off"
                  />
                  {doctorOpen && doctorOptions.length > 0 && (
                    <div className={linkComboboxDropdownClassShort}>
                      {doctorOptions.map((d) => (
                        <button
                          key={d.name}
                          type="button"
                          className={linkComboboxOptionClass}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            update({ practioner: d.name })
                            setDoctorQuery(d.label)
                            setDoctorOpen(false)
                          }}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>Schedule</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={MODAL_LABEL_CLASS}>
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.from_date}
                    onChange={(e) => update({ from_date: e.target.value })}
                    className={MODAL_FIELD_CLASS}
                    required
                  />
                </div>
                <div>
                  <label className={MODAL_LABEL_CLASS}>End Date</label>
                  <input
                    type="date"
                    value={form.to_date || ''}
                    onChange={(e) => update({ to_date: e.target.value })}
                    className={MODAL_FIELD_CLASS}
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Leave blank to keep running daily while Active.
                  </p>
                </div>
                <div>
                  <label className={MODAL_LABEL_CLASS}>Time</label>
                  <input
                    type="time"
                    value={form.time || ''}
                    onChange={(e) => update({ time: e.target.value })}
                    className={MODAL_FIELD_CLASS}
                  />
                </div>
                <div className="md:col-span-2">
                  <InventoryBranchField costCenter={form.branch || userCostCenter || ''} />
                </div>
              </div>
            </section>

            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>Services &amp; billing</h3>
              <SetupServicesEditor
                services={form.services || [{ session: '', amount: 0 }]}
                onChange={(services: DailyPatientVisitSetupServiceLine[]) =>
                  update({
                    services,
                    amount: services.reduce((sum, line) => sum + (Number(line.amount) || 0), 0),
                  })
                }
              />
              <div className="mt-4">
                <label className="inline-flex items-center gap-2.5 rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2.5 text-sm text-emerald-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form.is_active}
                    onChange={(e) => update({ is_active: e.target.checked })}
                    className="h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Active — scheduler will create visits daily
                </label>
              </div>
            </section>
          </div>

          <CreateModalFooter hint="Visits are created automatically at 12:01 AM while active. No end date means it keeps running until stopped.">
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={CM_BTN_PRIMARY}>
              {saving ? 'Creating…' : 'Create setup'}
            </button>
          </CreateModalFooter>
        </form>
      </div>
    </div>
  )
}

export const DailyAutoVisitView = ({ patient }: DailyAutoVisitViewProps) => {
  const { userCostCenter } = useCareContext()
  const [activeTab, setActiveTab] = useState<TabId>('setups')
  const [setups, setSetups] = useState<DailyPatientVisitSetup[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showCreate, setShowCreate] = useState(false)
  const [backfillTarget, setBackfillTarget] = useState<{
    setupName?: string
    setupLabel?: string
    defaultFrom?: string
    defaultTo?: string
  } | null>(null)
  const [stopping, setStopping] = useState<string | null>(null)
  const [detailSetup, setDetailSetup] = useState<DailyPatientVisitSetup | null>(null)
  const [editSetupName, setEditSetupName] = useState<string | null>(null)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'stopped'>('active')
  const menuRef = useRef<HTMLDivElement>(null)

  const activeCount = useMemo(() => setups.filter((s) => !!s.is_active).length, [setups])

  const filteredSetups = useMemo(() => {
    return setups.filter((s) => {
      if (statusFilter === 'active' && !s.is_active) return false
      if (statusFilter === 'stopped' && s.is_active) return false
      if (fromDate || toDate) {
        const start = s.from_date || ''
        const end = s.to_date || ''
        if (!start && !end) return false
        // Keep rows whose schedule window overlaps the selected range.
        if (fromDate && end && end < fromDate) return false
        if (toDate && start && start > toDate) return false
      }
      return true
    })
  }, [setups, statusFilter, fromDate, toDate])

  const filtersActive = !!(fromDate || toDate || statusFilter !== 'active')

  const loadSetups = async () => {
    try {
      setLoading(true)
      const rows = await fetchDailyPatientVisitSetups(
        patient || undefined,
        false,
        userCostCenter || undefined
      )
      setSetups(rows)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load daily auto visit setups')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSetups()
  }, [patient, refreshKey, userCostCenter])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('[data-portal-actions-menu]')) return
      if (el.closest('button[aria-label="Actions"]')) return
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenActionRow(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const stopSetup = async (name?: string) => {
    if (!name) return
    try {
      setStopping(name)
      await stopDailyPatientVisitSetup(name)
      toast.success('Daily auto visit stopped')
      setOpenActionRow(null)
      if (detailSetup?.name === name) {
        setDetailSetup((prev) => (prev ? { ...prev, is_active: false } : prev))
      }
      setRefreshKey((k) => k + 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to stop')
    } finally {
      setStopping(null)
    }
  }

  const toggleSetupActive = async (row: DailyPatientVisitSetup) => {
    if (!row.name) return
    const next = !row.is_active
    try {
      setToggling(row.name)
      await updateDailyPatientVisitSetup(row.name, { is_active: next })
      toast.success(next ? 'Enabled — visits will be created daily' : 'Disabled — no visits will be created')
      if (detailSetup?.name === row.name) {
        setDetailSetup((prev) => (prev ? { ...prev, is_active: next } : prev))
      }
      setRefreshKey((k) => k + 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setToggling(null)
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
              className={`text-left rounded-xl border px-4 py-3 transition ${
                isActive
                  ? 'border-emerald-300 bg-emerald-50/80 ring-1 ring-emerald-200/80'
                  : 'border-slate-200 bg-white hover:border-emerald-200'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${isActive ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                  <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-700' : 'text-slate-700'}`} />
                </div>
                <div>
                  <div className={`text-sm font-semibold ${isActive ? 'text-emerald-950' : 'text-slate-800'}`}>
                    {card.title}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{card.desc}</div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {activeTab === 'setups' && (
        <section className="bg-white border border-emerald-100 rounded-xl p-4 shadow-sm ring-1 ring-emerald-50">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-emerald-950">Daily Patient Visit Setup</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Active setups: {activeCount}
                {filtersActive && ` · Showing ${filteredSetups.length} of ${setups.length}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setBackfillTarget({
                    defaultFrom: fromDate || undefined,
                    defaultTo: toDate || undefined,
                  })
                }
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 text-xs font-medium text-emerald-800 shadow-sm hover:bg-emerald-50"
                title="Create missed Daily Auto Visits for a date range"
              >
                <Play className="h-3.5 w-3.5" />
                Run for dates
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="w-8 h-8 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-center text-base font-bold shadow-md shadow-emerald-600/25 hover:from-emerald-500 hover:to-teal-500"
                title="Create Daily Patient Visit Setup"
              >
                +
              </button>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">From</label>
              <div className="relative">
                <CalendarRange className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-8 rounded-md border border-slate-300 bg-white pl-7 pr-2 text-sm text-slate-700 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-300"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">To</label>
              <div className="relative">
                <CalendarRange className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-8 rounded-md border border-slate-300 bg-white pl-7 pr-2 text-sm text-slate-700 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-300"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'stopped')}
                className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-300"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="stopped">Stopped</option>
              </select>
            </div>
            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setFromDate('')
                  setToDate('')
                  setStatusFilter('active')
                }}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )}
          </div>

          {loading ? (
            <div className="py-8 text-sm text-slate-500 text-center">Loading setups...</div>
          ) : setups.length === 0 ? (
            <div className="py-8 text-sm text-slate-400 text-center">No Daily Patient Visit Setup found.</div>
          ) : filteredSetups.length === 0 ? (
            <div className="py-8 text-sm text-slate-400 text-center">No setups match the selected filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Entry Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">File No.</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Patient Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Doctor</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Branch</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Start Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">End Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[4.5rem]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredSetups.map((row) => (
                    <tr key={row.name} className="hover:bg-slate-50 transition-colors">
                      <td
                        className="px-4 py-3 text-sm font-medium text-primary hover:underline cursor-pointer whitespace-nowrap"
                        onClick={() => setDetailSetup(row)}
                      >
                        {formatSetupDate(row.posting_date || row.creation)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                        {formatEntryDate(row.cr_date || row.creation)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">{row.file_no || '—'}</td>
                      <td
                        className="px-4 py-3 text-sm text-slate-700 cursor-pointer"
                        onClick={() => setDetailSetup(row)}
                      >
                        <span className="font-medium text-primary hover:underline">
                          {row.patient_name || row.patient || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">{row.practitioner_name || row.practioner || '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap" title={row.branch || undefined}>
                        {row.branch || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 text-right">{(row.amount || 0).toFixed(3)}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{formatSetupDate(row.from_date)}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                        {row.to_date ? formatSetupDate(row.to_date) : 'Open-ended'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            row.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {row.is_active ? 'Active' : 'Stopped'}
                        </span>
                      </td>
                      <td className="px-4 py-2 align-middle">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => toggleSetupActive(row)}
                            disabled={toggling === row.name}
                            className={`inline-flex items-center justify-center w-8 h-8 rounded border transition disabled:opacity-50 ${
                              row.is_active
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                : 'border-slate-300 bg-white text-slate-400 hover:bg-slate-50'
                            }`}
                            aria-label={row.is_active ? 'Disable (hide from scheduler)' : 'Enable (show to scheduler)'}
                            title={row.is_active ? 'Enabled — click to disable' : 'Disabled — click to enable'}
                          >
                            {row.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          </button>
                          <div className="relative" ref={openActionRow === row.name ? menuRef : undefined}>
                          <button
                            type="button"
                            onClick={() => setOpenActionRow((prev) => (prev === row.name ? null : row.name || null))}
                            className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                            aria-label="Actions"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                          </button>
                          <PortalActionsMenu
                            open={openActionRow === row.name}
                            onClose={() => setOpenActionRow(null)}
                            triggerRef={menuRef}
                            minWidth={160}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setEditSetupName(row.name || null)
                                setOpenActionRow(null)
                              }}
                              className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setBackfillTarget({
                                  setupName: row.name,
                                  setupLabel: row.patient_name || row.patient || row.name,
                                  defaultFrom: row.from_date || undefined,
                                  defaultTo: row.to_date || undefined,
                                })
                                setOpenActionRow(null)
                              }}
                              className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                            >
                              Run for dates…
                            </button>
                            <button
                              type="button"
                              disabled={!row.is_active || stopping === row.name}
                              onClick={() => stopSetup(row.name)}
                              className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              {stopping === row.name ? 'Stopping…' : 'Stop'}
                            </button>
                          </PortalActionsMenu>
                          </div>
                        </div>
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
        <section className="bg-white border border-emerald-100 rounded-xl p-4 shadow-sm ring-1 ring-emerald-50">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-emerald-950">Daily Auto Visits</h3>
            <p className="text-xs text-slate-500 mt-0.5">Shows Patient Visits where Visit Type is Daily Auto Visit.</p>
          </div>
          <PatientVisitList
            patient={patient}
            refreshKey={refreshKey}
            visitType="Daily Auto Visit"
            hideLabPharmacyAmounts
          />
        </section>
      )}

      {showCreate && (
        <CreateSetupModal
          patient={patient}
          onClose={() => setShowCreate(false)}
          onCreated={() => setRefreshKey((k) => k + 1)}
        />
      )}

      {backfillTarget && (
        <BackfillVisitsModal
          setupName={backfillTarget.setupName}
          setupLabel={backfillTarget.setupLabel}
          defaultFrom={backfillTarget.defaultFrom}
          defaultTo={backfillTarget.defaultTo}
          onClose={() => setBackfillTarget(null)}
          onDone={() => setRefreshKey((k) => k + 1)}
        />
      )}

      {editSetupName && (
        <EditDailyPatientVisitSetupModal
          setupName={editSetupName}
          onClose={() => setEditSetupName(null)}
          onSaved={() => {
            setEditSetupName(null)
            setDetailSetup(null)
            setRefreshKey((k) => k + 1)
          }}
        />
      )}

      {detailSetup && (
        <DailyPatientVisitSetupDetailPanel
          row={detailSetup}
          onClose={() => setDetailSetup(null)}
        />
      )}
    </div>
  )
}
