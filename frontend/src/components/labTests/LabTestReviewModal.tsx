import { useEffect, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import {
  fetchDoctorReviewFormOptions,
  fetchLabTest,
  submitDoctorLabTestReview,
  type DoctorReviewFormOptions,
  type LabTest,
} from '../../services/labTests'
import { toast } from '../../hooks/useToast'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_FOOTER_STICKY,
  CREATE_MODAL_OVERLAY,
  CreateModalHeader,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { linkComboboxInputClassCompact } from '../ui/linkComboboxStyles'

export interface LabTestReviewModalProps {
  labTestName: string
  initialOutcome?: 'Reviewed' | 'Rejected'
  onClose: () => void
  onSuccess: () => void
}

const fieldClass = linkComboboxInputClassCompact

const checkboxClass =
  'mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-2 focus:ring-emerald-500/25'

const radioClass =
  'mt-1 h-4 w-4 border-slate-300 text-emerald-600 focus:ring-2 focus:ring-emerald-500/25'

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
          const actions = Array.isArray(doc.review_follow_up_actions)
            ? doc.review_follow_up_actions
            : (() => {
                try {
                  const parsed = JSON.parse(doc.review_follow_up_actions as string)
                  return Array.isArray(parsed) ? parsed : []
                } catch {
                  return []
                }
              })()
          if (actions.length) setFollowUps(new Set(actions))
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

  const subtitle = (
    <>
      {labTest?.lab_test_name || labTestName}
      {labTest?.patient_name ? ` · ${labTest.patient_name}` : ''}
    </>
  )

  return (
    <div className={CREATE_MODAL_OVERLAY} onClick={onClose}>
      <div
        className={createModalShellClass('max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col')}
        onClick={(e) => e.stopPropagation()}
      >
        <CreateModalHeader
          title="File pathology / radiology report"
          subtitle={subtitle}
          icon={<ClipboardCheck className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          onClose={onClose}
        />

        {loading ? (
          <div className={`${CREATE_MODAL_BODY_GRADIENT} p-8 text-center text-emerald-900/70`}>
            Loading…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div
              className={`${CREATE_MODAL_BODY_GRADIENT} flex-1 space-y-5 px-6 py-5`}
              style={{ scrollbarWidth: 'thin' }}
            >
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 rounded-xl border border-emerald-100/80 bg-white/70 p-4 text-sm shadow-sm sm:grid-cols-2">
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-emerald-800/60">
                    Sample / investigation
                  </span>
                  <p className="mt-1 font-medium text-emerald-950">
                    {formatDt(labTest?.result_date || labTest?.submitted_date)}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-emerald-800/60">
                    Results entered
                  </span>
                  <p className="mt-1 font-medium text-emerald-950">
                    {formatDt(labTest?.results_entered_datetime || labTest?.submitted_date)}
                  </p>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Type</label>
                <select
                  className={fieldClass}
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
                <p className="mb-2 text-sm font-semibold text-slate-700">Result indicator</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(options?.result_indicators || []).map((opt) => (
                    <label
                      key={opt}
                      className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50/50 has-[:checked]:border-emerald-300 has-[:checked]:bg-emerald-50/60"
                    >
                      <input
                        type="radio"
                        name="result_indicator"
                        className={radioClass}
                        checked={resultIndicator === opt}
                        onChange={() => setResultIndicator(opt)}
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold text-slate-700">Follow-up action</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(options?.follow_up_actions || []).map((action) => (
                    <label
                      key={action}
                      className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50/50 has-[:checked]:border-emerald-300 has-[:checked]:bg-emerald-50/60"
                    >
                      <input
                        type="checkbox"
                        className={checkboxClass}
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
                    className={`${fieldClass} mt-2`}
                    placeholder="Describe other action…"
                    value={followUpOther}
                    onChange={(e) => setFollowUpOther(e.target.value)}
                  />
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Comments / patient message
                </label>
                <textarea
                  className={`${fieldClass} min-h-[80px] resize-y`}
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  rows={3}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Message for patient&apos;s next prescription
                </label>
                <textarea
                  className={`${fieldClass} min-h-[60px] resize-y`}
                  value={prescriptionMessage}
                  onChange={(e) => setPrescriptionMessage(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="flex flex-wrap gap-4 rounded-xl border border-emerald-100/80 bg-white/60 px-4 py-3 text-sm">
                <label className="flex cursor-pointer items-center gap-2 text-slate-700">
                  <input
                    type="checkbox"
                    className={checkboxClass}
                    checked={patientInformed}
                    onChange={(e) => setPatientInformed(e.target.checked)}
                  />
                  Patient to be informed of this report
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-slate-700">
                  <input
                    type="checkbox"
                    className={checkboxClass}
                    checked={archiveReport}
                    onChange={(e) => setArchiveReport(e.target.checked)}
                  />
                  Archive report
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-slate-700">
                  <input
                    type="checkbox"
                    className={checkboxClass}
                    checked={createTask}
                    onChange={(e) => setCreateTask(e.target.checked)}
                  />
                  Create a task
                </label>
              </div>
            </div>

            <div className={`${CREATE_MODAL_FOOTER_STICKY} justify-end`}>
              <button type="button" onClick={onClose} className={CM_BTN_CANCEL} disabled={submitting}>
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void saveReview('Rejected')}
                className="rounded-lg border border-red-200/80 bg-white px-4 py-2.5 text-sm font-medium text-red-700 shadow-sm transition hover:bg-red-50 disabled:opacity-50"
              >
                Reject
              </button>
              <button type="submit" disabled={submitting} className={CM_BTN_PRIMARY}>
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
