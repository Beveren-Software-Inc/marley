// // services/diagnosis.ts

// import { apiRequest } from './apiClient'

// export interface DiagnosisData {
//   diagnosis: string
//   details: string
//   posting_date: string
//   diagnoses_time: string
//   practitioner: string
//   practitioner_name?: string
//   diagnoses_flag?: boolean
//   trans_num?: string
// }

// export interface AddDiagnosesResponse {
//   success: boolean
//   message: string
//   admission: string
//   diagnoses_added: number
// }

// export interface DiagnosisRow {
//   name: string
//   diagnosis: string
//   diagnosis_label: string
//   details: string
//   posting_date: string
//   diagnoses_time: string
//   practitioner: string
//   practitioner_name: string
//   diagnoses_flag: boolean
//   trans_num: string
// }

// /**
//  * Add diagnoses to an inpatient admission
//  */
// export async function addInpatientDiagnoses(
//   admission: string,
//   diagnoses: DiagnosisData[]
// ): Promise<AddDiagnosesResponse> {
//   return apiRequest<AddDiagnosesResponse>(
//     '/api/method/healthcare.api.diagnosis.add_inpatient_diagnoses',
//     {
//       method: 'POST',
//       body: JSON.stringify({
//         admission,
//         diagnoses
//       })
//     }
//   )
// }

// /**
//  * Get all diagnoses for an inpatient admission
//  */
// export async function getInpatientDiagnoses(
//   admission: string
// ): Promise<DiagnosisRow[]> {
//   const response = await fetch(
//     `/api/method/healthcare.api.diagnosis.get_inpatient_diagnoses?admission=${encodeURIComponent(admission)}`
//   )
//   const result = await response.json()
  
//   if (result.message && Array.isArray(result.message)) {
//     return result.message as DiagnosisRow[]
//   }
  
//   if (result.exc || !response.ok) {
//     throw new Error(result.exc || result.message || 'Failed to load diagnoses')
//   }
  
//   return []
// }

// /**
//  * Delete a specific diagnosis from an inpatient admission
//  */
// export async function deleteInpatientDiagnosis(
//   admission: string,
//   diagnosisRowName: string
// ): Promise<{ success: boolean; message: string }> {
//   return apiRequest(
//     '/api/method/healthcare.api.diagnosis.delete_inpatient_diagnosis',
//     {
//       method: 'POST',
//       body: JSON.stringify({
//         admission,
//         diagnosis_row_name: diagnosisRowName
//       })
//     }
//   )
// }

// services/diagnosis.ts

import { apiRequest } from './apiClient'

export interface DiagnosisData {
  name?: string  // For existing rows
  diagnosis: string
  diagnosis_label?: string
  diagnosis_group_name?: string
  details: string
  posting_date: string
  diagnoses_time: string
  practitioner: string
  practitioner_name?: string
  diagnoses_flag?: boolean
  trans_num?: string
}

export interface UpdateDiagnosesResponse {
  success: boolean
  message: string
  admission: string
  diagnoses_updated: number
}

export interface AddDiagnosesResponse {
  success: boolean
  message: string
  admission: string
  diagnoses_added: number
}

export interface DiagnosisRow {
  name: string
  diagnosis: string
  diagnosis_label: string
  disease_no?: string
  diagnosis_name?: string
  diagnosis_group_name?: string
  details: string
  posting_date: string
  diagnoses_time: string
  practitioner: string
  practitioner_name: string
  diagnoses_flag: boolean
  trans_num: string
}

/**
 * Update all diagnoses for an inpatient admission (replace entire table)
 */
export async function updateInpatientDiagnoses(
  admission: string,
  diagnoses: DiagnosisData[]
): Promise<UpdateDiagnosesResponse> {
  return apiRequest<UpdateDiagnosesResponse>(
    '/api/method/healthcare.api.diagnosis.update_inpatient_diagnoses',
    {
      method: 'POST',
      body: JSON.stringify({
        admission,
        diagnoses
      })
    }
  )
}

/**
 * Add new diagnoses to an inpatient admission (append only)
 */
export async function addInpatientDiagnoses(
  admission: string,
  diagnoses: DiagnosisData[]
): Promise<AddDiagnosesResponse> {
  return apiRequest<AddDiagnosesResponse>(
    '/api/method/healthcare.api.diagnosis.add_inpatient_diagnoses',
    {
      method: 'POST',
      body: JSON.stringify({
        admission,
        diagnoses
      })
    }
  )
}

/**
 * Get all diagnoses for an inpatient admission
 */
export async function getInpatientDiagnoses(
  admission: string
): Promise<DiagnosisRow[]> {
  const response = await fetch(
    `/api/method/healthcare.api.diagnosis.get_inpatient_diagnoses?admission=${encodeURIComponent(admission)}`
  )
  const result = await response.json()
  
  if (result.message && Array.isArray(result.message)) {
    return result.message as DiagnosisRow[]
  }
  
  if (result.exc || !response.ok) {
    throw new Error(result.exc || result.message || 'Failed to load diagnoses')
  }
  
  return []
}

/**
 * Delete a specific diagnosis from an inpatient admission
 */
export async function deleteInpatientDiagnosis(
  admission: string,
  diagnosisRowName: string
): Promise<{ success: boolean; message: string }> {
  return apiRequest(
    '/api/method/healthcare.api.diagnosis.delete_inpatient_diagnosis',
    {
      method: 'POST',
      body: JSON.stringify({
        admission,
        diagnosis_row_name: diagnosisRowName
      })
    }
  )
}