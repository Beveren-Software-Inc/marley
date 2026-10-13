// services/riskYesNo.ts

/**
 * Value helpers for the "Yes or No" questions on the risk assessments.
 *
 * The answers are stored on the backend as Select values ("Yes" / "No"). An
 * empty value means the clinician has not answered the question yet — it is
 * never treated as, nor displayed as, a "No".
 */
export type RiskYesNo = 'Yes' | 'No' | ''

/** Legacy Check answers (0/1) are still tolerated while reading old records. */
export function toRiskYesNo(value: unknown): RiskYesNo {
  if (value === 1 || value === true || value === '1' || value === 'yes' || value === 'Yes') {
    return 'Yes'
  }
  if (value === 0 || value === false || value === '0' || value === 'no' || value === 'No') {
    return 'No'
  }
  return ''
}

/** True only when the question was explicitly answered "Yes". */
export function isRiskYes(value: unknown): boolean {
  return toRiskYesNo(value) === 'Yes'
}

/** Display label for an answer; a question left unanswered renders as an em dash. */
export function riskYesNoLabel(value: unknown): string {
  return toRiskYesNo(value) || '—'
}
