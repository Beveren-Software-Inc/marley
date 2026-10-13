/**
 * Value helpers for the Yes/No segmented control used on the risk assessments.
 *
 * Kept separate from the component so both stay fast-refresh friendly.
 * The stored answer lives in services/riskYesNo.
 */

import { toRiskYesNo, type RiskYesNo } from '../../services/riskYesNo'

export type YesNoChoice = '' | 'yes' | 'no'

/** Map a stored answer (or a legacy Check value) to the control's value. */
export function yesNoFromValue(value: unknown): YesNoChoice {
  const answer = toRiskYesNo(value)
  if (answer === 'Yes') return 'yes'
  if (answer === 'No') return 'no'
  return ''
}

/** Map the control's value to the stored answer; unanswered stays blank. */
export function selectFromYesNo(value: YesNoChoice): RiskYesNo {
  if (value === 'yes') return 'Yes'
  if (value === 'no') return 'No'
  return ''
}

