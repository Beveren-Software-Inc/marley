import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { FileDown, FileText, MoreHorizontal, Pencil } from 'lucide-react'
import { fetchVitalSigns, type VitalSign } from '../../services/vitalSigns'
import { fetchHealthcarePractitioners, type LinkFieldOption } from '../../services/common'
import { useCardFilters, useCardHeaderSlot } from '../../contexts/CardFilterContext'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import { VitalSignsDetailPanel } from './VitalSignsDetailPanel'
import { DateFilterInput } from '../ui/DateFilterInput'
import { toast } from '../../hooks/useToast'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { useCareContext } from '../../providers/CareContextProvider'
import {
  DAILY_ROUTINE_EDIT_LOCKED_MESSAGE,
  VITAL_SIGN_EDIT_LOCKED_MESSAGE,
  isEditableWithin24hFromCreation,
} from '../../constants/nursingShift'
import { CreateVitalSignModal } from './CreateVitalSignModal'

interface VitalSignsListProps {
  patient?: string
  refreshKey?: number | string
  onPatientClick?: (patient: string) => void
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

function formatVsDateTime(vs: VitalSign): string {
  const date = vs.signs_date ? new Date(vs.signs_date).toLocaleDateString('en-GB') : ''
  const time = vs.signs_time || ''
  return [date, time].filter(Boolean).join(' ') || '-'
}

function formatBp(vs: VitalSign): string {
  if (vs.bp) return String(vs.bp)
  if (vs.bp_systolic && vs.bp_diastolic) return `${vs.bp_systolic}/${vs.bp_diastolic}`
  return '-'
}

function csvEscape(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

export const VitalSignsList = ({
  patient,
  refreshKey,
  onPatientClick,
  onAdd,
  addButtonTitle = 'Add Vital Signs',
  allowEditWithin24h = false,
}: VitalSignsListProps) => {
  const { guardClinicalEdit, vitalSignUneditableIn24Hour } = useCareContext()
  const cardFilters = useCardFilters()
  const headerSlot = useCardHeaderSlot()
  const inDashboardCard = cardFilters !== undefined
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = inDashboardCard ? cardFilters : showFiltersInternal

  const [vitalSigns, setVitalSigns] = useState<VitalSign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [detailSubtitle, setDetailSubtitle] = useState<string | undefined>()
  const [editRow, setEditRow] = useState<VitalSign | null>(null)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const actionMenuRef = useRef<HTMLDivElement>(null)

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [practitionerFilter, setPractitionerFilter] = useState('')
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const practitionerFilterRef = useRef<HTMLDivElement>(null)

  const hasActiveFilters = Boolean(dateFrom || dateTo || practitionerFilter)

  const loadVitalSigns = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetchVitalSigns(200, 0, patient, {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        practitioner: practitionerFilter || undefined,
      })
      setVitalSigns(response)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch vital signs'))
      setVitalSigns([])
    } finally {
      setLoading(false)
    }
  }, [patient, dateFrom, dateTo, practitionerFilter])

  useEffect(() => {
    loadVitalSigns()
  }, [loadVitalSigns, refreshKey])

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
      if (practitionerFilterRef.current?.contains(el)) return
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

  const openDetail = (vs: VitalSign) => {
    setDetailName(vs.name)
    const when = vs.signs_date
      ? `${new Date(vs.signs_date).toLocaleDateString('en-GB')}${vs.signs_time ? ` ${vs.signs_time}` : ''}`
      : undefined
    const parts = [vs.patient_name || vs.patient, vs.trans_no || vs.name, when].filter(Boolean)
    setDetailSubtitle(parts.length ? parts.join(' · ') : undefined)
  }

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

  const canEditRow = (row: VitalSign) =>
    allowEditWithin24h &&
    isEditableWithin24hFromCreation(row.creation, vitalSignUneditableIn24Hour)

  const openEdit = (row: VitalSign) => {
    if (!canEditRow(row)) {
      toast.error(vitalSignUneditableIn24Hour ? VITAL_SIGN_EDIT_LOCKED_MESSAGE : DAILY_ROUTINE_EDIT_LOCKED_MESSAGE)
      return
    }
    guardClinicalEdit(() => setEditRow(row))
  }

  const exportExcel = () => {
    if (!vitalSigns.length) {
      toast.info('No vital signs to export.')
      return
    }
    const includePatient = !patient
    const headers = [
      'Date & Time',
      ...(includePatient ? ['Patient'] : []),
      'Temperature',
      'Pulse',
      'BP',
      'Respiratory Rate',
      'SPO2',
      'Weight',
      'BMI',
      'Notes',
      'Record',
    ]
    const rows = vitalSigns.map((vs) => [
      formatVsDateTime(vs),
      ...(includePatient ? [vs.patient_name || vs.patient || ''] : []),
      vs.temperature ?? '',
      vs.pulse ?? '',
      formatBp(vs),
      vs.respiratory_rate ?? '',
      vs.spo2 ?? '',
      vs.weight ?? '',
      vs.bmi ?? '',
      vs.vital_signs_note ?? '',
      vs.trans_no || vs.name,
    ])
    const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const patientPart = (patient || 'all').replace(/[^\w.-]+/g, '_')
    a.download = `vital-signs-${patientPart}-${dateFrom || 'all'}-${dateTo || 'all'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportPdf = () => {
    if (!vitalSigns.length) {
      toast.info('No vital signs to print.')
      return
    }
    const win = window.open('', '_blank', 'width=1200,height=800')
    if (!win) {
      toast.error('Pop-up blocked. Allow pop-ups to download the PDF.')
      return
    }
    const includePatient = !patient
    const titlePatient = patient
      ? vitalSigns[0]?.patient_name || patient
      : 'All patients'
    const filterNote = [
      dateFrom ? `From ${dateFrom}` : '',
      dateTo ? `To ${dateTo}` : '',
    ]
      .filter(Boolean)
      .join(' · ')
    const rows = vitalSigns
      .map((vs) => {
        const patientTd = includePatient
          ? `<td>${vs.patient_name || vs.patient || ''}</td>`
          : ''
        return `<tr>
          <td>${formatVsDateTime(vs)}</td>
          ${patientTd}
          <td>${vs.temperature ?? ''}</td>
          <td>${vs.pulse ?? ''}</td>
          <td>${formatBp(vs)}</td>
          <td>${vs.respiratory_rate ?? ''}</td>
          <td>${vs.spo2 ?? ''}</td>
          <td>${vs.weight ?? ''}</td>
          <td>${vs.bmi ?? ''}</td>
          <td>${vs.trans_no || vs.name}</td>
        </tr>`
      })
      .join('')
    const patientTh = includePatient ? '<th>Patient</th>' : ''
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Vital Signs</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 24px; color: #0f172a; }
    h2 { margin: 0 0 4px; font-size: 18px; }
    .meta { color: #64748b; font-size: 12px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
    th { background: #f8fafc; }
  </style>
</head>
<body>
  <h2>Vital Signs</h2>
  <div class="meta">${titlePatient}${filterNote ? ` · ${filterNote}` : ''} · ${vitalSigns.length} record(s)</div>
  <table>
    <thead>
      <tr>
        <th>Date &amp; Time</th>
        ${patientTh}
        <th>Temp</th>
        <th>Pulse</th>
        <th>BP</th>
        <th>RR</th>
        <th>SPO2</th>
        <th>Weight</th>
        <th>BMI</th>
        <th>Record</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <script>window.onload = function () { window.print(); }<\/script>
</body>
</html>`)
    win.document.close()
  }

  const exportButtons = (
    <>
      <button
        type="button"
        onClick={exportPdf}
        disabled={loading || !vitalSigns.length}
        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-slate-300 rounded-md hover:bg-slate-50 bg-white text-slate-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        title="Download PDF"
      >
        <FileText className="w-3.5 h-3.5" />
        PDF
      </button>
      <button
        type="button"
        onClick={exportExcel}
        disabled={loading || !vitalSigns.length}
        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-slate-300 rounded-md hover:bg-slate-50 bg-white text-slate-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        title="Download Excel (CSV)"
      >
        <FileDown className="w-3.5 h-3.5" />
        Excel
      </button>
    </>
  )

  return (
    <>
      {inDashboardCard && headerSlot
        ? createPortal(exportButtons, headerSlot)
        : null}

      {!inDashboardCard && (
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-xl font-semibold text-slate-900">Vital Signs</h2>
          <div className="flex items-center gap-2 shrink-0">
            {exportButtons}
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
          <div ref={practitionerFilterRef} className="flex flex-col gap-1 min-w-[200px]">
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
          <ClearFiltersButton onClick={clearFilters} disabled={!hasActiveFilters} />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center p-8">
          <div className="text-slate-600">Loading vital signs...</div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center p-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
            <h3 className="text-red-800 font-semibold mb-2">Error Loading Vital Signs</h3>
            <p className="text-red-700 text-sm mb-2">{error.message}</p>
          </div>
        </div>
      ) : vitalSigns.length === 0 ? (
        <div className="flex items-center justify-center p-8">
          <div className="text-slate-500">
            No vital signs found{hasActiveFilters ? ' for the selected filters' : ''}.
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Date & Time
                </th>
                {!patient && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Patient
                  </th>
                )}
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Temperature
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Pulse
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  BP
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Respiratory Rate
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  SPO2
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Weight
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  BMI
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[100px]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {vitalSigns.map((vs) => (
                <tr key={vs.name} className="hover:bg-slate-50">
                  <td
                    className="px-4 py-3 text-sm text-primary cursor-pointer hover:underline"
                    onClick={() => openDetail(vs)}
                  >
                    {vs.signs_date ? new Date(vs.signs_date).toLocaleDateString('en-GB') : '-'}
                    {vs.signs_time && ` ${vs.signs_time}`}
                  </td>
                  {!patient && (
                    <td
                      className="px-4 py-3 text-sm text-slate-700 cursor-pointer"
                      onClick={() => vs.patient && onPatientClick?.(vs.patient)}
                    >
                      <span className="font-medium text-primary hover:underline">
                        {vs.patient_name || vs.patient || '-'}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm text-slate-700">{vs.temperature || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{vs.pulse || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {vs.bp || (vs.bp_systolic && vs.bp_diastolic ? `${vs.bp_systolic}/${vs.bp_diastolic}` : '-')}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{vs.respiratory_rate || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{vs.spo2 || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{vs.weight || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{vs.bmi || '-'}</td>
                  <td className="px-4 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
                    {allowEditWithin24h ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="relative inline-block" ref={openActionRow === vs.name ? actionMenuRef : undefined}>
                          <button
                            type="button"
                            onClick={() => setOpenActionRow((prev) => (prev === vs.name ? null : vs.name))}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                            aria-label="Actions"
                          >
                            <MoreHorizontal className="h-4 w-4" aria-hidden />
                          </button>
                          <PortalActionsMenu
                            open={openActionRow === vs.name}
                            onClose={() => setOpenActionRow(null)}
                            triggerRef={actionMenuRef}
                            minWidth={160}
                          >
                            {canEditRow(vs) ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionRow(null)
                                  openEdit(vs)
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                              >
                                <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                                Edit
                              </button>
                            ) : (
                              <div
                                className="px-3 py-2 text-xs text-slate-500"
                                title={VITAL_SIGN_EDIT_LOCKED_MESSAGE}
                              >
                                {vitalSignUneditableIn24Hour ? 'Edit locked (24h)' : 'Edit unavailable'}
                              </div>
                            )}
                          </PortalActionsMenu>
                        </div>
                        <PrintFormatDropdown
                          doctype="Vital Signs"
                          docName={vs.name}
                          noLetterhead={0}
                          triggerPrint={1}
                          className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-primary hover:bg-slate-50"
                        />
                      </div>
                    ) : (
                      <PrintFormatDropdown
                        doctype="Vital Signs"
                        docName={vs.name}
                        noLetterhead={0}
                        triggerPrint={1}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailName ? (
        <VitalSignsDetailPanel
          name={detailName}
          subtitle={detailSubtitle}
          onClose={() => {
            setDetailName(null)
            setDetailSubtitle(undefined)
          }}
        />
      ) : null}

      {editRow ? (
        <CreateVitalSignModal
          onClose={() => setEditRow(null)}
          onSuccess={() => {
            setEditRow(null)
            void loadVitalSigns()
          }}
          initialPatient={patient}
          editRow={editRow}
        />
      ) : null}
    </>
  )
}
