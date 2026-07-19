export type AdmissionClinicalOption = {
  name: string
  status?: string
  admitted_datetime?: string | null
  discharge_datetime?: string | null
  label: string
}

export type AdmissionClinicalAdmission = {
  name: string
  patient?: string
  patient_name?: string
  status?: string
  admitted_datetime?: string | null
  discharge_datetime?: string | null
  discharge_ordered_date?: string | null
  primary_practitioner_name?: string
  medical_department?: string
  cost_center?: string
  bed_no?: string
  allergies?: string
  medication_history?: string
  medical_history?: string
  surgical_history?: string
  discharge_instructions?: string
  discharge_note?: string
  followup_date?: string | null
}

export type AdmissionClinicalDischarge = {
  name: string
  docstatus?: number
  discharge_type?: string
  discharge_date?: string
  discharge_time?: string
  final_discharge_date?: string
  final_discharge_time?: string
  display_discharge_date?: string
  discharge_diagnosis?: string
  discharge_treatment_plan?: string
  discharge_reason?: string
  discharge_conditions?: string
  discharge_instructions?: string
  discharge_medic_stopped_why?: string
  duration?: string
  next_appointment_date?: string
  stopped_medications?: Array<Record<string, unknown>>
}

export type AdmissionClinicalNote = {
  name: string
  posting_date?: string
  practitioner_name?: string
  clinical_note_type?: string
  note?: string
}

export type AdmissionClinicalHistoryRow = {
  attribute: string
  description?: string
  field_1?: string
  attrib_note_2?: string
  order_no?: number
}

export type AdmissionClinicalDiagnosis = {
  name: string
  diagnosis?: string
  diagnosis_name?: string
  details?: string
  posting_date?: string
  practitioner_name?: string
}

export type AdmissionClinicalPrescriptionMed = {
  drug_name?: string
  display_drug_name?: string
  dosage?: string
  display_dosage?: string
  frequency?: string
  instructions?: string
  status?: string
}

export type AdmissionClinicalPrescription = {
  name: string
  status?: string
  practitioner?: string
  healthcare_practitioner_name?: string
  medications?: AdmissionClinicalPrescriptionMed[]
}

export type AdmissionClinicalWarning = {
  name: string
  warning?: string
  posting_date?: string
  practitioner_name?: string
}

export type AdmissionClinicalMedicalHistory = {
  name: string
  no_known_allergies?: number
  allergies?: string
  current_and_past_medications?: string
  other_ongoing_illness?: string
  previous_surgical_history?: string
}

export type AdmissionClinicalSignature = {
  file_name?: string
  document_type?: string
  transaction_no?: string
  upload_remarks?: string
  document?: string
}

export type AdmissionClinicalBundle = {
  patient: string
  admission: string | null
  admission_options: AdmissionClinicalOption[]
  admission_doc: AdmissionClinicalAdmission | null
  discharge: AdmissionClinicalDischarge | null
  diagnoses: AdmissionClinicalDiagnosis[]
  prescriptions: AdmissionClinicalPrescription[]
  clinical_notes: AdmissionClinicalNote[]
  history_form: {
    name: string
    template?: string
    date?: string
    history_detail: AdmissionClinicalHistoryRow[]
  } | null
  medical_history: AdmissionClinicalMedicalHistory | null
  warnings: AdmissionClinicalWarning[]
  /** Parent Inpatient Admission.signature image URL */
  signature?: string | null
  /** Inpatient Admission.e_signatures child rows */
  e_signatures?: AdmissionClinicalSignature[]
  has_data: boolean
}

export async function fetchAdmissionClinicalBundle(
  patient: string,
  admission?: string,
): Promise<AdmissionClinicalBundle> {
  const params = new URLSearchParams({ patient })
  if (admission) params.set('admission', admission)
  const response = await fetch(
    `/api/method/healthcare.api.patient_admission_clinical_bundle.get_admission_clinical_bundle?${params.toString()}`,
    { credentials: 'include', headers: { Accept: 'application/json' } },
  )
  const resData = await response.json()
  if (resData?.message) {
    return resData.message as AdmissionClinicalBundle
  }
  throw new Error(
    typeof resData?.message === 'string' ? resData.message : 'Failed to load admission clinical summary',
  )
}
