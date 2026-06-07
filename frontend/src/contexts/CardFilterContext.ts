import { createContext, useContext } from 'react'

// undefined = not inside a card (component uses its own internal toggle)
// boolean = card controls filter visibility
export const CardFilterContext = createContext<boolean | undefined>(undefined)
export const useCardFilters = () => useContext(CardFilterContext)

/** True when rendered inside a `DashboardCard` (dashboard tile, not full listing). */
export const useInDashboardCard = () => useContext(CardFilterContext) !== undefined

/** Full listing inside a card (`noHeightLimit`) — show pagination, not compact preview. */
export const DashboardFullListingContext = createContext(false)
export const useDashboardFullListing = () => useContext(DashboardFullListingContext)

/** Compact columns + metadata popover — only on small fixed-height dashboard tiles. */
export const DashboardCompactClinicalContext = createContext(false)
export const useDashboardCompactClinical = () => useContext(DashboardCompactClinicalContext)
