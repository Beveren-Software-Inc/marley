import { useEffect, useState } from 'react'
import { getPatientActiveAdmission, type InpatientRecord } from '../../services/inpatientRecords'
import { fetchMedicineGiven, deleteMedicineGiven, type MedicineGivenRow } from '../../services/medicineGiven'
import { toast } from '../../hooks/useToast'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'

interface MedicineGivenListProps {
  patient?: string
  refreshKey?: string | number
}

export const MedicineGivenList = ({ patient, refreshKey }: MedicineGivenListProps) => {
  const [admission, setAdmission] = useState<InpatientRecord | null>(null)
  const [rows, setRows] = useState<MedicineGivenRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">
          Admission: <span className="font-medium text-slate-700">{admission.name}</span>
        </div>
        <PrintFormatDropdown
          doctype="Admission Detail"
          docName={admission.name}
          noLetterhead={0}
          triggerPrint={1}
          className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-primary hover:bg-slate-50"
        />
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
                    className="inline-flex items-center justify-center px-2 py-1 rounded-md border border-red-300 text-[11px] text-red-700 hover:bg-red-50"
                  >
                    Remove
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