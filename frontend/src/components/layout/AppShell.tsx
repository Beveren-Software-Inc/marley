import type { ReactNode } from 'react'
import { useState, useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronDown, ChevronRight, Menu, X } from 'lucide-react'
import { doctorScreens } from '../../config/doctorScreens'
import { useAuth } from '../../providers/AuthProvider'
import { getVisibleMainLinks, type MainLinkItem } from '../../config/permissions'

const nurseScreens = [
  { id: 'n-first', title: 'IP Warnings / Meds / Allergy' },
  { id: 'n-labs', title: 'Lab Reports Status' },
  { id: 'n-med', title: 'Medication' },
  { id: 'n-given', title: 'Given Medicines' },
  // { id: 'n-doc-notes', title: 'Doctors Notes' },
  { id: 'n-dx', title: 'Diagnoses' },
  { id: 'n-psy-order', title: 'Psychologist Order' },
  { id: 'n-nut', title: 'Nutritionist Notes' },
  { id: 'n-psy-notes', title: 'Psychologist Notes' },
  { id: 'n-ther', title: 'Therapist Notes' },
  { id: 'n-nurse-notes', title: 'Nursing Notes' },
  { id: 'n-lab', title: 'Laboratory' },
  { id: 'n-op', title: 'OP Visit Note' },
  { id: 'n-tpr', title: 'TPR / Vital Signs' },
  { id: 'n-ect', title: 'ECT Form' },
  { id: 'n-iop', title: 'IOP Dashboard' },
  { id: 'n-obs', title: 'Observation Level' },
  { id: 'n-ipm', title: 'IP Medication' },
  { id: 'n-ip-services', title: 'IP Services / Transport' },
  { id: 'n-ref', title: 'Referral Services' },
  { id: 'n-daily-med', title: 'Daily Medication Chart' },
  { id: 'n-med-sheet', title: 'Medication Sheet' },
  { id: 'n-reminder', title: 'Long Acting Med Reminder' },
  { id: 'n-fall', title: 'Morse Fall Scale' },
  { id: 'n-assess', title: 'Patient Assessment' },
  { id: 'n-groom', title: 'Grooming Chart' },
  { id: 'n-sleep', title: 'Sleeping Pattern' },
  { id: 'n-mental', title: 'Mental Status' },
  { id: 'n-env', title: 'Environmental Checklist' },
  { id: 'n-discharge', title: 'Discharge Form / Procedure' },
  { id: 'n-other', title: 'Other Services' },
  { id: 'n-prn', title: 'PRN' },
  { id: 'n-sick', title: 'Sick Leave' },
  { id: 'n-package', title: 'Package Detail' },
  { id: 'n-session', title: 'Sessions / Scheduler' },
  { id: 'n-ip-adm', title: 'IP Admission & Detail' },
  { id: 'n-my-tasks', title: 'My Nursing Tasks' },
  { id: 'n-reg', title: 'Admission' }
].sort((a, b) => a.title.localeCompare(b.title))

const labScreens = [
  { id: 'l-pending', title: 'Pending Samples / Tests' },
  { id: 'l-history', title: 'Patient History (Medical)' },
  { id: 'l-setup', title: 'Lab Test Setup' },
  { id: 'l-req', title: 'Lab Test Requests' },
  { id: 'l-out', title: 'Outsourced Tests' },
  { id: 'l-sample', title: 'Sample Collection' },
  { id: 'l-results', title: 'Lab Test & Result' },
  { id: 'l-review', title: 'Lab Test Review' },
  { id: 'l-report', title: 'Lab Test Report History' }
].sort((a, b) => a.title.localeCompare(b.title))

const receptionScreens = [
  { id: 'r-new-op', title: 'New Patient Registration' },
  { id: 'r-appointment', title: 'New Appointment' },
  { id: 'r-ip-adm', title: 'New IP Admission' },
  { id: 'r-reg', title: 'Admission' },
  { id: 'r-visit', title: 'Patient Visit' },
  { id: 'r-new-visit', title: 'New Patient Visit' },
  { id: 'r-followup', title: 'Follow-up Dashboard' },
  { id: 'r-iop', title: 'IOP Dashboard' },
  { id: 'r-appointments-freeze', title: 'Appointments' },
  { id: 'r-service-requests', title: 'Service Requests / Booked Lab' },
  { id: 'r-discharge', title: 'Discharge' },
  // { id: 'r-receipt-voucher', title: 'Receipt Voucher' },
  // { id: 'r-op-dashboard', title: 'OP Dashboard' },
  // { id: 'r-ip-dashboard', title: 'IP Dashboard' }
].sort((a, b) => a.title.localeCompare(b.title))

