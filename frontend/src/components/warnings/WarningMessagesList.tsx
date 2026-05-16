import { useEffect, useMemo, useState } from 'react'
import { useWarningMessages } from '../../hooks/useWarningMessages'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { DocDetailView } from '../ui/DocDetailView'
import type { NoPatientWarningScope, WarningMessageListQuery } from '../../services/warningMessages'
import { useCardFilters } from '../../contexts/CardFilterContext'
import { fetchHealthcarePractitioners, type LinkFieldOption } from '../../services/common'

// Helper function to strip HTML tags and clean text
const stripHtml = (html: string | undefined): string => {
  if (!html) return '-'

  const tmp = document.createElement('div')
  tmp.innerHTML = html

  const text = tmp.textContent || tmp.innerText || ''
  return text.trim().replace(/\s+/g, ' ') || '-'
}

interface WarningMessagesListProps {
  patient?: string
  /** When there is no patient filter: show only organisation notices, or all warnings (default). */
  noPatientScope?: NoPatientWarningScope
  onPatientClick?: (patient: string) => void
}

export const WarningMessagesList = ({
  patient,
  noPatientScope = 'all',
  onPatientClick,
}: WarningMessagesListProps) => {
  const cardFilters = useCardFilters()
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = cardFilters !== undefined ? cardFilters : showFiltersInternal
  const isInsideCard = cardFilters !== undefined

  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [typeFilter, setTypeFilter] = useState<'Medical' | 'Organisation' | ''>('')
  const [practitionerFilter, setPractitionerFilter] = useState('')
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])

  const listQuery: WarningMessageListQuery | undefined = useMemo(() => {
    if (noPatientScope === 'organisation') {
      return {
        typeOfWarning: 'Organisation',
        practitioner: practitionerFilter || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      }
    }
    return {
      typeOfWarning: typeFilter || undefined,
      practitioner: practitionerFilter || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    }
  }, [noPatientScope, typeFilter, practitionerFilter, fromDate, toDate])

  const { warnings, loading, error, refetch } = useWarningMessages(patient, noPatientScope, listQuery)
  const [detailName, setDetailName] = useState<string | null>(null)

  useEffect(() => {
    if (!practitionerOpen) return
    const t = setTimeout(() => {
      fetchHealthcarePractitioners(practitionerQuery || undefined)
        .then(setPractitionerOptions)
        .catch(() => setPractitionerOptions([]))
    }, practitionerQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [practitionerOpen, practitionerQuery])

  const hasActiveFilters = Boolean(
    practitionerFilter || fromDate || toDate || (noPatientScope !== 'organisation' && typeFilter),
  )

  const clearFilters = () => {
    setFromDate('')
    setToDate('')
    setTypeFilter('')
    setPractitionerFilter('')
    setPractitionerQuery('')
  }

  const selectedPractitionerLabel =
    practitionerOptions.find((o) => o.name === practitionerFilter)?.label || practitionerFilter || ''

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
      <div className="flex items-center justify-between px-2 py-2 border-b border-slate-200 flex-shrink-0 gap-2">
        <span className="text-xs font-medium text-slate-500">
          {warnings.length} warning{warnings.length !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-2">
          {!isInsideCard && (
            <button
              type="button"
              onClick={() => setShowFiltersInternal((p) => !p)}
              className={`p-1.5 rounded-md border transition-colors ${showFilters ? 'bg-primary/10 border-primary text-primary' : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}
              title={showFilters ? 'Hide filters' : 'Show filters'}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {showFilters && (
        <div className="flex flex-wrap items-end gap-3 px-3 py-2 border-b border-slate-100 bg-slate-50/80">
          {noPatientScope !== 'organisation' && (
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-xs font-medium text-slate-500">Type</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter((e.target.value as 'Medical' | 'Organisation' | '') || '')}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
              >
                <option value="">All types</option>
                <option value="Medical">Medical</option>
                <option value="Organisation">Organisation</option>
              </select>
            </div>
          )}
          {noPatientScope === 'organisation' && (
            <div className="text-xs text-slate-600 self-end pb-1">Organisation notices only</div>
          )}
          <div className="flex flex-col gap-1 min-w-[120px]">
            <label className="text-xs font-medium text-slate-500">Posting from</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[120px]">
            <label className="text-xs font-medium text-slate-500">Posting to</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[200px] relative">
            <label className="text-xs font-medium text-slate-500">Practitioner</label>
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
              placeholder="Search practitioner…"
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
          {hasActiveFilters && (
            <button type="button" onClick={clearFilters} className="text-xs text-slate-600 underline self-end pb-1">
              Clear filters
            </button>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto overflow-x-auto">
        {loading && warnings.length > 0 && (
          <div className="px-4 py-2 text-xs text-slate-500 border-b border-slate-100">Refreshing…</div>
        )}
        {warnings.length === 0 && !loading && (
          <div className="flex items-center justify-center p-8">
            <div className="text-slate-500">No warning messages found</div>
          </div>
        )}
        {warnings.length > 0 && (
          <table className="w-full min-w-[800px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {!patient && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Patient</th>
                )}
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Posting Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Practitioner</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Warning</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {warnings.map((warning) => (
                <tr key={warning.name} className="hover:bg-slate-50">
                  {!patient && (
                    <td
                      className="px-4 py-3 text-sm text-slate-700 cursor-pointer"
                      onClick={() => warning.patient && onPatientClick?.(warning.patient)}
                    >
                      <span className="font-medium text-primary hover:underline">
                        {warning.patient_name || warning.patient || '-'}
                      </span>
                      {warning.gender && <div className="text-xs text-slate-500">{warning.gender}</div>}
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm text-slate-700">{warning.type_of_warning || 'Medical'}</td>
                  <td
                    className="px-4 py-3 text-sm text-slate-700 cursor-pointer"
                    onClick={() => setDetailName(warning.name)}
                  >
                    <span className="text-primary hover:underline">
                      {warning.posting_date ? new Date(warning.posting_date).toLocaleString() : '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {warning.practitioner_name || warning.practitioner || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    <div className="max-w-md" title={stripHtml(warning.warning)}>
                      {stripHtml(warning.warning)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {warning.reference_name ? (
                      <div>
                        <div className="text-xs text-slate-500">{warning.reference_doc}</div>
                        <div>{warning.reference_name}</div>
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {detailName && (
        <DetailSlideOver title="Warning Message" subtitle={detailName} onClose={() => setDetailName(null)}>
          <DocDetailView doctype="Warning Message" name={detailName} onUpdate={refetch} />
        </DetailSlideOver>
      )}
    </div>
  )
}
