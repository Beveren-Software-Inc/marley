import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchVitalSigns, type VitalSign } from '../../services/vitalSigns'
import { fetchHealthcarePractitioners, type LinkFieldOption } from '../../services/common'
import { useCardFilters } from '../../contexts/CardFilterContext'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import { VitalSignsDetailPanel } from './VitalSignsDetailPanel'
import { DateFilterInput } from '../ui/DateFilterInput'

interface VitalSignsListProps {
  patient?: string
  refreshKey?: number | string
  onPatientClick?: (patient: string) => void
  onAdd?: () => void
  addButtonTitle?: string
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

export const VitalSignsList = ({
  patient,
  refreshKey,
  onPatientClick,
  onAdd,
  addButtonTitle = 'Add Vital Signs',
}: VitalSignsListProps) => {
  const cardFilters = useCardFilters()
  const inDashboardCard = cardFilters !== undefined
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = inDashboardCard ? cardFilters : showFiltersInternal

  const [vitalSigns, setVitalSigns] = useState<VitalSign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [detailSubtitle, setDetailSubtitle] = useState<string | undefined>()

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
      const response = await fetchVitalSigns(50, 0, patient, {
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

  return (
    <>
      {!inDashboardCard && (
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-xl font-semibold text-slate-900">Vital Signs</h2>
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
                    <PrintFormatDropdown
                      doctype="Vital Signs"
                      docName={vs.name}
                      noLetterhead={0}
                      triggerPrint={1}
                    />
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
    </>
  )
}
