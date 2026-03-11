import { useState, useEffect } from 'react'
import { fetchIPServices, type IPServiceRow } from '../../services/ipServices'

interface IPServiceListProps {
  patient?: string
  admission_no?: string
  refreshKey?: number | string
}

export const IPServiceList = ({ patient, admission_no, refreshKey }: IPServiceListProps) => {
  const [list, setList] = useState<IPServiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    setLoading(true)
    fetchIPServices(50, 0, patient, admission_no)
      .then((data) => {
        if (!cancelled) setList(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to fetch IP Services'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [patient, admission_no, refreshKey])

  const openForm = (name: string | null) => {
    if (name) {
      window.open(`/app/ip-service/${encodeURIComponent(name)}`, '_blank')
    } else {
      window.open('/app/ip-service/new', '_blank')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6 text-slate-500 text-sm">
        Loading IP Services…
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
        {error.message}
      </div>
    )
  }

  if (list.length === 0) {
    return (
      <div className="flex items-center justify-center p-6 text-slate-500 text-sm">
        No IP Services found. Create one with the + button.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto min-w-0">
      <table className="w-full text-sm min-w-[600px]">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-600 font-medium">
            <th className="py-2 pr-2">Name</th>
            <th className="py-2 pr-2">Admission</th>
            <th className="py-2 pr-2">Patient</th>
            <th className="py-2 pr-2">Type</th>
            <th className="py-2 pr-2">Service Request</th>
            <th className="py-2 pr-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {list.map((row) => (
            <tr
              key={row.name}
              className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
              onClick={() => openForm(row.name)}
            >
              <td className="py-2 pr-2 font-medium text-primary">{row.name}</td>
              <td className="py-2 pr-2">{row.admission_no ?? '–'}</td>
              <td className="py-2 pr-2">{row.patient_full_name ?? row.file_number ?? '–'}</td>
              <td className="py-2 pr-2">{row.type ?? '–'}</td>
              <td className="py-2 pr-2">{row.service_request ?? '–'}</td>
              <td className="py-2 pr-2 text-right">{row.total_amount != null ? Number(row.total_amount) : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
