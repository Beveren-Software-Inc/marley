// hooks/useRiskAssessmentGaps.ts
import { useEffect, useState } from 'react'
import {
  RISK_GAP_REFRESH_EVENT,
  fetchRiskAssessmentGaps,
  type RiskAssessmentGaps,
  type RiskGapQuery,
} from '../services/generalRisk'

/**
 * Follow-up risk assessments still outstanding for the focused care episode.
 *
 * A flagged General Risk Assessment item (Suicidal risk / Homicide) with no
 * matching assessment for the same admission/visit drives the red outline on the
 * sidebar screen and on the form item. Re-checks when the care context changes or
 * when a risk assessment is saved anywhere in the portal.
 */
export function useRiskAssessmentGaps({
  patient,
  inpatientAdmission,
  patientVisit,
}: RiskGapQuery): RiskAssessmentGaps | null {
  const [gaps, setGaps] = useState<RiskAssessmentGaps | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const hasCareScope = Boolean(patient || inpatientAdmission || patientVisit)

  useEffect(() => {
    const onRiskAssessmentsChanged = () => setRefreshToken((token) => token + 1)
    window.addEventListener(RISK_GAP_REFRESH_EVENT, onRiskAssessmentsChanged)
    return () => window.removeEventListener(RISK_GAP_REFRESH_EVENT, onRiskAssessmentsChanged)
  }, [])

  useEffect(() => {
    if (!hasCareScope) return

    let cancelled = false
    fetchRiskAssessmentGaps({ patient, inpatientAdmission, patientVisit })
      .then((next) => {
        if (!cancelled) setGaps(next || null)
      })
      .catch(() => {
        if (!cancelled) setGaps(null)
      })

    return () => {
      cancelled = true
    }
  }, [hasCareScope, patient, inpatientAdmission, patientVisit, refreshToken])

  return hasCareScope ? gaps : null
}
