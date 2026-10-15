import { useCallback, useEffect, useRef, useState } from 'react'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import {
  deleteHomicideRiskAssessment,
  fetchHomicideRiskAssessments,
  type HomicideRiskAssessmentListFilters,
  type HomicideRiskAssessmentRow,
} from '../../services/homicideRisk'
import {
  fetchDoctorPractitioners,
  type LinkFieldOption,
} from '../../services/common'
import { notifyRiskGapsChanged } from '../../services/generalRisk'
import { useCareContext } from '../../providers/CareContextProvider'
import { toast } from '../../hooks/useToast'
import { useCardFilters } from '../../contexts/CardFilterContext'
import {
  HOMICIDE_RISK_EDIT_LOCKED_MESSAGE,
  isHomicideRiskEditable,
} from '../../constants/nursingShift'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { HomicideRiskAssessmentDetailPanel } from './HomicideRiskAssessmentDetailPanel'
import { CreateHomicideRiskAssessmentModal } from './CreateHomicideRiskAssessmentModal'
import { DateFilterInput } from '../ui/DateFilterInput'

interface HomicideRiskAssessmentListProps {
  patient?: string
  refreshKey?: number
  onPatientClick?: (patient: string) => void
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

const riskLevelBadge = (level?: string) => {
  if (!level) return <span className="text-slate-400">—</span>

  const levelColors: Record<string, string> = {
    Low: 'bg-green-100 text-green-700 border-green-200',
    Medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    High: 'bg-red-100 text-red-700 border-red-200',
  }

  const colorClass = levelColors[level] || 'bg-slate-100 text-slate-700 border-slate-200'

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border ${colorClass}`}>
      {level}
    </span>
  )
}

export const HomicideRiskAssessmentList = ({
  patient,
  refreshKey,
  onPatientClick,
}: HomicideRiskAssessmentListProps) => {
  const cardFilters = useCardFilters()
  const inDashboardCard = cardFilters !== undefined
  const { guardClinicalEdit, lockEditingData } = useCareContext()
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = inDashboardCard ? cardFilters : showFiltersInternal

  const [records, setRecords] = useState<HomicideRiskAssessmentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [detailRow, setDetailRow] = useState<HomicideRiskAssessmentRow | undefined>(undefined)
  const [localRefresh, setLocalRefresh] = useState(0)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const actionMenuRef = useRef<HTMLDivElement>(null)
  const [editName, setEditName] = useState<string | null>(null)
  const [deleteRow, setDeleteRow] = useState<HomicideRiskAssessmentRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [practitionerFilter, setPractitionerFilter] = useState('')
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerQuery, setPractitionerQuery] = useState('')

  const listFilters: HomicideRiskAssessmentListFilters = {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    practitioner: practitionerFilter || undefined,
  }

  const hasActiveFilters = Boolean(dateFrom || dateTo || practitionerFilter)

  const load = useCallback(async () => {
    if (!patient) {
      setRecords([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await fetchHomicideRiskAssessments(patient, listFilters)
      setRecords(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load homicide risk assessments')
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [patient, dateFrom, dateTo, practitionerFilter])

  useEffect(() => {
    load()
  }, [load, refreshKey, localRefresh])

  // Close the row actions menu on an outside click.
  useEffect(() => {
    if (!openActionRow) return
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('[data-portal-actions-menu]')) return
      if (el.closest('button[aria-label="Actions"]')) return
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setOpenActionRow(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openActionRow])

  useEffect(() => {
    if (!practitionerOpen) return
    const t = setTimeout(async () => {
      try {
        const opts = await fetchDoctorPractitioners(practitionerQuery || undefined)
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
      if (el.closest('[data-homicide-practitioner-filter]')) return
      setPractitionerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleView = (row: HomicideRiskAssessmentRow) => {
    setDetailRow(row)
    setDetailName(row.name)
  }

  const bump = () => setLocalRefresh((n) => n + 1)

  /**
   * Edit / delete stay open for the 24 hours after creation.
   *
   * Healthcare Settings → "Lock Editing Data" is still enforced when the user
   * clicks (`guardClinicalEdit` + the API guard); it only no longer greys the
   * action out before the 24-hour window closes, so the menu reflects the rule.
   */
  const canMutateRow = (row: HomicideRiskAssessmentRow) =>
    Boolean(row.creation) && isHomicideRiskEditable(String(row.creation || ''), true)

  const lockedMessage = () =>
    lockEditingData
      ? 'Editing is locked in Healthcare Settings.'
      : HOMICIDE_RISK_EDIT_LOCKED_MESSAGE

  const openEdit = (row: HomicideRiskAssessmentRow) => {
    setOpenActionRow(null)
    if (!canMutateRow(row)) {
      toast.error(lockedMessage())
      return
    }
    guardClinicalEdit(() => setEditName(String(row.name)))
  }

  const openDelete = (row: HomicideRiskAssessmentRow) => {
    setOpenActionRow(null)
    if (!canMutateRow(row)) {
      toast.error(lockedMessage())
      return
    }
    guardClinicalEdit(() => setDeleteRow(row))
  }

  const confirmDelete = async () => {
    if (!deleteRow?.name) return
    setDeleting(true)
    try {
      const result = await deleteHomicideRiskAssessment(String(deleteRow.name))
      if (!result.success) {
        throw new Error(result.message || 'Failed to delete assessment')
      }
      toast.success('Homicide Risk Assessment deleted')
      if (detailName === deleteRow.name) {
        setDetailName(null)
        setDetailRow(undefined)
      }
      if (editName === deleteRow.name) setEditName(null)
      setDeleteRow(null)
      // Removing the record may clear a flagged risk in the sidebar.
      notifyRiskGapsChanged()
      bump()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete assessment')
    } finally {
      setDeleting(false)
    }
  }

  const clearFilters = () => {
    setDateFrom('')
    setDateTo('')
    setPractitionerFilter('')
    setPractitionerQuery('')
    setPractitionerOpen(false)
  }

  const fmt = (val: string | null | undefined) => {
    if (!val) return '—'
    try {
      return new Date(val).toLocaleDateString('en-GB')
    } catch {
      return val
    }
  }

  if (!patient) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-md px-4 py-3 text-sm">
        Select a patient to view homicide risk assessments.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {!inDashboardCard && (
        <div className="flex items-center justify-end">
          <FilterToggleButton
            active={Boolean(showFilters)}
            onClick={() => setShowFiltersInternal((prev) => !prev)}
          />
        </div>
      )}

      {showFilters && (
        <div className="card-filter-bar flex flex-wrap items-end gap-3 mb-1 px-1 py-2 border-b border-slate-100 bg-slate-50/80 rounded-md">
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
          <div data-homicide-practitioner-filter className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-xs font-medium text-slate-500">Doctor</label>
            <div className="relative">
              <input
                type="text"
                value={
                  practitionerFilter
                    ? practitionerOptions.find((p) => p.name === practitionerFilter)?.label ||
                      practitionerQuery ||
                      practitionerFilter
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
                  aria-label="Clear doctor filter"
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
          <ClearFiltersButton onClick={clearFilters} disabled={!hasActiveFilters} />
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500 py-4 text-center">Loading homicide risk assessments…</div>
      ) : error ? (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">{error}</div>
      ) : records.length === 0 ? (
        <div className="p-4 text-sm text-slate-600 border border-dashed border-slate-300 rounded-md text-center">
          No homicide risk assessments found{hasActiveFilters ? ' for the selected filters' : ''}.
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">ID</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Doctor</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Risk Level</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => (
                <tr key={r.name} className="hover:bg-slate-50">
                  <td
                    className="px-3 py-2 text-sm font-medium text-primary hover:underline cursor-pointer whitespace-nowrap"
                    onClick={() => handleView(r)}
                  >
                    {r.name}
                  </td>
                  <td
                    className="px-3 py-2 text-slate-900 font-medium whitespace-nowrap cursor-pointer"
                    onClick={() => handleView(r)}
                  >
                    {fmt(r.assessment_date)}
                  </td>
                  <td className="px-3 py-2 text-slate-700 cursor-pointer" onClick={() => handleView(r)}>
                    {r.practitioner_name || r.clinician || '—'}
                  </td>
                  <td className="px-3 py-2 cursor-pointer" onClick={() => handleView(r)}>
                    {riskLevelBadge(r.risk_level)}
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      <div
                        className="relative"
                        ref={openActionRow === r.name ? actionMenuRef : undefined}
                      >
                        <button
                          type="button"
                          aria-label="Actions"
                          onClick={() =>
                            setOpenActionRow((prev) => (prev === r.name ? null : r.name))
                          }
                          className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                        >
                          <MoreHorizontal className="h-4 w-4" aria-hidden />
                        </button>
                        <PortalActionsMenu
                          open={openActionRow === r.name}
                          onClose={() => setOpenActionRow(null)}
                          triggerRef={actionMenuRef}
                          minWidth={170}
                        >
                          <button
                            type="button"
                            onClick={() => openEdit(r)}
                            disabled={!canMutateRow(r)}
                            title={
                              canMutateRow(r) && !lockEditingData
                                ? 'Edit (within 24 hours of creation)'
                                : lockedMessage()
                            }
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => openDelete(r)}
                            disabled={!canMutateRow(r)}
                            title={
                              canMutateRow(r) && !lockEditingData
                                ? 'Delete (within 24 hours of creation)'
                                : lockedMessage()
                            }
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            <Trash2 className="h-3.5 w-3.5 shrink-0 text-red-500" aria-hidden />
                            Delete
                          </button>
                        </PortalActionsMenu>
                      </div>
                      <PrintFormatDropdown
                        doctype="Homicide Risk Assessment"
                        docName={r.name}
                        noLetterhead={0}
                        triggerPrint={1}
                        className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-primary hover:bg-slate-50"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailName && (
        <HomicideRiskAssessmentDetailPanel
          name={detailName}
          preview={detailRow}
          onClose={() => {
            setDetailName(null)
            setDetailRow(undefined)
          }}
          onPatientClick={onPatientClick}
          onChanged={bump}
          refreshKey={localRefresh}
        />
      )}

      {editName && (
        <CreateHomicideRiskAssessmentModal
          editName={editName}
          onClose={() => setEditName(null)}
          onSuccess={() => {
            setEditName(null)
            // Reloads the list and re-fetches the open detail panel.
            bump()
          }}
        />
      )}

      {deleteRow && (
        <ConfirmDialog
          open
          title="Delete Homicide Risk Assessment?"
          message={`Delete ${deleteRow.name}? This cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          loading={deleting}
          onCancel={() => setDeleteRow(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}
