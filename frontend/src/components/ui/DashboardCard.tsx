import { useEffect, useState, type ReactNode } from 'react'
import { ArrowUpRight, ArrowDownLeft, Upload } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useCareContext } from '../../providers/CareContextProvider'
import {
  CardFilterContext,
  CardHeaderSlotContext,
  CardLeadingSlotContext,
  DashboardCompactClinicalContext,
  DashboardFullListingContext,
  DashboardLoadMoreContext,
} from '../../contexts/CardFilterContext'

/** Shared class for compact list/table typography (see global.css `.dense-listing`). */
export const DENSE_LISTING_CLASS = 'dense-listing'

/** @deprecated Use DENSE_LISTING_CLASS */
export const DENSE_CARD_LISTING_CLASS = DENSE_LISTING_CLASS

type CardHeaderActionsProps = {
  onAdd?: () => void
  addButtonTitle?: string
  onUpload?: () => void
  uploadButtonTitle?: string
  onOpenListing?: () => void
  listingScreen?: string
  openListingTitle?: string
}

/** Filter, add (+), and open full list (↗) — use on custom landing cards outside DashboardCard. */
export function CardHeaderActions({
  onAdd,
  addButtonTitle = 'Add',
  onUpload,
  uploadButtonTitle = 'Upload documents',
  onOpenListing,
  listingScreen,
  openListingTitle = 'Open full list',
  createDisabled = false,
  createDisabledTitle,
  expanded = false,
  collapseTitle = 'Collapse',
}: CardHeaderActionsProps & {
  createDisabled?: boolean
  createDisabledTitle?: string
  /** When true, the ↗ button becomes a ↙ collapse toggle. */
  expanded?: boolean
  collapseTitle?: string
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
      {onUpload && (
        <button
          type="button"
          onClick={onUpload}
          className="w-6 h-6 rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 flex items-center justify-center transition-colors flex-shrink-0"
          title={uploadButtonTitle}
          aria-label={uploadButtonTitle}
        >
          <Upload className="w-3.5 h-3.5" strokeWidth={2.25} />
        </button>
      )}
      {handleOpenListing && (
        <button
          type="button"
          onClick={handleOpenListing}
          className={`w-6 h-6 rounded-md border flex items-center justify-center transition-colors flex-shrink-0 ${
            expanded
              ? 'border-primary bg-primary/10 hover:bg-primary/20'
              : 'border-slate-300 bg-white hover:bg-slate-50'
          }`}
          title={expanded ? collapseTitle : openListingTitle}
          aria-label={expanded ? collapseTitle : openListingTitle}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ArrowDownLeft className="w-3.5 h-3.5 text-primary" strokeWidth={2.25} />
          ) : (
            <ArrowUpRight className="w-3.5 h-3.5 text-primary" strokeWidth={2.25} />
          )}
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
  onUpload,
  uploadButtonTitle,
  openListingTitle,
  children,
  className = '',
  addButtonTitle,
  noHeightLimit = false,
  fixedHeight = false,
  /** Taller fixed-height listing cards (more rows visible before scroll). */
  tall = false,
  compactClinicalLayout,
  requiresAttention = false,
  attentionLabel = 'Required — not completed',
  filterable = true,
  disableCreate = false,
  allowCreateOnClosedEpisode = false,
}: {
  /** Section title. Omit or pass empty when the nav tab already names the section. */
  title?: string
  /** Optional hint beside the title (e.g. Read-only). */
  titleAddon?: ReactNode
  /** Extra controls in the header row (before filter / + / listing). */
  headerExtra?: ReactNode
  onAdd?: () => void
  onUpload?: () => void
  uploadButtonTitle?: string
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
  /** Use a taller fixed viewport for listing-heavy cards. */
  tall?: boolean
  /** Brief summary table + ⓘ popover. Defaults to fixed-height dashboard tiles only. */
  compactClinicalLayout?: boolean
  /** Red highlight when a mandatory IP document is missing. */
  requiresAttention?: boolean
  attentionLabel?: string
  /** When false, hide filters for children (e.g. Patient List uses inline search only). */
  filterable?: boolean
  /** When true, disable + without hiding it (uses active visit/admission closed state by default). */
  disableCreate?: boolean
  /** Allow + even when the active visit/admission is closed (new OP visit / IP admission cards). */
  allowCreateOnClosedEpisode?: boolean
}) => {
  // Filters are shown inline on the card whenever the card is filterable.
  // Lists that need a custom filter toggle (e.g. after status tabs) set filterable={false}
  // and manage their own filter bar.
  const showFilters = filterable
  const { guardClinicalCreate, isActiveCareEpisodeClosed, activeCareBlockReason } = useCareContext()

  // ↗ toggles an in-place full-screen expand of this card (no route change); ↙ collapses it.
  const [expanded, setExpanded] = useState(false)
  // Leading slot — children can portal left-side header content (e.g. status tabs).
  const [leadingSlot, setLeadingSlot] = useState<HTMLElement | null>(null)
  // Header slot node — children (e.g. list toolbars) portal controls here, left of +/↗.
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  // When expanded, show the full listing (all columns/rows), not the compact tile layout.
  const fullList = noHeightLimit || expanded
  const useFixedHeight = fixedHeight && !fullList
  const compactClinical = compactClinicalLayout ?? useFixedHeight
  const sectionLabel = (title || '').trim()
  const resolvedAddTitle = addButtonTitle ?? (sectionLabel ? `Add ${sectionLabel}` : 'Add')
  const resolvedOpenListingTitle = openListingTitle ?? (sectionLabel ? `Expand ${sectionLabel}` : 'Expand')
  const createBlocked =
    disableCreate ?? (isActiveCareEpisodeClosed && !allowCreateOnClosedEpisode)
  const handleAdd = onAdd
    ? () => guardClinicalCreate(onAdd, { allowOnClosed: allowCreateOnClosedEpisode })
    : undefined

  return (
    <>
      {expanded && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[1px]"
          onClick={() => setExpanded(false)}
          aria-hidden
        />
      )}
      <section
        className={`dashboard-card rounded-lg p-3 sm:p-4 shadow-sm flex flex-col min-w-0 border ${
          requiresAttention ? '!bg-red-50/80 border-2 border-red-300/90 ring-1 ring-red-200/60' : 'border-slate-200/70'
        } ${
          expanded
            ? 'fixed inset-2 sm:inset-4 z-50 max-h-none overflow-auto shadow-2xl'
            : useFixedHeight
              ? tall
                ? 'h-[min(560px,75vh)] overflow-hidden'
                : 'h-[min(360px,58vh)] sm:h-[400px] overflow-hidden'
              : fullList
                ? 'flex-1 min-h-0'
                : ''
        } ${className}`}
        style={{ scrollbarWidth: 'thin' }}
      >
        <div className={`dashboard-card-head font-semibold mb-3 sm:mb-4 flex flex-wrap items-center justify-between flex-shrink-0 gap-x-2 gap-y-1.5 rounded-md px-3 py-2 text-slate-800 ${requiresAttention ? '!bg-red-200/70 !text-red-900' : ''}`}>
          <div className="flex items-center gap-2 min-w-0 flex-1 basis-[min(100%,12rem)]">
            {sectionLabel ? (
              <span className="truncate text-sm sm:text-base">
                {sectionLabel}
              </span>
            ) : null}
            {titleAddon}
            <span ref={setLeadingSlot} className="flex flex-wrap items-center gap-1.5 min-w-0" />
            {requiresAttention && (
              <span
                className="shrink-0 inline-flex items-center rounded-full bg-red-200/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-900"
                title={attentionLabel}
              >
                Required
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {headerExtra}
            <span ref={setHeaderSlot} className="contents" />
            <CardHeaderActions
              onAdd={handleAdd}
              addButtonTitle={resolvedAddTitle}
              onUpload={onUpload}
              uploadButtonTitle={uploadButtonTitle}
              onOpenListing={() => setExpanded((v) => !v)}
              openListingTitle={resolvedOpenListingTitle}
              collapseTitle={sectionLabel ? `Collapse ${sectionLabel}` : 'Collapse'}
              expanded={expanded}
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
            useFixedHeight
              ? `flex flex-col flex-1 min-h-0 dense-listing ${showFilters ? 'overflow-visible' : 'overflow-hidden'}`
              : fullList
                ? `flex flex-col flex-1 min-h-0 dense-listing ${showFilters ? 'overflow-visible' : 'overflow-hidden'}`
                : 'overflow-x-auto overflow-visible dense-listing'
          }
          style={{ scrollbarWidth: 'thin' }}
        >
          <DashboardFullListingContext.Provider value={fullList}>
            <DashboardCompactClinicalContext.Provider value={compactClinical}>
              <DashboardLoadMoreContext.Provider value={useFixedHeight}>
                <CardLeadingSlotContext.Provider value={leadingSlot}>
                  <CardHeaderSlotContext.Provider value={headerSlot}>
                    <CardFilterContext.Provider value={showFilters}>{children}</CardFilterContext.Provider>
                  </CardHeaderSlotContext.Provider>
                </CardLeadingSlotContext.Provider>
              </DashboardLoadMoreContext.Provider>
            </DashboardCompactClinicalContext.Provider>
          </DashboardFullListingContext.Provider>
        </div>
      </section>
    </>
  )
}
