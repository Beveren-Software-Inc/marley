import { useEffect, useRef, useState } from 'react'
import { ClipboardList, Pencil } from 'lucide-react'
import {
  fetchDoctorOrders,
  setDoctorOrderStatus,
  type DoctorOrderRow,
} from '../../services/doctorOrder'
import { fetchHealthcarePractitioners, type LinkFieldOption } from '../../services/common'
import { NurseDoctorOrderModal } from './NurseDoctorOrderModal'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import {
  MODAL_SECTION_CLASS,
  MODAL_SECTION_TITLE_CLASS,
} from '../ui/CreateModalChrome'
import { useCardFilters } from '../../contexts/CardFilterContext'
import { toast } from '../../hooks/useToast'

const DEFAULT_STATUS_FILTER = 'Pending'

const STATUS_OPTIONS = [
  { value: 'Pending', label: 'Pending' },
  { value: 'Finished', label: 'Finished' },
  { value: 'Canceled', label: 'Canceled' },
  { value: '', label: 'All statuses' },
]

interface DoctorOrderListProps {
  patient?: string
  admission?: string
  refreshKey?: number
  nurseMode?: boolean
  onPatientClick?: (patient: string) => void
}

const statusClass = (status: string | null | undefined) => {
  if (status === 'Finished') return 'bg-emerald-100 text-emerald-800'
  if (status === 'Canceled') return 'bg-slate-100 text-slate-600'
  return 'bg-amber-100 text-amber-800'
}

const isPending = (status: string | null | undefined) =>
  !status || status === 'Pending'

