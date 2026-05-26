import { Menu, X } from 'lucide-react'
import { useAppShell } from '../../contexts/AppShellContext'

type MobileNavMenuButtonProps = {
  className?: string
}

/** Opens the app sidebar on phones/tablets; sits inline in the portal header beside patient search. */
export function MobileNavMenuButton({ className = '' }: MobileNavMenuButtonProps) {
  const shell = useAppShell()
  if (!shell) return null

  const { sidebarOpen, toggleSidebar } = shell

  return (
    <button
      type="button"
      onClick={toggleSidebar}
      className={`md:hidden shrink-0 p-2 rounded-md border border-white/30 bg-white/10 text-white hover:bg-white/20 transition-colors ${className}`}
      aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
    >
      {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
    </button>
  )
}
