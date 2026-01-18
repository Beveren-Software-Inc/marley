import { useState, useEffect } from 'react'
import { fetchInpatientPackages, type InpatientPackage } from '../../services/inpatientRecords'

interface PackageSelectionModalProps {
  admissionNo: string
  onSelect: (pkg: InpatientPackage) => void
  onClose: () => void
}

export const PackageSelectionModal = ({
  admissionNo,
  onSelect,
  onClose
}: PackageSelectionModalProps) => {
  const [packages, setPackages] = useState<InpatientPackage[]>([])
  const [defaultCurrency, setDefaultCurrency] = useState<string>('BHD')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const loadPackages = async () => {
      try {
        setLoading(true)
        setError(null)
        console.log('Loading inpatient packages...')
        const response = await fetchInpatientPackages(undefined, true)
        console.log('Package response:', response)
        if (response && response.packages) {
          setPackages(response.packages)
          setDefaultCurrency(response.default_currency || 'BHD')
          console.log('Set packages:', response.packages.length)
        } else {
          console.warn('No packages in response')
          setPackages([])
        }
      } catch (err) {
        console.error('Error fetching packages:', err)
        setError(err instanceof Error ? err : new Error('Failed to fetch packages'))
      } finally {
        setLoading(false)
      }
    }

    loadPackages()
  }, [admissionNo])

  const displayPackages = packages

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
            <div className="text-center py-8 text-red-600">
              <p>Error: {error.message}</p>
              <p className="text-sm mt-2">Please ensure Inpatient Package records exist and are active.</p>
            </div>
          ) : displayPackages.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {displayPackages.map((pkg) => (
                <div
                  key={pkg.name}
                  className="border border-slate-200 rounded-lg p-4 hover:border-primary hover:shadow-md transition-all cursor-pointer"
                  onClick={() => onSelect(pkg)}
                >
                  <div className="mb-3">
                    <h3 className="font-semibold text-slate-900 mb-1">
                      {pkg.package_name}
                    </h3>
                    {pkg.category_name && (
                      <p className="text-xs text-slate-500 mb-1">
                        {pkg.category_name}
                      </p>
                    )}
                    <p className="text-sm text-slate-600">
                      {pkg.no_of_days} {pkg.no_of_days === 1 ? 'day' : 'days'}
                    </p>
                  </div>
                  <div className="pt-3 border-t border-slate-200">
                    <p className="text-2xl font-bold text-primary">
                      {pkg.package_rate.toLocaleString()} {defaultCurrency}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-600">
              <p>No active packages available.</p>
              <p className="text-sm mt-2">Please create Inpatient Package records in the system and ensure they are marked as Active.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

