import { useEffect, useState } from 'react'
import {
  createPatientSafetyEvent,
  fetchPatientSafetyEvents,
  fetchOVRs,
  fetchCAPAs,
  createOVR,
  createCAPA,
  type PatientSafetyEvent,
  type OccurrenceVarianceReport,
  type CAPA,
} from '../services/qmps'
import { fetchPatients, type PatientListItem } from '../services/patients'
import { toast } from '../hooks/useToast'

export const QMPSPage = () => {
  const [submitting, setSubmitting] = useState(false)
  const [events, setEvents] = useState<PatientSafetyEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [ovrs, setOvrs] = useState<OccurrenceVarianceReport[]>([])
  const [capas, setCapas] = useState<CAPA[]>([])
  const [patientQuery, setPatientQuery] = useState('')
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)

  const [form, setForm] = useState({
    is_anonymous: true,
    event_type: '',
    location: '',
    severity: '',
    patient: '',
    department: '',
    description: '',
    immediate_action: '',
    contributing_factors: '',
  })

  // Simple inline forms for OVR & CAPA
  const [newOvr, setNewOvr] = useState({
    variance_type: '',
    impact: '',
    owner_department: '',
    description: '',
  })
  const [creatingOvr, setCreatingOvr] = useState(false)

  const [newCapa, setNewCapa] = useState({
    title: '',
    status: 'Open',
    due_date: '',
  })
  const [creatingCapa, setCreatingCapa] = useState(false)

  const loadEvents = async () => {
    try {
      setLoadingEvents(true)
      const [eventList, ovrList, capaList] = await Promise.all([
        fetchPatientSafetyEvents(50, 0),
        fetchOVRs(25, 0),
        fetchCAPAs(25, 0),
      ])
      setEvents(eventList)
      setOvrs(ovrList)
      setCapas(capaList)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load events')
    } finally {
      setLoadingEvents(false)
    }
  }

  useEffect(() => {
    loadEvents()
  }, [])

  // Patient search
  useEffect(() => {
    if (!patientOpen) return
    const search = async () => {
      try {
        const list = patientQuery.trim()
          ? await fetchPatients(20, 0, patientQuery.trim())
          : await fetchPatients(20, 0)
        setPatientOptions(list)
      } catch {
        setPatientOptions([])
      }
    }
    const id = setTimeout(search, patientQuery.trim() ? 300 : 0)
    return () => clearTimeout(id)
  }, [patientOpen, patientQuery])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.event_type.trim()) {
      toast.error('Event type is required')
      return
    }
    if (!form.description.trim()) {
      toast.error('Description is required')
      return
    }
    try {
      setSubmitting(true)
      await createPatientSafetyEvent({
        event_type: form.event_type.trim(),
        location: form.location.trim() || undefined,
        severity: form.severity || undefined,
        patient: form.patient || undefined,
        department: form.department.trim() || undefined,
        description: form.description.trim(),
        immediate_action: form.immediate_action.trim() || undefined,
        contributing_factors: form.contributing_factors.trim() || undefined,
        is_anonymous: form.is_anonymous,
      })
      toast.success('Patient safety event submitted')
      setForm({
        is_anonymous: true,
        event_type: '',
        location: '',
        severity: '',
        patient: '',
        department: '',
        description: '',
        immediate_action: '',
        contributing_factors: '',
      })
      setPatientQuery('')
      await loadEvents()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit event')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateOvr = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newOvr.variance_type.trim()) {
      toast.error('Variance type is required')
      return
    }
    try {
      setCreatingOvr(true)
      await createOVR({
        variance_type: newOvr.variance_type.trim(),
        impact: newOvr.impact || undefined,
        owner_department: newOvr.owner_department.trim() || undefined,
        description: newOvr.description.trim() || undefined,
      })
      toast.success('OVR created')
      setNewOvr({ variance_type: '', impact: '', owner_department: '', description: '' })
      await loadEvents()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create OVR')
    } finally {
      setCreatingOvr(false)
    }
  }

  const handleCreateCapa = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCapa.title.trim()) {
      toast.error('CAPA title is required')
      return
    }
    try {
      setCreatingCapa(true)
      await createCAPA({
        title: newCapa.title.trim(),
        status: newCapa.status || undefined,
        due_date: newCapa.due_date || undefined,
      })
      toast.success('CAPA created')
      setNewCapa({ title: '', status: 'Open', due_date: '' })
      await loadEvents()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create CAPA')
    } finally {
      setCreatingCapa(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-primary text-white px-4 py-3 border-b border-white/20">
        <div>
          <h1 className="text-base md:text-lg font-semibold">Quality Management & Patient Safety</h1>
          <p className="text-xs md:text-sm text-white/80">
            Report patient safety events and review recent reports.
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)]">
        {/* Left: Reporting form */}
        <section className="bg-white border border-slate-200 rounded-lg shadow-sm p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-800 mb-1">Report Patient Safety Event</h2>
          <p className="text-xs text-slate-600">
            This form supports anonymous reporting. If &quot;Report Anonymously&quot; is checked, your name
            will not be shown on standard reports.
          </p>
          <form className="space-y-3" onSubmit={handleSubmit}>
            <div className="flex items-center gap-3 text-xs">
              <label className="inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={form.is_anonymous}
                  onChange={(e) => setForm({ ...form, is_anonymous: e.target.checked })}
                  className="h-3 w-3"
                />
                Report Anonymously
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600">
                  Event Type <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.event_type}
                  onChange={(e) => setForm({ ...form, event_type: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="e.g. Medication error, Fall, Near miss"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600">Location / Unit</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="e.g. Ward 3B, OPD, Pharmacy"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600">Severity</label>
                <select
                  value={form.severity}
                  onChange={(e) => setForm({ ...form, severity: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
                >
                  <option value="">Select severity</option>
                  <option value="Near Miss">Near Miss</option>
                  <option value="No Harm">No Harm</option>
                  <option value="Mild">Mild</option>
                  <option value="Moderate">Moderate</option>
                  <option value="Severe">Severe</option>
                  <option value="Sentinel">Sentinel</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600">Department / Service</label>
                <input
                  type="text"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="e.g. Psychiatry, Nursing, Pharmacy"
                />
              </div>
            </div>

            {/* Patient (optional) */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-600">Patient (optional)</label>
              <div className="relative">
                <input
                  type="text"
                  value={
                    form.patient
                      ? (patientOptions.find((p) => p.name === form.patient)?.patient_name || form.patient)
                      : patientQuery
                  }
                  onChange={(e) => {
                    setPatientQuery(e.target.value)
                    setPatientOpen(true)
                    if (form.patient) setForm({ ...form, patient: '' })
                  }}
                  onFocus={() => setPatientOpen(true)}
                  placeholder="Search patient..."
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
                {patientOpen && patientOptions.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto text-sm">
                    {patientOptions.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-50"
                        onClick={() => {
                          setForm({ ...form, patient: p.name })
                          setPatientQuery(p.patient_name || p.name)
                          setPatientOpen(false)
                        }}
                      >
                        <div className="font-medium">{p.patient_name || p.name}</div>
                        <div className="text-xs text-slate-500">{p.name}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-600">
                What happened? <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="Describe the event in your own words. Do not include staff names in this field."
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-600">Immediate action taken</label>
              <textarea
                rows={3}
                value={form.immediate_action}
                onChange={(e) => setForm({ ...form, immediate_action: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-600">Contributing factors</label>
              <textarea
                rows={3}
                value={form.contributing_factors}
                onChange={(e) => setForm({ ...form, contributing_factors: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 mt-2">
              <button
                type="button"
                onClick={() => {
                  setForm({
                    is_anonymous: true,
                    event_type: '',
                    location: '',
                    severity: '',
                    patient: '',
                    department: '',
                    description: '',
                    immediate_action: '',
                    contributing_factors: '',
                  })
                  setPatientQuery('')
                }}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50"
              >
                Clear
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-3 py-1.5 text-xs rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : 'Submit Event'}
              </button>
            </div>
          </form>
        </section>

        {/* Right: Recent events + OVR/CAPA (for QMPS / Quality team) */}
        <section className="bg-white border border-slate-200 rounded-lg shadow-sm p-4 flex flex-col space-y-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-800">Recent Safety Events</h2>
            <button
              type="button"
              onClick={loadEvents}
              disabled={loadingEvents}
              className="px-2 py-1 text-xs rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loadingEvents ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            {loadingEvents ? (
              <div className="text-sm text-slate-500 py-8 text-center">Loading events…</div>
            ) : events.length === 0 ? (
              <div className="text-sm text-slate-500 py-8 text-center">
                NO PATIENT SAFETY EVENTS REPORTED YET.
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Date / Time</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Event</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Severity</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Location</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {events.map((e) => (
                    <tr key={e.name} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-700">
                        {e.event_datetime ? new Date(e.event_datetime).toLocaleString('en-GB') : '-'}
                      </td>
                      <td className="px-3 py-2 text-slate-800">
                        <div className="font-medium">{e.event_type}</div>
                        {e.patient && (
                          <div className="text-[11px] text-slate-500 mt-0.5">Patient: {e.patient}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {e.severity || '-'}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {e.location || '-'}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {e.status || 'Open'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* OVR summary */}
          <div className="border-t border-slate-200 pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Recent OVRs</h2>
              <form className="flex items-center gap-2 text-[11px]" onSubmit={handleCreateOvr}>
                <input
                  type="text"
                  value={newOvr.variance_type}
                  onChange={(e) => setNewOvr({ ...newOvr, variance_type: e.target.value })}
                  placeholder="New variance type"
                  className="rounded-md border border-slate-300 px-2 py-1"
                />
                <button
                  type="submit"
                  disabled={creatingOvr}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 disabled:opacity-50"
                  title="Add OVR"
                >
                  {creatingOvr ? '…' : '+'}
                </button>
              </form>
            </div>
            {ovrs.length === 0 ? (
              <div className="text-xs text-slate-500 py-2">
                NO OCCURRENCE / VARIANCE REPORTS YET.
              </div>
            ) : (
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Type</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Impact</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {ovrs.map((o) => (
                    <tr key={o.name} className="hover:bg-slate-50">
                      <td className="px-3 py-1.5 text-slate-700">
                        {o.ovr_date || '-'}
                      </td>
                      <td className="px-3 py-1.5 text-slate-800">
                        {o.variance_type}
                      </td>
                      <td className="px-3 py-1.5 text-slate-700">
                        {o.impact || '-'}
                      </td>
                      <td className="px-3 py-1.5 text-slate-700">
                        {o.status || 'Open'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* CAPA summary */}
          <div className="border-t border-slate-200 pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800 mb-2">Recent CAPA</h2>
              <form className="flex items-center gap-2 text-[11px]" onSubmit={handleCreateCapa}>
                <input
                  type="text"
                  value={newCapa.title}
                  onChange={(e) => setNewCapa({ ...newCapa, title: e.target.value })}
                  placeholder="New CAPA title"
                  className="rounded-md border border-slate-300 px-2 py-1"
                />
                <button
                  type="submit"
                  disabled={creatingCapa}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 disabled:opacity-50"
                  title="Add CAPA"
                >
                  {creatingCapa ? '…' : '+'}
                </button>
              </form>
            </div>
            {capas.length === 0 ? (
              <div className="text-xs text-slate-500 py-2">
                NO CORRECTIVE / PREVENTIVE ACTIONS RECORDED YET.
              </div>
            ) : (
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Title</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Owner</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Due Date</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {capas.map((c) => (
                    <tr key={c.name} className="hover:bg-slate-50">
                      <td className="px-3 py-1.5 text-slate-800">
                        {c.title}
                      </td>
                      <td className="px-3 py-1.5 text-slate-700">
                        {c.owner_user || '-'}
                      </td>
                      <td className="px-3 py-1.5 text-slate-700">
                        {c.due_date || '-'}
                      </td>
                      <td className="px-3 py-1.5 text-slate-700">
                        {c.status || 'Open'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

