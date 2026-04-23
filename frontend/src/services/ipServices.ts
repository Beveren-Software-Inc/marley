import { apiRequest } from './apiClient'

export interface IPServiceRow {
  name: string
  admission_no?: string
  file_number?: string
  patient_full_name?: string
  type?: string
  cost_center?: string
  service_request?: string
  category?: string
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
  service_code: string
  amount: number
  date?: string
  note?: string
}

export interface CreateIPServiceInput {
  admission_no: string
  cost_center: string
  service_request?: string
  type?: string
  category?: string
  services?: IPServiceLineInput[]
}

export async function fetchIPServices(
  limit: number = 50,
  offset: number = 0,
  patient?: string,
  admission_no?: string
): Promise<IPServiceRow[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (patient) params.append('patient', patient)
  if (admission_no) params.append('admission_no', admission_no)

  const data = await apiRequest<IPServiceRow[]>(
    `/api/method/healthcare.api.ip_service.get_ip_services?${params.toString()}`
  )
  return Array.isArray(data) ? data : []
}

export async function createIPService(input: CreateIPServiceInput): Promise<{ name: string }> {
  const body: Record<string, unknown> = {
    admission_no: input.admission_no,
    cost_center: input.cost_center,
  }
  if (input.service_request) body.service_request = input.service_request
  if (input.type) body.type = input.type
  if (input.category) body.category = input.category
  if (input.services && input.services.length) body.services = input.services

  const data = await apiRequest<{ name: string }>(
    `/api/method/healthcare.api.ip_service.create_ip_service`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  )
  const name = data && typeof data === 'object' && 'name' in data ? (data as { name: string }).name : ''
  if (!name) throw new Error('Create IP Service did not return a name')
  return { name }
}




export async function fetchIPServiceTypes(
  search?: string,
  limit: number = 50
): Promise<{ name: string; service_name: string; category?: string; rate?: number }[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  if (search) params.append('search', search)
  
  const data = await apiRequest<any[]>(
    `/api/method/healthcare.api.ip_service_type.get_ip_service_types?${params.toString()}`
  )
  
  return Array.isArray(data) ? data : []
}

export async function fetchIPServiceType(templateName: string): Promise<IPServiceType | null> {
  const data = await apiRequest<IPServiceType>(
    `/api/method/healthcare.api.ip_service_type.get_ip_service_type?template_name=${encodeURIComponent(templateName)}`
  )
  return data || null
}