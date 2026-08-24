export const HEALTHCARE_SERVICE_TEMPLATE = 'Healthcare Service Template'
export const LAB_TEST_TEMPLATE = 'Lab Test Template'

export function isOtherServiceRequest(templateDt?: string | null) {
  return templateDt === HEALTHCARE_SERVICE_TEMPLATE
}

export function isLabServiceRequest(templateDt?: string | null) {
  return templateDt === LAB_TEST_TEMPLATE
}

/** List / create forms — Practitioner vs Nurse vs Username (lab) */
export function serviceRequestPractitionerLabel(
  templateDt?: string | null,
  override?: string
) {
  if (override) return override
  if (isLabServiceRequest(templateDt)) return 'Username'
  return isOtherServiceRequest(templateDt) ? 'Nurse' : 'Practitioner'
}

/** Detail slide-over — Username (practitioner display name) */
export function serviceRequestDetailClinicianLabel(
  _templateDt?: string | null,
  _override?: string
) {
  return 'Username'
}
