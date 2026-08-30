import { useCallback, useEffect, useRef, useState } from 'react'
import { MoreHorizontal, Pencil } from 'lucide-react'
import {
  fetchAssessmentTemplates,
  fetchDefaultPatientAssessmentTemplate,
  fetchPatientAssessments,
  type AssessmentTemplateOption,
  type PatientAssessmentRow,
} from '../../services/patientAssessment'
import { fetchHealthcarePractitioners, type LinkFieldOption } from '../../services/common'
import { useCardFilters } from '../../contexts/CardFilterContext'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { PatientAssessmentDetailPanel } from './PatientAssessmentDetailPanel'
import { DateFilterInput } from '../ui/DateFilterInput'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { useCareContext } from '../../providers/CareContextProvider'
import { DAILY_ROUTINE_EDIT_LOCKED_MESSAGE, isEditableWithin24hFromCreation } from '../../constants/nursingShift'
import { toast } from '../../hooks/useToast'
import { CreatePatientAssessmentModal } from './CreatePatientAssessmentModal'

interface PatientAssessmentListProps {
  patient?: string
  refreshKey?: number
  onCreateNew?: () => void
  onPatientClick?: (patient: string) => void
  title?: string
  onAdd?: () => void
  addButtonTitle?: string
  allowEditWithin24h?: boolean
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
    aria-label={active ? 'Hide filters' : 'Show filters'}
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

export const PatientAssessmentList = ({
  patient,
  refreshKey,
  onPatientClick,
  title = 'Patient Assessment',
  onAdd,
  addButtonTitle = 'New Patient Assessment',
  allowEditWithin24h = false,
}: PatientAssessmentListProps) => {
  const { guardClinicalEdit, uneditWithin24Hour } = useCareContext()
  const cardFilters = useCardFilters()
  const inDashboardCard = cardFilters !== undefined
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = inDashboardCard ? cardFilters : showFiltersInternal

  const [records, setRecords] = useState<PatientAssessmentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailRow, setDetailRow] = useState<PatientAssessmentRow | null>(null)
  const [editRow, setEditRow] = useState<PatientAssessmentRow | null>(null)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const actionMenuRef = useRef<HTMLDivElement>(null)

