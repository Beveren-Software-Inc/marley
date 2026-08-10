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

/**
 * Header slot node for a `DashboardCard` — a list rendered inside a card can portal
 * extra controls (e.g. PDF/Excel) into the header, to the left of the +/↗ buttons.
 * null when not inside a card (or the slot hasn't mounted yet).
 */
export const CardHeaderSlotContext = createContext<HTMLElement | null>(null)
export const useCardHeaderSlot = () => useContext(CardHeaderSlotContext)

/**
 * Leading (left) header slot for a `DashboardCard` — e.g. status filter tabs in place of
 * a repeated section title. null when not inside a card (or the slot hasn't mounted yet).
 */
export const CardLeadingSlotContext = createContext<HTMLElement | null>(null)
export const useCardLeadingSlot = () => useContext(CardLeadingSlotContext)
