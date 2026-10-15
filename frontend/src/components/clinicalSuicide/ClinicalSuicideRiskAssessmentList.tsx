// components/suicideRisk/SuicideRiskAssessmentList.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import {
  deleteSuicideRiskAssessment,
  fetchSuicideRiskAssessments,
  type SuicideRiskAssessmentRow,
} from '../../services/suicideRisk'
import { notifyRiskGapsChanged } from '../../services/generalRisk'
import { useCareContext } from '../../providers/CareContextProvider'
import { toast } from '../../hooks/useToast'
import { useCardFilters } from '../../contexts/CardFilterContext'
import {
  SUICIDE_RISK_EDIT_LOCKED_MESSAGE,
  isSuicideRiskEditable,
} from '../../constants/nursingShift'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { ClinicalSuicideRiskAssessmentDetailPanel } from './ClinicalSuicideRiskAssessmentDetailPanel'
import { CreateSuicideRiskAssessmentModal } from './CreateClinicalSuicideRiskAssessmentModal'
import { DateFilterInput } from '../ui/DateFilterInput'

interface SuicideRiskAssessmentListProps {
  patient?: string
  inpatientAdmission?: string
  refreshKey?: number
  onPatientClick?: (patient: string) => void
  /** When IP + active admission in header, scope list to that admission (default true). */
  scopeToActiveAdmission?: boolean
}

