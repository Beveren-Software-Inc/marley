import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchHealthcarePractitioners, type LinkFieldOption } from '../../services/common'
import {
  getAllMedicalDiagnosisEntries,
  getMedicalDiagnosisForContext,
  getMedicalDiagnosisForPatient,
  type MedicalDiagnosisEntryAggRow,
  type MedicalDiagnosisEntryRow,
} from '../../services/medicalDiagnosisEntry'
import { Plus } from 'lucide-react'
import { PatientDiagnosisModal } from './PatientDiagnosisModal'
import { MedicalDiagnosisDetailPanel } from './MedicalDiagnosisDetailPanel'
import { useCareContext } from '../../providers/CareContextProvider'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import { toast } from '../../hooks/useToast'

function formatDate(val?: string): string {
  if (!val) return '—'
  try {
    return new Date(val).toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return val
  }
}

function dateOnly(iso?: string): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

function inDateRange(posting?: string, from?: string, to?: string): boolean {
  const d = dateOnly(posting)
  if (!d) return !from && !to
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

/** Preview Text Editor HTML as plain text */
function stripHtml(html: string): string {
  if (!html || typeof document === 'undefined') return html || ''
  const d = document.createElement('div')
  d.innerHTML = html
  return (d.textContent || d.innerText || '').trim() || '—'
}

function contextLabel(row: MedicalDiagnosisEntryAggRow): string {
  if (row.visit_num) return `OP · ${row.visit_num}`
  if (row.inpatient_admission) return `IP · ${row.inpatient_admission}`
  return '—'
}

function toAggRow(row: MedicalDiagnosisEntryRow): MedicalDiagnosisEntryAggRow {
  return {
    ...row,
    parent: row.visit_num || row.inpatient_admission || '',
    parent_type: row.visit_num
      ? 'Patient Visit'
      : row.inpatient_admission
        ? 'Inpatient Admission'
        : '',
  }
}

export function DiagnosisSymptomsScreen({ allowCreate = true }: { allowCreate?: boolean } = {}) {
  const { mode, activeVisit, activeAdmission, selectedPatient, guardClinicalCreate } = useCareContext()

  const [rows, setRows] = useState<MedicalDiagnosisEntryAggRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showAddModal, setShowAddModal] = useState(false)
  const [search, setSearch] = useState('')
  const [detailName, setDetailName] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [practitionerFilter, setPractitionerFilter] = useState('')
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])

  const hasRefContext = Boolean(
    (mode === 'OP' && activeVisit) || (mode === 'IP' && activeAdmission),
  )

  const contextBanner = useMemo(() => {
    if (mode === 'OP' && activeVisit) {
      return `Showing diagnoses for OP Visit: ${activeVisit}`
    }
    if (mode === 'IP' && activeAdmission) {
      return `Showing diagnoses for IP Admission: ${activeAdmission}`
    }
    if (selectedPatient) {
      return `Showing diagnoses for patient: ${selectedPatient}`
    }
    return null
  }, [mode, activeVisit, activeAdmission, selectedPatient])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let data: MedicalDiagnosisEntryAggRow[]

      if (mode === 'IP' && activeAdmission) {
        const contextRows = await getMedicalDiagnosisForContext(
          'Inpatient Admission',
          activeAdmission,
        )
        data = contextRows.map(toAggRow)
      } else if (mode === 'OP' && activeVisit) {
        const contextRows = await getMedicalDiagnosisForContext('Patient Visit', activeVisit)
        data = contextRows.map(toAggRow)
      } else if (selectedPatient) {
        data = await getMedicalDiagnosisForPatient(selectedPatient)
      } else {
        data = await getAllMedicalDiagnosisEntries({ limit: 500 })
      }

      setRows(data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load diagnoses'
      setError(msg)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [mode, activeVisit, activeAdmission, selectedPatient])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  useEffect(() => {
    if (!practitionerOpen) return
    const t = setTimeout(() => {
      fetchHealthcarePractitioners(practitionerQuery || undefined)
        .then(setPractitionerOptions)
        .catch(() => setPractitionerOptions([]))
    }, practitionerQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [practitionerOpen, practitionerQuery])

  const hasActiveFilters = Boolean(fromDate || toDate || practitionerFilter)

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (!inDateRange(row.posting_date, fromDate || undefined, toDate || undefined)) return false
      if (practitionerFilter && row.practitioner !== practitionerFilter) return false
      if (!q) return true
      const haystack = [
        row.name,
        row.patient,
        row.patient_name,
        row.visit_num,
        row.inpatient_admission,
        row.diagnosis,
        row.diagnosis_name,
        row.disease_no,
        row.diagnosis_group_name,
        row.practitioner,
        row.practitioner_name,
        row.cost_center,
        stripHtml(row.details || ''),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [rows, search, fromDate, toDate, practitionerFilter])

  const detailPreview = useMemo(
    () => (detailName ? rows.find((r) => r.name === detailName) : undefined),
    [detailName, rows],
  )

  const emptyMessage = useMemo(() => {
    if (search.trim() || hasActiveFilters) return 'No diagnoses match your filters.'
    if (hasRefContext || selectedPatient) return 'No diagnoses for the current care context.'
    return 'No Medical Diagnosis Entry records yet.'
  }, [search, hasActiveFilters, hasRefContext, selectedPatient])

  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Medical Diagnosis Entry</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {contextBanner || 'All diagnosis records · newest first'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters((p) => !p)}
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                showFilters
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
              }`}
              title={showFilters ? 'Hide filters' : 'Show filters'}
              aria-label={showFilters ? 'Hide filters' : 'Show filters'}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
                />
              </svg>
            </button>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search patient, visit, diagnosis…"
              className="min-w-[200px] max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm placeholder:text-slate-400 hover:border-emerald-300/80 focus:border-emerald-400/80 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
            />
            {allowCreate ? (
              <button
                type="button"
                onClick={() => {
                  if (!selectedPatient) {
                    toast.error('Select a patient first')
                    return
                  }
                  guardClinicalCreate(() => setShowAddModal(true))
                }}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold leading-none text-white transition-colors hover:bg-primary/90"
                title="Add diagnosis"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
              </button>
            ) : null}
          </div>
        </div>

        {showFilters ? (
          <div className="flex shrink-0 flex-wrap items-end gap-3 border-b border-slate-100 bg-white px-4 py-3">
            <div className="flex min-w-[120px] flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex min-w-[120px] flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="relative flex min-w-[180px] flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Practitioner</label>
              <input
                type="text"
                value={
                  practitionerFilter
                    ? practitionerOptions.find((p) => p.name === practitionerFilter)?.label ||
                      practitionerQuery
                    : practitionerQuery
                }
                onChange={(e) => {
                  setPractitionerQuery(e.target.value)
                  setPractitionerFilter('')
                  setPractitionerOpen(true)
                }}
                onFocus={() => setPractitionerOpen(true)}
                onBlur={() => setTimeout(() => setPractitionerOpen(false), 150)}
                placeholder="Search practitioner…"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
              {practitionerOpen && practitionerOptions.length > 0 ? (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                  {practitionerOptions.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
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
              ) : null}
            </div>
            {hasActiveFilters ? (
              <ClearFiltersButton
                onClick={() => {
                  setFromDate('')
                  setToDate('')
                  setPractitionerFilter('')
                  setPractitionerQuery('')
                }}
              />
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="mx-4 mt-3 shrink-0 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col p-4">
          {loading ? (
            <div className="flex flex-1 items-center justify-center gap-2 py-8 text-sm text-slate-500">
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Loading…
            </div>
          ) : filteredRows.length === 0 ? (
            <p className="py-6 text-center text-sm italic text-slate-500">{emptyMessage}</p>
          ) : (
            <div
              className="relative isolate min-h-0 flex-1 overflow-auto rounded-md border border-slate-100"
              data-sticky-table-scroll
            >
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Entry
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Patient
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Visit / Admission
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Diagnosis no.
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Name
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Group
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Remarks
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Practitioner
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Branch
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Posting date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map((row, idx) => (
                    <tr
                      key={row.name || `${row.diagnosis}-${idx}`}
                      className="hover:bg-slate-50/80"
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 align-top font-mono text-xs">
                        {row.name ? (
                          <button
                            type="button"
                            onClick={() => setDetailName(row.name!)}
                            className="text-primary hover:underline"
                          >
                            {row.name}
                          </button>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 align-top text-slate-800">
                        <div className="font-medium">{row.patient_name?.trim() || row.patient || '—'}</div>
                        {row.patient && row.patient_name ? (
                          <div className="font-mono text-xs text-slate-500">{row.patient}</div>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 align-top font-mono text-xs text-slate-700">
                        {contextLabel(row)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 align-top font-mono text-sm text-slate-800">
                        {row.disease_no || row.diagnosis || '—'}
                      </td>
                      <td className="px-3 py-2.5 align-top font-medium text-slate-900">
                        {row.diagnosis_name?.trim() || row.diagnosis || '—'}
                      </td>
                      <td className="px-3 py-2.5 align-top text-sm text-slate-600">
                        {row.diagnosis_group_name || '—'}
                      </td>
                      <td
                        className="max-w-md px-3 py-2.5 align-top text-slate-600"
                        title={stripHtml(row.details || '')}
                      >
                        <span className="line-clamp-3">{stripHtml(row.details || '')}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 align-top text-slate-600">
                        {row.practitioner_name || row.practitioner || '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 align-top text-slate-600">
                        {row.cost_center || '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 align-top text-slate-500">
                        {formatDate(row.posting_date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && !hasRefContext && !selectedPatient && rows.length >= 500 ? (
            <p className="mt-3 shrink-0 text-center text-xs text-slate-500">
              Showing the 500 most recent entries. Select a patient or use filters to narrow results.
            </p>
          ) : null}
        </div>
      </section>

      {allowCreate && showAddModal && selectedPatient ? (
        <PatientDiagnosisModal
          parentDoctype={mode === 'IP' ? 'Inpatient Admission' : 'Patient Visit'}
          parentName={mode === 'IP' ? activeAdmission : activeVisit}
          patient={selectedPatient}
          mode="append"
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false)
            setRefreshKey((k) => k + 1)
          }}
        />
      ) : null}

      {detailName ? (
        <MedicalDiagnosisDetailPanel
          name={detailName}
          preview={detailPreview}
          onClose={() => setDetailName(null)}
        />
      ) : null}
    </div>
  )
}
