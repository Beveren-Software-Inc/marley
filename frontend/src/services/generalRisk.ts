// services/generalRisk.ts

import { isRiskYes, type RiskYesNo } from './riskYesNo'

// ── Shared item metadata (single source of truth for the Yes/No grid) ──────────

export interface GeneralRiskItem {
  /** Doctype answer fieldname (Select: "Yes" / "No", blank = not answered). */
  key: string
  label: string
}

export interface GeneralRiskSection {
  title: string
  items: GeneralRiskItem[]
}

export const GENERAL_RISK_SECTIONS: GeneralRiskSection[] = [
  {
    title: 'Risk Towards Self',
    items: [
      { key: 'self_harm', label: 'Self-harm' },
      { key: 'suicidal_risk', label: 'Suicidal risk' },
    ],
  },
  {
    title: 'Risk Towards Others',
    items: [
      { key: 'others_bullying', label: 'Bullying' },
      { key: 'others_violence', label: 'Violence and aggression' },
      { key: 'others_homicide', label: 'Homicide' },
    ],
  },
  {
    title: 'Risk From Others',
    items: [
      { key: 'from_bullying', label: 'Bullying' },
      { key: 'from_neglect', label: 'Neglect' },
      { key: 'from_violence', label: 'Violence and aggression' },
    ],
  },
]

export const GENERAL_RISK_ITEMS: GeneralRiskItem[] = GENERAL_RISK_SECTIONS.reduce<GeneralRiskItem[]>(
  (all, section) => [...all, ...section.items],
  []
)

/** Reason fieldname for a Yes/No item, e.g. self_harm → self_harm_reason. */
export const generalRiskReasonField = (key: string) => `${key}_reason`

/** Only an explicit "Yes" flags the item — an unanswered question does not. */
export function isGeneralRiskFlagged(value: unknown): boolean {
  return isRiskYes(value)
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GeneralRiskAssessmentRow {
  name: string
  patient: string
  patient_name?: string
  assessment_date: string
  practitioner?: string
  practitioner_name?: string
  docstatus: number
  inpatient_admission?: string
  patient_visit?: string
  /** Set by the list API so the UI can enforce the 24-hour edit window. */
  creation?: string
  modified?: string
  /** Answer fields are addressed by item key (see GENERAL_RISK_SECTIONS). */
  [field: string]: unknown
  self_harm?: RiskYesNo
  suicidal_risk?: RiskYesNo
  others_bullying?: RiskYesNo
  others_violence?: RiskYesNo
  others_homicide?: RiskYesNo
  from_bullying?: RiskYesNo
  from_neglect?: RiskYesNo
  from_violence?: RiskYesNo
}

export interface GeneralRiskAssessmentDetail extends GeneralRiskAssessmentRow {
  cost_center?: string
  self_harm_reason?: string
  suicidal_risk_reason?: string
  others_bullying_reason?: string
  others_violence_reason?: string
  others_homicide_reason?: string
  from_bullying_reason?: string
  from_neglect_reason?: string
  from_violence_reason?: string
  notes?: string
}

export interface GeneralRiskAssessmentListFilters {
  dateFrom?: string
  dateTo?: string
  practitioner?: string
}

export interface CreateGeneralRiskAssessmentInput {
  patient: string
  assessment_date: string
  practitioner?: string
  inpatient_admission?: string
  patient_visit?: string
  /** Portal branch; when omitted backend uses inpatient admission / visit cost center. */
  cost_center?: string
  notes?: string

  /**
   * Every item in GENERAL_RISK_SECTIONS contributes an answer field ("Yes" /
   * "No" / blank when unanswered) plus its `<field>_reason` text field. The
   * signature below lets the modal build the payload by looping over the shared
   * item list.
   */
  [field: string]: string | undefined

  // Risk towards self
  self_harm?: RiskYesNo
  self_harm_reason?: string
  suicidal_risk?: RiskYesNo
  suicidal_risk_reason?: string

  // Risk towards others
  others_bullying?: RiskYesNo
  others_bullying_reason?: string
  others_violence?: RiskYesNo
  others_violence_reason?: string
  others_homicide?: RiskYesNo
  others_homicide_reason?: string

  // Risk from others
  from_bullying?: RiskYesNo
  from_bullying_reason?: string
  from_neglect?: RiskYesNo
  from_neglect_reason?: string
  from_violence?: RiskYesNo
  from_violence_reason?: string
}

/** Update payload — same fields as create, plus the record name; patient is fixed. */
export interface UpdateGeneralRiskAssessmentInput
  extends Omit<CreateGeneralRiskAssessmentInput, 'patient'> {
  /** Name (ID) of the General Risk Assessment being updated. */
  name: string
}

// ── Create assessment ─────────────────────────────────────────────────────────
export async function createGeneralRiskAssessment(
  input: CreateGeneralRiskAssessmentInput
): Promise<{ success: boolean; name?: string; message?: string }> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()

  const res = await fetch(
    '/api/method/healthcare.api.general_risk_assessment.create_general_risk_assessment',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      },
      credentials: 'include',
      body: JSON.stringify({ data: JSON.stringify(input) }),
    }
  )
  const data = await res.json()
  const msg = data?.message
  return msg ?? { success: false, message: 'Unknown error' }
}

