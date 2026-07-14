import { useEffect, useRef, useState } from 'react'
import { Loader2, MoreHorizontal, Pill, Pencil, ShoppingCart, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { getPatientActiveAdmission, type InpatientRecord } from '../../services/inpatientRecords'
import {
  fetchMedicineGiven,
  fetchMissedMedicine,
  deleteMedicineGiven,
  convertMissedMedicineToGiven,
  checkMissedMedicineNow,
  createMedicineGivenSalesOrder,
  type MedicineGivenRow,
  type MissedMedicineRow,
} from '../../services/medicineGiven'
import { toast } from '../../hooks/useToast'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'
import { useCareContext } from '../../providers/CareContextProvider'
import { CreateMedicineGivenModal } from './CreateMedicineGivenModal'

const iconToolbarBtn =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'

const formatScheduleTime = (time?: string | null) => {
  if (!time) return ''
  return formatDisplayTime(time).slice(0, 5)
}

const formatDisplayTime = (time?: string | null) => {
  if (!time) return ''
  let value = time.trim()
  if (value.includes(' ')) {
    value = value.split(' ').pop() || value
  }
  if (value.includes('.')) {
    value = value.split('.')[0]
  }
  return value.length >= 8 ? value.slice(0, 8) : value
}

const formatGivenDateTime = (date?: string | null, time?: string | null) => {
  const datePart = date || ''
  const timePart = formatDisplayTime(time)
  if (datePart && timePart) return `${datePart} ${timePart}`
  return datePart || timePart || '—'
}

function DetailField({ label, value }: { label: string; value?: string | null }) {
  const display = value?.trim() ? value : '—'
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-900 break-words">{display}</p>
    </div>
  )
}

function MedicineGivenDetailPanel({
  row,
  onClose,
}: {
  row: MedicineGivenRow
  onClose: () => void
}) {
  const medicineLabel = row.medicine_name || row.medicine_code || 'Medicine given'
  const pmo = row.medication_order || row.patient_medication_order

  return (
    <DetailSlideOver
      title={medicineLabel}
      subtitle={formatGivenDateTime(row.date, row.time)}
      icon={<Pill className="h-5 w-5" />}
      onClose={onClose}
      maxWidthClass="max-w-lg"
    >
      <div className="space-y-4">
        <section className={MODAL_SECTION_CLASS}>
          <h3 className={MODAL_SECTION_TITLE_CLASS}>Administration</h3>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DetailField label="Date" value={row.date} />
            <DetailField label="Time given" value={formatDisplayTime(row.time)} />
            <DetailField label="Scheduled timing" value={formatScheduleTime(row.medicine_given_timing) || row.medicine_given_timing} />
            <DetailField label="Dose" value={row.dose} />
            <DetailField label="Quantity" value={row.qty != null ? `${row.qty} ${row.unit || ''}`.trim() : undefined} />
            <DetailField label="Given by" value={row.user} />
            <DetailField label="Frequency" value={row.frequency != null ? String(row.frequency) : undefined} />
          </div>
        </section>

        <section className={MODAL_SECTION_CLASS}>
          <h3 className={MODAL_SECTION_TITLE_CLASS}>Medicine & prescription</h3>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DetailField label="Medicine code" value={row.medicine_code} />
            <DetailField label="Medicine name" value={row.medicine_name} />
            <DetailField label="Patient Medication Order" value={pmo} />
            <DetailField label="Prescription type" value={row.prescription_type} />
            <DetailField label="PRN" value={row.is_prn ? 'Yes' : 'No'} />
          </div>
        </section>

        {(row.batch_no || row.lot_no || row.dispensing_lot) && (
          <section className={MODAL_SECTION_CLASS}>
            <h3 className={MODAL_SECTION_TITLE_CLASS}>Batch & lot</h3>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DetailField label="Batch" value={row.batch_id || row.batch_no} />
              <DetailField label="Lot" value={row.dispensing_lot || row.lot_no} />
            </div>
          </section>
        )}

        <section className={MODAL_SECTION_CLASS}>
          <h3 className={MODAL_SECTION_TITLE_CLASS}>Billing & notes</h3>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DetailField label="Sales order" value={row.sales_order} />
            <DetailField label="Delivery note" value={row.delivery_note} />
          </div>
          {row.dose_notes ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Dose notes</p>
              <p className="mt-1 text-sm text-slate-800 whitespace-pre-wrap">{row.dose_notes}</p>
            </div>
          ) : null}
          {(row.override_exceeded_frequency ||
            row.override_exceeded_dose_limit ||
            row.override_exceeded_cumulative_24h) ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-2">
              <p className="text-xs font-semibold text-amber-900">Override recorded</p>
              {row.override_exceeded_frequency ? (
                <p className="text-xs text-amber-800">Exceeded prescribed daily frequency</p>
              ) : null}
              {row.override_exceeded_dose_limit ? (
                <p className="text-xs text-amber-800">Exceeded maximum dose limit</p>
              ) : null}
              {row.override_exceeded_cumulative_24h ? (
                <p className="text-xs text-amber-800">Exceeded 24-hour cumulative dose</p>
              ) : null}
              <DetailField label="Reason" value={row.override_reason} />
              <DetailField label="Override user" value={row.override_user} />
              <DetailField label="Override time" value={row.override_timestamp} />
            </div>
          ) : null}
        </section>
      </div>
    </DetailSlideOver>
  )
}

