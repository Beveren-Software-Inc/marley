import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchInpatientAdmissionOptions } from '../../services/common'
import {
  fetchEnvironmentalChecklists,
  type EnvironmentalChecklistListFilters,
  type EnvironmentalChecklistRecord,
} from '../../services/environmentalChecklist'
import { useCardFilters } from '../../contexts/CardFilterContext'
import { useCareContext } from '../../providers/CareContextProvider'
import { EnvironmentalChecklistModal } from './EnvironmentalChecklistModal'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { EnvironmentalChecklistDetailPanel } from './EnvironmentalChecklistDetailPanel'

interface EnvironmentalChecklistListProps {
  patient?: string
  refreshKey?: number
  onPatientClick?: (patient: string) => void
  defaultAdmission?: string
  defaultVisit?: string
  createModalOpen?: boolean
  onCreateModalOpenChange?: (open: boolean) => void
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

export const EnvironmentalChecklistList = ({
  patient,
  refreshKey,
  onPatientClick,
  defaultAdmission,
  defaultVisit,
  createModalOpen,
  onCreateModalOpenChange,
}: EnvironmentalChecklistListProps) => {
  const cardFilters = useCardFilters()
  const inDashboardCard = cardFilters !== undefined
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = inDashboardCard ? cardFilters : showFiltersInternal

  const { guardClinicalCreate } = useCareContext()
  const [rows, setRows] = useState<EnvironmentalChecklistRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [internalCreateOpen, setInternalCreateOpen] = useState(false)
  const [editChecklist, setEditChecklist] = useState<string | null>(null)
  const [detailRow, setDetailRow] = useState<EnvironmentalChecklistRecord | null>(null)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const actionMenuRef = useRef<HTMLDivElement>(null)

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [admissionFilter, setAdmissionFilter] = useState('')
  const [admissionOptions, setAdmissionOptions] = useState<{ name: string; label: string }[]>([])

  const showCreateModal = createModalOpen ?? internalCreateOpen
  const setShowCreateModal = onCreateModalOpenChange ?? setInternalCreateOpen

  const listFilters: EnvironmentalChecklistListFilters = {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    inpatientAdmission: admissionFilter || undefined,
  }

  const hasActiveFilters = Boolean(dateFrom || dateTo || admissionFilter)

  const loadRows = useCallback(async () => {
    if (!patient) {
      setRows([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError(null)
      const data = await fetchEnvironmentalChecklists(patient, 50, listFilters)
      setRows(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load environmental checklists')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [patient, dateFrom, dateTo, admissionFilter])

  useEffect(() => {
    loadRows()
  }, [loadRows, refreshKey])

  useEffect(() => {
    if (!patient) {
      setAdmissionOptions([])
      return
    }
    fetchInpatientAdmissionOptions(undefined, patient)
      .then(setAdmissionOptions)
      .catch(() => setAdmissionOptions([]))
  }, [patient])

  useEffect(() => {
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
  }, [])

  const clearFilters = () => {
    setDateFrom('')
    setDateTo('')
    setAdmissionFilter('')
  }

  const handleCreateSuccess = () => {
    setShowCreateModal(false)
    loadRows()
  }

  const handleView = (row: EnvironmentalChecklistRecord) => {
    setOpenActionRow(null)
    setDetailRow(row)
  }

  const handleEdit = (name: string) => {
    setOpenActionRow(null)
    setDetailRow(null)
    setEditChecklist(name)
  }

  if (!patient) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-md px-4 py-3 text-sm">
        Select a patient to view Environmental Checklist records.
      </div>
    )
  }

  return (
    <>
      {!inDashboardCard && (
        <div className="font-semibold mb-3 flex items-center justify-between gap-2">
          <span>Environmental Checklist</span>
          <div className="flex items-center gap-2 shrink-0">
            <FilterToggleButton
              active={Boolean(showFilters)}
              onClick={() => setShowFiltersInternal((prev) => !prev)}
            />
            <button
              type="button"
              onClick={() => guardClinicalCreate(() => setShowCreateModal(true))}
              className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
              title="Add Environmental Checklist"
            >
              +
            </button>
          </div>
        </div>
      )}

      {showFilters && (
        <div className="flex flex-wrap items-end gap-3 mb-3 px-1 py-2 border-b border-slate-100 bg-slate-50/80 rounded-md">
          <div className="flex flex-col gap-1 min-w-[130px]">
            <label className="text-xs font-medium text-slate-500">Date from</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[130px]">
            <label className="text-xs font-medium text-slate-500">Date to</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[180px]">
            <label className="text-xs font-medium text-slate-500">Admission</label>
            <select
              value={admissionFilter}
              onChange={(e) => setAdmissionFilter(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            >
              <option value="">All admissions</option>
              {admissionOptions.map((option) => (
                <option key={option.name} value={option.name}>{option.label}</option>
              ))}
            </select>
          </div>
          <ClearFiltersButton onClick={clearFilters} disabled={!hasActiveFilters} />
        </div>
      )}

      {loading ? (
        <div className="text-slate-600 text-sm py-4">Loading environmental checklists...</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-blue-50 border border-blue-200 rounded-md px-4 py-3 text-sm text-blue-700">
          No environmental checklist records found{hasActiveFilters ? ' for the selected filters' : ''}.
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Visit</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Practitioner</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Cost Center</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Template</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Progress</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[100px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.map((row) => (
                <tr key={row.name} className="hover:bg-slate-50">
                  <td
                    className="px-4 py-3 text-sm font-medium text-primary hover:underline cursor-pointer"
                    onClick={() => handleView(row)}
                  >
                    {row.name}
                  </td>
                  {!patient && (
                    <td
                      className="px-4 py-3 text-sm cursor-pointer"
                      onClick={() => row.patient && onPatientClick?.(row.patient)}
                    >
                      <span className="font-medium text-primary hover:underline">
                        {row.patient_name || row.patient || '—'}
                      </span>
                    </td>
                  )}
                  <td
                    className="px-4 py-3 text-sm text-slate-700 cursor-pointer"
                    onClick={() => handleView(row)}
                  >
                    {row.inpatient_admission || '—'}
                  </td>
                  <td
                    className="px-4 py-3 text-sm text-slate-700 cursor-pointer"
                    onClick={() => handleView(row)}
                  >
                    {row.patient_visit || '—'}
                  </td>
                  <td
                    className="px-4 py-3 text-sm text-slate-700 cursor-pointer"
                    onClick={() => handleView(row)}
                  >
                    {row.practitioner_name || row.practitioner || '—'}
                  </td>
                  <td
                    className="px-4 py-3 text-sm text-slate-700 cursor-pointer"
                    onClick={() => handleView(row)}
                  >
                    {row.cost_center || '—'}
                  </td>
                  <td
                    className="px-4 py-3 text-sm text-slate-700 cursor-pointer"
                    onClick={() => handleView(row)}
                  >
                    {row.environmental_checklist_template || '—'}
                  </td>
                  <td
                    className="px-4 py-3 text-sm text-slate-700 cursor-pointer"
                    onClick={() => handleView(row)}
                  >
                    {row.completed_count ?? 0} / {row.total_count ?? 0}
                  </td>
                  <td
                    className="px-4 py-3 text-sm text-slate-500 cursor-pointer"
                    onClick={() => handleView(row)}
                  >
                    {row.creation ? new Date(row.creation).toLocaleDateString() : '—'}
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
                            onClick={() => handleView(row)}
                            className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEdit(row.name)}
                            className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          >
                            Edit
                          </button>
                        </PortalActionsMenu>
                      </div>
                      <PrintFormatDropdown
                        doctype="Environmental Checklist"
                        docName={row.name}
                        noLetterhead={0}
                        triggerPrint={1}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-slate-300 bg-white text-primary hover:bg-slate-50"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailRow ? (
        <EnvironmentalChecklistDetailPanel
          name={detailRow.name}
          preview={detailRow}
          onClose={() => setDetailRow(null)}
          onPatientClick={onPatientClick}
          onEdit={handleEdit}
        />
      ) : null}

      {showCreateModal && (
        <EnvironmentalChecklistModal
          patient={patient}
          defaultAdmission={defaultAdmission}
          defaultVisit={defaultVisit}
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {editChecklist && (
        <EnvironmentalChecklistModal
          patient={patient}
          checklistName={editChecklist}
          onClose={() => setEditChecklist(null)}
          onSuccess={() => {
            setEditChecklist(null)
            loadRows()
          }}
        />
      )}
    </>
  )
}
