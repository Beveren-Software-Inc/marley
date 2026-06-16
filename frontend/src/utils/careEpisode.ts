export const CLOSED_PATIENT_VISIT_STATUSES = new Set(['Completed', 'Cancelled'])

export const CLOSED_INPATIENT_ADMISSION_STATUSES = new Set(['Discharged', 'Cancelled'])

export function isPatientVisitClosedForCreate(status?: string | null): boolean {
  return Boolean(status && CLOSED_PATIENT_VISIT_STATUSES.has(status))
}

export function isInpatientAdmissionClosedForCreate(status?: string | null): boolean {
  return Boolean(status && CLOSED_INPATIENT_ADMISSION_STATUSES.has(status))
}

export type CareEpisodeGuardOptions = {
  /** Healthcare Settings: block clinical records on discharged IP (default true). */
  blockDischargedIp?: boolean
  /** Healthcare Settings: block clinical records on completed OP visit (default true). */
  blockCompletedVisit?: boolean
}

export function getActiveCareBlockReason(
  mode: 'OP' | 'IP' | null,
  visitStatus?: string | null,
  admissionStatus?: string | null,
  options?: CareEpisodeGuardOptions,
): string | undefined {
  const blockDischargedIp = options?.blockDischargedIp ?? true
  const blockCompletedVisit = options?.blockCompletedVisit ?? true
  if (blockCompletedVisit && mode === 'OP' && isPatientVisitClosedForCreate(visitStatus)) {
    return `This patient visit is ${visitStatus}. Select or create an open OP visit to add records.`
  }
  if (
    blockDischargedIp &&
    mode === 'IP' &&
    isInpatientAdmissionClosedForCreate(admissionStatus)
  ) {
    return `This inpatient admission is ${admissionStatus}. Select or create an active IP admission to add records.`
  }
  return undefined
}

export function isActiveCareEpisodeClosedForCreate(
  mode: 'OP' | 'IP' | null,
  activeVisit?: string,
  activeAdmission?: string,
  visitStatus?: string | null,
  admissionStatus?: string | null,
  options?: CareEpisodeGuardOptions,
): boolean {
  const blockDischargedIp = options?.blockDischargedIp ?? true
  const blockCompletedVisit = options?.blockCompletedVisit ?? true
  if (
    blockCompletedVisit &&
    mode === 'OP' &&
    activeVisit &&
    isPatientVisitClosedForCreate(visitStatus)
  ) {
    return true
  }
  if (
    blockDischargedIp &&
    mode === 'IP' &&
    activeAdmission &&
    isInpatientAdmissionClosedForCreate(admissionStatus)
  ) {
    return true
  }
  return false
}
