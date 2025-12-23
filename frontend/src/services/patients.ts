import { api } from './apiClient'

export async function fetchPatient(id: string) {
  const { data } = await api.get(`/resource/Patient/${id}`)
  return data.data
}


