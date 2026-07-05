import { formatPatientAgeFromDob } from '../../utils/patientAge'

export function PatientDobAgeHint({ dob }: { dob?: string }) {
  const age = formatPatientAgeFromDob(dob)
  if (!age) return null

  return <p className="mt-1 text-xs text-slate-500">Age: {age}</p>
}