  const [templateFilter, setTemplateFilter] = useState('')
  const [defaultTemplateName, setDefaultTemplateName] = useState('')
  const [templateOptions, setTemplateOptions] = useState<AssessmentTemplateOption[]>([])
  const [filtersReady, setFiltersReady] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [practitionerFilter, setPractitionerFilter] = useState('')
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])

  const hasActiveFilters = Boolean(
    (templateFilter && templateFilter !== defaultTemplateName) ||
      dateFrom ||
      dateTo ||
      practitionerFilter
  )

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchDefaultPatientAssessmentTemplate(), fetchAssessmentTemplates()])
      .then(([defaultTmpl, templates]) => {
        if (cancelled) return
        setTemplateOptions(templates)
        if (defaultTmpl) {
          setDefaultTemplateName(defaultTmpl.name)
          setTemplateFilter(defaultTmpl.name)
        }
        setFiltersReady(true)
      })
      .catch(() => {
        if (!cancelled) setFiltersReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

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

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchPatientAssessments(patient, 1, 50, {
        assessmentTemplate: templateFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        practitioner: practitionerFilter || undefined,
      })
      setRecords(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load patient assessments')
    } finally {
      setLoading(false)
    }
  }, [patient, templateFilter, dateFrom, dateTo, practitionerFilter])

  useEffect(() => {
    if (!filtersReady) return
    load()
  }, [load, refreshKey, filtersReady])

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
      if (el.closest('[data-pa-practitioner-filter]')) return
      setPractitionerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const clearFilters = () => {
    setTemplateFilter(defaultTemplateName)
    setDateFrom('')
    setDateTo('')
    setPractitionerFilter('')
    setPractitionerQuery('')
    setPractitionerOpen(false)
  }

  const fmt = (val: string | null | undefined) => {
    if (!val) return '—'
    try {
      return new Date(val).toLocaleString('en-GB')
    } catch {
      return val
    }
  }

  const scoreDisplay = (r: PatientAssessmentRow) => {
    if (r.total_score == null && r.total_score_obtained == null) return '—'
    const obtained = r.total_score_obtained ?? 0
    const total = r.total_score ?? 0
    if (total === 0) return `${obtained}`
    const pct = Math.round((obtained / total) * 100)
    return (
      <span className="flex items-center gap-1">
        <span className="font-semibold">{obtained}</span>
        <span className="text-slate-400">/ {total}</span>
        <span
          className={`text-[11px] font-medium ${
            pct >= 70
              ? 'text-emerald-600'
              : pct >= 40
              ? 'text-amber-600'
              : 'text-red-600'
          }`}
        >
          ({pct}%)
        </span>
      </span>
    )
  }

  const selectedPractitionerLabel =
    practitionerOptions.find((o) => o.name === practitionerFilter)?.label || practitionerFilter || ''

  const canEditRow = (row: PatientAssessmentRow) =>
    allowEditWithin24h &&
    (typeof row.docstatus === 'number' ? row.docstatus === 0 : true) &&
    isEditableWithin24hFromCreation(row.creation, uneditWithin24Hour)

  const openEdit = (row: PatientAssessmentRow) => {
    if (!canEditRow(row)) {
      toast.error(row.docstatus === 1 ? 'Submitted assessments cannot be edited here.' : DAILY_ROUTINE_EDIT_LOCKED_MESSAGE)
      return
    }
    guardClinicalEdit(() => setEditRow(row))
  }

  return (
    <div className="flex flex-col gap-4">
      {!inDashboardCard && (
        <div className="flex items-center justify-between gap-2 flex-shrink-0">
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <div className="flex items-center gap-2 shrink-0">
            <FilterToggleButton
              active={Boolean(showFilters)}
              onClick={() => setShowFiltersInternal((prev) => !prev)}
            />
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
        <div className="card-filter-bar flex flex-wrap items-end gap-3 px-1 py-2 border-b border-slate-100 bg-slate-50/80 rounded-md flex-shrink-0">
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
          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-xs font-medium text-slate-500">Assessment template</label>
            <select
              value={templateFilter}
              onChange={(e) => setTemplateFilter(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            >
              <option value="">Select All</option>
              {templateOptions.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.label}
                  {t.name === defaultTemplateName ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div
            data-pa-practitioner-filter
            className="flex flex-col gap-1 min-w-[200px] relative"
          >
            <label className="text-xs font-medium text-slate-500">Username</label>
            <input
              type="text"
              value={practitionerOpen ? practitionerQuery : selectedPractitionerLabel}
              onChange={(e) => {
                setPractitionerQuery(e.target.value)
                setPractitionerOpen(true)
                if (!e.target.value) setPractitionerFilter('')
              }}
              onFocus={() => setPractitionerOpen(true)}
              placeholder="Search username…"
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white w-full"
            />
            {practitionerOpen && practitionerOptions.length > 0 && (
              <ul className="absolute z-20 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg text-sm">
                {practitionerOptions.map((opt) => (
                  <li key={opt.name}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-slate-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setPractitionerFilter(opt.name)
                        setPractitionerQuery(opt.label || opt.name)
                        setPractitionerOpen(false)
                      }}
                    >
                      {opt.label || opt.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {hasActiveFilters ? <ClearFiltersButton onClick={clearFilters} /> : null}
        </div>
      )}

      {loading && (
        <div className="text-sm text-slate-500 py-4 text-center">
          Loading…
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && records.length === 0 && (
        <div className="p-4 text-sm text-slate-600 border border-dashed border-slate-300 rounded-md text-center">
          NO PATIENT ASSESSMENTS FOUND.
        </div>
      )}

      {!loading && records.length > 0 && (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">
                  Date / Time
                </th>
                {!patient && (
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">
                    Patient
                  </th>
                )}
                <th className="px-3 py-2 text-left font-semibold text-slate-600">
                  Template
                </th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">
                  Reference
                </th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">
                  Username
                </th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">
                  Score
                </th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => (
                <tr
                  key={r.name}
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => setDetailRow(r)}
                >
                  <td className="px-3 py-2 text-slate-900 font-medium whitespace-nowrap">
                    {fmt(r.assessment_datetime)}
                  </td>
                  {!patient && (
                    <td
                      className="px-3 py-2 cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); r.patient && onPatientClick?.(r.patient) }}
                    >
                      <span className="font-medium text-primary hover:underline">{r.patient_name || r.patient}</span>
                    </td>
                  )}
                  <td className="px-3 py-2 text-slate-700">
                    {r.assessment_template || '—'}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {r.reference_type ? (
                      <span>
                        {r.reference_type}
                        {r.encounter && (
                          <span className="text-slate-400">
                            {' '}
                            · {r.encounter}
                          </span>
                        )}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {r.healthcare_practitioner || '—'}
                  </td>
                  <td className="px-3 py-2">{scoreDisplay(r)}</td>
                  {/* stopPropagation prevents the row click (detail modal) from firing when the print button is clicked */}
                  <td
                    className="px-3 py-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-2">
                      {allowEditWithin24h ? (
                        <div className="relative inline-block" ref={openActionRow === r.name ? actionMenuRef : undefined}>
                          <button
                            type="button"
                            onClick={() => setOpenActionRow((prev) => (prev === r.name ? null : r.name))}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                            aria-label="Actions"
                          >
                            <MoreHorizontal className="h-4 w-4" aria-hidden />
                          </button>
                          <PortalActionsMenu
                            open={openActionRow === r.name}
                            onClose={() => setOpenActionRow(null)}
                            triggerRef={actionMenuRef}
                            minWidth={180}
                          >
                            {canEditRow(r) ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionRow(null)
                                  openEdit(r)
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                              >
                                <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                                Edit
                              </button>
                            ) : (
                              <div className="px-3 py-2 text-xs text-slate-500" title={DAILY_ROUTINE_EDIT_LOCKED_MESSAGE}>
                                {r.docstatus === 1 ? 'Edit locked (submitted)' : uneditWithin24Hour ? 'Edit locked (24h)' : 'Edit unavailable'}
                              </div>
                            )}
                          </PortalActionsMenu>
                        </div>
                      ) : null}
                      <PrintFormatDropdown
                        doctype="Patient Assessment"
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

      {detailRow ? (
        <PatientAssessmentDetailPanel
          name={detailRow.name}
          preview={detailRow}
          onClose={() => setDetailRow(null)}
          onPatientClick={onPatientClick}
        />
      ) : null}

      {editRow ? (
        <CreatePatientAssessmentModal
          patient={patient}
          editRow={editRow}
          onClose={() => setEditRow(null)}
          onSuccess={() => {
            setEditRow(null)
            void load()
          }}
        />
      ) : null}
    </div>
  )
}