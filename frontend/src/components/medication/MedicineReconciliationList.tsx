import { useEffect, useState, useRef } from 'react'
import {
  getDischargeReconciliationRows,
  stopMedicationOnDischarge,
  transferMedicationsOnDischarge,
  returnStoppedMedicationsToStore,
  type DischargeReconciliationRow,
} from '../../services/medicineGiven'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { toast } from '../../hooks/useToast'
import { MoreVertical, Square, CheckSquare, StopCircle, ArrowRightCircle, Package } from 'lucide-react'

interface MedicineReconciliationListProps {
  admission: string
  refreshKey?: string | number
  onRefresh?: () => void
}

/** Modal to collect reason when stopping a medication on discharge */
function StopReasonModal({
  drugName,
  onClose,
  onConfirm,
}: {
  orderEntryName: string
  drugName?: string
  onClose: () => void
  onConfirm: (reason: string) => void | Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      await Promise.resolve(onConfirm(reason.trim()))
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  const onFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    handleSubmit()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" role="dialog" aria-modal="true" aria-labelledby="stop-reason-title">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h2 id="stop-reason-title" className="text-lg font-semibold text-slate-800 mb-2">
          Mark as stopped
        </h2>
        <p className="text-sm text-slate-600 mb-3">
          {drugName ? (
            <>Record why <strong>{drugName}</strong> is being stopped. The reason is saved on the prescription. Use <strong>Return selected</strong> to create one stock entry for all stopped medicines.</>
          ) : (
            <>Record why this medication is being stopped. The reason is saved on the prescription. Use <strong>Return selected</strong> to create one stock entry for all stopped medicines.</>
          )}
        </p>
        <form onSubmit={onFormSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="reason-stopped" className="block text-sm font-medium text-slate-700 mb-1">
              Reason stopped (optional)
            </label>
            <textarea
              id="reason-stopped"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Patient declined, changed treatment, adverse effect…"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[80px]"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="px-3 py-1.5 text-sm rounded bg-primary text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save reason'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export const MedicineReconciliationList = ({
  admission,
  refreshKey,
  onRefresh,
}: MedicineReconciliationListProps) => {
  const [rows, setRows] = useState<DischargeReconciliationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [menuOpenForRow, setMenuOpenForRow] = useState<string | null>(null)
  const [stopModal, setStopModal] = useState<{ name: string; drug_name?: string } | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [transferLoading, setTransferLoading] = useState(false)
  const [returnLoading, setReturnLoading] = useState(false)
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null)

  // Checkbox = for transfer. Unchecked = for return (default). Return selected creates stock entry for unchecked, non-returned (each must have reason_stopped).
  const nonReturnedRows = rows.filter((r) => !r.returned_to_store)
  const returnCandidateCount = rows.filter((r) => !selected.has(r.name) && !r.returned_to_store).length

  const loadRows = async () => {
    if (!admission) {
      setRows([])
      return
    }
    try {
      setLoading(true)
      setError(null)
      const data = await getDischargeReconciliationRows(admission)
      setRows(data)
      setSelected(new Set())
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load reconciliation rows'
      setError(msg)
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRows()
  }, [admission, refreshKey])

  const toggleSelect = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === nonReturnedRows.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(nonReturnedRows.map((r) => r.name)))
    }
  }

  const handleStop = (row: DischargeReconciliationRow) => {
    setMenuOpenForRow(null)
    setStopModal({ name: row.name, drug_name: row.drug_name })
  }

  const confirmStop = async (reason: string) => {
    if (!stopModal || !admission) return
    try {
      setActionLoading(stopModal.name)
      await stopMedicationOnDischarge(admission, stopModal.name, reason)
      toast.success("Reason saved. Click 'Return selected' to create stock entry for all stopped medicines.")
      setStopModal(null)
      await loadRows()
      onRefresh?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save reason'
      toast.error(msg)
    } finally {
      setActionLoading(null)
    }
  }

  const handleReturnSelected = async () => {
    const toReturn = rows.filter((r) => !selected.has(r.name) && !r.returned_to_store).map((r) => r.name)
    if (toReturn.length === 0) return
    try {
      setReturnLoading(true)
      const result = await returnStoppedMedicationsToStore(admission, toReturn)
      if (result.stock_entry) {
        toast.success(`Stock entry ${result.stock_entry} created for ${result.items?.length ?? 0} item(s)`)
      } else {
        toast.info(result.message ?? 'No medicines to return.')
      }
      await loadRows()
      onRefresh?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to return medicines to store'
      toast.error(msg)
    } finally {
      setReturnLoading(false)
    }
  }

  const handleTransferSelected = async () => {
    if (selected.size === 0) {
      toast.error('Select at least one medication to transfer')
      return
    }
    try {
      setTransferLoading(true)
      const result = await transferMedicationsOnDischarge(admission, Array.from(selected))
      toast.success(`Created visit ${result.patient_visit} and prescription ${result.patient_medication_order}`)
      setSelected(new Set())
      await loadRows()
      onRefresh?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to transfer medications'
      toast.error(msg)
    } finally {
      setTransferLoading(false)
    }
  }

  if (!admission) {
    return (
      <div className="text-sm text-slate-600">
        No admission selected.
      </div>
    )
  }

  if (loading) {
    return <div className="text-sm text-slate-600">Loading medicines not given…</div>
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-red-700">
        {error}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="text-sm text-slate-500 py-2">
        No remaining medicines to reconcile. All ordered quantities have been given or reconciled.
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs text-slate-500">
            By default all are for <strong>Return</strong>. Tick to <strong>Transfer</strong>. For return, enter reason (Stopped) for each, then click Return selected. Each returned item must have a reason.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReturnSelected}
              disabled={returnCandidateCount === 0 || returnLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border border-amber-600 bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Package className="w-4 h-4" />
              {returnLoading ? 'Creating…' : `Return selected (${returnCandidateCount})`}
            </button>
            <button
              type="button"
              onClick={handleTransferSelected}
              disabled={selected.size === 0 || transferLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border border-primary bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowRightCircle className="w-4 h-4" />
              {transferLoading ? 'Transferring…' : `Transfer selected (${selected.size})`}
            </button>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg overflow-auto max-h-[320px]">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left w-8">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="text-slate-500 hover:text-slate-700 disabled:opacity-50"
                    title={selected.size === nonReturnedRows.length ? 'Deselect all (all for return)' : 'Select all for transfer'}
                    disabled={nonReturnedRows.length === 0}
                  >
                    {selected.size === nonReturnedRows.length && nonReturnedRows.length > 0 ? (
                      <CheckSquare className="w-4 h-4 inline" />
                    ) : (
                      <Square className="w-4 h-4 inline" />
                    )}
                  </button>
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                  Drug
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                  Ordered
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                  Remaining
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase w-12">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.map((row) => {
                const isStopped = Boolean(row.reason_stopped)
                const isReturned = Boolean(row.returned_to_store)
                const showCheckbox = !isReturned
                return (
                <tr key={row.name} className={`hover:bg-slate-50 ${isStopped ? 'bg-slate-50/50' : ''}`}>
                  <td className="px-3 py-2">
                    {showCheckbox ? (
                      <button
                        type="button"
                        onClick={() => toggleSelect(row.name)}
                        className="text-slate-500 hover:text-slate-700"
                        title={selected.has(row.name) ? 'Selected for transfer' : 'Unchecked = for return'}
                      >
                        {selected.has(row.name) ? (
                          <CheckSquare className="w-4 h-4 inline" />
                        ) : (
                          <Square className="w-4 h-4 inline" />
                        )}
                      </button>
                    ) : (
                      <span className="text-slate-300" title="Already returned">
                        <Square className="w-4 h-4 inline" />
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-800">
                    <span className="inline-flex items-center gap-1.5">
                      {row.drug_name || row.drug || row.name}
                      {isStopped && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
                          Stopped
                        </span>
                      )}
                      {isReturned && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-medium">
                          Returned
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{row.quantity}</td>
                  <td className="px-3 py-2 text-slate-700 font-medium">{row.remaining}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex items-center">
                      <button
                        ref={menuOpenForRow === row.name ? menuTriggerRef : undefined}
                        type="button"
                        onClick={() => setMenuOpenForRow(menuOpenForRow === row.name ? null : row.name)}
                        className="p-1 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        aria-haspopup="true"
                        aria-expanded={menuOpenForRow === row.name}
                        title="Actions"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {menuOpenForRow === row.name && (
                        <PortalActionsMenu
                          open={true}
                          onClose={() => setMenuOpenForRow(null)}
                          triggerRef={menuTriggerRef as React.RefObject<HTMLElement | null>}
                          placement="below-right"
                          minWidth={180}
                        >
                          <div className="py-1">
                            <button
                              type="button"
                              className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                              onClick={() => handleStop(row)}
                              disabled={actionLoading === row.name}
                            >
                              <StopCircle className="w-4 h-4 text-amber-600" />
                              {isStopped ? 'Edit reason stopped' : 'Mark as stopped (save reason)'}
                            </button>
                            {showCheckbox && (
                              <button
                                type="button"
                                className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                                onClick={() => {
                                  setSelected((s) => new Set(s).add(row.name))
                                  setMenuOpenForRow(null)
                                }}
                              >
                                <ArrowRightCircle className="w-4 h-4 text-primary" />
                                Add to transfer
                              </button>
                            )}
                          </div>
                        </PortalActionsMenu>
                      )}
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      {stopModal && (
        <StopReasonModal
          orderEntryName={stopModal.name}
          drugName={stopModal.drug_name}
          onClose={() => setStopModal(null)}
          onConfirm={(reason) => confirmStop(reason)}
        />
      )}
    </>
  )
}
