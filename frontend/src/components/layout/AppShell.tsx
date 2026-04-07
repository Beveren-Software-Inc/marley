

import type { ReactNode } from 'react'
import { useState, useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronDown, ChevronRight, Menu, X, Folder } from 'lucide-react'
import { doctorScreenGroups } from '../../config/doctorScreens'
import { useAuth } from '../../providers/AuthProvider'
import { useCareContext } from '../../providers/CareContextProvider'
import { getVisibleMainLinks, type MainLinkItem, type ScreenGroup } from '../../config/permissions'

// ─── Nurse screens ────────────────────────────────────────────────────────────

const nurseScreenGroups: ScreenGroup[] = [
  {
    groupTitle: 'Patient Care & Medication',
    screens: [
      { id: 'rx',          title: 'Prescription' },
      { id: 'single-prescription',    title: 'Single Prescription' },
      // { id: 'n-med',       title: 'Medication' },
      { id: 'n-given',     title: 'Given Medicines' },
      { id: 'n-daily-med', title: 'Daily Medication Chart' },
      { id: 'n-med-sheet', title: 'Medication Sheet' },
      { id: 'n-reminder',  title: 'Long Acting Med Reminder' },
      { id: 'n-prn',       title: 'PRN' },
    ],
  },
  {
    groupTitle: 'Clinical Documentation',
    screens: [
      { id: 'n-dx',          title: 'Diagnoses' },
      { id: 'n-first',       title: 'IP Warnings / Meds / Allergy' },
      { id: 'n-psy-order',   title: 'Psychologist Order' },
      { id: 'n-psy-notes',   title: 'Psychologist Notes' },
      { id: 'n-nut',         title: 'Nutritionist Notes' },
      { id: 'n-ther',        title: 'Therapist Notes' },
      { id: 'n-nurse-notes', title: 'Nursing Notes' },
     
      { id: 'n-tpr',         title: 'TPR / Vital Signs' },
      // { id: 'n-ect',         title: 'ECT Form' },
      // { id: 'n-obs',         title: 'Observation Level' },
    ],
  },
  {
    groupTitle: 'Daily Routine Care',
    screens: [
      { id: 'n-assess', title: 'Patient Assessment' },
      { id: 'n-groom',  title: 'Grooming Chart' },
      { id: 'n-sleep',  title: 'Sleeping Pattern' },
      { id: 'n-mental', title: 'Mental Status' },
      { id: 'n-env',    title: 'Environmental Checklist' },
      { id: 'n-fall',   title: 'Morse Fall Scale' },
    ],
  },

    {
    groupTitle: 'Observation & Monitoring',
    screens: [
      { id: 'n-ob', title: 'Observation' },
      
    ],
  },

  {
    groupTitle: 'Admission & Discharge',
    screens: [
      { id: 'n-reg',             title: 'Admission' },
      // { id: 'n-ip-adm',          title: 'IP Admission & Detail' },
      { id: 'n-discharge',       title: 'Discharge Form / Procedure' },
      { id: 'n-package',         title: 'Package Detail' },
      { id: 'n-patient-history', title: 'Patient History' },
    ],
  },
    {
    groupTitle: 'ECT Forms & Procedures',
    screens: [
      { id: 'n-ect', title: 'ECT Forms' },
      
    ],
  },
   {
    groupTitle: 'Laboratory',
    screens: [
       { id: 'n-labs',        title: 'Lab Reports Status' },
      { id: 'n-lab',         title: 'Laboratory' },
      
    ],
  },
  {
    groupTitle: 'Additional Care',
    screens: [
      { id: 'n-ip-services', title: 'IP Services / Transport' },
      { id: 'n-ref',         title: 'Referral Services' },
      { id: 'n-other',       title: 'Other Services' },
      { id: 'n-session',     title: 'Sessions / Scheduler' },
      { id: 'n-sick',        title: 'Sick Leave' },
    ],
  },
  {
    groupTitle: 'Shift',
    screens: [
      { id: 'n-my-tasks',    title: 'My Nursing Tasks' },
      { id: 'n-nurse-tasks', title: 'Nurse Tasks' },
    ],
  },
]

// ─── Other role screens ───────────────────────────────────────────────────────

const labScreens = [
  { id: 'l-pending', title: 'Pending Samples / Tests' },
  { id: 'l-history', title: 'Patient History (Medical)' },
  { id: 'l-setup',   title: 'Lab Test Setup' },
  { id: 'l-req',     title: 'Lab Test Requests' },
  { id: 'l-out',     title: 'Outsourced Tests' },
  { id: 'l-sample',  title: 'Sample Collection' },
  { id: 'l-results', title: 'Lab Test & Result' },
  { id: 'l-review',  title: 'Lab Test Review' },
  { id: 'l-report',  title: 'Lab Test Report History' },
].sort((a, b) => a.title.localeCompare(b.title))

