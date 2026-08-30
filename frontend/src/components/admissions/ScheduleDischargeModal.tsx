import { useState, useEffect } from 'react'
import { scheduleDischarge } from '../../services/inpatientRecords'
import { fetchHealthcarePractitioners, getCurrentUserPractitioner, type LinkFieldOption } from '../../services/common'
import { toast } from '../../hooks/useToast'
import { CreatePractitionerModal } from '../practitioners/CreatePractitionerModal'
import { toDatetimeLocalValue } from '../../utils/datetimeLocal'
import { DateFilterInput } from '../ui/DateFilterInput'

interface ScheduleDischargeModalProps {
  admission: {
    name: string
    patient: string
    patient_name?: string
  }
  onClose: () => void
  onSuccess: (dischargeData: any) => void
}

export const ScheduleDischargeModal = ({ admission, onClose, onSuccess }: ScheduleDischargeModalProps) => {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreatePractitioner, setShowCreatePractitioner] = useState(false)
  
  // Discharge Practitioner dropdown state
  const [practitioners, setPractitioners] = useState<LinkFieldOption[]>([])
  const [practOpen, setPractOpen] = useState(false)
  const [practQuery, setPractQuery] = useState('')
  const [selectedPractitioner, setSelectedPractitioner] = useState<LinkFieldOption | null>(null)

  const [formData, setFormData] = useState({
    discharge_practitioner: '',
    discharge_ordered_datetime: toDatetimeLocalValue(),
    followup_date: '',
    discharge_instructions: '',
    discharge_note: ''
  })

  // Load practitioners and auto-select current user's linked practitioner
  useEffect(() => {
    let cancelled = false

    const applyPractitioner = async (practitionerId: string) => {
      try {
        const options = await fetchHealthcarePractitioners(practitionerId)
        if (cancelled) return
        const match = options.find((p) => p.name === practitionerId)
        if (match) {
          setSelectedPractitioner(match)
          setPractQuery(match.label)
          setFormData((prev) => ({ ...prev, discharge_practitioner: match.name }))
          setPractitioners((prev) =>
            prev.some((p) => p.name === match.name) ? prev : [...prev, match],
          )
        } else {
          setFormData((prev) => ({ ...prev, discharge_practitioner: practitionerId }))
          setPractQuery(practitionerId)
        }
      } catch {
        if (!cancelled) {
          setFormData((prev) => ({ ...prev, discharge_practitioner: practitionerId }))
          setPractQuery(practitionerId)
        }
      }
    }

    const loadPractitioners = async () => {
      try {
        const practs = await fetchHealthcarePractitioners()
        if (cancelled) return
        setPractitioners(practs)

        const currentPract = await getCurrentUserPractitioner()
        if (currentPract && !cancelled) {
          await applyPractitioner(currentPract)
        }
      } catch (err) {
        console.error('Failed to load practitioners:', err)
      }
    }
    loadPractitioners()
    return () => {
      cancelled = true
    }
  }, [])

  // Search practitioners
  useEffect(() => {
    if (!practOpen) return

    const search = async () => {
      try {
        const results = await fetchHealthcarePractitioners(practQuery)
        setPractitioners(results)
      } catch (err) {
        console.error('Failed to search practitioners:', err)
        setPractitioners([])
      }
    }

    const timeoutId = setTimeout(() => {
      search()
    }, practQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [practQuery, practOpen])

  const handlePractitionerSelect = (pract: LinkFieldOption) => {
    setSelectedPractitioner(pract)
    setFormData(prev => ({ ...prev, discharge_practitioner: pract.name }))
    setPractQuery(pract.label)
    setPractOpen(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    try {
      setSubmitting(true)

      const dischargeData = {
        patient: admission.patient,
        inpatient_record: admission.name,
        discharge_practitioner: formData.discharge_practitioner || undefined,
        discharge_ordered_datetime: formData.discharge_ordered_datetime || undefined,
        followup_date: formData.followup_date || undefined,
        discharge_instructions: formData.discharge_instructions || undefined,
        discharge_note: formData.discharge_note || undefined
      }

      await scheduleDischarge(dischargeData)
      toast.success('Discharge scheduled successfully!', 3000)
      onSuccess(dischargeData)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to schedule discharge'
      toast.error(errorMessage, 5000)
      setError(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Schedule Discharge</h2>
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
          if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.closest('.absolute')) {
            setPractOpen(false)
          }
        }}>
          <div className="bg-slate-50 rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-slate-900 mb-2">Patient Information</h3>
            <div className="text-sm text-slate-700">
              <p><span className="font-medium">Patient:</span> {admission.patient_name || admission.patient}</p>
              <p><span className="font-medium">Admission No:</span> {admission.name}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Discharge Practitioner
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={selectedPractitioner ? selectedPractitioner.label : practQuery}
                  onChange={(e) => {
                    setPractQuery(e.target.value)
                    setPractOpen(true)
                  }}
                  onFocus={() => setPractOpen(true)}
                  placeholder="Search doctor..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowCreatePractitioner(true)
                  }}
                  className="absolute right-2 p-1 text-primary hover:text-primary/80 rounded"
                  title="Create New Practitioner"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                {practOpen && practitioners.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto top-full">
                    {practitioners.map((pract) => (
                      <button
                        key={pract.name}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                        onClick={() => handlePractitionerSelect(pract)}
                      >
                        <div className="font-medium">{pract.label}</div>
                        <div className="text-xs text-slate-500">
                          {[pract.name, pract.department].filter(Boolean).join(' · ')}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {practOpen && practitioners.length === 0 && practQuery && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg top-full">
                    <div className="px-3 py-2 text-xs text-slate-500">NO PRACTITIONERS FOUND</div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Discharge Ordered DateTime
              </label>
              <input
                type="datetime-local"
                value={formData.discharge_ordered_datetime}
                onChange={(e) => setFormData({ ...formData, discharge_ordered_datetime: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Followup Date
              </label>
              <DateFilterInput
                value={formData.followup_date}
                onChange={(e) => setFormData({ ...formData, followup_date: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Discharge Instructions
            </label>
            <textarea
              value={formData.discharge_instructions}
              onChange={(e) => setFormData({ ...formData, discharge_instructions: e.target.value })}
              rows={3}
              placeholder="Discharge instructions..."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Discharge Note
            </label>
            <textarea
              value={formData.discharge_note}
              onChange={(e) => setFormData({ ...formData, discharge_note: e.target.value })}
              rows={4}
              placeholder="Discharge summary note..."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {error}
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
              className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 disabled:opacity-50"
            >
              {submitting ? 'Scheduling...' : 'Schedule Discharge'}
            </button>
          </div>
        </form>
      </div>
      {showCreatePractitioner && (
        <CreatePractitionerModal
          onClose={() => setShowCreatePractitioner(false)}
          onSuccess={(practitionerName) => {
            setFormData({ ...formData, discharge_practitioner: practitionerName })
            const newPract = practitioners.find(p => p.name === practitionerName)
            if (newPract) {
              setSelectedPractitioner(newPract)
              setPractQuery(newPract.label)
            } else {
              fetchHealthcarePractitioners().then(setPractitioners).catch(console.error)
              setPractQuery(practitionerName)
            }
            setPractOpen(false)
            setShowCreatePractitioner(false)
          }}
        />
      )}
    </div>
  )
}