const ALL_MAIN_LINKS: MainLinkItem[] = [
  { to: '/doctor', label: 'Doctor', screens: doctorScreens, prefix: '/doctor' },
  { to: '/nurse', label: 'Nurse', screens: nurseScreens, prefix: '/nurse' },
  { to: '/lab', label: 'Lab', screens: labScreens, prefix: '/lab' },
  { to: '/reception', label: 'Reception', screens: receptionScreens, prefix: '/reception' },
  { to: '/patient-history', label: 'Patient History', screens: [], prefix: '/patient-history' },
  { to: '/pharmacy', label: 'Pharmacy', screens: [], prefix: '/pharmacy' },
  { to: '/employee', label: 'Employee', screens: [], prefix: '/employee' },
  { to: '/patient', label: 'Patient', screens: [], prefix: '/patient' },
  { to: '/qmps', label: 'QMPS', screens: [], prefix: '/qmps' }
]

export const AppShell = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth()
  const roles = user?.roles?.length ? user.roles : [user?.role, user?.role_profile_name].filter(Boolean) as string[]
  const mainLinks = useMemo(
    () => getVisibleMainLinks(ALL_MAIN_LINKS, roles),
    [user?.name, (user?.roles || []).join(','), (user?.role || '') + (user?.role_profile_name || '')]
  )

  // Track which topics have their subtopics expanded
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set())
  // Track sidebar visibility on mobile
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const toggleTopic = (linkTo: string) => {
    setExpandedTopics((prev) => {
      const next = new Set(prev)
      if (next.has(linkTo)) {
        next.delete(linkTo)
      } else {
        next.add(linkTo)
      }
      return next
    })
  }

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const closeSidebar = () => {
    setSidebarOpen(false)
  }

  return (
    <div className="h-screen overflow-hidden flex bg-muted">
      {/* Mobile menu button */}
      <button
        onClick={toggleSidebar}
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-primary text-white rounded-md shadow-lg hover:bg-primary/90 transition-colors"
        aria-label="Toggle menu"
      >
        {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`bg-primary text-white flex flex-col h-screen overflow-hidden fixed md:static z-40 transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } w-[240px]`}
      >
        <div className="bg-primary text-white px-4 py-3 border-b border-white/0 flex items-center h-[60px] flex-shrink-0">
          <div className="font-semibold text-lg">Healthcare</div>
        </div>
        {/* Navigation section below header */}
        <nav className="flex-1 overflow-y-auto p-4 flex flex-col gap-1 text-sm">
          {mainLinks.map((link) => {
            const isExpanded = expandedTopics.has(link.to)
            const hasScreens = (link.screens?.length ?? 0) > 0
            const showSubtopics = isExpanded && hasScreens

            return (
              <div key={link.to} className="flex flex-col gap-1">
                <div className="flex items-center">
                  {hasScreens && (
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        toggleTopic(link.to)
                      }}
                      className="p-1 hover:bg-white/20 rounded mr-1"
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  <NavLink
                    to={link.to}
                    onClick={closeSidebar}
                    className={({ isActive }) =>
                      `flex-1 px-3 py-2 rounded-md ${
                        isActive ? 'bg-white text-primary' : 'bg-white/10 hover:bg-white/20'
                      }`
                    }
                  >
                    {link.label}
                  </NavLink>
                </div>
                {showSubtopics && link.screens && (
                  <nav className="flex flex-col gap-1 mt-1 ml-6 text-xs">
                    {link.screens.map((s) => (
                      <NavLink
                        key={s.id}
                        to={`${link.to}?screen=${s.id}`}
                        onClick={closeSidebar}
                        className={({ isActive }) =>
                          `px-3 py-1.5 rounded-md ${
                            isActive ? 'bg-white text-primary' : 'bg-white/10 hover:bg-white/20'
                          }`
                        }
                      >
                        {s.title}
                      </NavLink>
                    ))}
                  </nav>
                )}
              </div>
            )
          })}
        </nav>
      </aside>
      <main className="p-0 h-screen flex flex-col flex-1 md:ml-0">
        {/* Portal target for patient alerts banner (body section, below header) */}
        <div
          id="patient-alerts-portal"
          className="fixed top-14 left-0 right-0 z-30 md:left-[240px]"
          aria-hidden
        />
        <div className="flex-1 overflow-y-auto">{children}</div>
        <footer className="h-9 flex items-center justify-end px-4 text-[11px] text-white bg-gradient-to-r from-primary/70 via-primary to-primary/60">
          © 2025 Powered by <span className="font-semibold ml-1">Beveren Software Inc.</span>
        </footer>
      </main>
    </div>
  )
}


