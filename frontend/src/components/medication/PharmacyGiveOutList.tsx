import { useCallback, useEffect, useState } from 'react'
import { Eye, Trash2 } from 'lucide-react'
import {
  deleteNursingPharmacyGiveOut,
  fetchNursingPharmacyGiveOuts,
  isPharmacyGiveOutInvoiced,
  type PharmacyGiveOutRow,
} from '../../services/pharmacyGiveOut'
import { useCareContext } from '../../providers/CareContextProvider'
import { useDashboardCompactClinical } from '../../contexts/CardFilterContext'
import {
  CardRowMetaHint,
  dashboardCardRowHoverClass,
  formatDashboardDate,
} from '../ui/dashboardCardListing'
import { StatusPill } from '../ui/StatusPill'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { PharmacyGiveOutSlideOver } from './PharmacyGiveOutSlideOver'
import { toast } from '../../hooks/useToast'

const statusColors: Record<string, string> = {
  Draft: 'default',
  Signed: 'success',
  Pending: 'warning',
  'In Process': 'info',
  Completed: 'success',
  Cancelled: 'danger',
}

const iconToolbarBtn =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'

interface PharmacyGiveOutListProps {
  patient?: string
  refreshKey?: string | number
  onPatientClick?: (patient: string) => void
  /** When true (default), IP mode also filters by active admission. */
  scopeToActiveAdmission?: boolean
}

function PharmacyGiveOutActions({
  row,
  deleting,
  onView,
  onDelete,
}: {
  row: PharmacyGiveOutRow
  deleting: boolean
  onView: () => void
  onDelete: () => void
}) {
  const invoiced = isPharmacyGiveOutInvoiced(row)

  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={onView}
        className={`${iconToolbarBtn} text-primary border-slate-200`}
        title="View details"
        aria-label="View details"
      >
        <Eye className="h-4 w-4" aria-hidden />
      </button>
      <PrintFormatDropdown
        doctype="Patient Medication Order"
        docName={row.name}
        noLetterhead={0}
        triggerPrint={1}
        className={`${iconToolbarBtn} text-primary border-slate-200`}
        ariaLabel="Print"
        title="Print"
      />
      <button
        type="button"
        onClick={onDelete}
        disabled={invoiced || deleting}
        className={`${iconToolbarBtn} border-red-200 text-red-700 hover:bg-red-50`}
        title={
          invoiced
            ? `Linked to invoice ${row.invoice} — cannot remove`
            : 'Remove this pharmacy give-out record'
        }
        aria-label="Remove"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  )
}

