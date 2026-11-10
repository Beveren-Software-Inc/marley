import type { LabTest } from '../../services/labTests'
import { stripHtmlToText } from '../ui/dashboardCardListing'
import { resultValuesFromHtml } from './labTestDisplayUtils'

export type BulkReviewBucket = 'toReview' | 'awaitingResults' | 'alreadyReviewed'

export function simplifyResultFlagLabel(flag?: string | null): string {
  if (!flag) return ''
  if (flag === 'Critically High' || flag === 'High') return 'High'
  if (flag === 'Critically Low' || flag === 'Low') return 'Low'
  return ''
}

export function displayResultFlag(lt: LabTest): string {
  return simplifyResultFlagLabel(lt.result_flag) || ''
}

/** Badge classes: High / critical high = red-orange; Low / critical low = yellow. */
export function resultFlagBadgeClass(flag?: string | null): string {
  const f = (flag || '').trim().toLowerCase()
  if (!f) return 'bg-slate-100 text-slate-500'
  if (f.includes('low')) {
    return f.includes('critical')
      ? 'bg-yellow-100 text-yellow-900 ring-1 ring-yellow-400'
      : 'bg-yellow-100 text-yellow-800'
  }
  if (f.includes('high') || f.includes('critical')) {
    return f.includes('critical')
      ? 'bg-red-100 text-red-700 ring-1 ring-red-300'
      : 'bg-orange-100 text-orange-700'
  }
  if (f === 'normal') return 'bg-green-100 text-green-700'
  return 'bg-orange-100 text-orange-700'
}

export function labTestResultPreview(lt: LabTest): string {
  const lines = lt.lab_test_lines || []
  if (lt.is_legacy_line_row || lt.is_legacy_import) {
    // Legacy results are shown as the values only — never the panel / test name /
    // test code prefixes (Oracle LAB 00-04 rows) or the stored Panel/Test Code/
    // Result HTML table dumped as text.
    const lineValues = lines
      .map((line) => (line.lab_result_value || '').trim())
      .filter(Boolean)
    if (lineValues.length) return lineValues.join(', ')

    const storedValues = resultValuesFromHtml(lt.custom_result)
    if (storedValues.length) return storedValues.join(', ')

    const plainResults = (typeof lt.results === 'string' ? lt.results : '').trim()
    if (plainResults && !plainResults.includes('<')) return plainResults
  }

  const raw =
    lt.custom_result ||
    lt.descriptive_result ||
    (typeof lt.results === 'string' ? lt.results : '') ||
    ''
  const text = stripHtmlToText(raw) || lt.result_flag || ''
  return text || '—'
}

/** Only Pending Review tests are updated by bulk doctor review. */
export function isLabTestEligibleForDoctorReview(lt: LabTest): boolean {
  return lt.status === 'Pending Review'
}

export function bucketLabTestsForBulkReview(tests: LabTest[]) {
  const toReview: LabTest[] = []
  const awaitingResults: LabTest[] = []
  const alreadyReviewed: LabTest[] = []

  for (const test of tests) {
    if (test.status === 'Pending Review') {
      toReview.push(test)
    } else if (test.status === 'Reviewed' || test.status === 'Rejected') {
      alreadyReviewed.push(test)
    } else {
      awaitingResults.push(test)
    }
  }

  return { toReview, awaitingResults, alreadyReviewed }
}

export interface ReviewFormValues {
  reportType: string
  resultIndicator: string
  followUps: Set<string>
  followUpOther: string
  comments: string
  prescriptionMessage: string
  patientInformed: boolean
  archiveReport: boolean
  createTask: boolean
}

export function validateReviewForm(
  values: ReviewFormValues,
  outcome: 'Reviewed' | 'Rejected'
): string | null {
  if (!values.resultIndicator) {
    return 'Please select a result indicator.'
  }
  if (outcome === 'Reviewed' && values.followUps.size === 0) {
    return 'Select at least one follow-up action.'
  }
  if (values.followUps.has('Other') && !values.followUpOther.trim()) {
    return 'Please describe the other follow-up action.'
  }
  if (outcome === 'Rejected' && !values.comments.trim()) {
    return 'Please provide a reason for rejection.'
  }
  return null
}

export function reviewFormToPayload(
  labTestName: string,
  values: ReviewFormValues,
  outcome: 'Reviewed' | 'Rejected'
) {
  return {
    lab_test_name: labTestName,
    new_status: outcome,
    review_report_type: values.reportType,
    review_result_indicator: values.resultIndicator,
    review_follow_up_actions: Array.from(values.followUps),
    review_follow_up_other: values.followUpOther,
    review_comments: values.comments,
    review_prescription_message: values.prescriptionMessage,
    patient_informed_of_report: values.patientInformed ? 1 : 0,
    archive_report_on_review: values.archiveReport ? 1 : 0,
    create_task_on_review: values.createTask ? 1 : 0,
  }
}
