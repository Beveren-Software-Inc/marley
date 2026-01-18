import { useState, useEffect } from 'react'
import { fetchInpatientRecord, fetchServiceUnits, admitPatient, type ServiceUnit, type InpatientPackage } from '../../services/inpatientRecords'

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

  // Calculate expected discharge date from package days
  const calculateExpectedDischarge = () => {
    if (selectedPackage.no_of_days) {
      const checkInDate = new Date()
      const expectedDate = new Date(checkInDate)
      expectedDate.setDate(expectedDate.getDate() + selectedPackage.no_of_days - 1)
      return expectedDate.toISOString().split('T')[0]
    }
    return ''
  }

  const [formData, setFormData] = useState({
    serviceUnit: '',
    checkIn: new Date().toISOString().slice(0, 16),
    expectedDischarge: calculateExpectedDischarge()
  })

  // Search service units when dropdown is open
  useEffect(() => {
    if (!serviceUnitOpen) return

    const search = async () => {
      try {
        const serviceUnitType = record?.admission_service_unit_type
        const results = await fetchServiceUnits(serviceUnitType, 'Vacant', serviceUnitQuery || undefined)
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
  }, [serviceUnitQuery, serviceUnitOpen, record?.admission_service_unit_type])

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        setError(null)
        
        const recordData = await fetchInpatientRecord(admissionNo)
        setRecord(recordData)
        
        // Load initial service units
        const serviceUnitType = recordData?.admission_service_unit_type
        const unitsData = await fetchServiceUnits(serviceUnitType, 'Vacant')
        setServiceUnits(unitsData)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load data'))
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [admissionNo])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.serviceUnit) {
      setError(new Error('Please select a service unit (bed)'))
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
                <p className="text-xs text-slate-500">{selectedPackage.category_name}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-slate-600">Duration:</span>{' '}
                <span className="font-medium">{selectedPackage.no_of_days} days</span>
              </div>
              <div>
                <span className="text-slate-600">Amount:</span>{' '}
                <span className="font-medium">
                  {selectedPackage.package_rate.toLocaleString()} BHD
                </span>
              </div>
            </div>
          </div>

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

          <div className="flex justify-end gap-3 pt-4">
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
        </form>
      </div>
    </div>
  )
}

