import type { Prescription } from '../services/prescriptions'

type PrescriptionSigningFields = Pick<
  Prescription,
  'new_system' | 'doctors_signature' | 'status'
>

export function prescriptionNeedsSignature(
  prescription?: PrescriptionSigningFields | null,
): boolean {
  if (!prescription?.new_system) return false
  if (prescription.doctors_signature?.trim()) return false
  if (prescription.status === 'Unsigned') return true
  return !prescription.status
}

export function prescriptionIsSigned(
  prescription?: PrescriptionSigningFields | null,
): boolean {
  if (!prescription?.new_system) return true
  return prescriptionAllowsMedicineGiving(prescription)
}

export function prescriptionAllowsMedicineGiving(
  prescription?: PrescriptionSigningFields | null,
): boolean {
  if (!prescription) return false
  if (!prescription.new_system) return true
  if (prescription.doctors_signature?.trim()) return true
  return ['Signed', 'In Process', 'Completed'].includes(prescription.status || '')
}
