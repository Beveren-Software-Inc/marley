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
  const [activeTab, setActiveTab] = useState<'standard' | 'custom'>('standard')
  const [packages, setPackages] = useState<InpatientPackage[]>([])
  const [defaultCurrency, setDefaultCurrency] = useState<string>('BHD')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Custom package state
  const [customRate, setCustomRate] = useState('')

  useEffect(() => {
    const loadPackages = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetchInpatientPackages(undefined, true)
        if (response && response.packages) {
          setPackages(response.packages)
          setDefaultCurrency(response.default_currency || 'BHD')
        } else {
          setPackages([])
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch packages'))
      } finally {
        setLoading(false)
      }
    }
    loadPackages()
  }, [admissionNo])

  const handleConfirmCustom = () => {
    const rate = parseFloat(customRate)
    if (!rate || rate <= 0) return
    onSelect({
      name: '__custom__',
      package_name: 'Custom Package',
      package_rate: rate,
      no_of_days: 0,
      active: 1,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="p-6 border-b border-slate-200 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-slate-900">Select Package</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-200 -mb-6">
            <button
              type="button"
              onClick={() => setActiveTab('standard')}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === 'standard'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Standard Packages
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('custom')}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === 'custom'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Custom Package
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">

          {/* ── Standard Packages Tab ── */}
          {activeTab === 'standard' && (
            <>
              {loading ? (
                <div className="text-center py-8 text-slate-600">Loading packages...</div>
              ) : error ? (
                <div className="text-center py-8 text-red-600">
                  <p>Error: {error.message}</p>
                  <p className="text-sm mt-2">Please ensure Inpatient Package records exist and are active.</p>
                </div>
              ) : packages.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {packages.map((pkg) => (
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
                          <p className="text-xs text-slate-500 mb-2">
                            <span className="font-medium">Room Category:</span> {pkg.category_name}
                          </p>
                        )}
                        <p className="text-sm text-slate-600 mb-2">
                          <span className="font-medium">Base Rate:</span> {pkg.package_rate.toLocaleString()} {defaultCurrency} / day
                        </p>
                        {pkg.duration_pricing && pkg.duration_pricing.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-200">
                            <p className="text-xs font-medium text-slate-700 mb-1">Duration Pricing:</p>
                            <div className="space-y-1">
                              {pkg.duration_pricing.map((dp, idx) => (
                                <div key={idx} className="text-xs text-slate-600">
                                  <span className="font-medium">{dp.duration_name || 'Duration'}:</span>{' '}
                                  Day {dp.from_day}
                                  {dp.to_day ? ` - ${dp.to_day}` : '+'} = {dp.amount.toLocaleString()} {defaultCurrency}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-600">
                  <p>NO ACTIVE PACKAGES AVAILABLE.</p>
                  <p className="text-sm mt-2">Please create Inpatient Package records in the system and ensure they are marked as Active.</p>
                </div>
              )}
            </>
          )}

          {/* ── Custom Package Tab ── */}
          {activeTab === 'custom' && (
            <div className="max-w-md mx-auto mt-4">
              <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Custom Package</p>
                    <p className="text-xs text-slate-500">Enter the agreed daily rate for this patient's bespoke arrangement</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Rate Per Day (BD) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={customRate}
                    onChange={(e) => setCustomRate(e.target.value)}
                    placeholder="e.g. 200"
                    min="0"
                    step="0.01"
                    className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    autoFocus
                  />
                </div>

                {customRate && parseFloat(customRate) > 0 && (
                  <div className="bg-white rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
                    <span className="text-slate-500">Confirmed rate: </span>
                    <span className="font-semibold text-slate-900">{parseFloat(customRate).toLocaleString()} BD / day</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleConfirmCustom}
                  disabled={!customRate || parseFloat(customRate) <= 0}
                  className="w-full py-2.5 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Confirm Custom Package
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
