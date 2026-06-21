import type { ReactNode } from 'react'
import { useState, useMemo } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, ChevronRight, Folder } from 'lucide-react'
import { AppShellContext } from '../../contexts/AppShellContext'
import { UserMenu } from '../user/UserMenu'
import { NotificationBell } from '../notifications/NotificationBell'
import { SidebarCareModePicker } from './SidebarCareModePicker'
import { doctorScreenGroups } from '../../config/doctorScreens'
import { useAuth } from '../../providers/AuthProvider'
import { useCareContext } from '../../providers/CareContextProvider'
import { getVisibleMainLinks, type MainLinkItem, type ScreenGroup } from '../../config/permissions'
import { SHOW_EMPLOYEE_PORTAL } from '../../config/features'
import { careScopeFromCostCenterField, filterDoctorScreenGroups, filterNurseScreenGroups, filterReceptionScreenGroups } from '../../config/costCenterCareScope'
import {
  DOCTOR_DISCHARGE_SCREEN_ID,
  isInpatientDischargeRoute,
  modeForInpatientDischargeScreens,
  NURSE_DISCHARGE_SCREEN_ID,
} from '../../utils/inpatientDischargeRoute'

// ─── Nurse screens ────────────────────────────────────────────────────────────

const nurseScreenGroups: ScreenGroup[] = [
  {
    groupTitle: 'Patient Care & Medication',
    screens: [
      { id: 'rx',          title: 'All Prescriptions' },
      { id: 'single-prescription',    title: 'Current Prescription' },
      // { id: 'n-med',       title: 'Medication' },
      { id: 'n-given',     title: 'Given Medicines' },
      { id: 'n-daily-med', title: 'Daily Medication Chart' },
      { id: 'n-med-sheet', title: 'Medication Sheet' },
      { id: 'n-reminder',  title: 'Long Acting Med Reminder' },
      { id: 'n-tpr',          title: 'TPR / Vital Signs' },
      { id: 'n-pharmacy-giveout', title: 'Pharmacy Give Out' },
      // { id: 'n-prn',       title: 'PRN' },
    ],
  },
  {
    groupTitle: 'Clinical Documentation',
    screens: [
      { id: 'n-first',       title: 'IP Warnings / Meds / Allergy' },
      { id: 'n-psy-order',   title: 'Psychologist Order' },
      { id: 'n-psy-notes',   title: 'Psychologist Notes' },
      { id: 'n-nut',         title: 'Nutritionist Notes' },
      { id: 'n-ther',        title: 'Therapist Notes' },
      { id: 'n-nurse-notes', title: 'Nursing Notes' },
      { id: 'n-doctor-order', title: 'Doctors Order' },
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
      { id: 'n-labs', title: 'Lab Reports Status' },
      { id: 'n-lab',  title: 'Laboratory' },
    ],
  },
  {
    groupTitle: 'Additional Care',
    screens: [
      { id: 'n-ip-services', title: 'Services' },
      { id: 'n-ref',         title: 'Referral Services' },
      { id: 'n-other',       title: 'Other Services' },
      { id: 'n-session',     title: 'Sessions / Scheduler' },
      { id: 'n-sick',        title: 'Sick Leave' },
    ],
  },
  {
    groupTitle: 'Inventory',
    screens: [
      { id: 'n-inventory', title: 'Dashboard Inventory' },
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

const pharmacyScreens = [
  { id: 'p-stock',     title: 'Stock' },
  { id: 'p-discharge', title: 'Pending Discharge' },
]

const labScreens = [
  // { id: 'l-pending', title: 'Pending Samples / Tests' },
  // { id: 'l-history', title: 'Patient History (Medical)' },
  { id: 'l-setup',     title: 'Lab Test Setup' },
  { id: 'l-results',   title: 'Lab Test & Result' },
  // { id: 'l-sample',  title: 'Sample Collection' },
  { id: 'l-out',       title: 'Outsourced Tests' },
  { id: 'l-inventory', title: 'Dashboard Inventory' },
  // { id: 'l-review',  title: 'Lab Test Review' },
]

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
      { id: 'r-appointments-freeze', title: 'Appointments' },
      { id: 'r-followup',            title: 'Follow-up Dashboard' },
      { id: 'r-iop',                 title: 'IOP Dashboard' },
    ],
  },
  {
    groupTitle: 'Admission & Discharge',
    screens: [
      { id: 'r-reg',       title: 'Admission' },
      { id: 'r-discharge', title: 'Discharge' },
    ],
  },
  {
    groupTitle: 'Patient Visits',
    screens: [
      { id: 'r-visit',           title: 'Patient Visit' },
      { id: 'r-daily-auto-visit', title: 'Daily Auto Visit' },
    ],
  },
  {
    groupTitle: 'Services & Referrals',
    screens: [
      { id: 'r-service-requests', title: 'Service Requests / Booked Lab' },
      { id: 'r-referral',         title: 'Patient Referral' },
      { id: 'r-observation',      title: 'Observation' },
      { id: 'r-internal-transfer', title: 'Internal Transfer' },
      { id: 'r-long-acting-meds', title: 'Long Acting Medicine' },
    ],
  },
  {
    groupTitle: 'Billing',
    screens: [
      { id: 'billing',                        title: 'Billing Dashboard' },
      { id: 'billing-additional-collection',  title: 'Cross‑Branch Payment' },
      { id: 'billing-internal-employee',      title: 'Internal Employee Billing' },
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
  { to: '/doctor',           label: 'Doctor',           screenGroups: doctorScreenGroups,     prefix: '/doctor' },
  { to: '/nurse',            label: 'Nurse',            screenGroups: nurseScreenGroups,       prefix: '/nurse' },
  { to: '/lab',              label: 'Lab',              screens: labScreens,                  prefix: '/lab' },
  { to: '/psychologist',     label: 'Psychologist',     screens: psychologistScreens,         prefix: '/psychologist' },
  { to: '/anesthesiologist', label: 'Anesthesiologist', screens: anesthesiologistScreens,     prefix: '/anesthesiologist' },
  { to: '/reception',        label: 'Reception',        screenGroups: receptionScreenGroups,   prefix: '/reception' },
  { to: '/insurance',        label: 'Insurance',        screens: insuranceScreens,            prefix: '/insurance' },
  { to: '/pharmacy',         label: 'Pharmacy',         screens: pharmacyScreens,           prefix: '/pharmacy' },
  { to: '/patient',          label: 'Patients',         screens: [],                          prefix: '/patient' },
  { to: '/patient-history',  label: 'Patient History',  screens: [],                          prefix: '/patient-history' },
  { to: '/employee',         label: 'Employee',         screens: [],                          prefix: '/employee' },
  { to: '/qmps',             label: 'QMPS',             screens: [],                          prefix: '/qmps' },
  { to: '/staff-activity-audit', label: 'Staff Activity Audit', screens: [],                  prefix: '/staff-activity-audit' },
]

/** Keep patient / mode / admission query params when switching sidebar screens. */
function buildScreenPath(basePath: string, screenId: string, currentSearch: string): string {
  const params = new URLSearchParams(currentSearch)
  params.set('screen', screenId)
  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

/** Role home link: drop screen only, keep care context query params. */
function buildRoleHomePath(basePath: string, currentSearch: string): string {
  const params = new URLSearchParams(currentSearch)
  params.delete('screen')
  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

// ─── AppShell ─────────────────────────────────────────────────────────────────

export const AppShell = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth()
  const { selectedPatient, costCenterPatientCareType, mode } = useCareContext()
  const ccScope = careScopeFromCostCenterField(costCenterPatientCareType)
  const location = useLocation()
  const urlSearch = new URLSearchParams(location.search)
  const inNurseDischargeRoute = isInpatientDischargeRoute(urlSearch, [NURSE_DISCHARGE_SCREEN_ID])
  const inDoctorDischargeRoute = isInpatientDischargeRoute(urlSearch, [DOCTOR_DISCHARGE_SCREEN_ID])
  const sidebarModeForNurse = modeForInpatientDischargeScreens(mode, ccScope, inNurseDischargeRoute)
  const sidebarModeForDoctor = modeForInpatientDischargeScreens(mode, ccScope, inDoctorDischargeRoute)

  // Derive the active screen id from the current URL query param
  const activeScreen = urlSearch.get('screen')
  const isNurseRoute = location.pathname.startsWith('/nurse')

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
      if (link.to === '/doctor') {
        const base = selectedPatient
          ? doctorScreenGroups
              .map((g) => ({
                ...g,
                screens: g.screens.filter((s) => s.id !== 'patients'),
              }))
              .filter((g) => g.screens.length > 0)
          : doctorScreenGroups
        return {
          ...link,
          screenGroups: filterDoctorScreenGroups(base, ccScope, sidebarModeForDoctor),
        }
      }
      if (link.to === '/nurse') {
        return { ...link, screenGroups: filterNurseScreenGroups(nurseScreenGroups, ccScope, sidebarModeForNurse) }
      }
      if (link.to === '/reception') {
        return { ...link, screenGroups: filterReceptionScreenGroups(receptionScreenGroups, ccScope, roles, mode) }
      }
      return link
    })
    const visible = getVisibleMainLinks(links, roles)
    if (SHOW_EMPLOYEE_PORTAL) return visible
    return visible.filter((link) => link.to !== '/employee')
  }, [
    user?.name,
    (user?.roles || []).join(','),
    (user?.role || '') + (user?.role_profile_name || ''),
    selectedPatient,
    ccScope,
    costCenterPatientCareType,
    mode,
    location.search,
  ])

  const shellContextValue = useMemo(
    () => ({ sidebarOpen, toggleSidebar, closeSidebar }),
    [sidebarOpen],
  )

  return (
    <AppShellContext.Provider value={shellContextValue}>
    <div className="h-screen overflow-hidden flex bg-muted">
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

        <SidebarCareModePicker />

        {/* Nav */}
        <nav className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-1 text-sm">
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
                    to={buildRoleHomePath(link.to, location.search)}
                    onClick={closeSidebar}
                    className={({ isActive }) =>
                      `flex-1 px-3 py-2 rounded-md ${
                        isActive ? 'bg-green-200 text-primary' : 'bg-white/10 hover:bg-white/20'
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
                            className={`flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-colors text-left ${
                              groupExpanded
                                ? 'bg-green-200 text-primary'
                                : 'text-white/80 hover:bg-white/20'
                            }`}
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
                                  to={buildScreenPath(link.to, s.id, location.search)}
                                  onClick={closeSidebar}
                                  className={
                                    activeScreen === s.id
                                      ? 'px-3 py-1.5 rounded-md text-xs bg-green-200 text-primary font-medium'
                                      : 'px-3 py-1.5 rounded-md text-xs bg-white/10 hover:bg-white/20'
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
                        to={buildScreenPath(link.to, s.id, location.search)}
                        onClick={closeSidebar}
                        className={
                          activeScreen === s.id
                            ? 'px-3 py-1.5 rounded-md bg-green-200 text-primary font-medium'
                            : 'px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20'
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

        {/* Mobile: account & notifications — least important, pinned to bottom */}
        <div className="md:hidden mt-auto shrink-0 border-t border-white/10 px-3 py-3 flex flex-col gap-2">
          <UserMenu placement="sidebar" />
          <NotificationBell placement="sidebar" />
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="p-0 h-screen flex flex-col flex-1 min-w-0 overflow-hidden md:ml-0">
        <div
          id="patient-alerts-portal"
          className="fixed top-14 left-0 right-0 z-30 md:left-[240px]"
          aria-hidden
        />
        <div className={`flex-1 min-w-0 overflow-y-auto dense-listing ${isNurseRoute ? 'overscroll-y-contain bg-slate-50' : ''}`}>
          {children}
        </div>
        <footer className="h-9 flex items-center justify-end px-4 text-[11px] text-white bg-gradient-to-r from-primary/70 via-primary to-primary/60">
          © 2025 Powered by <span className="font-semibold ml-1">Beveren Software Inc.</span>
        </footer>
      </main>
    </div>
    </AppShellContext.Provider>
  )
}