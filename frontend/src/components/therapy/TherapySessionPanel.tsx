import { useState } from 'react'
import { Calendar, CalendarClock } from 'lucide-react'
import { SessionScheduleList } from '../sessionSchedule/SessionScheduleList'
import { CreateSessionScheduleModal } from '../sessionSchedule/CreateSessionScheduleModal'
import { AppointmentList } from '../appointments/AppointmentList'
import { CardFilterContext } from '../../contexts/CardFilterContext'
import { useCareContext } from '../../providers/CareContextProvider'

type SessionTab = 'session-schedule' | 'appointments'

const SESSION_NAV_CARDS = [
  {
    id: 'session-schedule' as SessionTab,
    title: 'Session Schedule',
    icon: CalendarClock,
    color: 'bg-violet-50 text-violet-700 border-violet-200',
    iconColor: 'text-violet-600',
  },
  {
    id: 'appointments' as SessionTab,
    title: 'Appointments',
    icon: Calendar,
    color: 'bg-sky-50 text-sky-700 border-sky-200',
    iconColor: 'text-sky-600',
  },
]

interface TherapySessionPanelProps {
  patient?: string
  admissionNumber?: string
  refreshKey?: number
  onRefresh?: () => void
  onPatientClick?: (patient: string | undefined) => void
  initialTab?: SessionTab
  showAppointments?: boolean
  /** When true, fill parent DashboardCard and scroll inside it instead of growing past it. */
  embedded?: boolean
}

export function TherapySessionPanel({
  patient,
  admissionNumber,
  refreshKey = 0,
  onRefresh,
  onPatientClick,
  initialTab = 'session-schedule',
  showAppointments = true,
  embedded = false,
}: TherapySessionPanelProps) {
  const { guardClinicalCreate, activeVisit } = useCareContext()
  const [activeTab, setActiveTab] = useState<SessionTab>(initialTab)
  const [showFilters, setShowFilters] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const cards = showAppointments ? SESSION_NAV_CARDS : SESSION_NAV_CARDS.filter((c) => c.id === 'session-schedule')
  const activeCard = cards.find((card) => card.id === activeTab) ?? cards[0]

  return (
    <div className={embedded ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'space-y-4'}>
      {cards.length > 1 && (
        <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-w-2xl ${embedded ? 'mb-3 shrink-0' : ''}`}>
          {cards.map((card) => {
            const Icon = card.icon
            const isActive = activeTab === card.id
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => setActiveTab(card.id)}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 px-2 py-3 text-center transition-all hover:shadow-md ${
                  isActive
                    ? `${card.color} shadow-sm`
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className={`rounded-lg p-2.5 ${isActive ? 'bg-white/60' : 'bg-slate-100'}`}>
                  <Icon className={`h-5 w-5 ${isActive ? card.iconColor : 'text-slate-500'}`} />
                </div>
                <p className={`text-xs font-semibold leading-tight sm:text-sm ${isActive ? '' : 'text-slate-800'}`}>
                  {card.title}
                </p>
              </button>
            )
          })}
        </div>
      )}

      <CardFilterContext.Provider value={showFilters}>
        <section
          className={
            embedded
              ? 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm'
              : 'rounded-lg border border-slate-200 bg-white shadow-sm'
          }
        >
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-slate-800">{activeCard.title}</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFilters((prev) => !prev)}
                className={`p-1.5 rounded-md border transition-colors ${
                  showFilters
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'border-slate-300 text-slate-500 hover:bg-slate-50'
                }`}
                title={showFilters ? 'Hide filters' : 'Show filters'}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
                  />
                </svg>
              </button>
              {activeTab === 'session-schedule' && (
                <button
                  type="button"
                  onClick={() => guardClinicalCreate(() => setShowModal(true))}
                  className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-base font-bold"
                  title="Add Session Schedule"
                >
                  +
                </button>
              )}
            </div>
          </div>

          <div
            className={
              embedded
                ? 'flex min-h-0 flex-1 flex-col overflow-hidden p-3'
                : 'max-h-[480px] overflow-x-auto overflow-y-auto p-3'
            }
            style={embedded ? undefined : { scrollbarWidth: 'thin' }}
          >
            {activeTab === 'session-schedule' ? (
              <SessionScheduleList
                embedded
                patient={patient}
                admissionNumber={admissionNumber}
                refreshKey={refreshKey}
              />
            ) : (
              <AppointmentList embedded patient={patient} onPatientClick={onPatientClick} />
            )}
          </div>
        </section>
      </CardFilterContext.Provider>

      {showModal && (
        <CreateSessionScheduleModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            onRefresh?.()
            setShowModal(false)
          }}
          initialAdmission={admissionNumber}
          initialPatientVisit={activeVisit}
        />
      )}
    </div>
  )
}
