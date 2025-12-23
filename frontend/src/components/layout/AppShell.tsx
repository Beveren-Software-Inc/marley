import { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
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
]

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
]

const pharmacyScreens = [
  { id: 'p-expiry', title: 'Medicine Expiry Alerts' },
  { id: 'p-requests', title: 'Medication Requests' },
  { id: 'p-ipm', title: 'IP Medication Orders' },
  { id: 'p-given', title: 'Given Medicines History' },
  { id: 'p-stock', title: 'Stock Overview' }
]

const mainLinks = [
  { to: '/doctor', label: 'Doctor', screens: doctorScreens, prefix: '/doctor' },
  { to: '/nurse', label: 'Nurse', screens: nurseScreens, prefix: '/nurse' },
  { to: '/lab', label: 'Lab', screens: labScreens, prefix: '/lab' },
  { to: '/pharmacy', label: 'Pharmacy', screens: pharmacyScreens, prefix: '/pharmacy' },
  { to: '/patient', label: 'Patient', screens: [], prefix: '/patient' },
  { to: '/admin', label: 'Admin', screens: [], prefix: '/admin' }
]

export const AppShell = ({ children }: { children: ReactNode }) => {
  const location = useLocation()

  return (
    <div className="h-screen overflow-hidden grid grid-cols-[240px_1fr] bg-muted">
      <aside className="bg-primary text-white p-4 flex flex-col gap-4 h-screen overflow-y-auto">
        <div className="font-semibold text-lg mb-2">Healthcare</div>
        <nav className="flex flex-col gap-1 text-sm">
          {mainLinks.map((link) => {
            const isActiveGroup = location.pathname.startsWith(link.prefix)
            return (
              <div key={link.to} className="flex flex-col gap-1">
                <NavLink
                  to={link.to}
                  className={({ isActive }) =>
                    `px-3 py-2 rounded-md ${
                      isActive ? 'bg-white text-primary' : 'bg-white/10 hover:bg-white/20'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
                {isActiveGroup && link.screens.length > 0 && (
                  <nav className="flex flex-col gap-1 mt-1 ml-2 text-xs">
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
          © 2025 Powered by <span className="font-semibold ml-1">Beveren Software Inc</span>
        </footer>
      </main>
    </div>
  )
}


