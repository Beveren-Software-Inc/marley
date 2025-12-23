import { apiRequest } from './apiClient'

export async function fetchPatient(id: string) {
  return apiRequest(`/api/resource/Patient/${id}`)
}


