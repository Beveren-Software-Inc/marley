import { useEffect, useRef, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { toast } from '../../hooks/useToast'
import {
  fetchDailyPatientVisitSetup,
  updateDailyPatientVisitSetup,
  normalizeSetupServices,
  type DailyPatientVisitSetup,
  type DailyPatientVisitSetupServiceLine,
} from '../../services/dailyPatientVisitSetup'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { fetchHealthcarePractitioners, type LinkFieldOption } from '../../services/common'
import { fetchIOPSessionTypes, type IOPSessionType } from '../../services/iop'
import { SetupServicesEditor } from './SetupServicesEditor'
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

interface EditDailyPatientVisitSetupModalProps {
  setupName: string
  onClose: () => void
  onSaved: () => void
}

export const EditDailyPatientVisitSetupModal = ({
  setupName,
  onClose,
  onSaved,
}: EditDailyPatientVisitSetupModalProps) => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<DailyPatientVisitSetup | null>(null)

  const [patientQuery, setPatientQuery] = useState('')
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)

  const [doctorQuery, setDoctorQuery] = useState('')
  const [doctorOptions, setDoctorOptions] = useState<LinkFieldOption[]>([])
  const [doctorOpen, setDoctorOpen] = useState(false)

  const [sessionTypes, setSessionTypes] = useState<IOPSessionType[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  const update = (patch: Partial<DailyPatientVisitSetup>) =>
    setForm((prev) => (prev ? { ...prev, ...patch } : prev))

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([fetchDailyPatientVisitSetup(setupName), fetchIOPSessionTypes()])
      .then(([setup, types]) => {
        if (cancelled) return
        const services = normalizeSetupServices(setup)
        setForm({
          ...setup,
          is_active: !!setup.is_active,
          services,
          amount: services.reduce((sum, line) => sum + (Number(line.amount) || 0), 0),
        })
        setPatientQuery(setup.patient_name || setup.patient || '')
        setDoctorQuery(setup.practitioner_name || setup.practioner || '')
        setSessionTypes(types)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load setup')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [setupName])

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
    if (!form?.name) return
    setError(null)
    if (!form.patient || !form.from_date || !form.to_date || !form.time) {
      setError('Patient, Start Date, End Date and Time are required')
      return
    }
    try {
      setSaving(true)
      const services = (form.services || []).filter((line) => line.session || line.amount)
      await updateDailyPatientVisitSetup(form.name, {
        patient: form.patient,
        practioner: form.practioner,
        from_date: form.from_date,
        to_date: form.to_date,
        time: form.time,
        services,
        is_active: form.is_active,
      })
      toast.success('Daily Patient Visit Setup updated')
      onSaved()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update setup'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !form) {
    return (
      <div className={CREATE_MODAL_OVERLAY}>
        <div className={createModalShellClass('max-w-2xl w-full')}>
          <div className="px-6 py-10 text-center text-sm text-slate-500">Loading setup…</div>
        </div>
      </div>
    )
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div ref={containerRef} className={createModalShellClass('max-w-2xl w-full max-h-[90vh]')}>
        <CreateModalHeader
          title="Edit Daily Patient Visit Setup"
          subtitle={form.name}
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
                  <label className={MODAL_LABEL_CLASS}>Doctor Name</label>
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
                  <label className={MODAL_LABEL_CLASS}>
                    End Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.to_date}
                    onChange={(e) => update({ to_date: e.target.value })}
                    className={MODAL_FIELD_CLASS}
                    required
                  />
                </div>
                <div>
                  <label className={MODAL_LABEL_CLASS}>
                    Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    value={form.time}
                    onChange={(e) => update({ time: e.target.value })}
                    className={MODAL_FIELD_CLASS}
                    required
                  />
                </div>
              </div>
            </section>

            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>Services &amp; status</h3>
              <SetupServicesEditor
                services={form.services || [{ session: '', amount: 0 }]}
                onChange={(services: DailyPatientVisitSetupServiceLine[]) =>
                  update({
                    services,
                    amount: services.reduce((sum, line) => sum + (Number(line.amount) || 0), 0),
                  })
                }
                sessionTypes={sessionTypes}
                onSessionTypesUpdated={setSessionTypes}
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

          <CreateModalFooter>
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={CM_BTN_PRIMARY}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </CreateModalFooter>
        </form>
      </div>
    </div>
  )
}
