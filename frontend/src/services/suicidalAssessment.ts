// services/suicidalAssessment.ts
export interface SuicidalAssessment {
  name: string
  admission_no: string
  patient: string
  patient_name?: string
  assessment_date: string
  assessed_by?: string
  assessed_by_name?: string
  practitioner?: string
  practitioner_name?: string
  active_suicidal_thoughts_plans?: string
  overwhelmed_thoughts_harming?: string
  made_current_plans?: string
  previous_attempts?: string
  created_at?: string
  modified?: string
}

export type SuicidalAssessmentDetail = SuicidalAssessment & Record<string, unknown>

export interface SuicidalAssessmentListFilters {
  dateFrom?: string
  dateTo?: string
  practitioner?: string
}

export async function fetchSuicidalAssessments(
  patient?: string,
  admission?: string,
  filters: SuicidalAssessmentListFilters = {},
  limit: number = 50,
  offset: number = 0
): Promise<SuicidalAssessment[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (patient) params.append('patient', patient)
  if (admission) params.append('admission', admission)
  if (filters.dateFrom) params.append('date_from', filters.dateFrom)
  if (filters.dateTo) params.append('date_to', filters.dateTo)
  if (filters.practitioner) params.append('practitioner', filters.practitioner)

  const response = await fetch(
    `/api/method/healthcare.api.suicidal_assessment.get_suicidal_assessments?${params.toString()}`,
    { credentials: 'include' }
  )

  const resData = await response.json()

  if (resData?.message) {
    return Array.isArray(resData.message) ? resData.message : []
  }

  if (resData?.exc_type) {
    throw new Error(resData?.message || 'Failed to fetch suicidal assessments')
  }

  return []
}

export async function createSuicidalPatientAssessment(
  data: Record<string, unknown>
): Promise<{ success: boolean; name?: string; message?: string }> {
  const res = await fetch(
    '/api/method/healthcare.api.suicidal_assessment.create_suicidal_patient_assessment',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Frappe-CSRF-Token': (window as any).csrf_token || '',
      },
      credentials: 'include',
      body: JSON.stringify({ data: JSON.stringify(data) }),
    }
  )
  const resData = await res.json()
  if (resData?.exc_type) {
    return {
      success: false,
      message:
        (typeof resData._error_message === 'string' && resData._error_message) ||
        (typeof resData.message === 'string' && resData.message) ||
        'Failed to save assessment.',
    }
  }
  const msg = resData?.message
  return msg ?? { success: false, message: 'Unknown error' }
}

export async function fetchSuicidalAssessmentById(name: string): Promise<SuicidalAssessmentDetail> {
  const params = new URLSearchParams({ name })
  const response = await fetch(
    `/api/method/healthcare.api.suicidal_assessment.get_suicidal_patient_assessment?${params.toString()}`,
    { credentials: 'include' }
  )
  const resData = await response.json()

  if (resData?.exc_type) {
    throw new Error(resData?.message || 'Failed to fetch assessment details')
  }

  return resData?.message as SuicidalAssessmentDetail
}
