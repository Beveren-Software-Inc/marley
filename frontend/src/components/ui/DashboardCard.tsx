import { useState, type ReactNode } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useCareContext } from '../../providers/CareContextProvider'
import {
  CardFilterContext,
  DashboardCompactClinicalContext,
} from '../../contexts/CardFilterContext'

/** Shared class for compact list/table typography (see global.css `.dense-listing`). */
export const DENSE_LISTING_CLASS = 'dense-listing'

/** @deprecated Use DENSE_LISTING_CLASS */
export const DENSE_CARD_LISTING_CLASS = DENSE_LISTING_CLASS

type CardHeaderActionsProps = {
  onAdd?: () => void
  addButtonTitle?: string
  onOpenListing?: () => void
  listingScreen?: string
  openListingTitle?: string
}

/** Filter, add (+), and open full list (↗) — use on custom landing cards outside DashboardCard. */
export function CardHeaderActions({
  onAdd,
  addButtonTitle = 'Add',
  onOpenListing,
  listingScreen,
  openListingTitle = 'Open full list',
  createDisabled = false,
  createDisabledTitle,
}: CardHeaderActionsProps & {
  createDisabled?: boolean
  createDisabledTitle?: string
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const handleOpenListing =
    onOpenListing ??
    (listingScreen
      ? () => {
          const sp = new URLSearchParams(searchParams)
          sp.set('screen', listingScreen)
          setSearchParams(sp, { replace: true })
        }
      : undefined)

  return (
    <div className="flex items-center gap-2 shrink-0">
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          disabled={createDisabled}
          className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors text-sm font-bold flex-shrink-0 ${
            createDisabled
              ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
              : 'bg-primary text-white hover:bg-primary/90'
          }`}
          title={createDisabled ? createDisabledTitle ?? addButtonTitle : addButtonTitle}
        >
          +
        </button>
      )}
      {handleOpenListing && (
        <button
          type="button"
          onClick={handleOpenListing}
          className="w-6 h-6 rounded-md border border-slate-300 bg-white flex items-center justify-center hover:bg-slate-50 transition-colors flex-shrink-0"
          title={openListingTitle}
          aria-label={openListingTitle}
        >
          <ArrowUpRight className="w-3.5 h-3.5 text-primary" strokeWidth={2.25} />
        </button>
      )}
    </div>
  )
}

export const DashboardCard = ({
  title,
  titleAddon,
  headerExtra,
  onAdd,
  onOpenListing,
  listingScreen,
  openListingTitle,
  children,
  className = '',
  addButtonTitle,
  noHeightLimit = false,
  fixedHeight = false,
  compactClinicalLayout,
  requiresAttention = false,
  attentionLabel = 'Required — not completed',
  filterable = true,
  disableCreate = false,
  allowCreateOnClosedEpisode = false,
}: {
  title: string
  /** Optional hint beside the title (e.g. Read-only). */
  titleAddon?: ReactNode
  /** Extra controls in the header row (before filter / + / listing). */
  headerExtra?: ReactNode
  onAdd?: () => void
  /** Navigate to full listing (sidebar screen). Use `listingScreen` or pass a custom handler. */
  onOpenListing?: () => void
  /** Query `screen` value for the full listing view, e.g. `rx`, `lab`, `n-given`. */
  listingScreen?: string
  openListingTitle?: string
  children: React.ReactNode
  className?: string
  addButtonTitle?: string
  noHeightLimit?: boolean
  fixedHeight?: boolean
  /** Brief summary table + ⓘ popover. Defaults to fixed-height dashboard tiles only. */
  compactClinicalLayout?: boolean
  /** Red highlight when a mandatory IP document is missing. */
  requiresAttention?: boolean
  attentionLabel?: string
  /** When false, hide the filter toggle (e.g. Patient List uses inline search only). */
  filterable?: boolean
  /** When true, disable + without hiding it (uses active visit/admission closed state by default). */
  disableCreate?: boolean
  /** Allow + even when the active visit/admission is closed (new OP visit / IP admission cards). */
  allowCreateOnClosedEpisode?: boolean
}) => {
  const [showFilters, setShowFilters] = useState(false)
  const { guardClinicalCreate, isActiveCareEpisodeClosed, activeCareBlockReason } = useCareContext()
  const compactClinical =
    compactClinicalLayout ?? (fixedHeight && !noHeightLimit)
  const resolvedAddTitle = addButtonTitle ?? `Add ${title}`
  const resolvedOpenListingTitle = openListingTitle ?? `Open full ${title} list`
  const createBlocked =
    disableCreate ?? (isActiveCareEpisodeClosed && !allowCreateOnClosedEpisode)
  const handleAdd = onAdd
    ? () => guardClinicalCreate(onAdd, { allowOnClosed: allowCreateOnClosedEpisode })
    : undefined

  return (
    <section
      className={`rounded-lg p-3 sm:p-4 shadow-sm flex flex-col min-w-0 ${
        requiresAttention
          ? 'bg-red-50/80 border-2 border-red-300/90 ring-1 ring-red-200/60'
          : 'bg-white border border-slate-200'
      } ${
        fixedHeight && !noHeightLimit
          ? 'min-h-[min(280px,45vh)] max-h-[min(360px,58vh)] sm:min-h-[400px] sm:max-h-[400px]'
          : ''
      } ${className}`}
    >
      <div className="font-semibold mb-3 sm:mb-4 flex flex-wrap items-center justify-between flex-shrink-0 gap-x-2 gap-y-2">
        <div className="flex items-center gap-2 min-w-0 flex-1 basis-[min(100%,12rem)]">
          <span className={`truncate text-sm sm:text-base ${requiresAttention ? 'text-red-950' : undefined}`}>
            {title}
          </span>
          {titleAddon}
          {requiresAttention && (
            <span
              className="shrink-0 inline-flex items-center rounded-full bg-red-200/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-900"
              title={attentionLabel}
            >
              Required
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {headerExtra}
          {filterable && (
            <button
              type="button"
              onClick={() => setShowFilters((prev) => !prev)}
              className={`p-1 rounded-md border transition-colors ${showFilters ? 'bg-primary/10 border-primary text-primary' : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}
              title={showFilters ? 'Hide filters' : 'Show filters'}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
                />
              </svg>
            </button>
          )}
          <CardHeaderActions
            onAdd={handleAdd}
            addButtonTitle={resolvedAddTitle}
            onOpenListing={onOpenListing}
            listingScreen={listingScreen}
            openListingTitle={resolvedOpenListingTitle}
            createDisabled={createBlocked}
            createDisabledTitle={activeCareBlockReason}
          />
        </div>
      </div>
      {/*
        Avoid overflow-y on this wrapper: it clips native <select> menus and absolute filter dropdowns.
        Fixed-height cards rely on children using flex-1 min-h-0 overflow-auto on the table region.
      */}
      <div
        className={
          fixedHeight && !noHeightLimit
            ? `flex flex-col flex-1 min-h-0 dense-listing ${showFilters ? 'overflow-visible' : 'overflow-hidden'}`
            : 'overflow-x-auto overflow-visible dense-listing'
        }
        style={{ scrollbarWidth: 'thin' }}
      >
        <DashboardCompactClinicalContext.Provider value={compactClinical}>
          <CardFilterContext.Provider value={showFilters}>{children}</CardFilterContext.Provider>
        </DashboardCompactClinicalContext.Provider>
      </div>
    </section>
  )
}
