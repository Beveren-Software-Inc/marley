import { apiRequest } from './apiClient'
import { type LinkFieldOption } from './common'

export interface PatientSafetyEvent {
  name: string
  event_datetime?: string
  event_discovery_date?: string
  event_discovery_time?: string
  report_type?: string
  event_category?: string
  event_type?: string
  location?: string
  severity?: string
  patient?: string
  patient_name?: string
  department?: string
  status?: string
  risk_score?: number
  risk_rate?: string
  affected_person?: string
}

export async function fetchPatientSafetyEventTypes(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)

  const res = await fetch(
    `/api/method/healthcare.api.common.get_patient_safety_event_types${
      params.toString() ? `?${params.toString()}` : ''
    }`
  )
  const data = await res.json()

  if (data?.message && Array.isArray(data.message)) {
    return data.message as LinkFieldOption[]
  }
  return []
}

export async function createPatientSafetyEventType(eventType: string): Promise<{ name: string; event_type: string }> {
  return apiRequest<{ name: string; event_type: string }>(
    '/api/resource/Patient%20Safety%20Event%20Type',
    {
      method: 'POST',
      body: JSON.stringify({ event_type: eventType.trim() }),
    }
  )
}

export interface CreatePatientSafetyEventInput {
  report_type: string
  harm_evidence?: string
  event_category: string
  clinical_event_type?: string
  non_clinical_event_type?: string
  sentinel_event_type?: string
  other_event_specify?: string
  event_discovery_date: string
  event_discovery_time?: string
  report_date?: string
  location?: string
  department?: string
  description: string
  immediate_action?: string
  affected_person?: string
  is_anonymous?: 0 | 1 | boolean
  reporter_first_name?: string
  reporter_middle_name?: string
  reporter_last_name?: string
  reporter_mobile?: string
  reporter_email?: string
  reporter_position?: string
  patients_reached?: number
  patient?: string
  risk_probability?: string
  risk_impact?: string
  contributing_factors?: string
  analysis_possible_causes?: string
  corrective_action?: string
}

