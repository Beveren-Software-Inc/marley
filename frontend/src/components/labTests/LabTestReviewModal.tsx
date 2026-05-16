import { useEffect, useState } from 'react'
import {
  fetchDoctorReviewFormOptions,
  fetchLabTest,
  submitDoctorLabTestReview,
  type DoctorReviewFormOptions,
  type LabTest,
} from '../../services/labTests'
import { toast } from '../../hooks/useToast'

export interface LabTestReviewModalProps {
  labTestName: string
  initialOutcome?: 'Reviewed' | 'Rejected'
  onClose: () => void
  onSuccess: () => void
}

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white'

export const LabTestReviewModal = ({
  labTestName,
  initialOutcome = 'Reviewed',
  onClose,
  onSuccess,
}: LabTestReviewModalProps) => {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [labTest, setLabTest] = useState<LabTest | null>(null)
  const [options, setOptions] = useState<DoctorReviewFormOptions | null>(null)

  const [reportType, setReportType] = useState('Pathology')
  const [resultIndicator, setResultIndicator] = useState('Normal')
  const [followUps, setFollowUps] = useState<Set<string>>(() => new Set(['Take no action']))
  const [followUpOther, setFollowUpOther] = useState('')
  const [comments, setComments] = useState('')
  const [prescriptionMessage, setPrescriptionMessage] = useState('')
  const [patientInformed, setPatientInformed] = useState(true)
  const [archiveReport, setArchiveReport] = useState(false)
  const [createTask, setCreateTask] = useState(false)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const [doc, opts] = await Promise.all([
          fetchLabTest(labTestName),
          fetchDoctorReviewFormOptions(),
        ])
        if (cancelled) return
        setLabTest(doc)
        setOptions(opts)
        setReportType(doc.review_report_type || 'Pathology')
        if (doc.review_result_indicator) setResultIndicator(doc.review_result_indicator)
        if (doc.review_comments) setComments(doc.review_comments)
        if (doc.review_prescription_message) setPrescriptionMessage(doc.review_prescription_message)
        setPatientInformed(doc.patient_informed_of_report !== 0)
        setArchiveReport(!!doc.archive_report_on_review)
        setCreateTask(!!doc.create_task_on_review)
        if (doc.review_follow_up_actions) {
          try {
            const parsed = JSON.parse(doc.review_follow_up_actions) as string[]
            if (Array.isArray(parsed) && parsed.length) setFollowUps(new Set(parsed))
          } catch {
            /* ignore */
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load lab test')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [labTestName])

  const toggleFollowUp = (action: string) => {
    setFollowUps((prev) => {
      const next = new Set(prev)
      if (next.has(action)) next.delete(action)
      else next.add(action)
      return next
    })
  }

  const saveReview = async (selectedOutcome: 'Reviewed' | 'Rejected') => {
    setError(null)

    if (!resultIndicator) {
      setError('Please select a result indicator.')
      return
    }
    if (selectedOutcome === 'Reviewed' && followUps.size === 0) {
      setError('Select at least one follow-up action.')
      return
    }
    if (followUps.has('Other') && !followUpOther.trim()) {
      setError('Please describe the other follow-up action.')
      return
    }

    setSubmitting(true)
    try {
      await submitDoctorLabTestReview({
        lab_test_name: labTestName,
        new_status: selectedOutcome,
        review_report_type: reportType,
        review_result_indicator: resultIndicator,
        review_follow_up_actions: Array.from(followUps),
        review_follow_up_other: followUpOther,
        review_comments: comments,
        review_prescription_message: prescriptionMessage,
        patient_informed_of_report: patientInformed ? 1 : 0,
        archive_report_on_review: archiveReport ? 1 : 0,
        create_task_on_review: createTask ? 1 : 0,
      })
      toast.success(selectedOutcome === 'Reviewed' ? 'Lab test reviewed' : 'Lab test rejected')
      onSuccess()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save review'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void saveReview(initialOutcome)
  }

  const formatDt = (d?: string) => (d ? new Date(d).toLocaleString() : '—')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-slate-900">File pathology / radiology report</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {labTest?.lab_test_name || labTestName}
            {labTest?.patient_name ? ` · ${labTest.patient_name}` : ''}
          </p>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-600">Loading…</div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div
              className="overflow-y-auto px-6 py-4 space-y-5 flex-1"
              style={{ scrollbarWidth: 'thin' }}
            >
              {error && (
                <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">Sample / investigation</span>
                  <p className="font-medium text-slate-800">
                    {formatDt(labTest?.result_date || labTest?.submitted_date)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Results entered</span>
                  <p className="font-medium text-slate-800">
                    {formatDt(labTest?.results_entered_datetime || labTest?.submitted_date)}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
                <select
                  className={inputClass}
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                >
                  {(options?.report_types || ['Pathology']).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-700 mb-2">Result indicator</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(options?.result_indicators || []).map((opt) => (
                    <label
                      key={opt}
                      className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="result_indicator"
                        className="mt-1"
                        checked={resultIndicator === opt}
                        onChange={() => setResultIndicator(opt)}
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-700 mb-2">Follow-up action</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(options?.follow_up_actions || []).map((action) => (
                    <label
                      key={action}
                      className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={followUps.has(action)}
                        onChange={() => toggleFollowUp(action)}
                      />
                      <span>{action}</span>
                    </label>
                  ))}
                </div>
                {followUps.has('Other') && (
                  <input
                    type="text"
                    className={`${inputClass} mt-2`}
                    placeholder="Describe other action…"
                    value={followUpOther}
                    onChange={(e) => setFollowUpOther(e.target.value)}
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Comments / patient message
                </label>
                <textarea
                  className={`${inputClass} min-h-[80px]`}
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Message for patient&apos;s next prescription
                </label>
                <textarea
                  className={`${inputClass} min-h-[60px]`}
                  value={prescriptionMessage}
                  onChange={(e) => setPrescriptionMessage(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={patientInformed}
                    onChange={(e) => setPatientInformed(e.target.checked)}
                  />
                  Patient to be informed of this report
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={archiveReport}
                    onChange={(e) => setArchiveReport(e.target.checked)}
                  />
                  Archive report
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createTask}
                    onChange={(e) => setCreateTask(e.target.checked)}
                  />
                  Create a task
                </label>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex flex-wrap justify-end gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm border border-slate-300 rounded-md hover:bg-slate-50"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void saveReview('Rejected')}
                className="px-4 py-2 text-sm border border-red-300 text-red-700 rounded-md hover:bg-red-50 disabled:opacity-50"
              >
                Reject
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting
                  ? 'Saving…'
                  : initialOutcome === 'Rejected'
                    ? 'Confirm rejection'
                    : 'Confirm review'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
