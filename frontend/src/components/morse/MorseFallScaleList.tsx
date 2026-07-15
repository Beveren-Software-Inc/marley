import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchHealthcarePractitioners,
  getCurrentUserPractitionerOption,
  type LinkFieldOption,
} from '../../services/common'
import { isDoctorRole } from '../../config/permissions'
import {
  fetchMorseFallScales,
  type MorseFallScale,
  type MorseFallScaleListFilters,
} from '../../services/morseFallScale'
import { useCardFilters } from '../../contexts/CardFilterContext'
import { useCareContext } from '../../providers/CareContextProvider'
import { CreateMorseFallScaleModal } from './CreateMorseFallScaleModal'
import { MorseFallScaleDetailPanel } from './MorseFallScaleDetailPanel'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { DateFilterInput } from '../ui/DateFilterInput'

interface MorseFallScaleListProps {
  patient?: string
  patientName?: string
  refreshKey?: number
  onPatientClick?: (patient: string) => void
  defaultAdmission?: string
  /** When false, hide create controls (e.g. doctor read-only view). Default true. */
  allowCreate?: boolean
  createModalOpen?: boolean
  onCreateModalOpenChange?: (open: boolean) => void
  onRecordCreated?: () => void
}

const FilterToggleButton = ({
  active,
  onClick,
}: {
  active: boolean
  onClick: () => void
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`p-1.5 rounded-md border transition-colors ${
      active ? 'bg-primary/10 border-primary text-primary' : 'border-slate-300 text-slate-500 hover:bg-slate-50'
    }`}
    title={active ? 'Hide filters' : 'Show filters'}
  >
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
      />
    </svg>
  </button>
)

