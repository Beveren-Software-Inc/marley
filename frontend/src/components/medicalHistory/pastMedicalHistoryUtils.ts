import type { PatientMedicalHistory } from '../../services/patients'

export const ILLNESS_FIELDS = [
  { key: 'heart_disease' as const, label: 'Heart Disease' },
  { key: 'diabetes' as const, label: 'Diabetes' },
  { key: 'asthma' as const, label: 'Asthma' },
  { key: 'strokes' as const, label: 'Strokes' },
]

export type IllnessFieldKey = (typeof ILLNESS_FIELDS)[number]['key']

export type PastMedicalHistoryFormFields = Pick<
  PatientMedicalHistory,
  | 'heart_disease'
  | 'diabetes'
  | 'asthma'
  | 'strokes'
  | 'other_ongoing_illness'
  | 'previous_surgical_history'
  | 'current_and_past_medications'
  | 'allergies'
  | 'social_history'
  | 'addiction'
  | 'smoking'
>

export const emptyPastMedicalHistoryFields = (): PastMedicalHistoryFormFields => ({
  heart_disease: '',
  diabetes: '',
  asthma: '',
  strokes: '',
  other_ongoing_illness: '',
  previous_surgical_history: '',
  current_and_past_medications: '',
  allergies: '',
  social_history: '',
  addiction: 0,
  smoking: 0,
})

export function hasPastMedicalHistoryContent(h: Partial<PastMedicalHistoryFormFields>): boolean {
  if (ILLNESS_FIELDS.some(({ key }) => h[key] === 'Yes' || h[key] === 'No')) return true
  if (h.other_ongoing_illness?.trim()) return true
  if (h.previous_surgical_history?.trim()) return true
  if (h.current_and_past_medications?.trim()) return true
  if (h.allergies?.trim()) return true
  if (h.social_history?.trim()) return true
  if (h.addiction) return true
  if (h.smoking) return true
  return false
}

export function yesNoBadgeClass(value?: string): string {
  if (value === 'Yes') return 'bg-green-100 text-green-800 font-semibold'
  if (value === 'No') return 'bg-slate-100 text-slate-600'
  return 'bg-slate-50 text-slate-400'
}

/** One-line clinical blurb for dashboard card rows (allergies and key flags first). */
export function pmhClinicalBlurb(h: Partial<PatientMedicalHistory>): string {
  const parts: string[] = []
  if (h.allergies?.trim()) parts.push(`Allergies: ${h.allergies.trim()}`)
  for (const { key, label } of ILLNESS_FIELDS) {
    if (h[key] === 'Yes') parts.push(label)
  }
  if (h.other_ongoing_illness?.trim()) {
    const t = h.other_ongoing_illness.trim()
    parts.push(t.length > 60 ? `${t.slice(0, 60)}…` : t)
  }
  if (h.current_and_past_medications?.trim()) {
    const t = h.current_and_past_medications.trim()
    parts.push(`Meds: ${t.length > 50 ? `${t.slice(0, 50)}…` : t}`)
  }
  if (parts.length) return parts.join(' · ')
  return h.summary?.trim() || 'Past medical history'
}
