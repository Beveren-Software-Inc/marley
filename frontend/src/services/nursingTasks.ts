import { apiRequest } from './apiClient'

export interface NursingTaskRow {
  name: string
  status: string
  date?: string
  requested_start_time?: string
  requested_end_time?: string
  task_start_time?: string
  task_end_time?: string
  patient?: string
  patient_name?: string
  inpatient_record?: string
  service_unit?: string
  medical_department?: string
  activity?: string
  assigned_by?: string
  assigned_to?: string
}

export async function fetchNursingTasks(
  limit: number = 50,
  offset: number = 0,
  options?: {
    patient?: string
    assigned_to?: string
    status?: string
    my_tasks?: boolean
  }
): Promise<NursingTaskRow[]> {
  const params = new URLSearchParams()
  params.append('limit', String(limit))
  params.append('offset', String(offset))
  if (options?.patient) params.append('patient', options.patient)
  if (options?.assigned_to) params.append('assigned_to', options.assigned_to)
  if (options?.status) params.append('status', options.status)
  if (options?.my_tasks) params.append('my_tasks', '1')

  const data = await apiRequest<NursingTaskRow[]>(
    `/api/method/healthcare.api.nursing_task.get_nursing_tasks?${params.toString()}`
  )
  return Array.isArray(data) ? data : []
}

