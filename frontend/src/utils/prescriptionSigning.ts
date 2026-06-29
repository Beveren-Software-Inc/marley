import type { Prescription } from '../services/prescriptions'

export function prescriptionNeedsSignature(prescription?: Pick<Prescription, 'new_system' | 'doctors_signature' | 'status'> | null): boolean {
  if (!prescription?.new_system) return false
  if (prescription.status === 'Unsigned') return true
  if (prescription.doctors_signature?.trim()) return false
  return !prescription.status
}

export function prescriptionIsSigned(
  prescription?: Pick<Prescription, 'new_system' | 'doctors_signature' | 'status'> | null,
): boolean {
  if (!prescription?.new_system) return true
  return prescriptionAllowsMedicineGiving(prescription)
}

export function prescriptionAllowsMedicineGiving(
  prescription?: Pick<Prescription, 'new_system' | 'doctors_signature' | 'status'> | null,
): boolean {
  if (!prescription) return false
  if (!prescription.new_system) return true
  if (prescription.doctors_signature?.trim()) return true
  return ['Signed', 'In Process', 'Completed'].includes(prescription.status || '')
}
