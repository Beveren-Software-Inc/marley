import type { ReactNode } from 'react'
import { useState, useMemo, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, ChevronRight, Folder } from 'lucide-react'
import { UserMenu } from '../user/UserMenu'
import { AppShellContext } from '../../contexts/AppShellContext'
import { BranchSelector } from './BranchSelector'
import { NotificationBell } from '../notifications/NotificationBell'
import { SidebarCareModePicker } from './SidebarCareModePicker'
import { doctorScreenGroups, assessmentScreens } from '../../config/doctorScreens'
import { useAuth } from '../../providers/AuthProvider'
import { useCareContext } from '../../providers/CareContextProvider'
import { getVisibleMainLinks, type MainLinkItem, type ScreenGroup } from '../../config/permissions'
import type { ScreenItem } from '../../config/doctorScreens'
import { SHOW_EMPLOYEE_PORTAL } from '../../config/features'
import { careScopeFromCostCenterField, filterDoctorScreenGroups, filterNurseScreenGroups, filterReceptionScreenGroups } from '../../config/costCenterCareScope'
import sereneLogo from '../../assets/serene-logo.png'
import {
  DOCTOR_DISCHARGE_SCREEN_ID,
  isInpatientDischargeRoute,
  modeForInpatientDischargeScreens,
  NURSE_DISCHARGE_SCREEN_ID,
} from '../../utils/inpatientDischargeRoute'
import { stripDischargeFlowParams } from '../../utils/dischargeNavigation'

// ─── Nurse screens ────────────────────────────────────────────────────────────

const nurseScreenGroups: ScreenGroup[] = [
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
    groupTitle: 'Patient Medication',
    screens: [
      { id: 'n-daily-med', title: 'Daily Medication Chart' },
      { id: 'n-med-sheet', title: 'Medication Sheet' },
      { id: 'n-reminder',  title: 'Long Acting Medicines' },
      { id: 'n-given',     title: 'Given Medicines' },
      { id: 'n-pharmacy-giveout', title: 'Pharmacy Give Out' },
    ],
  },
  {
    // Mirrors the doctor's Documentation group (+ TPR); warnings live on the dashboard.
    groupTitle: 'Documentation',
    screens: [
      { id: 'n-doctor-order', title: 'Doctors Order' },
      { id: 'n-psy-notes',   title: 'Psychology Notes' },
      { id: 'n-psy-order',   title: 'Psychology Order' },
      { id: 'n-nut',         title: 'Nutritionist Notes' },
      { id: 'n-ther',        title: 'Therapist Notes' },
      { id: 'n-nurse-notes', title: 'Nursing Notes' },
      { id: 'n-med-notes',   title: 'Patient Medication Notes' },
      { id: 'n-tpr',         title: 'TPR / Vital Signs' },
    ],
  },
  {
    groupTitle: '',
    screens: [{ id: 'n-ob', title: 'Observation Level' }],
  },
  {
    groupTitle: '',
    screens: [{ id: 'n-discharge', title: 'Discharge Form' }],
  },
  {
    groupTitle: '',
    screens: [
      { id: 'n-patient-history', title: 'Patient History Form' },
      { id: 'n-physical-exam', title: 'Physical Examination' },
      { id: 'n-suicide-risk', title: 'Suicide Risk Assessment' },
    ],
  },
  {
    groupTitle: '',
    screens: [{ id: 'n-ect', title: 'ECT Forms' }],
  },
  {
    groupTitle: '',
    screens: [{ id: 'n-lab', title: 'Laboratory' }],
  },
  {
    groupTitle: '',
    screens: [{ id: 'n-ip-services', title: 'ECT Service' }],
  },
  {
    groupTitle: 'Other Services',
    screens: [
      { id: 'n-other', title: 'Other Services' },
      { id: 'n-sick', title: 'Sick Leave' },
    ],
  },
  {
    groupTitle: '',
    screens: [{ id: 'n-session', title: 'Session Scheduling' }],
  },
  {
    groupTitle: '',
    screens: [{ id: 'n-inventory', title: 'Inventory Dashboard' }],
  },
  {
    groupTitle: '',
    screens: [{ id: 'n-my-tasks', title: 'My Tasks' }],
  },
  {
    groupTitle: '',
    screens: [{ id: 'n-nurse-tasks', title: 'Assign Task' }],
  },
]

