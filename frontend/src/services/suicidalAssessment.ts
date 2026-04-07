// services/suicidalAssessment.ts
export interface SuicidalAssessment {
  name: string
  admission_no: string
  patient: string
  patient_name?: string
  assessment_date: string
  assessed_by?: string
  active_suicidal_thoughts_plans?: string
  overwhelmed_thoughts_harming?: string
  made_current_plans?: string
  previous_attempts?: string
  created_at?: string
  modified?: string
}

export async function fetchSuicidalAssessments(
  patient?: string,
  admission?: string,
  limit: number = 50,
  offset: number = 0
): Promise<SuicidalAssessment[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (patient) params.append('patient', patient)
  if (admission) params.append('admission', admission)

  const response = await fetch(
    `/api/method/healthcare.api.suicidal_assessment.get_suicidal_assessments?${params.toString()}`
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

export async function fetchSuicidalAssessmentById(name: string): Promise<any> {
  const response = await fetch(`/api/resource/Suicidal%20Patient%20Assessment/${name}`)
  const resData = await response.json()
  
  if (resData?.data) {
    return resData.data
  }
  
  throw new Error('Failed to fetch assessment details')
}