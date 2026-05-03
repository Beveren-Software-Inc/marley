import { useEffect, useState } from 'react'
import { Loader2, ShoppingCart, Trash2 } from 'lucide-react'
import { getPatientActiveAdmission, type InpatientRecord } from '../../services/inpatientRecords'
import { fetchMedicineGiven, deleteMedicineGiven, type MedicineGivenRow } from '../../services/medicineGiven'
import { toast } from '../../hooks/useToast'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { useCareContext } from '../../providers/CareContextProvider'

const iconToolbarBtn =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'

interface MedicineGivenListProps {
  patient?: string
  refreshKey?: string | number
}

export const MedicineGivenList = ({ patient, refreshKey }: MedicineGivenListProps) => {
  const { userCostCenter } = useCareContext()
  const [admission, setAdmission] = useState<InpatientRecord | null>(null)
  const [rows, setRows] = useState<MedicineGivenRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creatingSalesOrder, setCreatingSalesOrder] = useState(false)

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
        const adm = await getPatientActiveAdmission(patient)
        if (!adm) {
          setAdmission(null)
          setRows([])
          setError('No active inpatient admission found for this patient')
          return
        }
        setAdmission(adm)
        const data = await fetchMedicineGiven(adm.name, 100, 0)
        setRows(data)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load given medicines'
        setError(msg)
        setRows([])
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [patient, refreshKey])

  const handleDelete = async (row: MedicineGivenRow) => {
    if (!window.confirm('Remove this given medicine entry?')) return
    try {
      await deleteMedicineGiven(row.name)
      setRows((prev) => prev.filter((r) => r.name !== row.name))
      toast.success('Given medicine removed')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to delete given medicine'
      toast.error(msg)
    }
  }

  const handleCreateSalesOrder = async () => {
    if (!userCostCenter) {
      toast.error('No cost center found for current user')
      return
    }

    if (!window.confirm('Create sales order for today\'s medicine consumption? This will reduce stock from your warehouse.')) {
      return
    }

    setCreatingSalesOrder(true)
    try {
      const response = await fetch('/api/method/healthcare.api.nursing_inventory.create_daily_medicine_sales_order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cost_center: userCostCenter,
        }),
      })

      const result = await response.json()

      if (result.message?.sales_order) {
        toast.success(`Sales Order ${result.message.sales_order} created successfully`)
      } else if (result.exc) {
        throw new Error(result.exc)
      } else {
        throw new Error('Failed to create sales order')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create sales order'
      toast.error(msg)
    } finally {
      setCreatingSalesOrder(false)
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

  if (!rows.length) {
    return (
      <div className="text-sm text-slate-500">
        No given medicines recorded yet for admission {admission.name}.
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
            title="Create sales order for today's medicine consumption (draft; reduces stock from warehouse)"
          >
            {creatingSalesOrder ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ShoppingCart className="h-4 w-4" aria-hidden />
            )}
            <span className="sr-only">Create sales order</span>
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
                User
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((row) => (
              <tr key={row.name} className="hover:bg-slate-50">
                <td className="px-3 py-2 text-xs text-slate-700">
                  {row.date || '-'} {row.time || ''}
                </td>
                <td className="px-3 py-2 text-xs text-slate-700">
                  {row.medicine_name || row.medicine_code || '-'}
                </td>
                <td className="px-3 py-2 text-xs text-slate-700">
                  {row.qty ?? '-'} {row.unit || ''}
                </td>
                <td className="px-3 py-2 text-xs text-slate-700">
                  {row.user || '-'}
                </td>
                <td className="px-3 py-2 text-xs text-right">
                  <button
                    type="button"
                    onClick={() => handleDelete(row)}
                    className={`${iconToolbarBtn} border-red-200 text-red-700 hover:bg-red-50`}
                    title="Remove this given medicine row"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    <span className="sr-only">Remove</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}