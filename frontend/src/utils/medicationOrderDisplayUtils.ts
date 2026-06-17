/** Display helpers for Patient Medication Order lines (including legacy Oracle imports). */

export type MedicationOrderLike = {
  drug?: string | null
  drug_name?: string | null
  medication?: string | null
  old_medicine_code?: string | null
  old_medicine_name?: string | null
  medicine_no?: string | null
  trans_num?: string | null
  reference_no?: string | null
  dosage?: string | number | null
  strength?: string | null
  instructions?: string | null
  dose_notes?: string | null
  patient_frequency?: string | null
  written_frequency?: string | null
  date?: string | null
  start_date?: string | null
  end_date?: string | null
  route_of_administration?: string | null
  frequency?: string | null
}

function text(value: unknown): string {
  if (value == null || value === '') return ''
  if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)) {
    return String(value)
  }
  return String(value).trim()
}

export function isLegacyMedicationOrderRow(order: MedicationOrderLike): boolean {
  return (
    !text(order.drug) &&
    Boolean(
      text(order.old_medicine_code) ||
        text(order.old_medicine_name) ||
        text(order.medication) ||
        text(order.medicine_no) ||
        text(order.trans_num) ||
        text(order.reference_no) ||
        text(order.written_frequency)
    )
  )
}

export function displayMedicationDrugName(order: MedicationOrderLike): string {
  return text(order.drug_name) || text(order.medication) || text(order.old_medicine_name) || '-'
}

export function displayMedicationDrugCode(order: MedicationOrderLike): string {
  return text(order.drug) || text(order.old_medicine_code) || text(order.medicine_no) || '-'
}

export function displayMedicationDosage(order: MedicationOrderLike): string {
  const instructions = text(order.instructions) || text(order.dose_notes)
  if (isLegacyMedicationOrderRow(order)) {
    return instructions || text(order.dosage) || text(order.strength) || '-'
  }
  return text(order.dosage) || instructions || text(order.strength) || '-'
}

export function displayMedicationFrequency(order: MedicationOrderLike): string {
  return (
    text(order.patient_frequency) ||
    text(order.written_frequency) ||
    text(order.frequency) ||
    '-'
  )
}

export function displayMedicationStartDate(
  order: MedicationOrderLike,
  parentStartDate?: string | null
): string {
  return text(order.date) || text(order.start_date) || text(parentStartDate) || '-'
}

export function displayMedicationEndDate(
  order: MedicationOrderLike,
  parentEndDate?: string | null
): string {
  return text(order.end_date) || text(parentEndDate) || '-'
}

export function displayMedicationRoute(order: MedicationOrderLike): string {
  return text(order.route_of_administration) || '-'
}

export function displayMedicationInstructions(order: MedicationOrderLike): string {
  return text(order.instructions) || text(order.dose_notes) || ''
}
