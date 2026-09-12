import { createContext, useContext } from 'react'

export type AppShellContextValue = {
  sidebarOpen: boolean
  toggleSidebar: () => void
  closeSidebar: () => void
  /** Desktop only: sidebar collapsed to a thin expand control (Frappe-style). */
  sidebarCollapsed: boolean
  toggleSidebarCollapsed: () => void
  expandSidebar: () => void
}

export const AppShellContext = createContext<AppShellContextValue | null>(null)

export function useAppShell(): AppShellContextValue | null {
  return useContext(AppShellContext)
}

export const APP_SIDEBAR_WIDTH_EXPANDED = 240
/** Narrow rail shown on desktop when the full sidebar is collapsed. */
export const APP_SIDEBAR_WIDTH_COLLAPSED_RAIL = 32
/** Shared height for sidebar logo bar + main patient navbar (keeps them level). */
export const APP_TOPBAR_HEIGHT_PX = 60
export const APP_SIDEBAR_COLLAPSED_STORAGE_KEY = 'healthcare:sidebar-collapsed'
