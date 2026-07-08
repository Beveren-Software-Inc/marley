import type { LabTest } from '../../services/labTests'
import { stripHtmlToText } from '../ui/dashboardCardListing'

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

export function labTestResultPreview(lt: LabTest): string {
  const lines = lt.lab_test_lines || []
  if (lt.is_legacy_line_row || lt.is_legacy_import) {
    if (lines.length === 1) {
      const single = (lines[0].lab_result_value || '').trim()
      if (single) return single
    }
    if (lines.length > 1) {
      const parts = lines
        .map((line) => {
          const code = (line.lab_sub_num || line.group_name || '').trim()
          const value = (line.lab_result_value || '').trim()
          if (!value) return ''
          return code ? `${code}: ${value}` : value
        })
        .filter(Boolean)
      if (parts.length) return parts.join(', ')
    }
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