const receptionScreenGroups: ScreenGroup[] = [
  {
    groupTitle: 'Patient Registration',
    screens: [
      { id: 'patients',    title: 'Patient List' },
      { id: 'r-new-op',    title: 'New Patient Registration' },
      { id: 'r-insurance', title: 'Insurance Patient Register' },
    ],
  },
  {
    groupTitle: 'Appointments & Scheduling',
    screens: [
      { id: 'r-appointment',        title: 'New Appointment' },
      { id: 'r-appointments-freeze', title: 'Appointments' },
      { id: 'r-followup',           title: 'Follow-up Dashboard' },
      { id: 'r-iop',                title: 'IOP Dashboard' },
    ],
  },
  {
    groupTitle: 'Admission & Discharge',
    screens: [
      { id: 'r-ip-adm',   title: 'New IP Admission' },
      { id: 'r-reg',      title: 'Admission' },
      { id: 'r-discharge', title: 'Discharge' },
    ],
  },
  {
    groupTitle: 'Patient Visits',
    screens: [
      { id: 'r-visit',     title: 'Patient Visit' },
      { id: 'r-new-visit', title: 'New Patient Visit' },
    ],
  },
  {
    groupTitle: 'Services & Referrals',
    screens: [
      { id: 'r-service-requests', title: 'Service Requests / Booked Lab' },
      { id: 'r-referral',         title: 'Patient Referral' },
      { id: 'r-long-acting-meds', title: 'Long Acting Medicine' },
    ],
  },
]

const insuranceScreens = [
  { id: 'i-register', title: 'Patient Register' },
  // { id: 'i-claims',   title: 'Claims' },
]

const anesthesiologistScreens = [
  { id: 'a-anesthesia-consent', title: 'ECT Anesthesia Consent' },
  { id: 'a-pre-anesthesia',     title: 'Pre Anesthesia Assessment' },
  { id: 'a-anesthesia-record',  title: 'Anesthesia Record' },
  { id: 'a-recovery-room',      title: 'Recovery Room Record' },
  { id: 'a-alderete',           title: 'Modified Alderete Score' },
  { id: 'a-timeout',            title: 'Time Out Procedure' },
  { id: 'a-pre-ect',            title: 'Pre-ECT Checklist' },
  { id: 'a-suicidal',           title: 'Suicidal Patient Assessment' },
  { id: 'a-ect-admission',      title: 'ECT Admission' },
  { id: 'a-ect-procedure',      title: 'ECT Procedure' },
  { id: 'a-ect-details',        title: 'ECT Details' },
  { id: 'a-physical',           title: 'Physical Examination' },
  { id: 'a-patient-history',    title: 'Patient History' },
]

const psychologistScreens = [
  { id: 'p-notes',           title: 'Psychologist Notes' },
  { id: 'p-orders',          title: 'Psychologist Orders' },
  { id: 'p-dx',              title: 'Diagnoses' },
  { id: 'p-warn',            title: 'Warning Messages' },
  { id: 'p-mh',              title: 'Medical History / Allergies' },
  { id: 'p-patient-history', title: 'Patient History' },
  { id: 'p-physical',        title: 'Physical Examination' },
].sort((a, b) => a.title.localeCompare(b.title))

// ─── Main links ───────────────────────────────────────────────────────────────

const ALL_MAIN_LINKS: MainLinkItem[] = [
  { to: '/doctor',           label: 'Doctor',           screenGroups: doctorScreenGroups,      prefix: '/doctor' },
  { to: '/nurse',            label: 'Nurse',            screenGroups: nurseScreenGroups,        prefix: '/nurse' },
  { to: '/lab',              label: 'Lab',              screens: labScreens,                   prefix: '/lab' },
  { to: '/psychologist',     label: 'Psychologist',     screens: psychologistScreens,          prefix: '/psychologist' },
  { to: '/anesthesiologist', label: 'Anesthesiologist', screens: anesthesiologistScreens,      prefix: '/anesthesiologist' },
  { to: '/reception',        label: 'Reception',        screenGroups: receptionScreenGroups,    prefix: '/reception' },
  { to: '/insurance',        label: 'Insurance',        screens: insuranceScreens,             prefix: '/insurance' },
  { to: '/pharmacy',         label: 'Pharmacy',         screens: [],                           prefix: '/pharmacy' },
  { to: '/patient',          label: 'Patients',         screens: [],                           prefix: '/patient' },
  { to: '/patient-history',  label: 'Patient History',  screens: [],                           prefix: '/patient-history' },
  { to: '/employee',         label: 'Employee',         screens: [],                           prefix: '/employee' },
  { to: '/qmps',             label: 'QMPS',             screens: [],                           prefix: '/qmps' },
]

// ─── AppShell ─────────────────────────────────────────────────────────────────

