import { useState, useEffect } from 'react'
import { fetchInpatientRecord, fetchServiceUnits, admitPatient, calculatePackagePrice, createAdmissionSalesOrder, type ServiceUnit, type InpatientPackage } from '../../services/inpatientRecords'

interface AdmissionFormModalProps {
  admissionNo: string
  selectedPackage: InpatientPackage
  onComplete: () => void
  onClose: () => void
}

export const AdmissionFormModal = ({
  admissionNo,
  selectedPackage,
  onComplete,
  onClose
}: AdmissionFormModalProps) => {
  const [record, setRecord] = useState<any>(null)
  const [serviceUnits, setServiceUnits] = useState<ServiceUnit[]>([])
  const [serviceUnitQuery, setServiceUnitQuery] = useState('')
  const [serviceUnitOpen, setServiceUnitOpen] = useState(false)
  const [selectedServiceUnit, setSelectedServiceUnit] = useState<ServiceUnit | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  // Will be set from Inpatient Admission.expected_length_of_stay when the record loads.
  // If doctor didn't set it, the field will remain empty and user must enter manually.
  const [daysInput, setDaysInput] = useState<string>('')
  const [days, setDays] = useState<number>(0)
  const [calculatedPrice, setCalculatedPrice] = useState<number | null>(null)
  const [discountPercentInput, setDiscountPercentInput] = useState<string>('0')
  const [calculatingPrice, setCalculatingPrice] = useState(false)
  const [creatingSalesOrder, setCreatingSalesOrder] = useState(false)
  const [salesOrderCreated, setSalesOrderCreated] = useState<string | null>(null)

  const discountPercent = Math.min(
    100,
    Math.max(0, parseFloat(discountPercentInput || '0') || 0)
  )

  const discountedPrice =
    calculatedPrice !== null ? calculatedPrice * (1 - discountPercent / 100) : null

  // Calculate expected discharge date from days
  const calculateExpectedDischarge = (numDays: number) => {
    if (numDays > 0) {
      const checkInDate = new Date()
      const expectedDate = new Date(checkInDate)
      expectedDate.setDate(expectedDate.getDate() + numDays - 1)
      return expectedDate.toISOString().split('T')[0]
    }
    return ''
  }

  const [formData, setFormData] = useState({
    serviceUnit: '',
    checkIn: new Date().toISOString().slice(0, 16),
    expectedDischarge: '' as string
  })

  // Update days number when input changes (debounced)
  useEffect(() => {
    const numValue = parseInt(daysInput) || 0
    if (numValue > 0 && numValue !== days) {
      setDays(numValue)
    } else if (daysInput === '' || numValue === 0) {
      // If empty or 0, set days to 0 to clear price calculation
      setDays(0)
    }
  }, [daysInput])

  // Calculate price when days change
  useEffect(() => {
    const calculatePrice = async () => {
      if (days > 0 && selectedPackage.name) {
        try {
          setCalculatingPrice(true)
          const result = await calculatePackagePrice(selectedPackage.name, days)
          setCalculatedPrice(result.total_price)
          // Update expected discharge date
          setFormData(prev => ({
            ...prev,
            expectedDischarge: calculateExpectedDischarge(days)
          }))
        } catch (err) {
          console.error('Failed to calculate price:', err)
          setCalculatedPrice(null)
        } finally {
          setCalculatingPrice(false)
        }
      } else {
        setCalculatedPrice(null)
      }
    }

    calculatePrice()
  }, [days, selectedPackage.name])

  // Search service units when dropdown is open - filter by room category
  useEffect(() => {
    if (!serviceUnitOpen) return

    const search = async () => {
      try {
        const serviceUnitType = record?.admission_service_unit_type
        const roomCategory = selectedPackage.package_category // Filter by package's room category
        const results = await fetchServiceUnits(
          serviceUnitType, 
          'Vacant', 
          serviceUnitQuery || undefined,
          roomCategory
        )
        setServiceUnits(results)
      } catch (err) {
        console.error('Failed to search service units:', err)
        setServiceUnits([])
      }
    }

    // Debounce search, but load immediately if query is empty (to show initial list)
    const timeoutId = setTimeout(() => {
      search()
    }, serviceUnitQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [serviceUnitQuery, serviceUnitOpen, record?.admission_service_unit_type, selectedPackage.package_category])

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        setError(null)
        
        const recordData = await fetchInpatientRecord(admissionNo)
        setRecord(recordData)
        console.log("Here", recordData)
        // Use expected_length_of_stay from the admission (scheduled by doctor) as the ONLY source
        // for the default number of days. If it's not set or <= 0, leave the field empty.
        const rawExpected = (recordData as any)?.expected_length_of_stay
        const expectedDays =
          typeof rawExpected === 'number'
            ? rawExpected
            : rawExpected
            ? parseInt(String(rawExpected), 10)
            : 0

        if (expectedDays && expectedDays > 0) {
          setDays(expectedDays)
          setDaysInput(String(expectedDays))
          setFormData(prev => ({
            ...prev,
            expectedDischarge: calculateExpectedDischarge(expectedDays)
          }))
        } else {
          // No expected_length_of_stay set by doctor; keep days empty and no expected discharge.
          setDays(0)
          setDaysInput('')
          setFormData(prev => ({
            ...prev,
            expectedDischarge: ''
          }))
        }

        // Load initial service units - filter by package room category
        const serviceUnitType = recordData?.admission_service_unit_type
        const roomCategory = selectedPackage.package_category
        const unitsData = await fetchServiceUnits(serviceUnitType, 'Vacant', undefined, roomCategory)
        setServiceUnits(unitsData)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load data'))
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [admissionNo])

  const handleCreateSalesOrder = async () => {
    if (!discountedPrice || discountedPrice <= 0) {
      setError(new Error('Please calculate price first by entering number of days'))
      return
    }

    if (!formData.serviceUnit) {
      setError(new Error('Please select a service unit (room) first'))
      return
    }

    try {
      setCreatingSalesOrder(true)
      setError(null)

      const result = await createAdmissionSalesOrder(
        admissionNo,
        selectedPackage.name,
        days,
        discountedPrice,
        formData.serviceUnit
      )

      setSalesOrderCreated(result.sales_order_name)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to create sales order'))
    } finally {
      setCreatingSalesOrder(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.serviceUnit) {
      setError(new Error('Please select a service unit (bed)'))
      return
    }

    if (days <= 0) {
      setError(new Error('Number of days must be greater than 0'))
      return
    }

    try {
      setSubmitting(true)
      setError(null)

      await admitPatient(
        admissionNo,
        formData.serviceUnit,
        formData.checkIn,
        formData.expectedDischarge || undefined
      )

      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to admit patient'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl p-6">
          <div className="text-slate-600">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Admit Patient</h2>
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4" onClick={(e) => {
          // Close dropdowns when clicking outside inputs
          const target = e.target as HTMLElement
          if (target.tagName !== 'INPUT' && !target.closest('.absolute')) {
            setServiceUnitOpen(false)
          }
        }}>
          {/* Package Info */}
          <div className="bg-slate-50 rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-slate-900 mb-2">Selected Package</h3>
            <div className="mb-2">
              <p className="font-medium text-slate-900">{selectedPackage.package_name}</p>
              {selectedPackage.category_name && (
                <p className="text-xs text-slate-500">
                  <span className="font-medium">Room Category:</span> {selectedPackage.category_name}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm mb-2">
              <div>
                <span className="text-slate-600">Base Rate:</span>{' '}
                <span className="font-medium">
                  {selectedPackage.package_rate.toLocaleString()} BHD / day
                </span>
              </div>
            </div>
            {selectedPackage.duration_pricing && selectedPackage.duration_pricing.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-300">
                <p className="text-xs font-medium text-slate-700 mb-1">Duration Pricing:</p>
                <div className="space-y-1">
                  {selectedPackage.duration_pricing.map((dp, idx) => (
                    <div key={idx} className="text-xs text-slate-600">
                      <span className="font-medium">{dp.duration_name || 'Duration'}:</span>{' '}
                      Day {dp.from_day}{dp.to_day ? ` - ${dp.to_day}` : '+'} = {dp.amount.toLocaleString()} BHD
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Days + Discount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Number of Days <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                value={daysInput}
                onChange={(e) => {
                  // Allow empty string and any number input
                  setDaysInput(e.target.value)
                }}
                onBlur={(e) => {
                  // When field loses focus, ensure it has a valid value
                  const numValue = parseInt(e.target.value)
                  if (!numValue || numValue < 1) {
                    setDaysInput('1')
                    setDays(1)
                  }
                }}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Discount (%) 
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={discountPercentInput}
                onChange={(e) => setDiscountPercentInput(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Calculated Price */}
          {calculatingPrice ? (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-700">
              Calculating price...
            </div>
          ) : calculatedPrice !== null ? (
            <div className="bg-green-50 border border-green-200 rounded-md p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-green-900">Total Price:</span>
                <span className="text-lg font-bold text-green-900">
                  {(discountedPrice ?? calculatedPrice).toLocaleString()} BHD
                </span>
              </div>
              {discountPercent > 0 && (
                <p className="text-xs text-green-800 mt-1">
                  Discount {discountPercent}% applied (original {calculatedPrice.toLocaleString()} BHD)
                </p>
              )}
              <p className="text-xs text-green-700 mt-1">
                For {days} {days === 1 ? 'day' : 'days'}
              </p>
            </div>
          ) : null}

          {/* Patient Info */}
          {record && (
            <div className="bg-slate-50 rounded-lg p-4 mb-4">
              <h3 className="font-semibold text-slate-900 mb-2">Patient Information</h3>
              <div className="text-sm text-slate-700">
                <p>
                  <span className="font-medium">Name:</span> {record.patient_name || record.patient}
                </p>
                {record.medical_department && (
                  <p>
                    <span className="font-medium">Department:</span> {record.medical_department}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Service Unit */}
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Service Unit / Bed <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={selectedServiceUnit ? selectedServiceUnit.healthcare_service_unit_name : serviceUnitQuery}
                onChange={(e) => {
                  setServiceUnitQuery(e.target.value)
                  setServiceUnitOpen(true)
                }}
                onFocus={() => setServiceUnitOpen(true)}
                placeholder="Search Healthcare Service Unit..."
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
              {serviceUnitOpen && serviceUnits.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                  {serviceUnits.map((unit) => (
                    <button
                      key={unit.name}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                      onClick={() => {
                        setSelectedServiceUnit(unit)
                        setFormData({ ...formData, serviceUnit: unit.name })
                        setServiceUnitQuery(unit.healthcare_service_unit_name)
                        setServiceUnitOpen(false)
                      }}
                    >
                      <div className="font-medium">{unit.healthcare_service_unit_name}</div>
                      <div className="text-xs text-slate-500">
                        {unit.occupancy_status} {unit.service_unit_type ? `• ${unit.service_unit_type}` : ''}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {serviceUnitOpen && serviceUnits.length === 0 && serviceUnitQuery && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
                  <div className="px-3 py-2 text-xs text-slate-500">No service units found</div>
                </div>
              )}
            </div>
          </div>

          {/* Check In */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Check In Date & Time <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={formData.checkIn}
              onChange={(e) => setFormData({ ...formData, checkIn: e.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          {/* Expected Discharge */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Expected Discharge Date
            </label>
            <input
              type="date"
              value={formData.expectedDischarge}
              onChange={(e) => setFormData({ ...formData, expectedDischarge: e.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {error.message}
            </div>
          )}

          {salesOrderCreated && (
            <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-700">
              <p className="font-medium">Sales Order Created Successfully!</p>
              <p className="text-xs mt-1">Sales Order: {salesOrderCreated}</p>
            </div>
          )}

          <div className="flex justify-between items-center pt-4">
            <button
              type="button"
              onClick={handleCreateSalesOrder}
              disabled={creatingSalesOrder || !calculatedPrice || calculatedPrice <= 0}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creatingSalesOrder ? 'Creating Sales Order...' : 'Create Sales Order'}
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting ? 'Admitting...' : 'Admit Patient'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

