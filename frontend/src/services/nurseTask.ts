import { apiRequest } from './apiClient'

export interface NurseTask {
  name: string
  patient: string
  patient_name?: string
  task_type: string
  description?: string
  priority?: string
  status: string
  scheduled_time: string
  due_time?: string
  completed_time?: string
  assigned_nurse?: string
  assigned_nurse_name?: string
  medication?: string
  medication_name?: string
  dosage?: string
  route?: string
  is_prn?: 0 | 1
  prn_indication?: string
  notes?: string
  reference_doctype?: string
  encounter?: string
  completed_by?: string
  creation?: string
}

export interface CreateNurseTaskData {
  patient: string
  task_type: string
  scheduled_time: string
  description?: string
  priority?: string
  /** Healthcare Practitioner name */
  assigned_nurse?: string
  /** Shift Assignment name */
  shift?: string
  /** Branch name */
  cost_center?: string
  due_time?: string
  medication?: string
  dosage?: string
  /** Route of Administration name */
  route?: string
  /** Prescription Frequency name */
  frequency?: string
  is_prn?: boolean
  prn_indication?: string
  min_interval_hours?: number
  notes?: string
  reference_doctype?: string
  encounter?: string
  medication_type?: string
}

export async function createNurseTask(data: CreateNurseTaskData): Promise<{ name: string }> {
  return apiRequest<{ name: string }>(
    '/api/method/healthcare.api.nurse_task.create_nurse_task',
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  )
}

export async function bulkCreateNurseTasks(tasks: CreateNurseTaskData[]): Promise<{ created: string[]; count: number }> {
  return apiRequest<{ created: string[]; count: number }>(
    '/api/method/healthcare.api.nurse_task.bulk_create_nurse_tasks',
    {
      method: 'POST',
      body: JSON.stringify({ tasks: JSON.stringify(tasks) }),
    }
  )
}

export async function fetchNurseTasks(
  options?: {
    limit?: number
    offset?: number
    patient?: string
    status?: string
    task_type?: string
    date_from?: string
    date_to?: string
    my_tasks?: boolean
    assigned_nurse?: string
  }
): Promise<NurseTask[]> {
  const params = new URLSearchParams()
  if (options?.limit != null) params.append('limit', String(options.limit))
  if (options?.offset != null) params.append('offset', String(options.offset))
  if (options?.patient) params.append('patient', options.patient)
  if (options?.status) params.append('status', options.status)
  if (options?.task_type) params.append('task_type', options.task_type)
  if (options?.date_from) params.append('date_from', options.date_from)
  if (options?.date_to) params.append('date_to', options.date_to)
  if (options?.my_tasks) params.append('my_tasks', '1')
  if (options?.assigned_nurse) params.append('assigned_nurse', options.assigned_nurse)

  const res = await fetch(
    `/api/method/healthcare.api.nurse_task.get_nurse_tasks?${params.toString()}`
  )
  const data = await res.json()

  if (data?.exc || !res.ok) {
    throw new Error(data?.exc || data?.message || 'Failed to load nurse tasks')
  }

  return Array.isArray(data?.message) ? (data.message as NurseTask[]) : []
}

export async function updateNurseTaskStatus(
  name: string,
  status: string,
  notes?: string
): Promise<{ name: string; status: string }> {
  return apiRequest<{ name: string; status: string }>(
    '/api/method/healthcare.api.nurse_task.update_nurse_task_status',
    {
      method: 'POST',
      body: JSON.stringify({ name, status, notes }),
    }
  )
}
