import { useEffect, useMemo, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { useWarningMessages } from '../../hooks/useWarningMessages'
import type { NoPatientWarningScope, WarningMessage, WarningMessageListQuery } from '../../services/warningMessages'
import { markStickyNoteVerified } from '../../services/warningMessages'
import { WarningMessageDetailPanel } from './WarningMessageDetailPanel'
import { useCardFilters, usePreferCardLoadMore } from '../../contexts/CardFilterContext'
import { fetchHealthcarePractitioners, type LinkFieldOption } from '../../services/common'
import { dashboardCardRowHoverClass } from '../ui/dashboardCardListing'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import { DateFilterInput } from '../ui/DateFilterInput'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { PaginationControls, LoadMoreControls, DEFAULT_PAGE_SIZE, type PageSize } from '../ui/PaginationControls'

// Format a datetime as "dd/mm/yyyy" + "HH:mm" (24h, no seconds)
const formatPostingDateTime = (val?: string | null): { date: string; time: string } => {
  if (!val) return { date: '-', time: '' }
  const d = new Date(val)
  if (isNaN(d.getTime())) return { date: val, time: '' }
  return {
    date: d.toLocaleDateString('en-GB'),
    time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
  }
}

// Helper function to strip HTML tags and clean text
const stripHtml = (html: string | undefined): string => {
  if (!html) return '-'

  const tmp = document.createElement('div')
  tmp.innerHTML = html

  const text = tmp.textContent || tmp.innerText || ''
  return text.trim().replace(/\s+/g, ' ') || '-'
}

const getWarningPreviewText = (warning: WarningMessage): string =>
  stripHtml(warning.warning || warning.reported_information)

interface WarningMessagesListProps {
  patient?: string
  /** When there is no patient filter: show only organisation notices, or all warnings (default). */
  noPatientScope?: NoPatientWarningScope
  specialPhoneScope?: 'standard' | 'special_only' | 'all'
  onPatientClick?: (patient: string) => void
  title?: string
  onAdd?: () => void
  addButtonTitle?: string
}

export const WarningMessagesList = ({
  patient,
  noPatientScope = 'all',
  specialPhoneScope = 'standard',
  onPatientClick,
  title = 'Warnings & Allergies',
  onAdd,
  addButtonTitle = 'Add Warning Message',
}: WarningMessagesListProps) => {
  const cardFilters = useCardFilters()
  const preferLoadMore = usePreferCardLoadMore()
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = cardFilters !== undefined ? cardFilters : showFiltersInternal
  const inDashboardCard = cardFilters !== undefined

  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [typeFilter, setTypeFilter] = useState<'Medical' | 'Organisation' | ''>('')
  const [practitionerFilter, setPractitionerFilter] = useState('')
  const [includeSpecialPhoneWarnings, setIncludeSpecialPhoneWarnings] = useState(false)
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE)

  const listQuery: WarningMessageListQuery | undefined = useMemo(() => {
    if (noPatientScope === 'organisation') {
      return {
        typeOfWarning: 'Organisation',
        practitioner: practitionerFilter || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        includeSpecialPhoneWarnings,
        specialPhoneScope,
      }
    }
    return {
      typeOfWarning: typeFilter || undefined,
      practitioner: practitionerFilter || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      includeSpecialPhoneWarnings,
      specialPhoneScope,
    }
  }, [noPatientScope, typeFilter, practitionerFilter, fromDate, toDate, includeSpecialPhoneWarnings, specialPhoneScope])

  useEffect(() => {
    setPage(1)
  }, [patient, noPatientScope, typeFilter, practitionerFilter, fromDate, toDate, includeSpecialPhoneWarnings, specialPhoneScope])

  const { warnings, totalCount, loading, error, refetch } = useWarningMessages(
    patient,
    noPatientScope,
    listQuery,
    page,
    pageSize,
    preferLoadMore,
  )
  const [detailWarning, setDetailWarning] = useState<WarningMessage | null>(null)
  const [actionMenuOpenFor, setActionMenuOpenFor] = useState<string | null>(null)
  const actionMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!practitionerOpen) return
    const t = setTimeout(() => {
      fetchHealthcarePractitioners(practitionerQuery || undefined)
        .then(setPractitionerOptions)
        .catch(() => setPractitionerOptions([]))
    }, practitionerQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [practitionerOpen, practitionerQuery])

  useEffect(() => {
    const handleWarningUpdated = () => {
      refetch()
    }
    window.addEventListener('warning-message-updated', handleWarningUpdated)
    return () => window.removeEventListener('warning-message-updated', handleWarningUpdated)
  }, [refetch])

  const allowIncludeSpecialToggle = specialPhoneScope !== 'special_only'

  const hasActiveFilters = Boolean(
    practitionerFilter ||
      fromDate ||
      toDate ||
      (allowIncludeSpecialToggle && includeSpecialPhoneWarnings) ||
      (noPatientScope !== 'organisation' && typeFilter),
  )

  const clearFilters = () => {
    setFromDate('')
    setToDate('')
    setTypeFilter('')
    setPractitionerFilter('')
    setPractitionerQuery('')
    if (allowIncludeSpecialToggle) setIncludeSpecialPhoneWarnings(false)
  }

  const selectedPractitionerLabel =
    practitionerOptions.find((o) => o.name === practitionerFilter)?.label || practitionerFilter || ''

  const allowGlobalStickyNotes = specialPhoneScope === 'special_only'

  // Regular warnings stay patient-scoped. Sticky notes can be viewed globally.
  if (!patient && !allowGlobalStickyNotes) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Search for patient to view the list
        </p>
      </div>
    )
  }

  if (loading && warnings.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading warning messages...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Warning Messages</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-w-full flex flex-col flex-1 min-h-0 h-full">
      {!inDashboardCard && (
        <div className="flex items-center justify-between gap-2 mb-3 flex-shrink-0">
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowFiltersInternal((p) => !p)}
              className={`p-1.5 rounded-md border transition-colors ${showFilters ? 'bg-primary/10 border-primary text-primary' : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}
              title={showFilters ? 'Hide filters' : 'Show filters'}
              aria-label={showFilters ? 'Hide filters' : 'Show filters'}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
                />
              </svg>
            </button>
            {onAdd && (
              <button
                type="button"
                onClick={onAdd}
                className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-lg font-bold flex-shrink-0"
                title={addButtonTitle}
              >
                +
              </button>
            )}
          </div>
        </div>
      )}

      {showFilters && (
        <div className="card-filter-bar flex flex-wrap items-end gap-3 px-3 py-2 border-b border-slate-100 bg-slate-50/80">
          {noPatientScope !== 'organisation' && specialPhoneScope !== 'special_only' && (
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-xs font-medium text-slate-500">Type</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter((e.target.value as 'Medical' | 'Organisation' | '') || '')}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
              >
                <option value="">Select All</option>
                <option value="Medical">Medical</option>
                <option value="Organisation">Organisation</option>
              </select>
            </div>
          )}
          {/* {noPatientScope === 'organisation' && (
            <div className="text-xs text-slate-600 self-end pb-1">Organisation notices only</div>
          )} */}
          <div className="flex flex-col gap-1 min-w-[120px]">
            <label className="text-xs font-medium text-slate-500">From Date</label>
            <DateFilterInput
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[120px]">
            <label className="text-xs font-medium text-slate-500">To Date</label>
            <DateFilterInput
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[200px] relative">
            <label className="text-xs font-medium text-slate-500">Doctor</label>
            <input
              type="text"
              value={practitionerOpen ? practitionerQuery : selectedPractitionerLabel}
              onChange={(e) => {
                setPractitionerQuery(e.target.value)
                setPractitionerOpen(true)
                if (!e.target.value) setPractitionerFilter('')
              }}
              onFocus={() => setPractitionerOpen(true)}
              onBlur={() => setTimeout(() => setPractitionerOpen(false), 150)}
              placeholder="Search doctor…"
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white w-full"
            />
            {practitionerOpen && practitionerOptions.length > 0 && (
              <ul className="absolute z-20 top-full left-0 right-0 mt-0.5 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white shadow text-sm">
                {practitionerOptions.map((o) => (
                  <li key={o.name}>
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 hover:bg-slate-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setPractitionerFilter(o.name)
                        setPractitionerQuery('')
                        setPractitionerOpen(false)
                      }}
                    >
                      {o.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {allowIncludeSpecialToggle ? (
            <label className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={includeSpecialPhoneWarnings}
                onChange={(e) => setIncludeSpecialPhoneWarnings(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
              />
              Show special phone warnings
            </label>
          ) : null}
          {hasActiveFilters ? <ClearFiltersButton onClick={clearFilters} /> : null}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto overflow-x-auto">
        {loading && warnings.length > 0 && (
          <div className="px-4 py-2 text-xs text-slate-500 border-b border-slate-100">Refreshing…</div>
        )}
        {warnings.length === 0 && !loading && (
          <div className="flex items-center justify-center p-8">
            <div className="text-slate-500">NO WARNING MESSAGES FOUND</div>
          </div>
        )}
        {warnings.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap w-px">Posting Date</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap w-px">Doctor Name</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap w-px">Medical Role</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap w-px">Type</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase w-full">Message</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap w-px">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {warnings.map((warning) => {
                const text = getWarningPreviewText(warning)
                const posted = formatPostingDateTime(warning.posting_date)
                return (
                  <tr
                    key={warning.name}
                    className={dashboardCardRowHoverClass}
                    onClick={() => setDetailWarning(warning)}
                  >
                    <td className="px-3 py-2.5 text-sm text-slate-600 whitespace-nowrap w-px align-top">
                      <div>{posted.date}</div>
                      {posted.time && <div className="text-xs text-slate-400">{posted.time}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-slate-700 whitespace-nowrap w-px align-top">{warning.practitioner_name || warning.practitioner || '-'}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-700 whitespace-nowrap w-px align-top">{warning.medical_role || '-'}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-700 whitespace-nowrap w-px align-top">{warning.type_of_warning || 'Medical'}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-800 align-top">
                      {warning.is_special_phone_warning ? (
                        <div className="mb-1 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                            Sticky Note
                          </span>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                              (warning.verification_status || '').toLowerCase() === 'verified'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {(warning.verification_status || 'Unverified').toUpperCase()}
                          </span>
                        </div>
                      ) : null}
                      <div className="line-clamp-3 font-medium" title={text}>{text}</div>
                    </td>
                    <td className="px-3 py-2.5 text-sm text-slate-700 whitespace-nowrap w-px align-top">
                      <div className="inline-flex items-center gap-1">
                        <div className="relative" ref={actionMenuOpenFor === warning.name ? actionMenuRef : undefined}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setActionMenuOpenFor((prev) => (prev === warning.name ? null : warning.name))
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                          aria-label="Open actions"
                        >
                          <MoreHorizontal className="h-4 w-4" aria-hidden />
                        </button>
                          <PortalActionsMenu
                            open={actionMenuOpenFor === warning.name}
                            onClose={() => setActionMenuOpenFor(null)}
                            triggerRef={actionMenuRef}
                            minWidth={160}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setDetailWarning(warning)
                                setActionMenuOpenFor(null)
                              }}
                              className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                            >
                              Open
                            </button>
                            {warning.is_special_phone_warning &&
                            (warning.verification_status || '').toLowerCase() !== 'verified' ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  await markStickyNoteVerified(warning.name)
                                  setActionMenuOpenFor(null)
                                  await refetch()
                                }}
                                className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                              >
                                Mark Verified
                              </button>
                            ) : null}
                          </PortalActionsMenu>
                        </div>
                        <PrintFormatDropdown
                          doctype="Warning Message"
                          docName={warning.name}
                          noLetterhead={0}
                          triggerPrint={1}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-slate-300 bg-white text-primary hover:bg-slate-50"
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : null}
      </div>

      {preferLoadMore ? (
        <LoadMoreControls
          loadedCount={warnings.length}
          totalCount={totalCount}
          pageSize={pageSize}
          loading={loading}
          onLoadMore={() => setPage((p) => p + 1)}
        />
      ) : (
        <PaginationControls
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          loading={loading}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
        />
      )}

      {detailWarning ? (
        <WarningMessageDetailPanel
          name={detailWarning.name}
          preview={detailWarning}
          onClose={() => setDetailWarning(null)}
          onPatientClick={onPatientClick}
        />
      ) : null}
    </div>
  )
}
