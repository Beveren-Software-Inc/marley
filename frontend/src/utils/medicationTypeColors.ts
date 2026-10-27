/** Medication type color coding (matches prescription UI). */

import type { CSSProperties } from 'react'
import {
  describeInferredPrescriptionType,
  inferPrescriptionTypeFromOrder,
  normalizePrescriptionType,
  type InferredPrescriptionType,
} from './prescriptionType'

export const MEDICATION_TYPES = [
  { key: 'STAT', label: 'STAT', color: '#fe80c0' },
  { key: 'PRN', label: 'PRN', color: '#fefebf' },
  { key: 'Regular - Psy (Active)', label: 'Reg Psy Active', color: '#00ff02' },
  { key: 'Regular - Med (Active)', label: 'Reg Med Active', color: '#4080e1' },
  { key: 'Regular - Psy (Inactive)', label: 'Reg Psy Inactive', color: '#94a3b8' },
  { key: 'Regular - Med (Inactive)', label: 'Reg Med Inactive', color: '#94a3b8' },
  { key: 'Long Acting Medicine', label: 'Long Acting', color: '#0d9488' },
  { key: 'Future Plan', label: 'Future Plan', color: '#6366f1' },
] as const

export const isHexColor = (color: string) => color.startsWith('#')

export function getMedicationTypeColor(medicationType?: string | null): string {
  const normalized = normalizePrescriptionType(medicationType)
  const typeDef = MEDICATION_TYPES.find((t) => t.key === normalized)
  return typeDef?.color ?? '#94a3b8'
}

/** Short label for inline type chips (e.g. Reg Psy Active). */
export function getMedicationTypeLabel(
  medicationType?: string | null,
  fallbackPrn?: boolean | number | null,
): string {
  const normalized = normalizePrescriptionType(medicationType)
  if (normalized) {
    return MEDICATION_TYPES.find((t) => t.key === normalized)?.label || normalized
  }
  if (fallbackPrn === true || fallbackPrn === 1) return 'PRN'
  return ''
}

/** Resolve type used for color/label when medication_type may be empty but is_prn is set. */
export function resolveMedicationTypeForDisplay(
  medicationType?: string | null,
  isPrn?: boolean | number | null,
): string {
  const normalized = normalizePrescriptionType(medicationType)
  if (normalized) return normalized
  if (isPrn === true || isPrn === 1) return 'PRN'
  return ''
}

export function medicationTypeBadgeStyle(medicationType?: string | null): CSSProperties | undefined {
  const color = getMedicationTypeColor(medicationType)
  if (!isHexColor(color)) return undefined
  return {
    backgroundColor: color,
    color: '#1e293b',
  }
}

export function medicationRowStyle(medicationType?: string | null, isPink?: boolean): CSSProperties {
  if (isPink) {
    return { backgroundColor: 'rgba(253, 242, 248, 0.85)' }
  }
  const color = getMedicationTypeColor(medicationType)
  if (isHexColor(color)) {
    return { backgroundColor: `${color}22`, borderColor: `${color}55` }
  }
  return {}
}

/** Type shown for one medication line: coded type first, legacy free text as the fallback. */
export type MedicationOrderTypeDisplay = {
  /** Canonical type key, or display-only ``Regular`` / ``PRN`` / ``STAT`` read from the note. */
  type: string
  /** Chip label (``Reg Psy Active``, ``PRN``, ``Regular`` …). */
  label: string
  /** Set when the type was read from the line's free text instead of the coded field. */
  inferred: InferredPrescriptionType | null
  /** Tooltip explaining where an inferred type came from. */
  inferredHint?: string
}

export type MedicationTypeSource = {
  medication_type?: string | null
  is_prn?: boolean | number | null
  instructions?: string | null
  patient_frequency?: string | null
  written_frequency?: string | null
  frequency?: string | null
}

/**
 * Resolve the prescription type of a medication line for display.
 *
 * Legacy Oracle rows have no coded Prescription Type — the type was typed into
 * DOSE_NOTES, imported here into ``instructions`` (and sometimes into the frequency
 * column). Those lines fall back to a display-only type read from the instruction
 * (and frequency) text so they no longer appear typeless. Administration dose notes
 * are never used to decide the type. ``overrideType`` wins (e.g. the computed Future Plan).
 */
export function resolveMedicationOrderType(
  order?: MedicationTypeSource | null,
  overrideType?: string | null,
): MedicationOrderTypeDisplay {
  const explicit =
    normalizePrescriptionType(overrideType) ||
    resolveMedicationTypeForDisplay(order?.medication_type, order?.is_prn)
  if (explicit) {
    return { type: explicit, label: getMedicationTypeLabel(explicit, order?.is_prn), inferred: null }
  }
  const inferred = inferPrescriptionTypeFromOrder(order)
  if (!inferred) return { type: '', label: '', inferred: null }
  return {
    type: inferred.type,
    label: inferred.type,
    inferred,
    inferredHint: describeInferredPrescriptionType(inferred),
  }
}
