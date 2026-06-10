import { apiRequest } from './apiClient'

export type ActivityAuditRow = {
  timestamp: string
  user: string
  full_name: string
  activity_type: string
  doctype: string | null
  reference: string
  details: string
  source: 'activity_log' | 'route_history' | 'version'
}

export type ActivityAuditFilters = {
  from_date?: string
  to_date?: string
  period_days?: number
  user?: string
  doctype?: string
  activity_type?: 'all' | 'login' | 'route' | 'document'
  sort_by?: 'timestamp' | 'user' | 'activity_type' | 'doctype' | 'reference'
  sort_order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export type ActivityAuditReport = {
  from_date: string
  to_date: string
  total_count: number
  limit: number
  offset: number
  rows: ActivityAuditRow[]
}

export type ActivityAuditFilterOptions = {
  users: { user: string; full_name: string }[]
  doctypes: string[]
}

export type AuditUserOption = {
  user: string
  full_name: string
  email?: string
}

export type UserActivitySummaryRow = {
  user: string
  full_name: string
  login_count: number
  logout_count: number
  route_views: number
  document_edits: number
  total_events: number
  last_activity: string | null
  top_doctypes: { doctype: string; count: number }[]
}

export type UserActivitySummary = {
  from_date: string
  to_date: string
  total_users: number
  rows: UserActivitySummaryRow[]
}

export type SummarySortKey = 'document_edits' | 'total_events' | 'logins' | 'routes' | 'last_activity' | 'user'

export async function canViewUserActivityAudit(): Promise<boolean> {
  try {
    const result = await apiRequest<boolean>(
      '/api/method/healthcare.api.user_activity_audit.can_view_user_activity_audit'
    )
    return Boolean(result)
  } catch {
    return false
  }
}

export async function fetchUserActivityFilterOptions(
  filters: Pick<ActivityAuditFilters, 'from_date' | 'to_date' | 'period_days'> = {}
): Promise<ActivityAuditFilterOptions> {
  const params = new URLSearchParams()
  if (filters.from_date) params.set('from_date', filters.from_date)
  if (filters.to_date) params.set('to_date', filters.to_date)
  if (filters.period_days != null) params.set('period_days', String(filters.period_days))

  return apiRequest<ActivityAuditFilterOptions>(
    `/api/method/healthcare.api.user_activity_audit.get_user_activity_filter_options?${params.toString()}`
  )
}

export async function fetchUserActivityReport(
  filters: ActivityAuditFilters = {}
): Promise<ActivityAuditReport> {
  const params = new URLSearchParams()
  if (filters.from_date) params.set('from_date', filters.from_date)
  if (filters.to_date) params.set('to_date', filters.to_date)
  if (filters.period_days != null) params.set('period_days', String(filters.period_days))
  if (filters.user) params.set('user', filters.user)
  if (filters.doctype) params.set('doctype', filters.doctype)
  if (filters.activity_type) params.set('activity_type', filters.activity_type)
  if (filters.sort_by) params.set('sort_by', filters.sort_by)
  if (filters.sort_order) params.set('sort_order', filters.sort_order)
  if (filters.limit != null) params.set('limit', String(filters.limit))
  if (filters.offset != null) params.set('offset', String(filters.offset))

  return apiRequest<ActivityAuditReport>(
    `/api/method/healthcare.api.user_activity_audit.get_user_activity_report?${params.toString()}`
  )
}

export async function searchAuditUsers(search?: string, limit = 30): Promise<AuditUserOption[]> {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  params.set('limit', String(limit))

  const rows = await apiRequest<AuditUserOption[]>(
    `/api/method/healthcare.api.user_activity_audit.search_audit_users?${params.toString()}`
  )
  return Array.isArray(rows) ? rows : []
}

export async function fetchUserActivitySummary(
  filters: Pick<ActivityAuditFilters, 'from_date' | 'to_date' | 'period_days' | 'user'> & {
    sort_by?: SummarySortKey
    sort_order?: 'asc' | 'desc'
    limit?: number
  } = {}
): Promise<UserActivitySummary> {
  const params = new URLSearchParams()
  if (filters.from_date) params.set('from_date', filters.from_date)
  if (filters.to_date) params.set('to_date', filters.to_date)
  if (filters.period_days != null) params.set('period_days', String(filters.period_days))
  if (filters.user) params.set('user', filters.user)
  if (filters.sort_by) params.set('sort_by', filters.sort_by)
  if (filters.sort_order) params.set('sort_order', filters.sort_order)
  if (filters.limit != null) params.set('limit', String(filters.limit))

  return apiRequest<UserActivitySummary>(
    `/api/method/healthcare.api.user_activity_audit.get_user_activity_summary?${params.toString()}`
  )
}
