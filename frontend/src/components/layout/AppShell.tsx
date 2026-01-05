import type { ReactNode } from 'react'
import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { doctorScreens } from '../../config/doctorScreens'

const nurseScreens = [
  { id: 'n-first', title: 'IP Warnings / Meds / Allergy' },
  { id: 'n-labs', title: 'Lab Reports Status' },
  { id: 'n-med', title: 'Medication' },
  { id: 'n-given', title: 'Given Medicines' },
  { id: 'n-doc-notes', title: 'Doctors Notes' },
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
  { id: 'n-reg', title: 'Admission Register' }
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

const pharmacyScreens = [
  { id: 'p-expiry', title: 'Medicine Expiry Alerts' },
  { id: 'p-requests', title: 'Medication Requests' },
  { id: 'p-ipm', title: 'IP Medication Orders' },
  { id: 'p-given', title: 'Given Medicines History' },
  { id: 'p-stock', title: 'Stock Overview' }
].sort((a, b) => a.title.localeCompare(b.title))

const receptionScreens = [
  { id: 'r-new-op', title: 'New OP Registration' },
  { id: 'r-search', title: 'Search Existing Patient' },
  { id: 'r-appointment', title: 'Book Appointment' },
  { id: 'r-check', title: 'Check In / Check Out' },
  { id: 'r-ip-adm', title: 'New IP Admission' },
  { id: 'r-reg', title: 'Admission Register' },
  { id: 'r-print', title: 'Print Forms / Labels' }
].sort((a, b) => a.title.localeCompare(b.title))

const mainLinks = [
  { to: '/doctor', label: 'Doctor', screens: doctorScreens, prefix: '/doctor' },
  { to: '/nurse', label: 'Nurse', screens: nurseScreens, prefix: '/nurse' },
  { to: '/lab', label: 'Lab', screens: labScreens, prefix: '/lab' },
  { to: '/pharmacy', label: 'Pharmacy', screens: pharmacyScreens, prefix: '/pharmacy' },
  { to: '/reception', label: 'Reception', screens: receptionScreens, prefix: '/reception' },
  { to: '/patient', label: 'Patient', screens: [], prefix: '/patient' },
  { to: '/admin', label: 'Admin', screens: [], prefix: '/admin' }
]

export const AppShell = ({ children }: { children: ReactNode }) => {
  // Track which topics have their subtopics expanded
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set())

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

  return (
    <div className="h-screen overflow-hidden grid grid-cols-[240px_1fr] bg-muted">
      <aside className="bg-primary text-white flex flex-col h-screen overflow-hidden">
        <div className="bg-primary text-white px-4 py-3 border-b border-white/0 flex items-center h-[60px] flex-shrink-0">
          <div className="font-semibold text-lg">Healthcare</div>
        </div>
        {/* Navigation section below header */}
        <nav className="flex-1 overflow-y-auto p-4 flex flex-col gap-1 text-sm">
          {mainLinks.map((link) => {
            const isExpanded = expandedTopics.has(link.to)
            const hasScreens = link.screens.length > 0
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
                    className={({ isActive }) =>
                      `flex-1 px-3 py-2 rounded-md ${
                        isActive ? 'bg-white text-primary' : 'bg-white/10 hover:bg-white/20'
                      }`
                    }
                  >
                    {link.label}
                  </NavLink>
                </div>
                {showSubtopics && (
                  <nav className="flex flex-col gap-1 mt-1 ml-6 text-xs">
                    {link.screens.map((s) => (
                      <NavLink
                        key={s.id}
                        to={`${link.to}?screen=${s.id}`}
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
      <main className="p-0 h-screen flex flex-col">
        <div className="flex-1 overflow-y-auto">{children}</div>
        <footer className="h-9 flex items-center justify-end px-4 text-[11px] text-white bg-gradient-to-r from-primary/70 via-primary to-primary/60">
          © 2025 Powered by <span className="font-semibold ml-1">Beveren Software Inc.</span>
        </footer>
      </main>
    </div>
  )
}


