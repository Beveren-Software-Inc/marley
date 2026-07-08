import { useEffect, useMemo, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import {
  fetchDoctorReviewFormOptions,
  fetchLabTest,
  submitDoctorLabTestReview,
  type LabTest,
} from '../../services/labTests'
import { toast } from '../../hooks/useToast'
import { StatusPill } from '../ui/StatusPill'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_FOOTER_STICKY,
  CREATE_MODAL_OVERLAY,
  CreateModalHeader,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { LabTestReviewFormBody } from './LabTestReviewFormBody'
import { LabTestRejectionReasonModal } from './LabTestRejectionReasonModal'
import {
  bucketLabTestsForBulkReview,
  labTestResultPreview,
  reviewFormToPayload,
  validateReviewForm,
  type ReviewFormValues,
} from './labTestReviewUtils'

export interface LabTestReviewModalProps {
  /** Single-test review */
  labTestName?: string
  /** Bulk group review — same form, then confirmation list */
  bulkTests?: LabTest[]
  groupLabel?: string
  serviceRequest?: string
  initialOutcome?: 'Reviewed' | 'Rejected'
  onClose: () => void
  onSuccess: () => void
}

const statusColors: Record<string, string> = {
  Draft: 'default',
  'Pending Review': 'warning',
  Reviewed: 'success',
  Rejected: 'danger',
  Submitted: 'info',
  Completed: 'success',
}

const defaultFormValues = (): ReviewFormValues => ({
  reportType: 'Pathology',
  resultIndicator: 'Normal',
  followUps: new Set(['Take no action']),
  followUpOther: '',
  comments: '',
  prescriptionMessage: '',
  patientInformed: true,
  archiveReport: false,
  createTask: false,
})

export const LabTestReviewModal = ({
  labTestName,
  bulkTests,
  groupLabel,
  serviceRequest,
  initialOutcome = 'Reviewed',
  onClose,
  onSuccess,
}: LabTestReviewModalProps) => {
  const isBulk = Boolean(bulkTests?.length)
  const [step, setStep] = useState<1 | 2>(1)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failures, setFailures] = useState<Array<{ label: string; reason: string }>>([])
  const [labTest, setLabTest] = useState<LabTest | null>(null)
  const [options, setOptions] = useState<Awaited<ReturnType<typeof fetchDoctorReviewFormOptions>> | null>(null)
  const [formValues, setFormValues] = useState<ReviewFormValues>(defaultFormValues)
  const [rejectionModalOpen, setRejectionModalOpen] = useState(false)

  const buckets = useMemo(
    () => (bulkTests ? bucketLabTestsForBulkReview(bulkTests) : null),
    [bulkTests]
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        if (isBulk) {
          const opts = await fetchDoctorReviewFormOptions()
          if (cancelled) return
          setOptions(opts)
          setFormValues(defaultFormValues())
        } else if (labTestName) {
          const [doc, opts] = await Promise.all([
            fetchLabTest(labTestName),
            fetchDoctorReviewFormOptions(),
          ])
          if (cancelled) return
          setLabTest(doc)
          setOptions(opts)
          const followUps = new Set(['Take no action'])
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
            if (actions.length) actions.forEach((a) => followUps.add(a))
          }
          setFormValues({
            reportType: doc.review_report_type || 'Pathology',
            resultIndicator: doc.review_result_indicator || 'Normal',
            followUps,
            followUpOther: '',
            comments: doc.review_comments || '',
            prescriptionMessage: doc.review_prescription_message || '',
            patientInformed: doc.patient_informed_of_report !== 0,
            archiveReport: !!doc.archive_report_on_review,
            createTask: !!doc.create_task_on_review,
          })
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load review form')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isBulk, labTestName])

  const patchForm = (patch: Partial<ReviewFormValues>) => {
    setFormValues((prev) => ({ ...prev, ...patch }))
  }

  const toggleFollowUp = (action: string) => {
    setFormValues((prev) => {
      const next = new Set(prev.followUps)
      if (next.has(action)) next.delete(action)
      else next.add(action)
      return { ...prev, followUps: next }
    })
  }

  const saveSingleReview = async (
    outcome: 'Reviewed' | 'Rejected',
    valuesOverride?: ReviewFormValues
  ) => {
    if (!labTestName) return
    const activeValues = valuesOverride ?? formValues
    const validationError = validateReviewForm(activeValues, outcome)
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await submitDoctorLabTestReview(reviewFormToPayload(labTestName, activeValues, outcome))
      toast.success(outcome === 'Reviewed' ? 'Lab test reviewed' : 'Lab test rejected')
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

  const saveBulkReview = async (
    outcome: 'Reviewed' | 'Rejected',
    valuesOverride?: ReviewFormValues
  ) => {
    if (!buckets) return
    const activeValues = valuesOverride ?? formValues
    const validationError = validateReviewForm(activeValues, outcome)
    if (validationError) {
      setError(validationError)
      return
    }
    if (!buckets.toReview.length) {
      setError('No tests in this group are pending review.')
      return
    }

    setSubmitting(true)
    setError(null)
    setFailures([])
    const reviewed: string[] = []
    const failed: Array<{ label: string; reason: string }> = []

    try {
      for (const test of buckets.toReview) {
        const label = test.lab_test_name || test.template || test.name
        try {
          await submitDoctorLabTestReview(reviewFormToPayload(test.name, activeValues, outcome))
          reviewed.push(label)
        } catch (err) {
          failed.push({
            label,
            reason: err instanceof Error ? err.message : 'Review failed',
          })
        }
      }

      if (reviewed.length) {
        toast.success(
          outcome === 'Reviewed'
            ? `${reviewed.length} lab test${reviewed.length !== 1 ? 's' : ''} reviewed`
            : `${reviewed.length} lab test${reviewed.length !== 1 ? 's' : ''} rejected`
        )
        onSuccess()
      }

      if (failed.length) {
        setFailures(failed)
        setError(`${failed.length} test${failed.length !== 1 ? 's' : ''} could not be updated.`)
        toast.error(`${failed.length} test${failed.length !== 1 ? 's' : ''} failed`)
      } else {
        onClose()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const goToConfirmStep = () => {
    const validationError = validateReviewForm(formValues, initialOutcome)
    if (validationError) {
      setError(validationError)
      return
    }
    if (isBulk && !buckets?.toReview.length) {
      setError('No tests in this group are pending review.')
      return
    }
    setError(null)
    setStep(2)
  }

  const requestRejection = () => {
    if (!formValues.resultIndicator) {
      setError('Please select a result indicator before rejecting.')
      return
    }
    setError(null)
    setRejectionModalOpen(true)
  }

  const confirmRejection = (reason: string) => {
    const nextValues = { ...formValues, comments: reason }
    setFormValues(nextValues)
    setRejectionModalOpen(false)
    if (isBulk) void saveBulkReview('Rejected', nextValues)
    else void saveSingleReview('Rejected', nextValues)
  }

  const rejectionTestLabel = isBulk
    ? `${groupLabel || 'Group review'}${buckets?.toReview.length ? ` · ${buckets.toReview.length} test${buckets.toReview.length !== 1 ? 's' : ''}` : ''}`
    : labTest?.lab_test_name || labTestName

  const formatDt = (d?: string) => (d ? new Date(d).toLocaleString('en-GB') : '—')

  const subtitle = isBulk ? (
    <>
      {groupLabel || 'Group review'}
      {serviceRequest ? ` · ${serviceRequest}` : ''}
    </>
  ) : (
    <>
      {labTest?.lab_test_name || labTestName}
      {labTest?.patient_name ? ` · ${labTest.patient_name}` : ''}
    </>
  )

  const singleMeta = !isBulk ? (
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
  ) : step === 1 ? (
    <p className="rounded-xl border border-emerald-100/80 bg-white/70 px-4 py-3 text-sm text-slate-600">
      Complete the review details below. On the next step you will confirm which group tests
      will be marked as reviewed. Tests without results yet are not changed.
    </p>
  ) : null

  const renderBulkConfirmList = () => {
    if (!buckets || !bulkTests) return null

    const renderSection = (
      title: string,
      items: LabTest[],
      tone: 'emerald' | 'slate' | 'amber'
    ) => {
      if (!items.length) return null
      const toneClass =
        tone === 'emerald'
          ? 'border-emerald-200 bg-emerald-50/50'
          : tone === 'amber'
            ? 'border-amber-200 bg-amber-50/40'
            : 'border-slate-200 bg-slate-50/50'
      return (
        <div className={`rounded-xl border ${toneClass} overflow-hidden`}>
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 border-b border-inherit">
            {title} ({items.length})
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-white/80">
              {items.map((test) => (
                <tr key={test.name}>
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-slate-800">
                      {test.lab_test_name || test.template || test.name}
                    </div>
                    <div className="text-xs text-slate-500">{test.name}</div>
                  </td>
                  <td className="px-3 py-2 align-top text-slate-700 max-w-[180px]">
                    <span className="line-clamp-2">{labTestResultPreview(test)}</span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <StatusPill
                      status={test.status || 'Draft'}
                      color={statusColors[test.status || 'Draft'] || 'default'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Your review answers will be applied to{' '}
          <span className="font-medium text-emerald-800">{buckets.toReview.length}</span> test
          {buckets.toReview.length !== 1 ? 's' : ''} with status Pending Review.
        </p>
        {renderSection('Will be marked reviewed', buckets.toReview, 'emerald')}
        {renderSection('Skipped — awaiting results', buckets.awaitingResults, 'amber')}
        {renderSection('Skipped — already reviewed', buckets.alreadyReviewed, 'slate')}
        {failures.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 space-y-1">
            {failures.map((f) => (
              <div key={f.label}>
                <span className="font-medium">{f.label}:</span> {f.reason}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={CREATE_MODAL_OVERLAY} onClick={onClose}>
      <div
        className={createModalShellClass('max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col')}
        onClick={(e) => e.stopPropagation()}
      >
        <CreateModalHeader
          title={isBulk ? 'Bulk review group' : 'File pathology / radiology report'}
          subtitle={subtitle}
          icon={<ClipboardCheck className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          onClose={onClose}
        />

        {loading ? (
          <div className={`${CREATE_MODAL_BODY_GRADIENT} p-8 text-center text-emerald-900/70`}>
            Loading…
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (isBulk && step === 1) goToConfirmStep()
              else if (isBulk) void saveBulkReview(initialOutcome)
              else if (initialOutcome === 'Rejected') requestRejection()
              else void saveSingleReview(initialOutcome)
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div
              className={`${CREATE_MODAL_BODY_GRADIENT} flex-1 space-y-5 overflow-y-auto px-6 py-5`}
              style={{ scrollbarWidth: 'thin' }}
            >
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </div>
              )}

              {isBulk && (
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                  <span className={step === 1 ? 'text-emerald-700' : ''}>1. Review details</span>
                  <span>→</span>
                  <span className={step === 2 ? 'text-emerald-700' : ''}>2. Confirm tests</span>
                </div>
              )}

              {step === 1 ? (
                <LabTestReviewFormBody
                  options={options}
                  values={formValues}
                  onChange={patchForm}
                  onToggleFollowUp={toggleFollowUp}
                  meta={singleMeta}
                />
              ) : (
                renderBulkConfirmList()
              )}
            </div>

            <div className={`${CREATE_MODAL_FOOTER_STICKY} justify-end`}>
              <button type="button" onClick={onClose} className={CM_BTN_CANCEL} disabled={submitting}>
                Cancel
              </button>

              {isBulk && step === 2 && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setStep(1)
                    setError(null)
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  Back
                </button>
              )}

              {isBulk && step === 1 ? (
                <button type="submit" disabled={submitting} className={CM_BTN_PRIMARY}>
                  Next — confirm tests
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={requestRejection}
                    className="rounded-lg border border-red-200/80 bg-white px-4 py-2.5 text-sm font-medium text-red-700 shadow-sm transition hover:bg-red-50 disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button type="submit" disabled={submitting} className={CM_BTN_PRIMARY}>
                    {submitting
                      ? 'Saving…'
                      : isBulk
                        ? `Confirm review (${buckets?.toReview.length ?? 0})`
                        : initialOutcome === 'Rejected'
                          ? 'Confirm rejection'
                          : 'Confirm review'}
                  </button>
                </>
              )}
            </div>
          </form>
        )}
      </div>

      <LabTestRejectionReasonModal
        open={rejectionModalOpen}
        loading={submitting}
        testLabel={rejectionTestLabel}
        initialReason={formValues.comments}
        onClose={() => {
          if (!submitting) setRejectionModalOpen(false)
        }}
        onConfirm={confirmRejection}
      />
    </div>
  )
}
