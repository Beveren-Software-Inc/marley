import { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { doctorScreens } from '../../config/doctorScreens'

const mainLinks = [
  { to: '/doctor', label: 'Doctor' },
  { to: '/nurse', label: 'Nurse' },
  { to: '/lab', label: 'Lab' },
  { to: '/pharmacy', label: 'Pharmacy' },
  { to: '/patient', label: 'Patient' },
  { to: '/admin', label: 'Admin' }
]

const doctorSidebarScreens = doctorScreens.filter((s) =>
  ['pi', 'ah', 'dpn', 'dos', 'dn', 'med', 'lab', 'tpr', 'ipm', 'pkg'].includes(s.id)
)

export const AppShell = ({ children }: { children: ReactNode }) => {
  const location = useLocation()
  const isDoctor = location.pathname.startsWith('/doctor')

  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr] bg-muted">
      <aside className="bg-primary text-white p-4 flex flex-col gap-4">
        <div className="font-semibold text-lg mb-2">Healthcare</div>
        <nav className="flex flex-col gap-1 text-sm">
          {mainLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `px-3 py-2 rounded-md ${isActive ? 'bg-white text-primary' : 'bg-white/10 hover:bg-white/20'}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        {isDoctor && (
          <div className="mt-4 border-t border-white/20 pt-3 text-sm">
            <div className="text-xs uppercase tracking-wide text-white/70 mb-2">Doctor · Current IP Screens</div>
            <nav className="flex flex-col gap-1">
              {doctorSidebarScreens.map((s) => (
                <NavLink
                  key={s.id}
                  to={`/doctor?screen=${s.id}`}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-md text-xs ${
                      isActive ? 'bg-white text-primary' : 'bg-white/10 hover:bg-white/20'
                    }`
                  }
                >
                  {s.title}
                </NavLink>
              ))}
            </nav>
          </div>
        )}
      </aside>
      <main className="p-0">{children}</main>
    </div>
  )
}


