import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import {
  CM_BTN_CANCEL,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { createPractitionerUnavailability } from '../../services/practitionerUnavailability'
import { fetchCostCenters, fetchHealthcarePractitioners, type LinkFieldOption } from '../../services/common'
import { toast } from '../../hooks/useToast'

interface CreatePractitionerUnavailabilityModalProps {
  onClose: () => void
  onSuccess: () => void
}

export const CreatePractitionerUnavailabilityModal = ({
  onClose,
  onSuccess,
}: CreatePractitionerUnavailabilityModalProps) => {
  const today = new Date().toISOString().split('T')[0]
  const doctorDropRef = useRef<HTMLUListElement>(null)

  const [doctorId, setDoctorId] = useState('')
  const [doctorQuery, setDoctorQuery] = useState('')
  const [doctorResults, setDoctorResults] = useState<LinkFieldOption[]>([])
  const [doctorOpen, setDoctorOpen] = useState(false)
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [branch, setBranch] = useState('')
  const [anyRemarks, setAnyRemarks] = useState('')
  const [costCenters, setCostCenters] = useState<LinkFieldOption[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchCostCenters().then(setCostCenters).catch(() => {})
  }, [])

  useEffect(() => {
    if (!doctorOpen) return
    const search = async () => {
      try {
        const results = await fetchHealthcarePractitioners(doctorQuery)
        setDoctorResults(results)
      } catch {
        setDoctorResults([])
      }
    }
    const id = setTimeout(search, doctorQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(id)
  }, [doctorQuery, doctorOpen])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (doctorDropRef.current && !doctorDropRef.current.contains(e.target as Node)) {
        setDoctorOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const validate = () => {
    const next: Record<string, string> = {}
    if (!doctorId) next.doctor_id = 'Practitioner is required'
    if (!startDate) next.start_date = 'Start date is required'
    if (!endDate) next.end_date = 'End date is required'
    if (startDate && endDate && endDate < startDate) {
      next.end_date = 'End date cannot be before start date'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    try {
      await createPractitionerUnavailability({
        doctor_id: doctorId,
        start_date: startDate,
        end_date: endDate,
        branch: branch || undefined,
        any_remarks: anyRemarks.trim() || undefined,
      })
      toast.success('Practitioner unavailability created')
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create record')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY} onClick={onClose}>
      <div className={createModalShellClass('max-w-lg')} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Practitioner Unavailability</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Practitioner <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={doctorId ? doctorQuery : doctorQuery}
              onChange={(e) => {
                setDoctorId('')
                setDoctorQuery(e.target.value)
                setDoctorOpen(true)
              }}
              onFocus={() => setDoctorOpen(true)}
              placeholder="Search practitioner…"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {errors.doctor_id && <p className="text-xs text-red-600 mt-1">{errors.doctor_id}</p>}
            {doctorOpen && doctorResults.length > 0 && (
              <ul
                ref={doctorDropRef}
                className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto"
              >
                {doctorResults.map((doc) => (
                  <li key={doc.name}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                      onClick={() => {
                        setDoctorId(doc.name)
                        setDoctorQuery(doc.label || doc.name)
                        setDoctorOpen(false)
                      }}
                    >
                      {doc.label || doc.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Start Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
              {errors.start_date && <p className="text-xs text-red-600 mt-1">{errors.start_date}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                End Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
              {errors.end_date && <p className="text-xs text-red-600 mt-1">{errors.end_date}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Branch</label>
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">— Select branch —</option>
              {costCenters.map((cc) => (
                <option key={cc.name} value={cc.name}>
                  {cc.label || cc.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Remarks</label>
            <textarea
              value={anyRemarks}
              onChange={(e) => setAnyRemarks(e.target.value)}
              rows={3}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              placeholder="Optional notes…"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
