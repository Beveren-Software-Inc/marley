/** Field groups for Vital Signs detail slide-over */
export const VS_VISIT_FIELDS = [
  { key: 'trans_no', label: 'Trans No' },
  { key: 'patient', label: 'Patient' },
  { key: 'patient_name', label: 'Patient Name' },
  { key: 'inpatient_record', label: 'Inpatient Admission' },
  { key: 'encounter', label: 'Patient Visit' },
  { key: 'appointment', label: 'Appointment' },
] as const

/** TPR + cardiovascular — two per row (BP shown as single combined tile in panel) */
export const VS_CORE_VITAL_FIELDS = [
  { key: 'temperature', label: 'Temperature' },
  { key: 'pulse', label: 'Pulse' },
  { key: 'respiratory_rate', label: 'Respiratory Rate' },
  { key: 'spo2', label: 'SpO₂' },
  { key: 'location_temperature', label: 'Location Temperature' },
] as const

export const VS_CLINICAL_FIELDS = [
  { key: 'tongue', label: 'Tongue' },
  { key: 'abdomen', label: 'Abdomen' },
  { key: 'reflexes', label: 'Reflexes' },
] as const

export const VS_NOTE_FIELDS = [
  { key: 'vital_signs_note', label: 'Vital Signs Notes' },
  { key: 'nutrition_note', label: 'Nutrition Notes' },
  { key: 'remarks', label: 'Remarks' },
] as const
