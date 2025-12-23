import { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { doctorScreens } from '../../config/doctorScreens'

const mainLinks = [
  { to: '/nurse', label: 'Nurse' },
  { to: '/lab', label: 'Lab' },
  { to: '/pharmacy', label: 'Pharmacy' },
  { to: '/patient', label: 'Patient' },
  { to: '/admin', label: 'Admin' }
]

const doctorSidebarScreens = doctorScreens

export const AppShell = ({ children }: { children: ReactNode }) => {
  const location = useLocation()
  const isDoctor = location.pathname.startsWith('/doctor')

  return (
    <div className="h-screen overflow-hidden grid grid-cols-[240px_1fr] bg-muted">
      <aside className="bg-primary text-white p-4 flex flex-col gap-4 h-screen overflow-y-auto">
        <div className="font-semibold text-lg mb-2">Healthcare</div>
        <nav className="flex flex-col gap-1 text-sm">
          {/* Doctor main link with dropdown of current IP screens */}
          <div className="flex flex-col gap-1">
            <NavLink
              to="/doctor"
              className={({ isActive }) =>
                `px-3 py-2 rounded-md ${isActive ? 'bg-white text-primary' : 'bg-white/10 hover:bg-white/20'}`
              }
            >
              Doctor
            </NavLink>
            {isDoctor && (
              <nav className="flex flex-col gap-1 mt-1 ml-2 text-xs">
                {doctorSidebarScreens.map((s) => (
                  <NavLink
                    key={s.id}
                    to={`/doctor?screen=${s.id}`}
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

          {/* Other main links */}
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


