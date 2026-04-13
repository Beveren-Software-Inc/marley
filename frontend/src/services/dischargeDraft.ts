/**
 * Utilities for persisting a discharge form draft to localStorage.
 * Keyed per admission so multiple in-progress discharges can coexist.
 */

const key = (admissionName: string) => `discharge_draft_v1_${admissionName}`

export interface DischargeSelectedOptions {
  dischargedBy?: { name: string; label: string } | null
  finalDischarge?: { name: string; label: string } | null
  receivingDoctor?: { name: string; label: string } | null
  dischargeTemplate?: { name: string; label: string } | null
  nurseTemplate?: { name: string; label: string } | null  // Add this
  dischargedByQuery?: string
  finalDischargeQuery?: string
  receivingDoctorsQuery?: string
  dischargeTemplateQuery?: string
  nurseTemplateQuery?: string  // Add this
}

export interface DischargeDraftData {
  formData: Record<string, string>
  selectedOptions: DischargeSelectedOptions
  checklistItems: unknown[]
  nurseChecklistItems?: unknown[]  // Add this (optional for backward compatibility)
  documents: unknown[]
  relatives: unknown[]
  transferPrescription?: {
    name: string
    patient_visit?: string
  }
  savedAt: string
}

export function saveDischargeDraft(
  admissionName: string,
  data: Omit<DischargeDraftData, 'savedAt'>
): void {
  try {
    const payload: DischargeDraftData = { ...data, savedAt: new Date().toISOString() }
    localStorage.setItem(key(admissionName), JSON.stringify(payload))
  } catch { /* ignore storage errors */ }
}

export function loadDischargeDraft(admissionName: string): DischargeDraftData | null {
  try {
    const raw = localStorage.getItem(key(admissionName))
    return raw ? (JSON.parse(raw) as DischargeDraftData) : null
  } catch { return null }
}

export function clearDischargeDraft(admissionName: string): void {
  try {
    localStorage.removeItem(key(admissionName))
  } catch { /* ignore */ }
}

export function hasDischargeDraft(admissionName: string): boolean {
  try {
    return localStorage.getItem(key(admissionName)) !== null
  } catch { return false }
}

export function draftSavedAt(admissionName: string): string | null {
  const draft = loadDischargeDraft(admissionName)
  if (!draft?.savedAt) return null
  try {
    return new Date(draft.savedAt).toLocaleString()
  } catch { return draft.savedAt }
}
