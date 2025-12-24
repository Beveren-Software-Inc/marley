import { useState, useEffect } from 'react'
import { fetchPackageDetails, type PackageDetail } from '../../services/inpatientRecords'

interface PackageSelectionModalProps {
  admissionNo: string
  onSelect: (pkg: PackageDetail) => void
  onClose: () => void
}

export const PackageSelectionModal = ({
  admissionNo,
  onSelect,
  onClose
}: PackageSelectionModalProps) => {
  const [packages, setPackages] = useState<PackageDetail[]>([])
  const [defaultCurrency, setDefaultCurrency] = useState<string>('BHD')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const loadPackages = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetchPackageDetails(admissionNo)
        if (response.packages) {
          setPackages(response.packages)
          setDefaultCurrency(response.defaultCurrency || 'BHD')
        } else {
          // Fallback for old format
          setPackages(Array.isArray(response) ? response : [])
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch packages'))
      } finally {
        setLoading(false)
      }
    }

    loadPackages()
  }, [admissionNo])

  // If no packages found, create dummy packages for selection with company currency
  const displayPackages =
    packages.length > 0
      ? packages
      : [
          {
            name: 'pkg-1',
            admission_no: admissionNo,
            from_date: new Date().toISOString().split('T')[0],
            to_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split('T')[0],
            total_days: 7,
            transaction_amount: 5000,
            currency: defaultCurrency,
            vch_status: 'Open',
            remarks: 'Standard Package - 7 days'
          },
          {
            name: 'pkg-2',
            admission_no: admissionNo,
            from_date: new Date().toISOString().split('T')[0],
            to_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split('T')[0],
            total_days: 14,
            transaction_amount: 9000,
            currency: defaultCurrency,
            vch_status: 'Open',
            remarks: 'Extended Package - 14 days'
          },
          {
            name: 'pkg-3',
            admission_no: admissionNo,
            from_date: new Date().toISOString().split('T')[0],
            to_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split('T')[0],
            total_days: 30,
            transaction_amount: 18000,
            currency: defaultCurrency,
            vch_status: 'Open',
            remarks: 'Premium Package - 30 days'
          }
        ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Select Package</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-8 text-slate-600">Loading packages...</div>
          ) : error ? (
            <div className="text-center py-8 text-red-600">Error: {error.message}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {displayPackages.map((pkg) => (
                <div
                  key={pkg.name}
                  className="border border-slate-200 rounded-lg p-4 hover:border-primary hover:shadow-md transition-all cursor-pointer"
                  onClick={() => onSelect(pkg)}
                >
                  <div className="mb-3">
                    <h3 className="font-semibold text-slate-900 mb-1">
                      {pkg.remarks || `Package ${pkg.name}`}
                    </h3>
                    <p className="text-sm text-slate-600">
                      {pkg.total_days} {pkg.total_days === 1 ? 'day' : 'days'}
                    </p>
                  </div>
                  <div className="mb-3">
                    <p className="text-xs text-slate-500 mb-1">Duration</p>
                    <p className="text-sm text-slate-700">
                      {new Date(pkg.from_date).toLocaleDateString()} -{' '}
                      {new Date(pkg.to_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="pt-3 border-t border-slate-200">
                    <p className="text-2xl font-bold text-primary">
                      {pkg.transaction_amount.toLocaleString()} {pkg.currency}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

