/**
 * Utilities for persisting a discharge form draft to localStorage.
 * Keyed per admission so multiple in-progress discharges can coexist.
 */

import { fetchDischargeDraftForAdmission } from './inpatientRecords'

const key = (admissionName: string) => `discharge_draft_v1_${admissionName}`

export interface DischargeSelectedOptions {
  dischargeReceptionist?: { name: string; label: string } | null
  dischargeDoctor?: { name: string; label: string } | null
  dischargeNurse?: { name: string; label: string } | null
  dischargeTemplate?: { name: string; label: string } | null
  nurseTemplate?: { name: string; label: string } | null
  dischargeReceptionistQuery?: string
  dischargeDoctorQuery?: string
  dischargeNurseQuery?: string
  dischargeTemplateQuery?: string
  nurseTemplateQuery?: string
  /** @deprecated Legacy draft fields — ignored on load */
  dischargedBy?: { name: string; label: string } | null
  finalDischarge?: { name: string; label: string } | null
  receivingDoctor?: { name: string; label: string } | null
  dischargedByQuery?: string
  finalDischargeQuery?: string
  receivingDoctorsQuery?: string
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

/** True if a draft exists on the server and/or in localStorage. */
export async function hasAnyDischargeDraft(admissionName: string): Promise<boolean> {
  try {
    const server = await fetchDischargeDraftForAdmission(admissionName)
    if (server?.name) return true
  } catch {
    /* ignore */
  }
  return hasDischargeDraft(admissionName)
}

export function draftSavedAt(admissionName: string): string | null {
  const draft = loadDischargeDraft(admissionName)
  if (!draft?.savedAt) return null
  try {
    return new Date(draft.savedAt).toLocaleString()
  } catch { return draft.savedAt }
}