export const DoctorOrderList = ({
  patient,
  admission,
  refreshKey,
  nurseMode = false,
  onPatientClick,
}: DoctorOrderListProps) => {
  const cardFilters = useCardFilters()
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = cardFilters !== undefined ? cardFilters : showFiltersInternal
  const inDashboardCard = cardFilters !== undefined

  const [records, setRecords] = useState<DoctorOrderRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState(DEFAULT_STATUS_FILTER)
  const [doctorFilter, setDoctorFilter] = useState('')
  const [doctorQuery, setDoctorQuery] = useState('')
  const [doctorOpen, setDoctorOpen] = useState(false)
  const [doctorOptions, setDoctorOptions] = useState<LinkFieldOption[]>([])
  const [nurseFilter, setNurseFilter] = useState('')
  const [nurseQuery, setNurseQuery] = useState('')
  const [nurseOpen, setNurseOpen] = useState(false)
  const [nurseOptions, setNurseOptions] = useState<LinkFieldOption[]>([])
  const [selected, setSelected] = useState<DoctorOrderRow | null>(null)
  const [nurseEditRow, setNurseEditRow] = useState<DoctorOrderRow | null>(null)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const actionMenuRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchDoctorOrders({
        patient,
        admission,
        doctor: doctorFilter || undefined,
        nurse: nurseFilter || undefined,
        status: statusFilter || undefined,
      })
      setRecords(data)
      setSelected((prev) => {
        if (!prev) return null
        return data.find((r) => r.name === prev.name) ?? prev
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load doctor orders')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient, admission, refreshKey, doctorFilter, nurseFilter, statusFilter])

  useEffect(() => {
    if (!doctorOpen) return
    const t = setTimeout(() => {
      fetchHealthcarePractitioners(doctorQuery || undefined)
        .then(setDoctorOptions)
        .catch(() => setDoctorOptions([]))
    }, doctorQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [doctorOpen, doctorQuery])

  useEffect(() => {
    if (!nurseOpen) return
    const t = setTimeout(() => {
      fetchHealthcarePractitioners(nurseQuery || undefined)
        .then(setNurseOptions)
        .catch(() => setNurseOptions([]))
    }, nurseQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [nurseOpen, nurseQuery])

  useEffect(() => {
    if (!showFilters) return
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (!el.closest('[data-doctor-order-filter]')) {
        setDoctorOpen(false)
        setNurseOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showFilters])

  const activeFilterCount =
    (doctorFilter ? 1 : 0) +
    (nurseFilter ? 1 : 0) +
    (statusFilter !== DEFAULT_STATUS_FILTER ? 1 : 0)

  const clearFilters = () => {
    setDoctorFilter('')
    setDoctorQuery('')
    setNurseFilter('')
    setNurseQuery('')
    setStatusFilter(DEFAULT_STATUS_FILTER)
  }

  const filterInputClass =
    'w-full py-2 px-3 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white'

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

  const formatDateTime = (val: string | null | undefined) => {
    if (!val) return '—'
    try {
      return new Date(val).toLocaleString('en-GB')
    } catch {
      return val
    }
  }

  const handleStatusAction = async (
    row: DoctorOrderRow,
    status: 'Finished' | 'Canceled'
  ) => {
    setOpenActionRow(null)
    setActionLoading(row.name)
    try {
      const result = await setDoctorOrderStatus(row.name, status)
      if (!result.success) {
        throw new Error(result.message || `Failed to mark order as ${status}`)
      }
      toast.success(
        status === 'Finished' ? 'Order marked as finished' : 'Order canceled'
      )
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setActionLoading(null)
    }
  }

  const menuItemClass =
    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      {!inDashboardCard && (
        <div className="flex items-center justify-between gap-2 flex-shrink-0">
          <h2 className="text-xl font-semibold text-slate-900">Doctors Order</h2>
          <button
            type="button"
            onClick={() => setShowFiltersInternal((prev) => !prev)}
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
        </div>
      )}

      {showFilters && (
        <div className="card-filter-bar flex flex-wrap items-end gap-3 flex-shrink-0 pb-2 border-b border-slate-100">
          <div data-doctor-order-filter className="relative min-w-[180px]">
            <label className="block text-xs font-medium text-slate-600 mb-1">Doctor</label>
            <input
              type="text"
              value={
                doctorFilter
                  ? doctorOptions.find((p) => p.name === doctorFilter)?.label || doctorQuery
                  : doctorQuery
              }
              onChange={(e) => {
                setDoctorQuery(e.target.value)
                setDoctorFilter('')
                setDoctorOpen(true)
              }}
              onFocus={() => {
                setDoctorOpen(true)
                fetchHealthcarePractitioners(doctorQuery || undefined).then(setDoctorOptions)
              }}
              placeholder="All doctors…"
              className={filterInputClass}
            />
            {doctorOpen && doctorOptions.length > 0 && (
              <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-slate-300 bg-white shadow-lg">
                {doctorOptions.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100"
                    onClick={() => {
                      setDoctorFilter(p.name)
                      setDoctorQuery(p.label || p.name)
                      setDoctorOpen(false)
                    }}
                  >
                    {p.label || p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div data-doctor-order-filter className="relative min-w-[180px]">
            <label className="block text-xs font-medium text-slate-600 mb-1">Nurse</label>
            <input
              type="text"
              value={
                nurseFilter
                  ? nurseOptions.find((p) => p.name === nurseFilter)?.label || nurseQuery
                  : nurseQuery
              }
              onChange={(e) => {
                setNurseQuery(e.target.value)
                setNurseFilter('')
                setNurseOpen(true)
              }}
              onFocus={() => {
                setNurseOpen(true)
                fetchHealthcarePractitioners(nurseQuery || undefined).then(setNurseOptions)
              }}
              placeholder="All nurses…"
              className={filterInputClass}
            />
            {nurseOpen && nurseOptions.length > 0 && (
              <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-slate-300 bg-white shadow-lg">
                {nurseOptions.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100"
                    onClick={() => {
                      setNurseFilter(p.name)
                      setNurseQuery(p.label || p.name)
                      setNurseOpen(false)
                    }}
                  >
                    {p.label || p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`${filterInputClass} min-w-[140px]`}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <ClearFiltersButton
            onClick={clearFilters}
            disabled={activeFilterCount === 0}
            activeCount={activeFilterCount}
          />
        </div>
      )}

      {loading && <div className="text-sm text-slate-500 py-4 text-center">Loading…</div>}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">{error}</div>
      )}

      {!loading && !error && records.length === 0 && (
        <div className="p-4 text-sm text-slate-600 border border-dashed border-slate-300 rounded-md text-center">
          NO DOCTOR ORDERS FOUND.
        </div>
      )}

      {!loading && records.length > 0 && (
        <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-[min(60vh,32rem)] overflow-y-auto [scrollbar-width:thin]">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-[1]">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                {!patient && (
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Patient</th>
                )}
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Order</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Doctor</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Nurse remarks</th>
                <th className="px-3 py-2 text-center font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((row) => {
                const pending = isPending(row.status)
                return (
                  <tr key={row.name} className="hover:bg-slate-50">
                    <td
                      className="px-3 py-2 whitespace-nowrap cursor-pointer text-primary hover:underline"
                      onClick={() => setSelected(row)}
                    >
                      {formatDateTime(row.trans_date)}
                    </td>
                    {!patient && (
                      <td className="px-3 py-2">
                        {row.patient && onPatientClick ? (
                          <button
                            type="button"
                            className="text-primary hover:underline text-left"
                            onClick={(e) => {
                              e.stopPropagation()
                              onPatientClick(row.patient!)
                            }}
                          >
                            {row.patient_name || row.patient}
                          </button>
                        ) : (
                          row.patient_name || row.patient || '—'
                        )}
                      </td>
                    )}
                    <td
                      className="px-3 py-2 max-w-xs truncate text-slate-700 cursor-pointer"
                      onClick={() => setSelected(row)}
                    >
                      {row.doctor_order || '—'}
                    </td>
                    <td
                      className="px-3 py-2 whitespace-nowrap text-slate-600 cursor-pointer"
                      onClick={() => setSelected(row)}
                    >
                      {row.doctor_name || row.doctor || '—'}
                    </td>
                    <td
                      className="px-3 py-2 whitespace-nowrap cursor-pointer"
                      onClick={() => setSelected(row)}
                    >
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${statusClass(row.status)}`}
                      >
                        {row.status || 'Pending'}
                      </span>
                    </td>
                    <td
                      className="px-3 py-2 max-w-[12rem] truncate text-slate-600 cursor-pointer"
                      onClick={() => setSelected(row)}
                    >
                      {row.nurses_remarks || '—'}
                    </td>
                    <td className="px-3 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <div
                          className="relative inline-block"
                          ref={openActionRow === row.name ? actionMenuRef : undefined}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setOpenActionRow((prev) => (prev === row.name ? null : row.name))
                            }
                            disabled={actionLoading === row.name}
                            className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                            aria-label="Actions"
                          >
                            {actionLoading === row.name ? (
                              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                />
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8v8H4z"
                                />
                              </svg>
                            ) : (
                              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                              </svg>
                            )}
                          </button>
                          <PortalActionsMenu
                            open={openActionRow === row.name}
                            onClose={() => setOpenActionRow(null)}
                            triggerRef={actionMenuRef}
                            minWidth={200}
                          >
                            <button
                              type="button"
                              className={menuItemClass}
                              onClick={() => {
                                setOpenActionRow(null)
                                setSelected(row)
                              }}
                            >
                              View details
                            </button>
                            {nurseMode && pending && (
                              <button
                                type="button"
                                className={menuItemClass}
                                onClick={() => {
                                  setOpenActionRow(null)
                                  setNurseEditRow(row)
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                                Edit nurse note
                              </button>
                            )}
                            {nurseMode && pending && (
                              <button
                                type="button"
                                className={menuItemClass}
                                onClick={() => handleStatusAction(row, 'Finished')}
                              >
                                Mark finished
                              </button>
                            )}
                            {pending && (
                              <button
                                type="button"
                                className={`${menuItemClass} text-red-600 hover:bg-red-50`}
                                onClick={() => handleStatusAction(row, 'Canceled')}
                              >
                                Cancel order
                              </button>
                            )}
                          </PortalActionsMenu>
                        </div>
                        <PrintFormatDropdown
                          doctype="Doctor Order"
                          docName={row.name}
                          noLetterhead={0}
                          triggerPrint={1}
                          className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-primary hover:bg-slate-50"
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

      {selected && (
        <DetailSlideOver
          title="Doctor Order"
          subtitle={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {selected.trans_no ? (
                <span className="font-medium text-emerald-950">Trans {selected.trans_no}</span>
              ) : (
                <span className="font-medium text-emerald-950">{selected.name}</span>
              )}
              {selected.trans_date ? (
                <>
                  <span className="text-emerald-700/40">·</span>
                  <span>{formatDateTime(selected.trans_date)}</span>
                </>
              ) : null}
            </span>
          }
          icon={<ClipboardList className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          maxWidthClass="max-w-md"
          onClose={() => setSelected(null)}
          headerActions={
            <span
              className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(selected.status)}`}
            >
              {selected.status || 'Pending'}
            </span>
          }
        >
          <div className="flex flex-col gap-4 p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Patient', value: selected.patient_name || selected.patient || '—' },
                {
                  label: 'Admission',
                  value: selected.inpatient_admission || '—',
                },
                { label: 'Branch', value: selected.cost_center || '—' },
                { label: 'Department', value: selected.department || '—' },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-lg border border-emerald-100/80 bg-white p-3 shadow-sm"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/70">
                    {label}
                  </div>
                  <div className="mt-1 truncate text-sm font-semibold text-slate-800" title={value}>
                    {value}
                  </div>
                </div>
              ))}
            </div>

            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>Order description</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                {selected.doctor_order || '—'}
              </p>
            </section>

            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>Doctor</h3>
              <p className="text-sm font-medium text-slate-900">
                {selected.doctor_name || selected.doctor || '—'}
              </p>
              {selected.doctor_entry_date && (
                <p className="mt-1 text-xs text-slate-500">
                  Entered {formatDateTime(selected.doctor_entry_date)}
                </p>
              )}
            </section>

            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>Nursing response</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                {selected.nurses_remarks || '—'}
              </p>
              {(selected.nurse_name || selected.nurse) && (
                <p className="mt-2 text-xs text-slate-500">
                  {selected.nurse_name || selected.nurse}
                  {selected.nurse_entry_date
                    ? ` · ${formatDateTime(selected.nurse_entry_date)}`
                    : ''}
                </p>
              )}
            </section>
          </div>
        </DetailSlideOver>
      )}

      {nurseEditRow && (
        <NurseDoctorOrderModal
          order={nurseEditRow}
          onClose={() => setNurseEditRow(null)}
          onSuccess={() => {
            setNurseEditRow(null)
            load()
          }}
        />
      )}
    </div>
  )
}