function MarkMissedGivenModal({
  row,
  onClose,
  onConfirm,
}: {
  row: MissedMedicineRow
  onClose: () => void
  onConfirm: (lateReason: string) => void | Promise<void>
}) {
  const [lateReason, setLateReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const medicineLabel = row.medicine_name || row.medicine_code || 'this medicine'
  const scheduledTime = formatScheduleTime(row.medicine_given_timing || row.time)
  const scheduledDate = row.date || 'today'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await Promise.resolve(onConfirm(lateReason.trim()))
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mark-missed-given-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl ring-1 ring-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 id="mark-missed-given-title" className="text-lg font-semibold text-slate-900">
            Record missed dose as given
          </h2>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            You are marking a missed dose of <strong className="text-slate-800">{medicineLabel}</strong>
            {scheduledTime ? (
              <>
                {' '}
                scheduled for <strong className="text-slate-800">{scheduledTime}</strong>
              </>
            ) : null}{' '}
            on <strong className="text-slate-800">{scheduledDate}</strong> as administered.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label htmlFor="late-reason" className="block text-sm font-medium text-slate-700 mb-1">
              Reason for late administration <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              id="late-reason"
              value={lateReason}
              onChange={(e) => setLateReason(e.target.value)}
              placeholder="e.g. Patient was asleep, delayed by procedure, refused earlier…"
              rows={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary min-h-[80px]"
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                'Mark as given'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface MedicineGivenListProps {
  patient?: string
  refreshKey?: string | number
  /** When false, hides row edit/delete actions (e.g. discharge read-only view). */
  manageRows?: boolean
}

export const MedicineGivenList = ({ patient, refreshKey, manageRows = true }: MedicineGivenListProps) => {
  const { activeAdmission, guardClinicalEdit } = useCareContext()
  const [admission, setAdmission] = useState<InpatientRecord | null>(null)
  const [rows, setRows] = useState<MedicineGivenRow[]>([])
  const [missedRows, setMissedRows] = useState<MissedMedicineRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creatingSalesOrder, setCreatingSalesOrder] = useState(false)
  const [confirm, setConfirm] = useState<{ kind: 'delete'; row: MedicineGivenRow } | { kind: 'createSO' } | null>(null)
  const [checkingMissedNow, setCheckingMissedNow] = useState(false)
  const [pendingMissedRow, setPendingMissedRow] = useState<MissedMedicineRow | null>(null)
  const [detailRow, setDetailRow] = useState<MedicineGivenRow | null>(null)
  const [editRow, setEditRow] = useState<MedicineGivenRow | null>(null)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!patient) {
        setAdmission(null)
        setRows([])
        return
      }

      try {
        setLoading(true)
        setError(null)

        let admName: string | undefined
        let admObj: InpatientRecord | null = null

        if (activeAdmission) {
          admName = activeAdmission
          admObj = { name: activeAdmission, patient, patient_name: '', status: 'Admitted', scheduled_date: '' }
        } else {
          admObj = await getPatientActiveAdmission(patient)
          admName = admObj?.name
        }

        if (!admObj || !admName) {
          setAdmission(null)
          setRows([])
          setMissedRows([])
          setError('No active inpatient admission found for this patient')
          return
        }
        setAdmission(admObj)
        const [data, missed] = await Promise.all([
          fetchMedicineGiven(admName, 100, 0),
          fetchMissedMedicine(admName, 100, 0),
        ])
        setRows(data)
        setMissedRows(missed)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load given medicines'
        setError(msg)
        setRows([])
        setMissedRows([])
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [patient, refreshKey, activeAdmission])

  const refreshGivenRows = async () => {
    if (!admission?.name) return
    const refreshed = await fetchMedicineGiven(admission.name, 100, 0)
    setRows(refreshed)
  }

  const handleDelete = (row: MedicineGivenRow) => {
    setConfirm({ kind: 'delete', row })
  }

  const doDelete = (row: MedicineGivenRow) => {
    setConfirm(null)
    guardClinicalEdit(() => {
      void (async () => {
        try {
          await deleteMedicineGiven(row.name)
          setRows((prev) => prev.filter((r) => r.name !== row.name))
          toast.success('Given medicine removed')
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Failed to delete given medicine'
          toast.error(msg)
        }
      })()
    })
  }

  const handleCreateSalesOrder = () => {
    if (!admission?.name) {
      toast.error('NO ACTIVE INPATIENT ADMISSION FOUND')
      return
    }
    setConfirm({ kind: 'createSO' })
  }

  const doCreateSalesOrder = async () => {
    setConfirm(null)
    if (!admission?.name) return
    setCreatingSalesOrder(true)
    try {
      const result = await createMedicineGivenSalesOrder(admission.name)
      const dnMsg = result.delivery_note ? ` · Delivery Note ${result.delivery_note}` : ''
      const linkedMsg =
        result.linked_rows != null && result.linked_rows > 0
          ? ` (${result.linked_rows} row${result.linked_rows === 1 ? '' : 's'} linked)`
          : ''
      toast.success(`Sales Order ${result.sales_order} created${dnMsg}${linkedMsg}`)
      const refreshed = await fetchMedicineGiven(admission.name, 100, 0)
      setRows(refreshed)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create Service Bill'
      toast.error(msg)
    } finally {
      setCreatingSalesOrder(false)
    }
  }

  const handleConvertMissedToGiven = async (row: MissedMedicineRow, lateReason = '') => {
    try {
      await convertMissedMedicineToGiven(row.name, lateReason || '')
      setMissedRows((prev) => prev.filter((r) => r.name !== row.name))
      if (admission) {
        const refreshed = await fetchMedicineGiven(admission.name, 100, 0)
        setRows(refreshed)
      }
      toast.success('Missed dose recorded as given')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to convert missed medicine'
      toast.error(msg)
      throw e
    }
  }

  const handleCheckMissedNow = async () => {
    if (!admission) return
    try {
      setCheckingMissedNow(true)
      const result = await checkMissedMedicineNow(admission.name, 60)
      const missed = await fetchMissedMedicine(admission.name, 100, 0)
      setMissedRows(missed)
      toast.success(
        result.created_rows > 0
          ? `Detected ${result.created_rows} missed medicine entr${result.created_rows === 1 ? 'y' : 'ies'}`
          : 'No new missed medicine detected'
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to check missed medicine now'
      toast.error(msg)
    } finally {
      setCheckingMissedNow(false)
    }
  }

  if (!patient) {
    return (
      <div className="text-sm text-slate-600">
        Select a patient to view given medicines.
      </div>
    )
  }

  if (loading) {
    return <div className="text-sm text-slate-600">Loading given medicines...</div>
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-red-700">
        {error}
      </div>
    )
  }

  if (!admission) {
    return (
      <div className="text-sm text-slate-600">
        No active inpatient admission for this patient.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Toolbar — icon actions; hover shows full label */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs text-slate-500 min-w-0 truncate">
          Admission: <span className="font-medium text-slate-700">{admission.name}</span>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/90 p-1">
          <button
            type="button"
            onClick={handleCreateSalesOrder}
            disabled={creatingSalesOrder}
            className={`${iconToolbarBtn} text-blue-700 border-blue-200/80 hover:bg-blue-50`}
            title="Create Service Bill for today's medicine consumption (draft; reduces stock from warehouse)"
          >
            {creatingSalesOrder ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ShoppingCart className="h-4 w-4" aria-hidden />
            )}
            <span className="sr-only">Create Service Bill</span>
          </button>
          <PrintFormatDropdown
            doctype="Admission Detail"
            docName={admission.name}
            noLetterhead={0}
            triggerPrint={1}
            title="Print — choose format"
            className={`${iconToolbarBtn} text-primary border-slate-200`}
            ariaLabel="Print"
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-auto max-h-[320px]">
        <div className="px-3 py-2 border-b border-slate-200 bg-slate-50">
          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Given Medicines</div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                Date / Time
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                Medicine
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                Qty
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                Batch / Lot
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                User
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                Billing
              </th>
              {manageRows ? (
                <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">
                  Actions
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={manageRows ? 7 : 6} className="px-3 py-4 text-xs text-slate-500 text-center">
                  No given medicines recorded yet for this admission.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.name} className="hover:bg-slate-50">
                <td className="px-3 py-2 text-xs text-slate-700">
                  <button
                    type="button"
                    onClick={() => setDetailRow(row)}
                    className="text-left text-primary hover:underline font-medium"
                    title="View administration details"
                  >
                    {formatGivenDateTime(row.date, row.time)}
                  </button>
                </td>
                <td className="px-3 py-2 text-xs text-slate-700">
                  {row.medicine_name || row.medicine_code || '-'}
                </td>
                <td className="px-3 py-2 text-xs text-slate-700">
                  {row.qty ?? '-'} {row.unit || ''}
                </td>
                <td className="px-3 py-2 text-xs text-slate-700">
                  {row.batch_no || row.lot_no || row.dispensing_lot ? (
                    <div className="flex flex-col gap-0.5">
                      {row.batch_no ? (
                        <span className="truncate max-w-[120px]" title={row.batch_id || row.batch_no}>
                          Batch: {row.batch_id || row.batch_no}
                        </span>
                      ) : null}
                      {row.dispensing_lot ? (
                        <span className="truncate max-w-[120px]" title={row.dispensing_lot}>
                          Lot: {row.dispensing_lot}
                        </span>
                      ) : row.lot_no ? (
                        <span className="truncate max-w-[120px]" title={row.lot_no}>
                          Lot: {row.lot_no}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-slate-700">
                  {row.user || '-'}
                </td>
                <td className="px-3 py-2 text-xs text-slate-700">
                  {row.sales_order ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="inline-flex w-fit items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                        Billed
                      </span>
                      <span className="text-[10px] text-slate-500 truncate max-w-[140px]" title={row.sales_order}>
                        SO: {row.sales_order}
                      </span>
                      {row.delivery_note ? (
                        <span className="text-[10px] text-slate-500 truncate max-w-[140px]" title={row.delivery_note}>
                          DN: {row.delivery_note}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-400">Pending</span>
                  )}
                </td>
                {manageRows ? (
                  <td className="px-3 py-2 text-xs text-right">
                    <div className="relative inline-block" ref={openActionRow === row.name ? menuRef : undefined}>
                      <button
                        type="button"
                        aria-label="Actions"
                        onClick={() => setOpenActionRow((prev) => (prev === row.name ? null : row.name))}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      >
                        <MoreHorizontal className="h-4 w-4" aria-hidden />
                      </button>
                      <PortalActionsMenu
                        open={openActionRow === row.name}
                        onClose={() => setOpenActionRow(null)}
                        triggerRef={menuRef}
                        minWidth={180}
                      >
                        <button
                          type="button"
                          disabled={Boolean(row.sales_order)}
                          onClick={() => {
                            setOpenActionRow(null)
                            guardClinicalEdit(() => setEditRow(row))
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                          title={
                            row.sales_order
                              ? `Linked to ${row.sales_order} — cannot edit`
                              : 'Edit this given medicine row'
                          }
                        >
                          <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenActionRow(null)
                            handleDelete(row)
                          }}
                          disabled={Boolean(row.sales_order)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                          title={
                            row.sales_order
                              ? `Linked to ${row.sales_order} — cannot remove`
                              : 'Remove this given medicine row'
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Delete
                        </button>
                      </PortalActionsMenu>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-auto max-h-[280px]">
        <div className="px-3 py-2 border-b border-amber-200 flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
            Missed Medicines
          </div>
          <button
            type="button"
            onClick={handleCheckMissedNow}
            disabled={checkingMissedNow}
            className="inline-flex items-center rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60"
            title="Detect missed doses for daily-frequency medicines only (morning/noon/evening/night). Long-interval medicines are manual."
          >
            {checkingMissedNow ? 'Checking…' : 'Check Missed Now'}
          </button>
        </div>
        {missedRows.length === 0 ? (
          <div className="px-3 py-3 text-xs text-amber-900/80">No missed medicines detected.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-amber-100/70 border-b border-amber-200">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-amber-900 uppercase">
                  Scheduled
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-amber-900 uppercase">
                  Medicine
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-amber-900 uppercase">
                  Qty
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-amber-900 uppercase">
                  Notes
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-amber-900 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-200">
              {missedRows.map((row) => (
                <tr key={row.name} className="hover:bg-amber-100/50">
                  <td className="px-3 py-2 text-xs text-slate-700">
                    {row.date || '-'} {formatScheduleTime(row.medicine_given_timing || row.time) || '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-700">
                    {row.medicine_name || row.medicine_code || '-'}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-700">
                    {row.qty ?? '-'} {row.unit || ''}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-700 max-w-[260px] truncate" title={row.dose_notes || ''}>
                    {row.dose_notes || '-'}
                  </td>
                  <td className="px-3 py-2 text-xs text-right">
                    <button
                      type="button"
                      onClick={() => setPendingMissedRow(row)}
                      className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
                      title="Record this missed dose as given"
                    >
                      Mark Given
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pendingMissedRow && (
        <MarkMissedGivenModal
          row={pendingMissedRow}
          onClose={() => setPendingMissedRow(null)}
          onConfirm={(lateReason) => handleConvertMissedToGiven(pendingMissedRow, lateReason)}
        />
      )}

      {detailRow && (
        <MedicineGivenDetailPanel row={detailRow} onClose={() => setDetailRow(null)} />
      )}

      {editRow && patient && (
        <CreateMedicineGivenModal
          initialPatient={patient}
          inpatientRecord={admission?.name}
          editRow={editRow}
          onClose={() => setEditRow(null)}
          onSuccess={async () => {
            setEditRow(null)
            await refreshGivenRows()
          }}
        />
      )}
      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        variant="danger"
        title="Remove given medicine"
        message="Remove this given medicine entry?"
        confirmLabel="Remove"
        onConfirm={() => confirm?.kind === 'delete' && doDelete(confirm.row)}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === 'createSO'}
        variant="warning"
        title="Create service bill"
        message="Create Service Bill for today's medicine consumption? This will reduce stock from the admission branch warehouse."
        confirmLabel="Create bill"
        loading={creatingSalesOrder}
        onConfirm={() => void doCreateSalesOrder()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}