export const HEALTHCARE_SERVICE_TEMPLATE = 'Healthcare Service Template'

export function isOtherServiceRequest(templateDt?: string | null) {
  return templateDt === HEALTHCARE_SERVICE_TEMPLATE
}

/** List / create forms — Practitioner vs Nurse */
export function serviceRequestPractitionerLabel(
  templateDt?: string | null,
  override?: string
) {
  if (override) return override
  return isOtherServiceRequest(templateDt) ? 'Nurse' : 'Practitioner'
}

/** Detail slide-over — Doctor Name vs Nurse */
export function serviceRequestDetailClinicianLabel(
  templateDt?: string | null,
  override?: string
) {
  if (override) return override
  return isOtherServiceRequest(templateDt) ? 'Nurse' : 'Doctor Name'
}
