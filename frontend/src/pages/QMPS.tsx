import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, ClipboardList, History, Target, ShieldAlert } from 'lucide-react'
import { QualityIndicatorsBoard } from '../components/qmps/QualityIndicatorsBoard'
import { CreateQualityIndicatorModal } from '../components/qmps/CreateQualityIndicatorModal'
import { CreatePatientSafetyEventModal } from '../components/qmps/CreatePatientSafetyEventModal'
import {
  fetchPatientSafetyEvents,
  fetchOVRs,
  fetchCAPAs,
  createOVR,
  createCAPA,
  fetchPatientSafetyEventDetail,
  type PatientSafetyEvent,
  type PatientSafetyEventDetail,
  type OccurrenceVarianceReport,
  type CAPA,
} from '../services/qmps'
import { toast } from '../hooks/useToast'
import { DetailSlideOver } from '../components/ui/CreateModalChrome'
import { DashboardCard } from '../components/ui/DashboardCard'

type QMPSTab = 'patient-safety-events' | 'quality-indicators' | 'recent-ovrs' | 'recent-capas'

const VALID_TABS: QMPSTab[] = [
  'patient-safety-events',
  'quality-indicators',
  'recent-ovrs',
  'recent-capas',
]

const NAV_CARDS = [
  {
    id: 'patient-safety-events' as QMPSTab,
    title: 'Patient Safety Events',
    icon: AlertTriangle,
    color: 'bg-red-50 text-red-700 border-red-200',
    iconColor: 'text-red-600',
  },
  {
    id: 'quality-indicators' as QMPSTab,
    title: 'Quality Indicators',
    icon: Target,
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    iconColor: 'text-emerald-600',
  },
  {
    id: 'recent-ovrs' as QMPSTab,
    title: 'Recent OVRs',
    icon: ClipboardList,
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    iconColor: 'text-amber-600',
  },
  {
    id: 'recent-capas' as QMPSTab,
    title: 'Recent CAPA',
    icon: History,
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    iconColor: 'text-blue-600',
  },
]