export function PharmacyGiveOutList({
  patient,
  refreshKey,
  onPatientClick,
  scopeToActiveAdmission = true,
}: PharmacyGiveOutListProps) {
  const { mode, activeAdmission, selectedPatient: contextPatient } = useCareContext()
  const compactClinical = useDashboardCompactClinical()
  const effectivePatient = patient ?? (contextPatient || undefined)
  const scopeAdmission =
    scopeToActiveAdmission && mode === 'IP' && activeAdmission ? activeAdmission : undefined

  const [rows, setRows] = useState<PharmacyGiveOutRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [deletingName, setDeletingName] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchNursingPharmacyGiveOuts({
        patient: effectivePatient,
        inpatientRecord: effectivePatient ? scopeAdmission : undefined,
      })
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to load pharmacy give-out records'))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [effectivePatient, scopeAdmission])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const handleDelete = async (row: PharmacyGiveOutRow) => {
    if (isPharmacyGiveOutInvoiced(row)) return
    if (!window.confirm('Remove this pharmacy give-out record? The linked sales order will be cancelled.')) {
      return
    }

    setDeletingName(row.name)
    try {
      await deleteNursingPharmacyGiveOut(row.name)
      setRows((prev) => prev.filter((r) => r.name !== row.name))
      if (detailName === row.name) {
        setDetailName(null)
      }
      toast.success('Pharmacy give-out removed')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to remove pharmacy give-out record'
      toast.error(msg)
    } finally {
      setDeletingName(null)
    }
  }

  const slideOver = (
    <PharmacyGiveOutSlideOver giveOutName={detailName} onClose={() => setDetailName(null)} />
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6 text-sm text-slate-600">
        Loading pharmacy give-out records…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error.message}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center p-6 text-center text-sm text-slate-500">
          <p>No nursing pharmacy give-out records yet.</p>
          <p className="text-xs text-slate-400 mt-1">Use + to create one from the current prescription.</p>
        </div>
        {slideOver}
      </>
    )
  }

  if (compactClinical) {
    return (
      <>
        <div className="flex flex-col flex-1 min-h-0">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-white border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2 pr-2 font-medium">Date</th>
                <th className="py-2 pr-2 font-medium">Medications</th>
                <th className="py-2 pr-2 font-medium hidden sm:table-cell">Invoice</th>
                <th className="py-2 pr-2 font-medium">Status</th>
                <th className="py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.name}
                  className={`border-b border-slate-100 ${dashboardCardRowHoverClass}`}
                  onClick={() => setDetailName(row.name)}
                >
                  <td className="py-2 pr-2 align-top whitespace-nowrap text-slate-700">
                    {formatDashboardDate(row.posting_date || row.start_date)}
                  </td>
                  <td className="py-2 pr-2 align-top min-w-0">
                    <div className="font-medium text-slate-900 truncate">
                      {row.medications_summary || '—'}
                    </div>
                    <CardRowMetaHint
                      fields={[
                        ['Source prescription', row.source_prescription],
                        ['Invoice', row.invoice || row.sales_order],
                        ['Patient', row.patient_name || row.patient],
                      ]}
                    />
                  </td>
                  <td className="py-2 pr-2 align-top hidden sm:table-cell text-slate-700 truncate max-w-[8rem]">
                    {row.invoice || row.sales_order || '—'}
                  </td>
                  <td className="py-2 pr-2 align-top">
                    <StatusPill
                      status={row.status || 'Pending'}
                      color={statusColors[row.status || ''] || 'default'}
                    />
                  </td>
                  <td className="py-2 align-top">
                    <PharmacyGiveOutActions
                      row={row}
                      deleting={deletingName === row.name}
                      onView={() => setDetailName(row.name)}
                      onDelete={() => void handleDelete(row)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {slideOver}
      </>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-4">Date</th>
              {!effectivePatient && <th className="py-2 pr-4">Patient</th>}
              <th className="py-2 pr-4">Medications</th>
              <th className="py-2 pr-4">Source prescription</th>
              <th className="py-2 pr-4">Invoice</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.name}
                className={`border-b border-slate-100 hover:bg-slate-50 ${dashboardCardRowHoverClass}`}
                onClick={() => setDetailName(row.name)}
              >
                <td className="py-3 pr-4 whitespace-nowrap text-slate-700">
                  {formatDashboardDate(row.posting_date || row.start_date)}
                </td>
                {!effectivePatient && (
                  <td className="py-3 pr-4">
                    {onPatientClick && row.patient ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onPatientClick(row.patient)
                        }}
                        className="text-primary hover:underline text-left"
                      >
                        {row.patient_name || row.patient}
                      </button>
                    ) : (
                      row.patient_name || row.patient
                    )}
                  </td>
                )}
                <td className="py-3 pr-4 text-slate-700 max-w-xs truncate" title={row.medications_summary}>
                  {row.medications_summary || '—'}
                </td>
                <td className="py-3 pr-4 text-slate-700">{row.source_prescription || '—'}</td>
                <td className="py-3 pr-4 text-slate-700">{row.invoice || row.sales_order || '—'}</td>
                <td className="py-3 pr-4">
                  <StatusPill
                    status={row.status || 'Pending'}
                    color={statusColors[row.status || ''] || 'default'}
                  />
                </td>
                <td className="py-3 pr-2">
                  <PharmacyGiveOutActions
                    row={row}
                    deleting={deletingName === row.name}
                    onView={() => setDetailName(row.name)}
                    onDelete={() => void handleDelete(row)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {slideOver}
    </>
  )
}
