import { apiRequest } from './apiClient'

export interface IPServiceRow {
  name: string
  admission_no?: string
  file_number?: string
  patient_full_name?: string
  category?: string
  cost_center?: string
  first_service?: string
  /** Date of the first service line — the ECT session / encounter date. */
  service_date?: string | null
  total_amount?: number
  creation?: string
}

export interface IPServiceType {
  name: string
  service_name: string
  description?: string
  category?: 'Medical Service' | 'Other Service'
  item_code?: string
  rate?: number
  disabled?: boolean
  pricing?: Array<{
    item: string
    rate: number
    note?: string
  }>
}

export interface IPServiceLineInput {
  service_type: string
  service_code?: string
  amount: number
  date?: string
  note?: string
}

export interface CreateIPServiceInput {
  admission_no?: string
  patient_visit?: string
  cost_center?: string
  type?: string
  category?: string
  services: IPServiceLineInput[]
}

/** Care-type filter for the ECT Service list. 'All' ignores the navbar OP/IP context. */
export type IPServiceCareType = 'All' | 'OP' | 'IP'

/**
 * Which date the From/To range is matched against: 'service' = the service line
 * date (ECT session / Patient Visit encounter date, the date shown on the ECT
 * Service), 'creation' = the day the record was raised (default).
 */
export type IPServiceDateField = 'creation' | 'service'

export async function fetchIPServices(
  limit: number = 50,
  offset: number = 0,
  patient?: string,
  admission_no?: string,
  patient_visit?: string,
  patient_care_type?: 'OP' | 'IP',
  date_from?: string,
  date_to?: string,
  date_field?: IPServiceDateField,
): Promise<IPServiceRow[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (patient) params.append('patient', patient)
  if (admission_no) params.append('admission_no', admission_no)
  if (patient_visit) params.append('patient_visit', patient_visit)
  if (patient_care_type) params.append('patient_care_type', patient_care_type)
  if (date_from) params.append('date_from', date_from)
  if (date_to) params.append('date_to', date_to)
  if (date_field) params.append('date_field', date_field)

  const data = await apiRequest<IPServiceRow[]>(
    `/api/method/healthcare.api.ip_service.get_ip_services?${params.toString()}`
  )
  return Array.isArray(data) ? data : []
}

export async function createIPService(input: CreateIPServiceInput): Promise<{ name: string; sales_order?: string }> {
  const body: Record<string, unknown> = {
    category: input.category || 'Medical Service',
    services: input.services,
  }
  if (input.admission_no) body.admission_no = input.admission_no
  if (input.patient_visit) body.patient_visit = input.patient_visit
  if (input.cost_center) body.cost_center = input.cost_center
  if (input.type) body.type = input.type

  const data = await apiRequest<{ name: string; sales_order?: string }>(
    `/api/method/healthcare.api.ip_service.create_ip_service`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  )
  const name = data && typeof data === 'object' && 'name' in data ? (data as { name: string }).name : ''
  if (!name) throw new Error('Create IP Service did not return a name')
  return {
    name,
    sales_order: data && typeof data === 'object' && 'sales_order' in data ? data.sales_order : undefined,
  }
}

export async function deleteIPService(name: string): Promise<{ deleted: string; sales_orders?: string[] }> {
  const data = await apiRequest<{ deleted: string; sales_orders?: string[] }>(
    `/api/method/healthcare.api.ip_service.delete_ip_service`,
    {
      method: 'POST',
      body: JSON.stringify({ name }),
    }
  )
  if (!data?.deleted) throw new Error('Delete ECT Service did not return confirmation')
  return data
}




export async function fetchIPServiceTypes(
  search?: string,
  limit: number = 50,
  isEct?: boolean,
  patientCareType?: 'OP' | 'IP',
): Promise<{ name: string; service_name: string; category?: string; rate?: number }[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  if (search) params.append('search', search)
  if (isEct) params.append('is_ect', '1')
  if (patientCareType) params.append('patient_care_type', patientCareType)
  
  const data = await apiRequest<any[]>(
    `/api/method/healthcare.api.ip_service.get_ip_service_types?${params.toString()}`
  )
  
  return Array.isArray(data) ? data : []
}

export interface ECTDefaultService {
  name: string
  service_name: string
}

export interface ECTDefaultServices {
  op: ECTDefaultService | null
  ip: ECTDefaultService | null
}

/** Default ECT services from Healthcare Settings (used to pre-select OP / IP service). */
export async function fetchECTDefaultServices(): Promise<ECTDefaultServices> {
  const data = await apiRequest<ECTDefaultServices>(
    '/api/method/healthcare.api.ip_service.get_ect_default_services'
  )
  return {
    op: data?.op ?? null,
    ip: data?.ip ?? null,
  }
}

export async function fetchIPServiceType(
  templateName: string,
  patientCareType?: 'OP' | 'IP',
): Promise<IPServiceType | null> {
  const params = new URLSearchParams()
  params.append('template_name', templateName)
  if (patientCareType) params.append('patient_care_type', patientCareType)

  const data = await apiRequest<IPServiceType>(
    `/api/method/healthcare.api.ip_service.get_ip_service_type?${params.toString()}`
  )
  return data || null
}