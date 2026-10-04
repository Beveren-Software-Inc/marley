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

// ── Notify doctor (WhatsApp) ────────────────────────────────────────────────

export interface ReportRequestWhatsAppTemplateOption {
  name: string
  template_name: string
  actual_name?: string
  purpose?: string
  header_type?: string
  header_text?: string
  body_text?: string
  footer_text?: string
  field_names?: string
  language_code?: string
  variable_count?: number
}

export interface ReportRequestWhatsAppTemplatePreview {
  header: string
  body: string
  footer: string
  template_name?: string
  actual_name?: string
}

export interface ReportRequestWhatsAppPreview {
  report_request: string
  patient?: string
  patient_name?: string
  recipient?: string
  doctor?: string
  doctor_name?: string
  phone_number: string
  country?: string
  country_isd?: string
  templates: ReportRequestWhatsAppTemplateOption[]
  selected_template: string | null
  parameters: string[]
  preview: ReportRequestWhatsAppTemplatePreview | null
  selected?: ReportRequestWhatsAppTemplateOption | null
}

/** Preview the "Notify Doctor" WhatsApp message for a report request. */
export async function getReportRequestWhatsAppPreview(
  name: string,
  opts?: { templateName?: string; doctor?: string },
): Promise<ReportRequestWhatsAppPreview> {
  return apiRequest<ReportRequestWhatsAppPreview>(
    '/api/method/healthcare.api.report_request.get_report_request_whatsapp_preview',
    {
      method: 'POST',
      body: JSON.stringify({
        name,
        ...(opts?.templateName ? { template_name: opts.templateName } : {}),
        ...(opts?.doctor ? { doctor: opts.doctor } : {}),
      }),
    },
  )
}

export interface SendReportRequestDoctorWhatsAppResult {
  status: string
  report_request: string
  doctor: string
  doctor_name: string
  phone_number: string
  template_name: string
  chat_name?: string | null
}

/** Send the "Notify Doctor" WhatsApp message for a report request. */
export async function sendReportRequestDoctorWhatsApp(
  name: string,
  opts: {
    doctor: string
    phone_number?: string
    template_name?: string
    template_parameters?: string[] | string
  },
): Promise<SendReportRequestDoctorWhatsAppResult> {
  return apiRequest<SendReportRequestDoctorWhatsAppResult>(
    '/api/method/healthcare.api.report_request.send_report_request_doctor_whatsapp',
    {
      method: 'POST',
      body: JSON.stringify({
        name,
        doctor: opts.doctor,
        ...(opts.phone_number ? { phone_number: opts.phone_number } : {}),
        ...(opts.template_name ? { template_name: opts.template_name } : {}),
        ...(opts.template_parameters != null
          ? {
              template_parameters: Array.isArray(opts.template_parameters)
                ? JSON.stringify(opts.template_parameters)
                : opts.template_parameters,
            }
          : {}),
      }),
    },
  )
}
