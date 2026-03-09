import { apiRequest } from './apiClient'

export interface PatientSafetyEvent {
  name: string
  event_datetime: string
  event_type: string
  location?: string
  severity?: string
  patient?: string
  department?: string
  status?: string
}

export interface CreatePatientSafetyEventInput {
  event_datetime?: string
  event_type: string
  location?: string
  severity?: string
  patient?: string
  department?: string
  description: string
  immediate_action?: string
  contributing_factors?: string
  is_anonymous?: 0 | 1 | boolean
}

export async function createPatientSafetyEvent(
  data: CreatePatientSafetyEventInput
): Promise<{ name: string }> {
  const body = {
    doctype: 'Patient Safety Event',
    is_anonymous: data.is_anonymous ? 1 : 0,
    event_datetime: data.event_datetime,
    event_type: data.event_type,
    location: data.location,
    severity: data.severity,
    patient: data.patient,
    department: data.department,
    description: data.description,
    immediate_action: data.immediate_action,
    contributing_factors: data.contributing_factors,
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
      'event_type',
      'location',
      'severity',
      'patient',
      'department',
      'status',
      'is_anonymous',
      'reported_by',
    ])
  )
  params.append('order_by', 'event_datetime desc')

  const res = await fetch(`/api/resource/Patient%20Safety%20Event?${params.toString()}`)
  const data = await res.json()

  if (data?.data && Array.isArray(data.data)) {
    return data.data as PatientSafetyEvent[]
  }

  return []
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


