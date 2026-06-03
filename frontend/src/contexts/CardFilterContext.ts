import { createContext, useContext } from 'react'

// undefined = not inside a card (component uses its own internal toggle)
// boolean = card controls filter visibility
export const CardFilterContext = createContext<boolean | undefined>(undefined)
export const useCardFilters = () => useContext(CardFilterContext)

/** True when rendered inside a `DashboardCard` (dashboard tile, not full listing). */
export const useInDashboardCard = () => useContext(CardFilterContext) !== undefined

/** Compact columns + metadata popover — only on small fixed-height dashboard tiles. */
export const DashboardCompactClinicalContext = createContext(false)
export const useDashboardCompactClinical = () => useContext(DashboardCompactClinicalContext)
