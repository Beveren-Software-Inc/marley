import { useEffect, useState } from 'react'
import { getInternalTransfers, type InternalTransferRow } from '../../services/internalTransfer'

interface InternalTransferListProps {
  patient?: string
  refreshKey?: number | string
  onPatientClick?: (patient: string) => void
}

export const InternalTransferList = ({ patient, refreshKey, onPatientClick }: InternalTransferListProps) => {
  const [rows, setRows] = useState<InternalTransferRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const data = await getInternalTransfers({ patient, limit: 100 })
        setRows(data)
      } catch {
        setRows([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [patient, refreshKey])

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-left">
            <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Transfer No</th>
            {!patient && (
              <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Patient</th>
            )}
            <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Admission</th>
            <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Transfer Date</th>
            <th className="px-3 py-2 font-semibold text-slate-600 text-xs">From</th>
            <th className="px-3 py-2 font-semibold text-slate-600 text-xs">To</th>
            <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Reason</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={patient ? 6 : 7} className="px-3 py-8 text-center text-slate-400 text-xs">Loading…</td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={patient ? 6 : 7} className="px-3 py-8 text-center text-slate-400 text-xs">NO INTERNAL TRANSFERS FOUND</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.name} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td className="px-3 py-2 font-mono text-xs text-slate-600">{row.name}</td>
                {!patient && (
                  <td
                    className="px-3 py-2 cursor-pointer"
                    onClick={() => row.patient && onPatientClick?.(row.patient)}
                  >
                    <div className="font-medium text-primary hover:underline">{row.patient_name || row.patient}</div>
                    <div className="text-xs text-slate-400">{row.patient}</div>
                  </td>
                )}
                <td className="px-3 py-2 text-slate-600">{row.inpatient_admission}</td>
                <td className="px-3 py-2 text-slate-600">{row.transfer_datetime ? new Date(row.transfer_datetime).toLocaleString('en-GB') : '—'}</td>
                <td className="px-3 py-2 text-slate-600">{row.from_cost_center}</td>
                <td className="px-3 py-2 text-slate-600">{row.to_cost_center}</td>
                <td className="px-3 py-2 text-slate-600">{row.reason || '—'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
