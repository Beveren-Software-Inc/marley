import { useState, useEffect } from 'react'
import { fetchPackageDetails, type PackageDetail } from '../../services/packageDetails'
import { StatusPill } from '../ui/StatusPill'

const statusColors: Record<string, string> = {
  'Open': 'warning',
  'Closed': 'success'
}

interface PackageDetailsListProps {
  patient?: string
  admission_no?: string
}

export const PackageDetailsList = ({ patient, admission_no }: PackageDetailsListProps) => {
  const [packages, setPackages] = useState<PackageDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const loadPackageDetails = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetchPackageDetails(50, 0, patient, admission_no)
        setPackages(response)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch package details'))
      } finally {
        setLoading(false)
      }
    }

    loadPackageDetails()
  }, [patient, admission_no])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading package details...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Package Details</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
        </div>
      </div>
    )
  }

  if (packages.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">No package details found</div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Package ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Patient
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Admission No
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              From Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              To Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Total Days
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Amount
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {packages.map((pkg) => (
            <tr key={pkg.name} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-sm font-medium text-slate-900">
                {pkg.name}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {pkg.patient_full_name || pkg.file_number || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {pkg.admission_no || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {pkg.from_date ? new Date(pkg.from_date).toLocaleDateString() : '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {pkg.to_date ? new Date(pkg.to_date).toLocaleDateString() : '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {pkg.total_days || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {pkg.transaction_amount 
                  ? `${pkg.transaction_amount} ${pkg.currency || ''}`.trim()
                  : '-'}
              </td>
              <td className="px-4 py-3">
                {pkg.vch_status ? (
                  <StatusPill
                    status={pkg.vch_status}
                    color={statusColors[pkg.vch_status] || 'default'}
                  />
                ) : (
                  <span className="text-sm text-slate-500">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}




