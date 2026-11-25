import { apiRequest } from './apiClient'
import type { NurseBriefingAdmission, NurseBriefingLabTest } from './nurseBriefing'

export type DoctorBriefingLabTest = NurseBriefingLabTest

export interface DoctorShiftBriefing {
  cost_center?: string | null
  active_admissions: NurseBriefingAdmission[]
  pending_review_lab_tests: DoctorBriefingLabTest[]
}

export type DoctorBriefingSection = 'admissions' | 'lab_tests'

function briefingUrl(costCenter: string | undefined, section: DoctorBriefingSection): string {
  const params = new URLSearchParams({ section })
  if (costCenter) params.set('cost_center', costCenter)
  return `/api/method/healthcare.api.doctor_briefing.get_doctor_shift_briefing?${params}`
}

export async function fetchDoctorBriefingAdmissions(costCenter?: string): Promise<{
  cost_center?: string | null
  active_admissions: NurseBriefingAdmission[]
}> {
  const data = await apiRequest<{
    cost_center?: string | null
    active_admissions?: NurseBriefingAdmission[]
  }>(briefingUrl(costCenter, 'admissions'))
  return {
    cost_center: data.cost_center ?? null,
    active_admissions: data.active_admissions ?? [],
  }
}

export async function fetchDoctorBriefingLabTests(costCenter?: string): Promise<{
  pending_review_lab_tests: DoctorBriefingLabTest[]
}> {
  const data = await apiRequest<{ pending_review_lab_tests?: DoctorBriefingLabTest[] }>(
    briefingUrl(costCenter, 'lab_tests'),
  )
  return { pending_review_lab_tests: data.pending_review_lab_tests ?? [] }
}
