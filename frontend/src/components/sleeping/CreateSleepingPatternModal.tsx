import { useEffect, useState } from 'react'
import { fetchInpatientAdmissions, type LinkFieldOption } from '../../services/common'
import { createSleepingPattern } from '../../services/sleepingPattern'
import { toast } from '../../hooks/useToast'

interface CreateSleepingPatternModalProps {
  onClose: () => void
  onSuccess?: () => void
  initialPatient?: string
}

export const CreateSleepingPatternModal = ({
  onClose,
  onSuccess,
  initialPatient,
}: CreateSleepingPatternModalProps) => {
  const [admissions, setAdmissions] = useState<LinkFieldOption[]>([])
  const [admissionNo, setAdmissionNo] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [branch, setBranch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadAdmissions = async () => {
      if (!initialPatient) return
      try {
        const opts = await fetchInpatientAdmissions(initialPatient)
        setAdmissions(opts)
        if (opts.length > 0) {
          setAdmissionNo(opts[0].name)
        }
      } catch (err) {
        console.error('Failed to load inpatient admissions for sleeping pattern', err)
      }
    }
    loadAdmissions()
  }, [initialPatient])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!admissionNo) {
      setError('Admission No is required')
      return
    }
    try {
      setLoading(true)
      setError(null)
      await createSleepingPattern({
        admission_no: admissionNo,
        date,
        branch: branch || undefined,
      })
      toast.success('Sleeping Pattern created')
      onSuccess?.()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create Sleeping Pattern'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Create Sleeping Pattern</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Admission No <span className="text-red-500">*</span>
              </label>
              <select
                value={admissionNo}
                onChange={(e) => setAdmissionNo(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select admission...</option>
                {admissions.map((adm) => (
                  <option key={adm.name} value={adm.name}>
                    {adm.label || adm.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Branch
              </label>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-md hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-3 py-1.5 text-sm bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