function getRiskLevel(total: number): { label: string; className: string } {
  if (total < 25) return { label: 'No Risk', className: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
  if (total < 51) return { label: 'Low Risk', className: 'text-yellow-700 bg-yellow-50 border-yellow-200' }
  return { label: 'High Risk', className: 'text-red-700 bg-red-50 border-red-200' }
}

function formatDate(value?: string): string {
  if (!value) return '—'
  try {
    const d = new Date(value)
    if (!isNaN(d.getTime())) return d.toLocaleDateString('en-GB')
  } catch {
    /* ignore */
  }
  return value
}

export const MorseFallScaleList = ({
  patient,
  patientName,
  refreshKey,
  onPatientClick,
  defaultAdmission,
  allowCreate = true,
  createModalOpen,
  onCreateModalOpenChange,
  onRecordCreated,
}: MorseFallScaleListProps) => {
  const cardFilters = useCardFilters()
  const inDashboardCard = cardFilters !== undefined
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = inDashboardCard ? cardFilters : showFiltersInternal

  const { guardClinicalCreate, userRole } = useCareContext()
  const [rows, setRows] = useState<MorseFallScale[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [internalCreateOpen, setInternalCreateOpen] = useState(false)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const actionMenuRef = useRef<HTMLDivElement>(null)

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [practitionerFilter, setPractitionerFilter] = useState('')
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerQuery, setPractitionerQuery] = useState('')

  // Doctors get the filter pre-applied to their own records; nurses and other roles start unfiltered.
  const practitionerDefaultApplied = useRef(false)
  useEffect(() => {
    if (practitionerDefaultApplied.current) return
    if (!isDoctorRole(userRole)) return
    practitionerDefaultApplied.current = true
    let cancelled = false
    getCurrentUserPractitionerOption()
      .then((opt) => {
        if (cancelled || !opt) return
        setPractitionerOptions((prev) => (prev.some((p) => p.name === opt.name) ? prev : [opt, ...prev]))
        setPractitionerFilter(opt.name)
        setPractitionerQuery(opt.label || opt.name)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [userRole])

  const showCreateModal = createModalOpen ?? internalCreateOpen
  const setShowCreateModal = onCreateModalOpenChange ?? setInternalCreateOpen

  const listFilters: MorseFallScaleListFilters = {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    practitioner: practitionerFilter || undefined,
  }

  const hasActiveFilters = Boolean(dateFrom || dateTo || practitionerFilter)

  const loadRows = useCallback(async () => {
    if (!patient) {
      setRows([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError(null)
      const data = await fetchMorseFallScales(50, 0, patient, listFilters)
      setRows(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Morse Fall Scale records')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [patient, dateFrom, dateTo, practitionerFilter])

  useEffect(() => {
    loadRows()
  }, [loadRows, refreshKey])

  useEffect(() => {
    if (!practitionerOpen) return
    const t = setTimeout(async () => {
      try {
        const opts = await fetchHealthcarePractitioners(practitionerQuery || undefined)
        setPractitionerOptions(opts)
      } catch {
        setPractitionerOptions([])
      }
    }, practitionerQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [practitionerQuery, practitionerOpen])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('[data-portal-actions-menu]')) return
      if (el.closest('button[aria-label="Actions"]')) return
      if (el.closest('[data-morse-practitioner-filter]')) return
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setOpenActionRow(null)
      }
      setPractitionerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const clearFilters = () => {
    setDateFrom('')
    setDateTo('')
    setPractitionerFilter('')
    setPractitionerQuery('')
    setPractitionerOpen(false)
  }

  const handleCreateSuccess = () => {
    setShowCreateModal(false)
    loadRows()
    onRecordCreated?.()
  }

  const handleView = (name: string) => {
    setOpenActionRow(null)
    setDetailName(name)
  }

  const detailRow = detailName ? rows.find((r) => r.name === detailName) : undefined

  if (!patient) {
    return (
      <>
        {!inDashboardCard && (
          <div className="font-semibold mb-3">
            <span>Morse Fall Scale</span>
          </div>
        )}
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-md px-4 py-3 text-sm">
          SEARCH PATIENT TO VIEW MORSE FALL SCALE
        </div>
      </>
    )
  }

  return (
    <>
      {!inDashboardCard && (
        <div className="font-semibold mb-3 flex items-center justify-between gap-2">
          <span>Morse Fall Scale</span>
          <div className="flex items-center gap-2 shrink-0">
            <FilterToggleButton
              active={Boolean(showFilters)}
              onClick={() => setShowFiltersInternal((prev) => !prev)}
            />
            {allowCreate ? (
              <button
                type="button"
                onClick={() => guardClinicalCreate(() => setShowCreateModal(true))}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Create Morse Fall Scale"
              >
                +
              </button>
            ) : null}
          </div>
        </div>
      )}

      {showFilters && (
        <div className="card-filter-bar flex flex-wrap items-end gap-3 mb-3 px-1 py-2 border-b border-slate-100 bg-slate-50/80 rounded-md">
          <div className="flex flex-col gap-1 min-w-[130px]">
            <label className="text-xs font-medium text-slate-500">From Date</label>
            <DateFilterInput
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[130px]">
            <label className="text-xs font-medium text-slate-500">To Date</label>
            <DateFilterInput
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            />
          </div>
          <div data-morse-practitioner-filter className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-xs font-medium text-slate-500">Doctor</label>
            <div className="relative">
              <input
                type="text"
                value={
                  practitionerFilter
                    ? practitionerOptions.find((p) => p.name === practitionerFilter)?.label || practitionerQuery || practitionerFilter
                    : practitionerQuery
                }
                onChange={(e) => {
                  setPractitionerQuery(e.target.value)
                  setPractitionerFilter('')
                  setPractitionerOpen(true)
                }}
                onFocus={() => setPractitionerOpen(true)}
                placeholder="Search doctor…"
                className={`w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary ${
                  practitionerFilter ? 'pr-8' : ''
                }`}
              />
              {practitionerFilter && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label="Clear practitioner filter"
                  onClick={() => {
                    setPractitionerFilter('')
                    setPractitionerQuery('')
                    setPractitionerOpen(false)
                  }}
                >
                  ×
                </button>
              )}
              {practitionerOpen && practitionerOptions.length > 0 && (
                <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-auto">
                  {practitionerOptions.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setPractitionerFilter(p.name)
                        setPractitionerQuery(p.label || p.name)
                        setPractitionerOpen(false)
                      }}
                    >
                      {p.label || p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <ClearFiltersButton onClick={clearFilters} disabled={!hasActiveFilters} className="!ml-0" />
        </div>
      )}

      {loading ? (
        <div className="text-slate-600 text-sm py-4">Loading Morse Fall Scale records…</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-red-700">{error}</div>
      ) : rows.length === 0 ? (
        <div className="bg-blue-50 border border-blue-200 rounded-md px-4 py-3 text-sm text-blue-700">
          NO RECORD FOUND
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Record</th>
                {!patient && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Patient</th>
                )}
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Admission</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Doctor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Branch</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Total</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Risk</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[100px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.map((row) => {
                const risk = row.total_points != null ? getRiskLevel(row.total_points) : null
                return (
                  <tr key={row.name} className="hover:bg-slate-50">
                    <td
                      className="px-4 py-3 text-sm font-medium text-primary hover:underline cursor-pointer"
                      onClick={() => handleView(row.name)}
                    >
                      {row.trans_no || row.name}
                    </td>
                    {!patient && (
                      <td
                        className="px-4 py-3 text-sm cursor-pointer"
                        onClick={() => row.patient_no && onPatientClick?.(row.patient_no)}
                      >
                        <span className="font-medium text-primary hover:underline">{row.patient_no || '—'}</span>
                      </td>
                    )}
                    <td
                      className="px-4 py-3 text-sm text-slate-700 cursor-pointer"
                      onClick={() => handleView(row.name)}
                    >
                      {row.admission_no || '—'}
                    </td>
                    <td
                      className="px-4 py-3 text-sm text-slate-700 cursor-pointer"
                      onClick={() => handleView(row.name)}
                    >
                      {row.practitioner_name || row.practitioner || '—'}
                    </td>
                    <td
                      className="px-4 py-3 text-sm text-slate-700 cursor-pointer"
                      onClick={() => handleView(row.name)}
                    >
                      {row.cost_center || '—'}
                    </td>
                    <td
                      className="px-4 py-3 text-sm font-semibold text-slate-800 cursor-pointer"
                      onClick={() => handleView(row.name)}
                    >
                      {row.total_points ?? '—'}
                    </td>
                    <td
                      className="px-4 py-3 text-sm cursor-pointer"
                      onClick={() => handleView(row.name)}
                    >
                      {risk ? (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${risk.className}`}>
                          {risk.label}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td
                      className="px-4 py-3 text-sm text-slate-500 cursor-pointer"
                      onClick={() => handleView(row.name)}
                    >
                      {formatDate(row.date)}
                    </td>
                    <td className="px-4 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="relative inline-block" ref={openActionRow === row.name ? actionMenuRef : undefined}>
                          <button
                            type="button"
                            onClick={() => setOpenActionRow((prev) => (prev === row.name ? null : row.name))}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                            aria-label="Actions"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                          </button>
                          <PortalActionsMenu
                            open={openActionRow === row.name}
                            onClose={() => setOpenActionRow(null)}
                            triggerRef={actionMenuRef}
                            minWidth={160}
                          >
                            <button
                              type="button"
                              onClick={() => handleView(row.name)}
                              className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                            >
                              View
                            </button>
                          </PortalActionsMenu>
                        </div>
                        <PrintFormatDropdown
                          doctype="Morse Fall Scale"
                          docName={row.name}
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
        </div>
      )}

      {detailName && (
        <MorseFallScaleDetailPanel
          name={detailName}
          preview={detailRow}
          onClose={() => setDetailName(null)}
          onPatientClick={onPatientClick}
        />
      )}

      {allowCreate && showCreateModal && (
        <CreateMorseFallScaleModal
          patient={patient}
          patientName={patientName}
          defaultAdmission={defaultAdmission}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreateSuccess}
        />
      )}
    </>
  )
}