// ── Update assessment (24-hour window) ────────────────────────────────────────
export async function updateGeneralRiskAssessment(
  input: UpdateGeneralRiskAssessmentInput
): Promise<{ success: boolean; name?: string; message?: string }> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()

  const res = await fetch(
    '/api/method/healthcare.api.general_risk_assessment.update_general_risk_assessment',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({ data: JSON.stringify(input) }),
    }
  )
  const data = await res.json()
  const msg = data?.message
  return msg ?? { success: false, message: 'Unknown error' }
}

// ── Delete assessment (24-hour window) ────────────────────────────────────────
export async function deleteGeneralRiskAssessment(
  name: string
): Promise<{ success: boolean; name?: string; message?: string }> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()

  const res = await fetch(
    '/api/method/healthcare.api.general_risk_assessment.delete_general_risk_assessment',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({ name }),
    }
  )
  const data = await res.json()
  const msg = data?.message
  return msg ?? { success: false, message: 'Unknown error' }
}

// ── Fetch assessments list ────────────────────────────────────────────────────
export async function fetchGeneralRiskAssessments(
  patient?: string,
  filters: GeneralRiskAssessmentListFilters = {}
): Promise<GeneralRiskAssessmentRow[]> {
  const params = new URLSearchParams()
  if (patient) params.append('patient', patient)
  if (filters.practitioner) params.append('practitioner', filters.practitioner)
  if (filters.dateFrom) params.append('date_from', filters.dateFrom)
  if (filters.dateTo) params.append('date_to', filters.dateTo)

  const res = await fetch(
    `/api/method/healthcare.api.general_risk_assessment.get_general_risk_assessments?${params.toString()}`,
    { credentials: 'include' }
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load general risk assessments')
  }
  return (data?.message || []) as GeneralRiskAssessmentRow[]
}

export async function fetchGeneralRiskAssessment(
  name: string
): Promise<GeneralRiskAssessmentDetail> {
  const params = new URLSearchParams({ name })
  const res = await fetch(
    `/api/method/healthcare.api.general_risk_assessment.get_general_risk_assessment?${params.toString()}`,
    { credentials: 'include' }
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load general risk assessment')
  }
  return data?.message as GeneralRiskAssessmentDetail
}

// ── Follow-up risk assessment gaps ───────────────────────────────────────────

/**
 * Screens/items highlighted in red while a flagged General Risk Assessment item
 * still has no matching assessment for the same care episode.
 */
export const SUICIDAL_RISK_SCREEN_ID = 'clinical-suicide-risk'
export const HOMICIDE_RISK_SCREEN_ID = 'homicide-risk'

/** General Risk Assessment items that require a follow-up risk assessment. */
export const FOLLOW_UP_RISK_ITEMS: Record<string, string> = {
  suicidal_risk: SUICIDAL_RISK_SCREEN_ID,
  others_homicide: HOMICIDE_RISK_SCREEN_ID,
}

export interface RiskAssessmentGaps {
  /** Latest General Risk Assessment of the episode, when one exists. */
  general_risk_assessment: string | null
  suicidal_risk_flagged: 0 | 1
  homicide_risk_flagged: 0 | 1
  /** Latest follow-up assessments recorded for the same episode, if any. */
  clinical_suicide_risk_assessment: string | null
  homicide_risk_assessment: string | null
  /** 1 when the item is flagged and the follow-up assessment is still missing. */
  needs_suicidal_risk_assessment: 0 | 1
  needs_homicide_risk_assessment: 0 | 1
}

export interface RiskGapQuery {
  patient?: string
  inpatientAdmission?: string
  patientVisit?: string
}

export async function fetchRiskAssessmentGaps(
  query: RiskGapQuery
): Promise<RiskAssessmentGaps> {
  const params = new URLSearchParams()
  if (query.patient) params.append('patient', query.patient)
  if (query.inpatientAdmission) params.append('inpatient_admission', query.inpatientAdmission)
  if (query.patientVisit) params.append('patient_visit', query.patientVisit)

  const res = await fetch(
    `/api/method/healthcare.api.general_risk_assessment.get_risk_assessment_gaps?${params.toString()}`,
    { credentials: 'include' }
  )
  const data = await res.json()
  if (data?.exc_type) {
    throw new Error(data?.message || 'Failed to load follow-up risk assessment status')
  }
  return data?.message as RiskAssessmentGaps
}

/** Broadcast that risk assessments changed, so the sidebar re-checks its gaps. */
export const RISK_GAP_REFRESH_EVENT = 'healthcare:risk-assessment-gaps-changed'

export function notifyRiskGapsChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(RISK_GAP_REFRESH_EVENT))
}