export const AppShell = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth()
  const { selectedPatient } = useCareContext()

  const roles = user?.roles?.length
    ? user.roles
    : [user?.role, user?.role_profile_name].filter(Boolean) as string[]

  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const toggleTopic = (linkTo: string) => {
    setExpandedTopics((prev) => {
      const next = new Set(prev)
      next.has(linkTo) ? next.delete(linkTo) : next.add(linkTo)
      return next
    })
  }

  const toggleGroup = (linkTo: string, groupTitle: string) => {
    const key = `${linkTo}||${groupTitle}`
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const toggleSidebar = () => setSidebarOpen((v) => !v)
  const closeSidebar  = () => setSidebarOpen(false)

  const mainLinks = useMemo(() => {
    const links = ALL_MAIN_LINKS.map((link) => {
      if (link.to !== '/doctor') return link
      return {
        ...link,
        screenGroups: selectedPatient
          ? doctorScreenGroups
              .map((g) => ({
                ...g,
                screens: g.screens.filter((s) => s.id !== 'patients'),
              }))
              .filter((g) => g.screens.length > 0)
          : doctorScreenGroups,
      }
    })
    return getVisibleMainLinks(links, roles)
  }, [
    user?.name,
    (user?.roles || []).join(','),
    (user?.role || '') + (user?.role_profile_name || ''),
    selectedPatient,
  ])

  return (
    <div className="h-screen overflow-hidden flex bg-muted">
      {/* Mobile hamburger */}
      <button
        onClick={toggleSidebar}
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-primary text-white rounded-md shadow-lg hover:bg-primary/90 transition-colors"
        aria-label="Toggle menu"
      >
        {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={closeSidebar} />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`bg-primary text-white flex flex-col h-screen overflow-hidden fixed md:static z-40 transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } w-[240px]`}
      >
        {/* Logo */}
        <div className="bg-primary text-white px-4 py-3 border-b border-white/10 flex items-center h-[60px] flex-shrink-0">
          <div className="font-semibold text-lg">Healthcare</div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-4 flex flex-col gap-1 text-sm">
          {mainLinks.map((link) => {
            const isExpanded  = expandedTopics.has(link.to)
            const hasGroups   = (link.screenGroups?.length ?? 0) > 0
            const hasScreens  = (link.screens?.length ?? 0) > 0
            const hasChildren = hasGroups || hasScreens

            return (
              <div key={link.to} className="flex flex-col gap-0.5">
                {/* Top-level link row */}
                <div className="flex items-center">
                  {hasChildren && (
                    <button
                      onClick={() => toggleTopic(link.to)}
                      className="p-1 hover:bg-white/20 rounded mr-1 flex-shrink-0"
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded
                        ? <ChevronDown className="w-4 h-4" />
                        : <ChevronRight className="w-4 h-4" />}
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

                {/* ── Grouped screens ── */}
                {isExpanded && hasGroups && link.screenGroups && (
                  <div className="flex flex-col gap-0.5 ml-5 mt-0.5">
                    {link.screenGroups.map((group) => {
                      const groupKey      = `${link.to}||${group.groupTitle}`
                      const groupExpanded = expandedGroups.has(groupKey)

                      return (
                        <div key={group.groupTitle} className="flex flex-col gap-0.5">
                          <button
                            onClick={() => toggleGroup(link.to, group.groupTitle)}
                            className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-xs font-semibold tracking-wide text-white/80 hover:bg-white/20 transition-colors text-left"
                          >
                            <Folder className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
                            <span className="flex-1 truncate">{group.groupTitle}</span>
                            {groupExpanded
                              ? <ChevronDown className="w-3 h-3 flex-shrink-0 opacity-60" />
                              : <ChevronRight className="w-3 h-3 flex-shrink-0 opacity-60" />}
                          </button>

                          {groupExpanded && (
                            <nav className="flex flex-col gap-0.5 ml-4">
                              {group.screens.map((s) => (
                                <NavLink
                                  key={s.id}
                                  to={`${link.to}?screen=${s.id}`}
                                  onClick={closeSidebar}
                                  className={({ isActive }) =>
                                    `px-3 py-1.5 rounded-md text-xs ${
                                      isActive ? 'bg-white text-primary font-medium' : 'bg-white/10 hover:bg-white/20'
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
                  </div>
                )}

                {/* ── Flat screens ── */}
                {isExpanded && hasScreens && link.screens && (
                  <nav className="flex flex-col gap-0.5 mt-0.5 ml-6 text-xs">
                    {link.screens.map((s) => (
                      <NavLink
                        key={s.id}
                        to={`${link.to}?screen=${s.id}`}
                        onClick={closeSidebar}
                        className={({ isActive }) =>
                          `px-3 py-1.5 rounded-md ${
                            isActive ? 'bg-white text-primary font-medium' : 'bg-white/10 hover:bg-white/20'
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

      {/* ── Main content ── */}
      <main className="p-0 h-screen flex flex-col flex-1 md:ml-0">
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