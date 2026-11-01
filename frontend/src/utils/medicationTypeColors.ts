/**
 * Medication type color coding (matches prescription UI).
 *
 * ``color`` is the type's raw hue — kept for tints, borders and legends. ``textColor`` is
 * the same hue darkened enough to be read as **text** on a white background, because a
 * medication line shows its type as colored text on the type label rather than as a
 * colored row background (the drug name itself always stays in the normal body color).
 */

import type { CSSProperties } from 'react'
import {
  describeInferredPrescriptionType,
  inactivePrescriptionType,
  inferPrescriptionTypeFromOrder,
  isLegacyLineDiscontinued,
  isLegacyPrescriptionLine,
  normalizePrescriptionType,
  type InferredPrescriptionType,
  type LegacyPrescriptionLineSource,
} from './prescriptionType'

export const MEDICATION_TYPES = [
  { key: 'STAT', label: 'STAT', color: '#fe80c0', textColor: '#be185d' },
  { key: 'PRN', label: 'PRN', color: '#fefebf', textColor: '#a16207' },
  { key: 'Regular - Psy (Active)', label: 'Reg Psy Active', color: '#00ff02', textColor: '#15803d' },
  { key: 'Regular - Med (Active)', label: 'Reg Med Active', color: '#4080e1', textColor: '#1d4ed8' },
  { key: 'Regular - Psy (Inactive)', label: 'Reg Psy Inactive', color: '#94a3b8', textColor: '#64748b' },
  { key: 'Regular - Med (Inactive)', label: 'Reg Med Inactive', color: '#94a3b8', textColor: '#64748b' },
  { key: 'Long Acting Medicine', label: 'Long Acting', color: '#0d9488', textColor: '#0f766e' },
  { key: 'Future Plan', label: 'Future Plan', color: '#6366f1', textColor: '#4338ca' },
  // Legacy Oracle prescriptions only: redundancy type 4 is flagged this way.
  { key: 'Contraindicated', label: 'Contraindicated', color: '#ef4444', textColor: '#b91c1c' },
] as const

export const isHexColor = (color: string) => color.startsWith('#')

export function getMedicationTypeColor(medicationType?: string | null): string {
  const normalized = normalizePrescriptionType(medicationType)
  const typeDef = MEDICATION_TYPES.find((t) => t.key === normalized)
  return typeDef?.color ?? '#94a3b8'
}

/**
 * Readable text color for a type, or ``undefined`` when the line has no type at all.
 *
 * The line must stay in the normal body color when its type is unknown/blank — otherwise
 * every untyped row would look the same washed-out grey.
 */
