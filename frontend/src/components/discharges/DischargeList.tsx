import { useState, useEffect } from 'react'
import { fetchDischarges, type Discharge } from '../../services/discharges'
import { StatusPill } from '../ui/StatusPill'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { DocDetailView } from '../ui/DocDetailView'

const statusColors: Record<string, string> = {
  'Draft': 'warning',
  'Submitted': 'success',
  'Cancelled': 'danger'
}

interface DischargeListProps {
  patient?: string
  admission?: string
}

export const DischargeList = ({ patient, admission }: DischargeListProps) => {
  const [discharges, setDischarges] = useState<Discharge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [admissionFilter, setAdmissionFilter] = useState<string>('')

  useEffect(() => {
    const loadDischarges = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetchDischarges(50, 0, patient, admission)
        setDischarges(response)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch discharges'))
      } finally {
        setLoading(false)
      }
    }

    loadDischarges()
  }, [patient, admission])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading discharges...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Discharges</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
        </div>
      </div>
    )
  }

  if (discharges.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">No discharges found</div>
      </div>
    )
  }

  const getDocStatus = (docstatus?: number): string => {
    if (docstatus === 0) return 'Draft'
    if (docstatus === 1) return 'Submitted'
    if (docstatus === 2) return 'Cancelled'
    return 'Draft'
  }

  const filtered = discharges.filter((d) => {
    const status = getDocStatus(d.docstatus)
    if (statusFilter && status !== statusFilter) return false
    if (typeFilter && d.discharge_type !== typeFilter) return false
    if (
      admissionFilter &&
      !(d.admission || '')
        .toLowerCase()
        .includes(admissionFilter.toLowerCase())
    ) {
      return false
    }
    return true
  })

  const statusOptions = ['Draft', 'Submitted', 'Cancelled']
  const dischargeTypeOptions = Array.from(
    new Set(discharges.map((d) => d.discharge_type).filter((x): x is string => !!x))
  ).sort()

  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      {/* Filters */}
      <div className="px-4 pt-3 pb-2 border-b border-slate-200 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col">
          <label className="text-xs font-medium text-slate-600 mb-1">IP Admission</label>
          <input
            type="text"
            value={admissionFilter}
            onChange={(e) => setAdmissionFilter(e.target.value)}
            placeholder="Search admission no..."
            className="w-40 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs font-medium text-slate-600 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-32 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs font-medium text-slate-600 mb-1">Discharge Type</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-40 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All</option>
            {dischargeTypeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        {(admissionFilter || statusFilter || typeFilter) && (
          <button
            type="button"
            onClick={() => {
              setAdmissionFilter('')
              setStatusFilter('')
              setTypeFilter('')
            }}
            className="ml-auto text-xs text-slate-600 hover:text-slate-900 px-2 py-1 rounded-md border border-slate-200 hover:border-slate-400"
          >
            Clear
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Discharge ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Patient
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Admission No
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Discharge Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Discharge Type
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Discharged By
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[100px]">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {filtered.map((discharge) => (
            <tr key={discharge.name} className="hover:bg-slate-50">
              <td
                className="px-4 py-3 text-sm font-medium text-primary cursor-pointer hover:underline"
                onClick={() => setDetailName(discharge.name)}
              >
                {discharge.name}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {discharge.patient_name || discharge.file_no || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {discharge.admission || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {discharge.discharge_date 
                  ? new Date(discharge.discharge_date).toLocaleString() 
                  : '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {discharge.discharge_type || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {discharge.discharged_by_user_name || discharge.discharged_by_user || '-'}
              </td>
              <td className="px-4 py-3">
                <StatusPill
                  status={getDocStatus(discharge.docstatus)}
                  color={statusColors[getDocStatus(discharge.docstatus)] || 'default'}
                />
              </td>
              <td className="px-4 py-2 align-middle">
                <PrintFormatDropdown
                  doctype="Discharge"
                  docName={discharge.name}
                  noLetterhead={0}
                  triggerPrint={1}
                />
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>

      {detailName && (
        <DetailSlideOver
          title="Discharge"
          subtitle={detailName}
          onClose={() => setDetailName(null)}
        >
          <DocDetailView doctype="Discharge" name={detailName} />
        </DetailSlideOver>
      )}
    </div>
  )
}





