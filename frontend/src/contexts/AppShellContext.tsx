import { createContext, useContext } from 'react'

export type AppShellContextValue = {
  sidebarOpen: boolean
  toggleSidebar: () => void
  closeSidebar: () => void
}

export const AppShellContext = createContext<AppShellContextValue | null>(null)

export function useAppShell(): AppShellContextValue | null {
  return useContext(AppShellContext)
}
