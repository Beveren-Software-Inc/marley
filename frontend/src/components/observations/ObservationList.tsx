import { useState, useEffect, useRef } from 'react'
import { fetchObservations, createObservationSalesOrder, type Observation } from '../../services/observations'
import { useFormatMoney } from '../../hooks/useFormatMoney'
import { toast } from '../../hooks/useToast'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { ObservationDetailPanel } from './ObservationDetailPanel'
import { ScheduleObservationDischargeModal } from './ScheduleObservationDischargeModal'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'

interface ObservationListProps {
  patient?: string
  onPatientClick?: (patient: string) => void
}

export const ObservationList = ({ patient, onPatientClick }: ObservationListProps) => {
  const formatCurrency = useFormatMoney()
  const [observations, setObservations] = useState<Observation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [detailPreview, setDetailPreview] = useState<Observation | undefined>(undefined)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [dischargeTarget, setDischargeTarget] = useState<Observation | null>(null)
  const actionMenuRef = useRef<HTMLDivElement>(null)

  const loadObservations = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetchObservations(50, 0, patient)
      setObservations(response)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch observations'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadObservations()
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

  const handleOpenSalesOrder = (soName: string) => {
    setOpenActionRow(null)
    window.open(`/app/sales-order/${encodeURIComponent(soName)}`, '_blank')
  }

  const handleCreateSalesOrder = async (row: Observation) => {
    setActionLoading(row.name)
    try {
      const res = await createObservationSalesOrder(row.name)
      toast.success(
        res.existing
          ? `Sales Order ${res.sales_order} already linked`
          : `Sales Order ${res.sales_order} created (Draft)`,
      )
      setOpenActionRow(null)
      await loadObservations()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create Sales Order')
    } finally {
      setActionLoading(null)
    }
  }

  /** User can bill when IP/OP context exists and an Observation Level is set (server uses level for item/rate). */
  const canBillObservation = (obs: Observation): boolean =>
    !!(
      obs.observation_level &&
      (obs.admission_no || (obs.reference_doctype === 'Patient Visit' && obs.reference_docname))
    )

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading observations...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Observations</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
        </div>
      </div>
    )
  }

  if (observations.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">No observations found</div>
      </div>
    )
  }

  const getResultDisplay = (obs: Observation): string => {
    if (obs.result_text) return obs.result_text
    if (obs.result_float !== undefined && obs.result_float !== null) return obs.result_float.toString()
    if (obs.result_select) return obs.result_select
    if (obs.result_boolean !== undefined && obs.result_boolean !== null) return obs.result_boolean ? 'Yes' : 'No'
    if (obs.result_datetime) return new Date(obs.result_datetime).toLocaleString()
    if (obs.result_time) return obs.result_time
    if (obs.result_data) return obs.result_data
    return '-'
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Observation ID
            </th>
            {!patient && (
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Patient
              </th>
            )}
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Start Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              DC Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Obs Level
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Room
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Security Personnel
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Result
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Amount
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Duration
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Practitioner
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[140px]">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {observations.map((obs) => (
            <tr key={obs.name} className="hover:bg-slate-50">
              <td
                className="px-4 py-3 text-sm font-medium text-primary cursor-pointer hover:underline"
                onClick={() => {
                  setDetailPreview(obs)
                  setDetailName(obs.name)
                }}
              >
                {obs.trans_no || obs.name}
              </td>
              {!patient && (
                <td
                  className="px-4 py-3 text-sm text-slate-700 cursor-pointer"
                  onClick={() => obs.patient && onPatientClick?.(obs.patient)}
                >
                  <span className="font-medium text-primary hover:underline">{obs.patient_name || obs.patient || '-'}</span>
                </td>
              )}
              <td className="px-4 py-3 text-sm text-slate-700">
                {obs.start_date ? new Date(obs.start_date).toLocaleDateString() : '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {obs.dc_date ? new Date(obs.dc_date).toLocaleDateString() : '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {obs.observation_level || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {obs.room_name || obs.room || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {obs.designated_security_personel || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {getResultDisplay(obs)}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {obs.amount !== undefined && obs.amount !== null
                  ? formatCurrency(Number(obs.amount))
                  : '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {obs.duration || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {obs.practitioner_name || obs.healthcare_practitioner || '-'}
              </td>
              <td className="px-4 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  <div className="relative inline-block" ref={openActionRow === obs.name ? actionMenuRef : undefined}>
                    <button
                      type="button"
                      onClick={() => setOpenActionRow((prev) => (prev === obs.name ? null : obs.name))}
                      disabled={actionLoading === obs.name}
                      className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      aria-label="Actions"
                    >
                      {actionLoading === obs.name ? (
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      )}
                    </button>
                    <PortalActionsMenu
                      open={openActionRow === obs.name}
                      onClose={() => setOpenActionRow(null)}
                      triggerRef={actionMenuRef}
                      minWidth={200}
                    >
                      {!obs.dc_date ? (
                        <button
                          type="button"
                          onClick={() => {
                            setOpenActionRow(null)
                            setDischargeTarget(obs)
                          }}
                          className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                        >
                          Schedule discharge
                        </button>
                      ) : null}
                      {obs.order_created ? (
                        <button
                          type="button"
                          onClick={() => handleOpenSalesOrder(obs.order_created!)}
                          className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                        >
                          Open Sales Order
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!canBillObservation(obs)}
                          title={
                            !canBillObservation(obs)
                              ? !obs.observation_level
                                ? 'Select an Observation Level (billable) on the observation before creating a Sales Order'
                                : 'Link an admission (IP) or visit (OP) before creating a Sales Order'
                              : undefined
                          }
                          onClick={() => handleCreateSalesOrder(obs)}
                          className="block w-full text-left px-3 py-2 text-sm text-primary hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Create Sales Order
                        </button>
                      )}
                    </PortalActionsMenu>
                  </div>
                  <PrintFormatDropdown
                    doctype="Observation"
                    docName={obs.name}
                    noLetterhead={0}
                    triggerPrint={1}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {detailName ? (
        <ObservationDetailPanel
          name={detailName}
          preview={detailPreview}
          onClose={() => {
            setDetailName(null)
            setDetailPreview(undefined)
          }}
          onPatientClick={onPatientClick}
        />
      ) : null}

      {dischargeTarget ? (
        <ScheduleObservationDischargeModal
          observation={dischargeTarget}
          onClose={() => setDischargeTarget(null)}
          onSuccess={loadObservations}
        />
      ) : null}
    </div>
  )
}