export const QMPSPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const tabFromUrl = VALID_TABS.includes(rawTab as QMPSTab) ? (rawTab as QMPSTab) : 'patient-safety-events'
  const [activeTab, setActiveTab] = useState<QMPSTab>(tabFromUrl)

  const [events, setEvents] = useState<PatientSafetyEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [ovrs, setOvrs] = useState<OccurrenceVarianceReport[]>([])
  const [capas, setCapas] = useState<CAPA[]>([])

  // Create patient safety event modal
  const [showCreateEventModal, setShowCreateEventModal] = useState(false)

  // Create quality indicator modal
  const [showCreateQualityIndicator, setShowCreateQualityIndicator] = useState(false)
  const [qiRefreshKey, setQiRefreshKey] = useState(0)

  // Event detail slide-over
  const [detailEvent, setDetailEvent] = useState<PatientSafetyEventDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // OVR & CAPA inline forms
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

  const handleTabChange = (newTab: QMPSTab) => {
    setActiveTab(newTab)
    const newSearchParams = new URLSearchParams(searchParams)
    newSearchParams.set('tab', newTab)
    setSearchParams(newSearchParams, { replace: true })
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

  const openEventDetail = async (event: PatientSafetyEvent) => {
    setDetailLoading(true)
    try {
      const detail = await fetchPatientSafetyEventDetail(event.name)
      setDetailEvent(detail)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to fetch event details')
    } finally {
      setDetailLoading(false)
    }
  }

  const resolvedTab = activeTab
  const activeCard =
    NAV_CARDS.find((c) => c.id === resolvedTab) ?? NAV_CARDS[0]

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full min-w-0 overflow-hidden">
      <header className="sticky top-0 z-10 shrink-0 flex items-center justify-between bg-primary text-white px-4 py-3 border-b border-white/20">
        <div>
          <h1 className="text-base md:text-lg font-semibold">Quality Management & Patient Safety</h1>
          <p className="text-xs md:text-sm text-white/80">
            Report patient safety events and review recent reports.
          </p>
        </div>
      </header>

      <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden p-4 gap-4">
        {/* Navigation cards */}
        <div className="grid grid-cols-4 gap-1.5 shrink-0">
          {NAV_CARDS.map((card) => {
            const Icon = card.icon
            const isActive = resolvedTab === card.id
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => handleTabChange(card.id)}
                className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-1 py-1.5 text-center transition-all hover:shadow-sm ${
                  isActive
                    ? `${card.color} shadow-sm`
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className={`rounded-md p-1 ${isActive ? 'bg-white/60' : 'bg-slate-100'}`}>
                  <Icon className={`h-3.5 w-3.5 ${isActive ? card.iconColor : 'text-slate-500'}`} />
                </div>
                <p className={`text-[10px] leading-tight sm:text-[11px] ${isActive ? 'font-bold' : 'font-medium text-slate-800'}`}>
                  {card.title}
                </p>
              </button>
            )
          })}
        </div>

        {/* Active section */}
        <DashboardCard
          noHeightLimit
          className="flex-1 min-h-0"
          openListingTitle={`Expand ${activeCard.title}`}
          filterable={false}
          title={activeCard.title}
          {...(resolvedTab === 'patient-safety-events'
            ? {
                onAdd: () => setShowCreateEventModal(true),
                addButtonTitle: 'Report Patient Safety Event',
              }
            : resolvedTab === 'quality-indicators'
              ? {
                  onAdd: () => setShowCreateQualityIndicator(true),
                  addButtonTitle: 'Create Quality Indicator',
                }
              : {})}
        >
          {resolvedTab === 'patient-safety-events' && (
            <div className="p-1 flex-1 min-h-0 overflow-auto">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-800">Safety Events</h2>
                <button
                  type="button"
                  onClick={loadEvents}
                  disabled={loadingEvents}
                  className="px-2 py-1 text-xs rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {loadingEvents ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
              {loadingEvents ? (
                <div className="text-sm text-slate-500 py-8 text-center">Loading events…</div>
              ) : events.length === 0 ? (
                <div className="text-sm text-slate-500 py-8 text-center">
                  NO PATIENT SAFETY EVENTS REPORTED YET. Click the + button above to report one.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Date / Time</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Event</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Severity</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Location</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Department</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {events.map((e) => (
                      <tr
                        key={e.name}
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => openEventDetail(e)}
                      >
                        <td className="px-3 py-2 text-slate-700">
                          {e.event_datetime ? new Date(e.event_datetime).toLocaleString('en-GB') : '-'}
                        </td>
                        <td className="px-3 py-2 text-slate-800">
                          <div className="font-medium">{e.event_type}</div>
                          {e.patient && (
                            <div className="text-[11px] text-slate-500 mt-0.5">Patient: {e.patient}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-700">{e.severity || '-'}</td>
                        <td className="px-3 py-2 text-slate-700">{e.location || '-'}</td>
                        <td className="px-3 py-2 text-slate-700">{e.department || '-'}</td>
                        <td className="px-3 py-2 text-slate-700">{e.status || 'Open'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {resolvedTab === 'quality-indicators' && (
            <div className="p-1 flex-1 min-h-0 overflow-auto">
              <QualityIndicatorsBoard key={qiRefreshKey} />
            </div>
          )}

          {resolvedTab === 'recent-ovrs' && (
            <div className="p-1 flex-1 min-h-0 overflow-auto">
              <div className="flex items-center justify-between mb-3">
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
                <table className="w-full text-xs">
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
                        <td className="px-3 py-1.5 text-slate-700">{o.ovr_date || '-'}</td>
                        <td className="px-3 py-1.5 text-slate-800">{o.variance_type}</td>
                        <td className="px-3 py-1.5 text-slate-700">{o.impact || '-'}</td>
                        <td className="px-3 py-1.5 text-slate-700">{o.status || 'Open'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {resolvedTab === 'recent-capas' && (
            <div className="p-1 flex-1 min-h-0 overflow-auto">
              <div className="flex items-center justify-between mb-3">
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
                <table className="w-full text-xs">
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
                        <td className="px-3 py-1.5 text-slate-800">{c.title}</td>
                        <td className="px-3 py-1.5 text-slate-700">{c.owner_user || '-'}</td>
                        <td className="px-3 py-1.5 text-slate-700">{c.due_date || '-'}</td>
                        <td className="px-3 py-1.5 text-slate-700">{c.status || 'Open'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </DashboardCard>
      </div>

      {/* Create patient safety event modal */}
      {showCreateEventModal && (
        <CreatePatientSafetyEventModal
          onClose={() => setShowCreateEventModal(false)}
          onSuccess={() => {
            setShowCreateEventModal(false)
            loadEvents()
          }}
        />
      )}

      {/* Create quality indicator modal */}
      {showCreateQualityIndicator && (
        <CreateQualityIndicatorModal
          onClose={() => setShowCreateQualityIndicator(false)}
          onSuccess={() => setQiRefreshKey((k) => k + 1)}
        />
      )}

      {/* Event detail slide-over from right */}
      {detailEvent && (
        <DetailSlideOver
          title="Patient Safety Event"
          subtitle={detailEvent.name}
          icon={<ShieldAlert className="w-5 h-5" />}
          onClose={() => setDetailEvent(null)}
          maxWidthClass="max-w-2xl"
        >
          {detailLoading ? (
            <div className="py-12 text-center text-sm text-slate-500">Loading event details…</div>
          ) : (
            <div className="space-y-5">
              {/* Event type & status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Event Type</p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">{detailEvent.event_type || '-'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Status</p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">
                    <span className={`inline-block rounded border px-2 py-0.5 text-[11px] font-medium ${
                      detailEvent.status === 'Closed'
                        ? 'border-green-200 bg-green-100 text-green-800'
                        : detailEvent.status === 'In Review'
                          ? 'border-amber-200 bg-amber-100 text-amber-800'
                          : 'border-blue-200 bg-blue-100 text-blue-800'
                    }`}>
                      {detailEvent.status || 'Open'}
                    </span>
                  </p>
                </div>
              </div>

              {/* Date & time */}
              <div>
                <p className="text-xs font-semibold text-slate-500">Event Date & Time</p>
                <p className="text-sm font-medium text-slate-900 mt-0.5">
                  {detailEvent.event_datetime ? new Date(detailEvent.event_datetime).toLocaleString('en-GB') : '-'}
                </p>
              </div>

              {/* Location, Severity, Department */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Location / Unit</p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">{detailEvent.location || '-'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Severity</p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">{detailEvent.severity || '-'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Department</p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">{detailEvent.department || '-'}</p>
                </div>
              </div>

              {/* Patient */}
              <div>
                <p className="text-xs font-semibold text-slate-500">Patient</p>
                <p className="text-sm font-medium text-slate-900 mt-0.5">{detailEvent.patient || 'N/A'}</p>
              </div>

              {/* Anonymous */}
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  Number(detailEvent.is_anonymous) === 1
                    ? 'border-purple-200 bg-purple-100 text-purple-800'
                    : 'border-slate-200 bg-slate-100 text-slate-600'
                }`}>
                  {Number(detailEvent.is_anonymous) === 1 ? 'Reported Anonymously' : 'Identified Reporter'}
                </span>
              </div>

              {/* Description */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500 mb-2">What Happened?</p>
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{detailEvent.description || '-'}</p>
              </div>

              {/* Immediate action */}
              {detailEvent.immediate_action && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-slate-500 mb-2">Immediate Action Taken</p>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap">{detailEvent.immediate_action}</p>
                </div>
              )}

              {/* Contributing factors */}
              {detailEvent.contributing_factors && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-slate-500 mb-2">Contributing Factors</p>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap">{detailEvent.contributing_factors}</p>
                </div>
              )}

              {/* Reported by */}
              <div>
                <p className="text-xs font-semibold text-slate-500">Reported By</p>
                <p className="text-sm font-medium text-slate-900 mt-0.5">
                  {detailEvent.reported_by || detailEvent.owner || '-'}
                </p>
              </div>
            </div>
          )}
        </DetailSlideOver>
      )}
    </div>
  )
}