// ─── Other role screens ───────────────────────────────────────────────────────

const pharmacyScreens = [
  // 'p-stock' (Stock) removed — it rendered the same view as the Pharmacy dashboard landing (/pharmacy).
  { id: 'p-discharge', title: 'Pending Discharge' },
]

const labScreens = [
  // { id: 'l-pending', title: 'Pending Samples / Tests' },
  // { id: 'l-history', title: 'Patient History (Medical)' },
  { id: 'l-setup',     title: 'Lab Test Setup' },
  // 'l-results' (Lab Test & Result) merged into the Lab Dashboard's "Tests & Results" card.
  // { id: 'l-sample',  title: 'Sample Collection' },
  { id: 'l-out',       title: 'Outsourced Tests' },
  { id: 'l-mh',        title: 'Past Medical History' },
  { id: 'l-inventory', title: 'Inventory Dashboard' },
  // { id: 'l-review',  title: 'Lab Test Review' },
]

const receptionScreenGroups: ScreenGroup[] = [
  {
    groupTitle: 'Patient Registration',
    screens: [
      { id: 'patients',    title: 'Edit Patient Details' },
      { id: 'r-new-op',    title: 'New Patient Registration' },
      { id: 'r-insurance', title: 'Insurance Patient Register' },
    ],
  },
  {
    groupTitle: 'Appointments & Scheduling',
    screens: [
      { id: 'r-appointments-freeze', title: 'Appointments' },
      { id: 'r-sticky-notes', title: 'Sticky Notes' },
      { id: 'r-practitioner-unavailability', title: 'Practitioner Unavailability' },
      { id: 'r-followup',            title: 'Follow-up Dashboard' },
      { id: 'r-iop',                 title: 'IOP Dashboard' },
    ],
  },
  {
    groupTitle: 'Admission & Discharge',
    screens: [
      { id: 'r-reg',       title: 'Admission' },
      { id: 'r-discharge', title: 'Discharge' },
      { id: 'r-medical-consent',   title: 'Patient Medical Consent' },
      { id: 'r-financial-consent', title: 'Informed Financial Consent' },
      { id: 'r-signatures',        title: 'Admission e-Signatures' },
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
  {
    groupTitle: '',
    screens: [{ id: 'r-reports', title: 'Reports' }],
  },
  {
    groupTitle: '',
    screens: [{ id: 'r-promotions', title: 'Promotion Analysis' }],
  },
]

const insuranceScreens = [
  { id: 'i-register', title: 'Patient Register' },
  // { id: 'i-claims',   title: 'Claims' },
]

// First 11 screens (ECT/anesthesia forms) removed from the sidebar — they are
// already reachable as cards on the Anesthesiologist dashboard.
const anesthesiologistScreens = [
  { id: 'a-physical',           title: 'Physical Examination' },
  { id: 'a-patient-history',    title: 'Patient History' },
]

const psychologyScreens = [
  { id: 'p-dx',              title: 'Diagnoses' },
  { id: 'p-warn',            title: 'Warnings & Messages' },
  { id: 'p-mh',              title: 'Past Medical History' },
  { id: 'p-patient-history', title: 'Patient History' },
  { id: 'p-physical',        title: 'Physical Examination' },
].sort((a, b) => a.title.localeCompare(b.title))

const nutritionistScreens = [
  { id: 'nut-notes', title: 'Nutritionist Notes' },
  { id: 'nut-appointments', title: 'Appointments' },
  { id: 'nut-session', title: 'Session Scheduling' },
]

const psychologistScreenGroups: ScreenGroup[] = [
  {
    groupTitle: 'Psychology',
    screens: psychologyScreens,
  },
  {
    // Mirrors the doctor's Documentation group.
    groupTitle: 'Documentation',
    screens: [
      { id: 'p-doctor-order', title: 'Doctors Orders' },
      { id: 'p-notes',        title: 'Psychology Notes' },
      { id: 'p-orders',       title: 'Psychology Orders' },
      { id: 'p-nut',          title: 'Nutrition Notes' },
      { id: 't-notes',        title: 'Occupational Therapy Notes' },
      { id: 'p-nurse-notes',  title: 'Nursing Notes' },
    ],
  },
  {
    groupTitle: 'Scales & Assessments',
    screens: [{ id: 'fall', title: 'Morse Fall Scale' }, ...assessmentScreens],
  },
  {
    groupTitle: '',
    screens: [{ id: 't-session', title: 'Session Scheduler' }],
  },
]

const therapyScreenGroups: ScreenGroup[] = [
  {
    groupTitle: '',
    screens: [{ id: 't-notes', title: 'Therapy Notes' }],
  },
  {
    groupTitle: '',
    screens: [{ id: 't-session', title: 'Session Scheduler' }],
  },
  {
    groupTitle: '',
    screens: [{ id: 't-appointments', title: 'Appointments' }],
  },
  {
    // Mirrors the doctor's Documentation group.
    groupTitle: 'Documentation',
    screens: [
      { id: 'th-doctor-order', title: 'Doctors Orders' },
      { id: 'th-psy-notes',    title: 'Psychology Notes' },
      { id: 'th-psy-order',    title: 'Psychology Orders' },
      { id: 'th-nut',          title: 'Nutrition Notes' },
      { id: 'th-nurse-notes',  title: 'Nursing Notes' },
    ],
  },
]

const nutritionistScreenGroups: ScreenGroup[] = [
  {
    groupTitle: 'Nutritionist',
    screens: nutritionistScreens,
  },
]

// ─── Main links ───────────────────────────────────────────────────────────────

const ALL_MAIN_LINKS: MainLinkItem[] = [
  { to: '/doctor',           label: 'Doctor',           screenGroups: doctorScreenGroups,     prefix: '/doctor' },
  { to: '/nurse',            label: 'Nurse',            screenGroups: nurseScreenGroups,       prefix: '/nurse' },
  { to: '/lab',              label: 'Lab',              screens: labScreens,                  prefix: '/lab' },
  { to: '/psychologist',     label: 'Psychologist',     screenGroups: psychologistScreenGroups, prefix: '/psychologist' },
  { to: '/therapy',          label: 'Occupational Therapist',          screenGroups: therapyScreenGroups,      prefix: '/therapy' },
  { to: '/nutritionist',     label: 'Nutritionist',     screenGroups: nutritionistScreenGroups, prefix: '/nutritionist' },
  { to: '/anesthesiologist', label: 'Anesthesiologist', screens: anesthesiologistScreens,     prefix: '/anesthesiologist' },
  { to: '/reception',        label: 'Reception',        screenGroups: receptionScreenGroups,   prefix: '/reception' },
  { to: '/insurance',        label: 'Insurance',        screens: insuranceScreens,            prefix: '/insurance' },
  { to: '/pharmacy',         label: 'Pharmacy',         screens: pharmacyScreens,           prefix: '/pharmacy' },
  { to: '/patient',          label: 'Edit Patient Details', screens: [],                      prefix: '/patient' },
  { to: '/patient-history',  label: 'Patient History',  screens: [],                          prefix: '/patient-history' },
  { to: '/employee',         label: 'Employee',         screens: [],                          prefix: '/employee' },
  { to: '/ip-quotation',     label: 'IP Quotation',     screens: [],                          prefix: '/ip-quotation' },
  { to: '/qmps',             label: 'QMPS',             screens: [],                          prefix: '/qmps' },
  { to: '/staff-activity-audit', label: 'Staff Activity Audit', screens: [],                  prefix: '/staff-activity-audit' },
]

/** Single-admission discharge — not part of care context; drop when navigating away. */
function stripInpatientDischargeFlowParams(params: URLSearchParams): void {
  stripDischargeFlowParams(params)
}

/** Keep patient / mode / admission query params when switching sidebar screens. */
function buildScreenPath(basePath: string, screenId: string, currentSearch: string): string {
  const params = new URLSearchParams(currentSearch)
  stripInpatientDischargeFlowParams(params)
  params.set('screen', screenId)
  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

/** Role home link: drop screen only, keep care context query params. */
function buildRoleHomePath(basePath: string, currentSearch: string): string {
  const params = new URLSearchParams(currentSearch)
  stripInpatientDischargeFlowParams(params)
  params.delete('screen')
  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

// ─── Sidebar nav styling ──────────────────────────────────────────────────────

/** Active items keep the translucent fill and get a thin green outline. */
const SIDEBAR_ACTIVE_BORDER = 'border border-emerald-300'

const SIDEBAR_LINK =
  'flex-1 px-3 py-2 rounded-md bg-white/10 text-white border hover:bg-white/20 transition-colors'
const SIDEBAR_LINK_IDLE = 'border-transparent'
const SIDEBAR_LINK_ACTIVE = `${SIDEBAR_ACTIVE_BORDER} bg-white/10 text-white font-semibold`

const SIDEBAR_GROUP =
  'flex items-center gap-1.5 w-full min-w-0 px-2 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-colors text-left hover:bg-white/20 border'
const SIDEBAR_GROUP_IDLE = 'border-transparent text-white/80'
const SIDEBAR_GROUP_ACTIVE = `${SIDEBAR_ACTIVE_BORDER} text-white bg-white/10`

const SIDEBAR_CHEVRON =
  'p-1 rounded flex-shrink-0 text-white/70 hover:bg-white/20 transition-colors'

const SIDEBAR_SCREEN =
  'px-3 py-1.5 rounded-md text-xs bg-white/10 text-white border hover:bg-white/20 transition-colors'
const SIDEBAR_SCREEN_IDLE = 'border-transparent'
const SIDEBAR_SCREEN_ACTIVE = `${SIDEBAR_ACTIVE_BORDER} bg-white/10 text-white font-medium`

const OBSERVATION_SCREEN_IDS = new Set(['n-ob', 'r-observation', 'obs'])
const OBSERVATION_GROUP_TITLES = new Set(['Observation & Monitoring', 'Observation'])
/** Observation nav keeps a soft green fill when active. */
const SIDEBAR_OBSERVATION_ACTIVE =
  'bg-emerald-200/90 text-emerald-950 border border-emerald-400 font-medium'

function sidebarScreenClass(screenId: string, isActive: boolean): string {
  if (!isActive) return `${SIDEBAR_SCREEN} ${SIDEBAR_SCREEN_IDLE}`
  if (OBSERVATION_SCREEN_IDS.has(screenId)) {
    return `${SIDEBAR_SCREEN} ${SIDEBAR_OBSERVATION_ACTIVE}`
  }
  return `${SIDEBAR_SCREEN} ${SIDEBAR_SCREEN_ACTIVE}`
}

function sidebarGroupClass(groupTitle: string, isActive: boolean): string {
  if (!isActive) return `${SIDEBAR_GROUP} ${SIDEBAR_GROUP_IDLE}`
  if (OBSERVATION_GROUP_TITLES.has(groupTitle)) {
    return `${SIDEBAR_GROUP} ${SIDEBAR_OBSERVATION_ACTIVE}`
  }
  return `${SIDEBAR_GROUP} ${SIDEBAR_GROUP_ACTIVE}`
}

function sidebarRoleClass(isActive: boolean): string {
  return `${SIDEBAR_LINK} ${isActive ? SIDEBAR_LINK_ACTIVE : SIDEBAR_LINK_IDLE}`
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

  /** Keep role + folder expanded for the current route and active screen. */
  useEffect(() => {
    const pathname = location.pathname
    const screen = activeScreen

    setExpandedTopics((prev) => {
      const next = new Set(prev)
      for (const link of mainLinks) {
        const prefix = link.prefix || link.to
        if (pathname.startsWith(prefix)) {
          next.add(link.to)
        }
      }
      return next
    })

    if (!screen) return

    setExpandedGroups((prev) => {
      const next = new Set(prev)
      for (const link of mainLinks) {
        const prefix = link.prefix || link.to
        if (!pathname.startsWith(prefix)) continue
        for (const group of link.screenGroups ?? []) {
          if (group.screens.some((s) => s.id === screen)) {
            next.add(`${link.to}||${group.groupTitle}`)
          }
        }
      }
      return next
    })
  }, [location.pathname, activeScreen, mainLinks])

  const isRolePathActive = (prefix: string) => location.pathname.startsWith(prefix)

  /** Role row is highlighted when on that role (including any nested screen). */
  const isRoleNavActive = (prefix: string) => isRolePathActive(prefix)

  /** Folder row is highlighted when it contains the current screen on this role. */
  const isGroupNavActive = (prefix: string, screens: ScreenItem[]) =>
    isRolePathActive(prefix) && !!activeScreen && screens.some((s) => s.id === activeScreen)

  /** Leaf screen row is highlighted when it matches the current screen on this role. */
  const isScreenNavActive = (prefix: string, screenId: string) =>
    isRolePathActive(prefix) && activeScreen === screenId

  return (
    <AppShellContext.Provider value={shellContextValue}>
    <div className="h-screen overflow-hidden flex bg-muted">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={closeSidebar} />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`bg-primary bg-gradient-to-b from-white/[0.07] via-transparent to-black/25 text-white flex flex-col h-screen overflow-hidden fixed md:static z-40 shadow-xl shadow-black/10 transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } w-[240px]`}
      >
        {/* Logo */}
        <div className="bg-primary px-3 py-3 border-b border-white/10 flex items-center justify-center flex-shrink-0">
          <div className="w-full rounded-lg bg-white shadow-sm px-3 py-2.5 flex items-center justify-center">
            <img
              src={sereneLogo}
              alt="Serene Psychiatry Hospital"
              className="w-[180px] max-w-full h-auto object-contain select-none"
              draggable={false}
            />
          </div>
        </div>

        <SidebarCareModePicker />

        {/* Nav */}
        <nav className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-1 text-sm">
          {mainLinks.map((link) => {
            const rolePrefix = link.prefix || link.to
            const isExpanded  = expandedTopics.has(link.to)
            const hasGroups   = (link.screenGroups?.length ?? 0) > 0
            const hasScreens  = (link.screens?.length ?? 0) > 0
            const hasChildren = hasGroups || hasScreens
            const roleIsActive = isRoleNavActive(rolePrefix)

            return (
              <div key={link.to} className="flex flex-col gap-0.5">
                {/* Top-level link row — border on label only, not chevron */}
                <div className="flex items-center gap-0.5">
                  {hasChildren && (
                    <button
                      type="button"
                      onClick={() => toggleTopic(link.to)}
                      className={SIDEBAR_CHEVRON}
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded
                        ? <ChevronDown className="w-4 h-4" />
                        : <ChevronRight className="w-4 h-4" />}
                    </button>
                  )}
                  <NavLink
                    to={buildRoleHomePath(link.to, location.search)}
                    onClick={() => {
                      if (hasChildren) {
                        setExpandedTopics((prev) => new Set(prev).add(link.to))
                      }
                      closeSidebar()
                    }}
                    className={sidebarRoleClass(roleIsActive)}
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
                      const groupIsActive = isGroupNavActive(rolePrefix, group.screens)

                      // Folderless entries: an empty groupTitle renders its screens
                      // as direct sidebar items (no folder row, no indent).
                      if (!group.groupTitle) {
                        return (
                          <nav key={group.screens[0]?.id || 'flat'} className="flex flex-col gap-0.5">
                            {group.screens.map((s) => (
                              <NavLink
                                key={s.id}
                                to={buildScreenPath(link.to, s.id, location.search)}
                                onClick={closeSidebar}
                                className={sidebarScreenClass(
                                  s.id,
                                  isScreenNavActive(rolePrefix, s.id),
                                )}
                              >
                                {s.title}
                              </NavLink>
                            ))}
                          </nav>
                        )
                      }

                      return (
                        <div key={group.groupTitle} className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => toggleGroup(link.to, group.groupTitle)}
                              className={SIDEBAR_CHEVRON}
                              aria-label={groupExpanded ? 'Collapse folder' : 'Expand folder'}
                            >
                              {groupExpanded
                                ? <ChevronDown className="w-3 h-3" />
                                : <ChevronRight className="w-3 h-3" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleGroup(link.to, group.groupTitle)}
                              className={sidebarGroupClass(group.groupTitle, groupIsActive)}
                            >
                              <Folder className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
                              <span className="flex-1 truncate">{group.groupTitle}</span>
                            </button>
                          </div>

                          {groupExpanded && (
                            <nav className="flex flex-col gap-0.5 ml-4">
                              {group.screens.map((s) => (
                                <NavLink
                                  key={s.id}
                                  to={buildScreenPath(link.to, s.id, location.search)}
                                  onClick={closeSidebar}
                                  className={sidebarScreenClass(
                                    s.id,
                                    isScreenNavActive(rolePrefix, s.id),
                                  )}
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
                        className={sidebarScreenClass(
                          s.id,
                          isScreenNavActive(rolePrefix, s.id),
                        )}
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
          <BranchSelector placement="sidebar" />
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
          © {new Date().getFullYear()} Powered by <span className="font-semibold ml-1">Beveren Software Inc.</span>
        </footer>
      </main>
    </div>
    </AppShellContext.Provider>
  )
}