export function getMedicationTypeTextColor(medicationType?: string | null): string | undefined {
  const normalized = normalizePrescriptionType(medicationType)
  if (!normalized) return undefined
  return MEDICATION_TYPES.find((t) => t.key === normalized)?.textColor
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

/**
 * Small type chip: type-colored text inside a hairline outline of the same hue (like the
 * frequency pill, but outline-only) — the chip is the only element on a line that carries
 * color, so the line itself stays neutral.
 */
export function medicationTypeBadgeStyle(medicationType?: string | null): CSSProperties | undefined {
  const color = getMedicationTypeTextColor(medicationType)
  if (!color) return undefined
  return { color, border: `1px solid ${color}4d` }
}

/**
 * Row style for a prescription line. The type no longer tints the row — it is shown by the
 * type chip's text color — so only a pink prescription keeps its light pink highlight
 * (pink is a flag on the line, not a prescription type).
 */
export function medicationRowStyle(isPink?: boolean): CSSProperties {
  return isPink ? { backgroundColor: 'rgba(253, 242, 248, 0.7)' } : {}
}

/** Type shown for one medication line: coded type first, legacy mappings as the fallback. */
export type MedicationOrderTypeDisplay = {
  /** Canonical type key, or display-only ``Regular`` / ``PRN`` / ``STAT`` read from the note. */
  type: string
  /** Chip label (``Reg Psy Active``, ``PRN``, ``Regular`` …). */
  label: string
  /** Set when the type was read from the line's free text instead of the coded field. */
  inferred: InferredPrescriptionType | null
  /** Tooltip explaining where an inferred (or legacy-mapped) type came from. */
  inferredHint?: string
  /** Set when the type came from the legacy Oracle redundancy-type mapping. */
  legacyMapped?: boolean
}

export type MedicationTypeSource = {
  medication_type?: string | null
  /** Server-resolved type for a legacy line (``redundancy_type`` → Prescription Type). */
  resolved_prescription_type?: string | null
  /** Oracle DC note / Discontinued status — a DC'd legacy line is the Inactive type. */
  dc?: string | null
  medication_status?: string | null
  is_prn?: boolean | number | null
  instructions?: string | null
  patient_frequency?: string | null
  written_frequency?: string | null
  frequency?: string | null
} & LegacyPrescriptionLineSource

/** Type decoded from the legacy Oracle redundancy code ('' for new prescriptions). */
export function resolveLegacyPrescriptionType(
  order?: Pick<MedicationTypeSource, 'medication_type' | 'resolved_prescription_type'> | null,
): string {
  if (!order || normalizePrescriptionType(order.medication_type)) return ''
  return normalizePrescriptionType(order.resolved_prescription_type)
}

/**
 * Resolve the prescription type of a medication line for display.
 *
 * New prescriptions store the doctor's Prescription Type in ``medication_type``. Legacy
 * Oracle rows never had one — Oracle only has ``redundancy_type`` — so the API maps that
 * code through the Prescription Type doctype and returns it as
 * ``resolved_prescription_type``; the line is then grouped / coloured by that type.
 *
 * Two legacy-only rules:
 *   • a DC'd line (Oracle's ``dc`` note) shows the **Inactive** twin of its Regular type —
 *     the medicine was stopped, it is not active;
 *   • a legacy line with no mapped type stays blank — its type is never assumed.
 *
 * Lines that are not legacy fall back to a display-only type read from the instruction
 * (and frequency) text. Administration dose notes are never used to decide the type.
 * ``overrideType`` wins (e.g. the computed Future Plan). Nothing is written back.
 */
export function resolveMedicationOrderType(
  order?: MedicationTypeSource | null,
  overrideType?: string | null,
): MedicationOrderTypeDisplay {
  const override = normalizePrescriptionType(overrideType)
  if (override) {
    return { type: override, label: getMedicationTypeLabel(override, order?.is_prn), inferred: null }
  }

  const coded = normalizePrescriptionType(order?.medication_type)
  if (coded) {
    return { type: coded, label: getMedicationTypeLabel(coded, order?.is_prn), inferred: null }
  }

  const legacyType = resolveLegacyPrescriptionType(order)
  if (legacyType) {
    // A DC'd legacy line was stopped, so it shows as the Inactive twin of its type.
    const type = isLegacyLineDiscontinued(order) ? inactivePrescriptionType(legacyType) : legacyType
    return {
      type,
      label: getMedicationTypeLabel(type, order?.is_prn),
      inferred: null,
      legacyMapped: true,
      inferredHint: 'Prescription type mapped from the legacy Oracle redundancy code',
    }
  }

  const prnOnly = resolveMedicationTypeForDisplay(null, order?.is_prn)
  if (prnOnly) {
    return { type: prnOnly, label: getMedicationTypeLabel(prnOnly, order?.is_prn), inferred: null }
  }

  // A legacy Oracle line with no mapped type stays blank: its type is never assumed (a
  // missing redundancy code does not make it a Regular prescription).
  if (isLegacyPrescriptionLine(order)) return { type: '', label: '', inferred: null }

  const inferred = inferPrescriptionTypeFromOrder(order)
  if (!inferred) return { type: '', label: '', inferred: null }
  return {
    type: inferred.type,
    label: inferred.type,
    inferred,
    inferredHint: describeInferredPrescriptionType(inferred),
  }
}
