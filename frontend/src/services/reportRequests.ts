import { apiRequest } from './apiClient'

export type ReportRequestStatus = 'Pending' | 'Done' | 'Rejected' | 'Archived'

export interface ReportRequestAuditRow {
  action?: string
  user?: string
  user_full_name?: string
  action_on?: string | null
  details?: string | null
}

export interface ReportRequestRow {
  name: string
  status: ReportRequestStatus
  request_date?: string | null
  urgency?: string
  patient?: string
  patient_name?: string
  file_no?: string
  id_number?: string
  requester?: string
  requester_name?: string
  requester_role?: string
  recipient?: string
  signed_request?: string | null
  remarks?: string | null
  reject_reason?: string | null
  completed_by?: string | null
  completed_by_name?: string | null
  completed_on?: string | null
  cost_center?: string | null
  audit_trail?: ReportRequestAuditRow[]
}

export async function fetchReportRequests(opts: {
  status?: string
  patient?: string
  limit?: number
  offset?: number
}): Promise<{ data: ReportRequestRow[]; total_count: number }> {
  const params = new URLSearchParams()
  params.set('status', opts.status || 'Pending')
  if (opts.patient) params.set('patient', opts.patient)
  params.set('limit', String(opts.limit ?? 50))
  params.set('offset', String(opts.offset ?? 0))
  return apiRequest(`/api/method/healthcare.api.report_request.get_report_requests?${params}`)
}

export async function fetchReportRequest(name: string): Promise<ReportRequestRow> {
  const params = new URLSearchParams({ name })
  return apiRequest(`/api/method/healthcare.api.report_request.get_report_request?${params}`)
}

export async function createReportRequest(data: Record<string, unknown>): Promise<ReportRequestRow> {
  return apiRequest('/api/method/healthcare.api.report_request.create_report_request', {
    method: 'POST',
    body: JSON.stringify({ data }),
  })
}

export async function updateReportRequest(
  name: string,
  data: Record<string, unknown>,
): Promise<ReportRequestRow> {
  return apiRequest('/api/method/healthcare.api.report_request.update_report_request', {
    method: 'POST',
    body: JSON.stringify({ name, data }),
  })
}

export async function completeReportRequest(name: string): Promise<ReportRequestRow> {
  return apiRequest('/api/method/healthcare.api.report_request.complete_report_request', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function reopenReportRequest(name: string): Promise<ReportRequestRow> {
  return apiRequest('/api/method/healthcare.api.report_request.reopen_report_request', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function rejectReportRequest(name: string, reason: string): Promise<ReportRequestRow> {
  return apiRequest('/api/method/healthcare.api.report_request.reject_report_request', {
    method: 'POST',
    body: JSON.stringify({ name, reason }),
  })
}