const riskLevelBadge = (level?: string) => {
  if (!level) return <span className="text-slate-400">—</span>

  const levelColors: Record<string, string> = {
    Low: 'bg-green-100 text-green-700 border-green-200',
    Medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    High: 'bg-orange-100 text-orange-700 border-orange-200',
    Emergency: 'bg-red-100 text-red-700 border-red-200',
  }

  const colorClass = levelColors[level] || 'bg-slate-100 text-slate-700 border-slate-200'

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border ${colorClass}`}>
      {level}
    </span>
  )
}

const assessmentDay = (val?: string | null) => {
  if (!val) return ''
  try {
    return new Date(val).toISOString().slice(0, 10)
  } catch {
    return String(val).slice(0, 10)
  }
}

export const SuicideRiskAssessmentList = ({
  patient,
  inpatientAdmission,
  refreshKey,
  onPatientClick,
  scopeToActiveAdmission = true,
}: SuicideRiskAssessmentListProps) => {
  const {
    mode,
    activeAdmission,
    activeVisit,
    selectedPatient: contextPatient,
    guardClinicalEdit,
    lockEditingData,
  } = useCareContext()
  const effectivePatient = patient ?? contextPatient ?? undefined
  const scopedAdmission =
    scopeToActiveAdmission && mode === 'IP' && activeAdmission
      ? activeAdmission
      : inpatientAdmission
  const scopedVisit =
    mode === 'OP' && activeVisit && !scopedAdmission ? activeVisit : undefined

  const [records, setRecords] = useState<SuicideRiskAssessmentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<SuicideRiskAssessmentRow | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [localRefresh, setLocalRefresh] = useState(0)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const actionMenuRef = useRef<HTMLDivElement>(null)
  const [editName, setEditName] = useState<string | null>(null)
  const [deleteRow, setDeleteRow] = useState<SuicideRiskAssessmentRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const cardFilters = useCardFilters()
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = cardFilters !== undefined ? cardFilters : showFiltersInternal
  const isInsideCard = cardFilters !== undefined

  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [riskLevelFilter, setRiskLevelFilter] = useState('')

  const load = async (q?: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchSuicideRiskAssessments(
        effectivePatient,
        q,
        scopedAdmission,
        scopedVisit,
      )
      setRecords(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load suicide risk assessments')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [effectivePatient, scopedAdmission, scopedVisit, refreshKey, localRefresh])

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

  const handleSearchChange = (q: string) => {
    setSearch(q)
    if (effectivePatient) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(q), 350)
  }

  const bump = () => setLocalRefresh((n) => n + 1)

  /**
   * Edit / delete stay open for the 24 hours after creation.
   *
   * Healthcare Settings → "Lock Editing Data" is still enforced when the user
   * clicks (`guardClinicalEdit` + the API guard); it only no longer greys the
   * action out before the 24-hour window closes, so the menu reflects the rule.
   */
  const canMutateRow = (row: SuicideRiskAssessmentRow) =>
    Boolean(row.creation) && isSuicideRiskEditable(String(row.creation || ''), true)

  const lockedMessage = () =>
    lockEditingData
      ? 'Editing is locked in Healthcare Settings.'
      : SUICIDE_RISK_EDIT_LOCKED_MESSAGE

  const openEdit = (row: SuicideRiskAssessmentRow) => {
    setOpenActionRow(null)
    if (!canMutateRow(row)) {
      toast.error(lockedMessage())
      return
    }
    guardClinicalEdit(() => setEditName(String(row.name)))
  }

  const openDelete = (row: SuicideRiskAssessmentRow) => {
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
      const result = await deleteSuicideRiskAssessment(String(deleteRow.name))
      if (!result.success) {
        throw new Error(result.message || 'Failed to delete assessment')
      }
      toast.success('Suicide Risk Assessment deleted')
      if (selected?.name === deleteRow.name) setSelected(null)
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

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const day = assessmentDay(r.assessment_date)
      if (fromDate && day && day < fromDate) return false
      if (toDate && day && day > toDate) return false
      if (riskLevelFilter && r.risk_level !== riskLevelFilter) return false
      return true
    })
  }, [records, fromDate, toDate, riskLevelFilter])

  const riskLevelOptions = useMemo(() => {
    const s = new Set<string>()
    for (const r of records) {
      if (r.risk_level) s.add(r.risk_level)
    }
    return Array.from(s).sort()
  }, [records])

  const hasActiveFilters = Boolean(fromDate || toDate || riskLevelFilter)

  const fmt = (val: string | null | undefined) => {
    if (!val) return '—'
    try {
      return new Date(val).toLocaleDateString('en-GB')
    } catch {
      return val
    }
  }

  return (
    <div className="flex flex-col gap-2 h-full flex-1 min-h-0">
      {!isInsideCard && (
        <div className="flex items-center gap-3 flex-wrap justify-between flex-shrink-0">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Search Patient</label>
            <input
              type="search"
              placeholder="Search by patient name…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFiltersInternal((p) => !p)}
            className={`p-1.5 rounded-md border transition-colors ${showFilters ? 'bg-primary/10 border-primary text-primary' : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}
            title={showFilters ? 'Hide filters' : 'Show filters'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
          </button>
        </div>
      )}

      {showFilters && (
        <div className="card-filter-bar flex flex-wrap items-end gap-3 px-0 py-2 border-b border-slate-100 bg-slate-50/80 flex-shrink-0">
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
          <div className="flex flex-col gap-1 min-w-[120px]">
            <label className="text-xs font-medium text-slate-500">Risk level</label>
            <select
              value={riskLevelFilter}
              onChange={(e) => setRiskLevelFilter(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            >
              <option value="">Select All</option>
              {riskLevelOptions.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </div>
          {hasActiveFilters && (
            <ClearFiltersButton
              onClick={() => {
                setFromDate('')
                setToDate('')
                setRiskLevelFilter('')
              }}
            />
          )}
        </div>
      )}

      {effectivePatient && !isInsideCard && (
        <p className="text-[11px] text-slate-500 flex-shrink-0">
          {filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''}
          {hasActiveFilters && records.length !== filteredRecords.length ? ` (of ${records.length})` : ''}
        </p>
      )}

      {loading && <div className="text-sm text-slate-500 py-4 text-center flex-shrink-0">Loading…</div>}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 flex-shrink-0">{error}</div>
      )}

      {!loading && !error && filteredRecords.length === 0 && (
        <div className="p-4 text-sm text-slate-600 border border-dashed border-slate-300 rounded-md text-center flex-1">
          NO SUICIDE RISK ASSESSMENTS FOUND.
        </div>
      )}

      {!loading && filteredRecords.length > 0 && (
        <div className="overflow-auto border border-slate-200 rounded-lg flex-1 min-h-0">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                {!effectivePatient && (
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Patient</th>
                )}
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Clinician</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Risk Score</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Risk Level</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.map((r) => (
                <tr key={r.name} className="hover:bg-slate-50 cursor-pointer" onClick={() => setSelected(r)}>
                  <td className="px-3 py-2 text-slate-900 font-medium whitespace-nowrap">{fmt(r.assessment_date)}</td>
                  {!effectivePatient && (
                    <td
                      className="px-3 py-2 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        r.patient && onPatientClick?.(r.patient)
                      }}
                    >
                      <span className="font-medium text-primary hover:underline">
                        {r.patient_name || r.patient}
                      </span>
                    </td>
                  )}
                  <td className="px-3 py-2 text-slate-700">{r.clinician_name || r.clinician || '—'}</td>
                  <td className="px-3 py-2 text-slate-700">
                    <span
                      className={`font-semibold ${
                        r.risk_score >= 75
                          ? 'text-red-600'
                          : r.risk_score >= 50
                            ? 'text-orange-600'
                            : r.risk_score >= 25
                              ? 'text-yellow-600'
                              : 'text-green-600'
                      }`}
                    >
                      {r.risk_score}
                    </span>
                  </td>
                  <td className="px-3 py-2">{riskLevelBadge(r.risk_level)}</td>
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
                        doctype="Clinical Suicide Risk Assessment"
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

      {selected && (
        <ClinicalSuicideRiskAssessmentDetailPanel
          name={selected.name}
          preview={selected}
          onClose={() => setSelected(null)}
          onPatientClick={onPatientClick}
          onChanged={bump}
          refreshKey={localRefresh}
        />
      )}

      {editName && (
        <CreateSuicideRiskAssessmentModal
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
          title="Delete Suicide Risk Assessment?"
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