export async function createPatientSafetyEvent(
  data: CreatePatientSafetyEventInput
): Promise<{ name: string }> {
  const body = {
    doctype: 'Patient Safety Event',
    ...data,
    is_anonymous: data.is_anonymous ? 1 : 0,
  }

  return apiRequest<{ name: string }>('/api/resource/Patient%20Safety%20Event', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function fetchPatientSafetyEvents(
  limit = 50,
  offset = 0
): Promise<PatientSafetyEvent[]> {
  const params = new URLSearchParams()
  params.append('limit_page_length', String(limit))
  params.append('limit_start', String(offset))
  params.append(
    'fields',
    JSON.stringify([
      'name',
      'event_datetime',
      'event_discovery_date',
      'event_discovery_time',
      'report_type',
      'event_category',
      'event_type',
      'location',
      'severity',
      'patient',
      'patient_name',
      'department',
      'status',
      'risk_score',
      'risk_rate',
      'affected_person',
      'is_anonymous',
      'reported_by',
    ])
  )
  params.append('order_by', 'event_discovery_date desc, modified desc')

  const res = await fetch(`/api/resource/Patient%20Safety%20Event?${params.toString()}`)
  const data = await res.json()

  if (data?.data && Array.isArray(data.data)) {
    return data.data as PatientSafetyEvent[]
  }

  return []
}

export interface PatientSafetyEventDetail extends PatientSafetyEvent {
  description?: string
  immediate_action?: string
  contributing_factors?: string
  is_anonymous?: number
  reported_by?: string
  harm_evidence?: string
  clinical_event_type?: string
  non_clinical_event_type?: string
  sentinel_event_type?: string
  other_event_specify?: string
  report_date?: string
  reporter_first_name?: string
  reporter_middle_name?: string
  reporter_last_name?: string
  reporter_mobile?: string
  reporter_email?: string
  reporter_position?: string
  patients_reached?: number
  patient_cpr?: string
  patient_file_no?: string
  patient_gender?: string
  risk_probability?: string
  risk_impact?: string
  analysis_possible_causes?: string
  corrective_action?: string
  creation?: string
  modified?: string
  owner?: string
}

export async function fetchPatientSafetyEventDetail(name: string): Promise<PatientSafetyEventDetail> {
  const res = await fetch(`/api/resource/Patient%20Safety%20Event/${encodeURIComponent(name)}`)
  const data = await res.json()

  if (data?.data) {
    return data.data as PatientSafetyEventDetail
  }
  if (data?.exception) {
    throw new Error(data.message || 'Failed to fetch event details')
  }
  throw new Error('Invalid response format')
}

// ── OVR & CAPA (Phase 2) ─────────────────────────────────────────────────────

export interface OccurrenceVarianceReport {
  name: string
  ovr_date: string
  event?: string
  variance_type: string
  impact?: string
  status?: string
  owner_department?: string
  owner_user?: string
}

export interface CreateOVRInput {
  ovr_date?: string
  event?: string
  variance_type: string
  impact?: string
  owner_department?: string
  owner_user?: string
  description?: string
}

export async function createOVR(data: CreateOVRInput): Promise<{ name: string }> {
  const body = {
    doctype: 'Occurrence Variance Report',
    ovr_date: data.ovr_date,
    event: data.event,
    variance_type: data.variance_type,
    impact: data.impact,
    owner_department: data.owner_department,
    owner_user: data.owner_user,
    description: data.description,
  }

  return apiRequest<{ name: string }>('/api/resource/Occurrence%20Variance%20Report', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function fetchOVRs(limit = 50, offset = 0): Promise<OccurrenceVarianceReport[]> {
  const params = new URLSearchParams()
  params.append('limit_page_length', String(limit))
  params.append('limit_start', String(offset))
  params.append(
    'fields',
    JSON.stringify([
      'name',
      'ovr_date',
      'event',
      'variance_type',
      'impact',
      'status',
      'owner_department',
      'owner_user',
    ])
  )
  params.append('order_by', 'ovr_date desc, modified desc')

  const res = await fetch(`/api/resource/Occurrence%20Variance%20Report?${params.toString()}`)
  const data = await res.json()

  if (data?.data && Array.isArray(data.data)) {
    return data.data as OccurrenceVarianceReport[]
  }

  return []
}

export interface CAPA {
  name: string
  source_doctype?: string
  source_name?: string
  title: string
  status?: string
  owner_user?: string
  due_date?: string
}

export interface CreateCAPAInput {
  source_doctype?: string
  source_name?: string
  title: string
  status?: string
  owner_user?: string
  due_date?: string
  corrective_action?: string
  preventive_action?: string
  effectiveness_review?: string
}

export async function createCAPA(data: CreateCAPAInput): Promise<{ name: string }> {
  const body = {
    doctype: 'Corrective Preventive Action',
    source_doctype: data.source_doctype,
    source_name: data.source_name,
    title: data.title,
    status: data.status,
    owner_user: data.owner_user,
    due_date: data.due_date,
    corrective_action: data.corrective_action,
    preventive_action: data.preventive_action,
    effectiveness_review: data.effectiveness_review,
  }

  return apiRequest<{ name: string }>('/api/resource/Corrective%20Preventive%20Action', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function fetchCAPAs(limit = 50, offset = 0): Promise<CAPA[]> {
  const params = new URLSearchParams()
  params.append('limit_page_length', String(limit))
  params.append('limit_start', String(offset))
  params.append(
    'fields',
    JSON.stringify([
      'name',
      'source_doctype',
      'source_name',
      'title',
      'status',
      'owner_user',
      'due_date',
    ])
  )
  params.append('order_by', 'due_date asc, modified desc')

  const res = await fetch(`/api/resource/Corrective%20Preventive%20Action?${params.toString()}`)
  const data = await res.json()

  if (data?.data && Array.isArray(data.data)) {
    return data.data as CAPA[]
  }

  return []
}


