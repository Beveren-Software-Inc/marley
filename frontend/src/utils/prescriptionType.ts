/** Sync checkbox flags from Prescription Type (medication_type) — single source of truth in UI. */

/** Canonical Select options on Inpatient Medication Order Entry / Medicine Given. */
const VALID_PRESCRIPTION_TYPES = new Set([
  'STAT',
  'PRN',
  'Regular - Psy (Active)',
  'Regular - Med (Active)',
  'Regular - Psy (Inactive)',
  'Regular - Med (Inactive)',
  'Long Acting Medicine',
  'Future Plan',
])

/** Map common typos / spacing variants to the doctype Select values. */
const PRESCRIPTION_TYPE_ALIASES: Record<string, string> = {
  'Regular -Med (Active)': 'Regular - Med (Active)',
  'Regular -Med(Active)': 'Regular - Med (Active)',
  'Regular - Med(Active)': 'Regular - Med (Active)',
  'Regular -Psy (Active)': 'Regular - Psy (Active)',
  'Regular -Psy(Active)': 'Regular - Psy (Active)',
  'Regular - Psy(Active)': 'Regular - Psy (Active)',
  'Regular -Med (Inactive)': 'Regular - Med (Inactive)',
  'Regular -Med(Inactive)': 'Regular - Med (Inactive)',
  'Regular - Med(Inactive)': 'Regular - Med (Inactive)',
  'Regular -Psy (Inactive)': 'Regular - Psy (Inactive)',
  'Regular -Psy(Inactive)': 'Regular - Psy (Inactive)',
  'Regular - Psy(Inactive)': 'Regular - Psy (Inactive)',
}

export function normalizePrescriptionType(medicationType?: string | null): string {
  const type = (medicationType || '').trim()
  if (!type) return ''
  if (VALID_PRESCRIPTION_TYPES.has(type)) return type
  return PRESCRIPTION_TYPE_ALIASES[type] || type
}

export function flagsFromPrescriptionType(medicationType?: string | null): {
  is_prn: boolean
  is_long_acting: boolean
} {
  const type = normalizePrescriptionType(medicationType)
  return {
    is_prn: type === 'PRN',
    is_long_acting: type === 'Long Acting Medicine',
  }
}

export function isLongActingPrescriptionType(medicationType?: string | null): boolean {
  return normalizePrescriptionType(medicationType) === 'Long Acting Medicine'
}

/** True when a prescription line is long-acting (not given via Record Given Medicine). */
export function isLongActingMedicationOrder(
  order:
    | {
        is_long_acting_medicine?: boolean | 0 | 1 | null
        is_long_acting?: boolean | null
        medication_type?: string | null
      }
    | null
    | undefined,
): boolean {
  if (!order) return false
  if (order.is_long_acting_medicine === 1 || order.is_long_acting_medicine === true || order.is_long_acting) {
    return true
  }
  return isLongActingPrescriptionType(order.medication_type)
}

export function isPrnPrescriptionType(medicationType?: string | null): boolean {
  return normalizePrescriptionType(medicationType) === 'PRN'
}

// ─── Legacy free-text prescription type (display-only fallback) ───────────────
/**
 * The type a legacy line actually is, read from its free text when the coded
 * Prescription Type is blank.
 *
 * Serene's Oracle data has no prescription-type column: the type was typed into
 * DOSE_NOTES, imported here into the line's `instructions` (and often reused for the
 * frequency columns as well), e.g. ``3BDPRN`` or ``AS PRN``. Per the prescription
 * types/frequency/route reference the three types are:
 *   • STAT    — given straight away, once only
 *   • PRN     — given only when the patient needs it
 *   • Regular — given on a schedule (the only type that carries a frequency)
 *
 * This only ever feeds the display: nothing is written back to the record.
 */
export type InferredPrescriptionType = {
  type: 'STAT' | 'PRN' | 'Regular'
  /** Field group the type was read from. */
  source: 'instructions' | 'frequency'
  /** Text that produced the match, e.g. ``PRN`` in ``3BDPRN``. */
  evidence: string
}

type PrescriptionTypeTextSource = {
  /** Free-text instruction — legacy Oracle DOSE_NOTES was imported here. */
  instructions?: string | null
  /** Dose notes on administration rows. */
  dose_notes?: string | null
  patient_frequency?: string | null
  written_frequency?: string | null
  frequency?: string | null
}

/** "STAT", "S.T.A.T.", "stat dose" — but not "state" / "status". */
const STAT_TYPE_PATTERN = /(?:^|[^a-z])s\.?\s?t\.?\s?a\.?\s?t\.?(?![a-z])/i
/** "PRN", "P.R.N.", "3BDPRN", "1/2prn", "as needed", "as required", "SOS". */
const PRN_TYPE_PATTERN =
  /prn|p\.\s?r\.\s?n|as\s+needed|as\s+required|(?:^|[^a-z])s\.?\s?o\.?\s?s\.?(?![a-z])/i
/**
 * Explicit "regular" / "routine", or a frequency code. Frequency only applies to
 * regular prescriptions (PRN/STAT carry none), so a frequency means Regular.
 */
const REGULAR_TYPE_PATTERN =
  /regular|routine|(?:^|[^a-z])(?:bd|b\.d|tds|t\.d\.s|tid|t\.i\.d|qid|q\.i\.d|qds|hs|h\.s|nocte|qam|qpm|mane|od|o\.d)(?![a-z])|(?:^|[^a-z])\d\s?-\s?\d\s?-\s?\d(?![a-z])/i

const PRESCRIPTION_TYPE_PRIORITY: Record<InferredPrescriptionType['type'], number> = {
  Regular: 1,
  PRN: 2,
  STAT: 3,
}

function textOf(...values: Array<string | null | undefined>): string {
  return values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' | ')
}

function detectPrescriptionTypeInText(
  text: string,
): { type: InferredPrescriptionType['type']; evidence: string } | null {
  const value = (text || '').trim()
  if (!value) return null
  const checks: Array<{ type: InferredPrescriptionType['type']; pattern: RegExp }> = [
    { type: 'STAT', pattern: STAT_TYPE_PATTERN },
    { type: 'PRN', pattern: PRN_TYPE_PATTERN },
    { type: 'Regular', pattern: REGULAR_TYPE_PATTERN },
  ]
  for (const { type, pattern } of checks) {
    const match = value.match(pattern)
    if (match) return { type, evidence: match[0].trim() }
  }
  return null
}

/**
 * Read the prescription type from a legacy line's free text.
 * Returns null when nothing recognisable is written (the line simply has no type).
 */
export function inferPrescriptionTypeFromOrder(
  order?: PrescriptionTypeTextSource | null,
): InferredPrescriptionType | null {
  if (!order) return null
  const fromInstructions = detectPrescriptionTypeInText(
    textOf(order.instructions, order.dose_notes),
  )
  const fromFrequency = detectPrescriptionTypeInText(
    textOf(order.patient_frequency, order.written_frequency, order.frequency),
  )
  if (!fromInstructions) {
    return fromFrequency ? { ...fromFrequency, source: 'frequency' } : null
  }
  if (!fromFrequency) {
    return { ...fromInstructions, source: 'instructions' }
  }
  // STAT outranks PRN outranks Regular; instructions win on an equal match.
  return PRESCRIPTION_TYPE_PRIORITY[fromFrequency.type] >
    PRESCRIPTION_TYPE_PRIORITY[fromInstructions.type]
    ? { ...fromFrequency, source: 'frequency' }
    : { ...fromInstructions, source: 'instructions' }
}

/** Tooltip for a type chip that was read from free text rather than the coded field. */
export function describeInferredPrescriptionType(inferred: InferredPrescriptionType): string {
  const source =
    inferred.source === 'instructions' ? 'the instructions / dose notes' : 'the frequency'
  return `Prescription type read from ${source}: "${inferred.evidence}". No coded type on this line.`
}

function isDaysValueCleared(value: unknown): boolean {
  if (value === '' || value === null || value === undefined) return true
  const n = Number(value)
  return !Number.isFinite(n) || n <= 0
}

/**
 * Keep End Date and Days in lockstep on create/edit.
 * Filling one derives the other from Start Date; clearing either clears the other.
 */
export function syncPrescriptionEndDateAndDays<
  T extends { date?: unknown; end_date?: unknown; no_of_days?: unknown },
>(
  row: T,
  field: string,
  addDays: (start: string, days: number) => string,
  daysBetween: (start: string, end: string) => number,
): T {
  if (field !== 'date' && field !== 'end_date' && field !== 'no_of_days') return row

  const start = String(row.date || '').trim()
  const end = String(row.end_date || '').trim()
  const daysRaw = row.no_of_days

  if (field === 'end_date' && !end) {
    return { ...row, end_date: '', no_of_days: '' }
  }
  if (field === 'no_of_days' && isDaysValueCleared(daysRaw)) {
    return { ...row, no_of_days: '', end_date: '' }
  }
  if ((field === 'date' || field === 'end_date') && start && end) {
    return { ...row, no_of_days: daysBetween(start, end) || 1 }
  }
  const daysNum = Number(daysRaw)
  if (field === 'no_of_days' && start && Number.isFinite(daysNum) && daysNum > 0) {
    return { ...row, end_date: addDays(start, daysNum) }
  }
  return row
}

/** Calendar date YYYY-MM-DD in local time. */
export function todayDateString(asOf: Date = new Date()): string {
  const y = asOf.getFullYear()
  const m = String(asOf.getMonth() + 1).padStart(2, '0')
  const d = String(asOf.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Future Plan is not a selectable type — it is a display bucket for lines whose
 * Start Date is after today. On/after that date they show under their real type (PRN, etc.).
 */
export function isFuturePlanByStartDate(
  order: { date?: string | null; start_date?: string | null } | null | undefined,
  asOf: Date = new Date()
): boolean {
  if (!order) return false
  const start = String(order.date || order.start_date || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return false
  return start > todayDateString(asOf)
}

/**
 * True when the medication line end date (or parent Rx end) is before today.
 * End date itself remains active; the day after it is treated as expired.
 */
export function isMedicationEndDatePassed(
  order:
    | {
        end_date?: string | null
        _rx_end?: string | null
      }
    | null
    | undefined,
  asOf: Date = new Date()
): boolean {
  if (!order) return false
  const end = String(order.end_date || order._rx_end || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return false
  return end < todayDateString(asOf)
}

/**
 * Stopped / discontinued line for listing filters (Current Prescription Stopped tab).
 *
 * Covers new UI stops and legacy imports — not free-text comments (too ambiguous).
 */
export function isMedicationStopped(
  order:
    | {
        reason_stopped?: string | null
        stopped?: boolean | 0 | 1 | null
        medication_status?: string | null
        stopped_date?: string | null
        effective_status?: string | null
        status?: string | null
      }
    | null
    | undefined,
): boolean {
  if (!order) return false
  if (String(order.reason_stopped || '').trim()) return true
  if (order.stopped === true || order.stopped === 1) return true
  if (String(order.medication_status || '').trim() === 'Discontinued') return true
  if (String(order.stopped_date || '').trim()) return true
  const effective = String(order.effective_status || '').trim().toLowerCase()
  if (effective === 'stopped' || effective === 'discontinued') return true
  const status = String(order.status || '').trim().toLowerCase()
  if (status === 'stopped' || status === 'discontinued') return true
  return false
}

/** Filter/count helper for Current Prescription type cards (incl. computed Future Plan). */
export function matchesPrescriptionTypeFilter(
  order: {
    medication_type?: string | null
    date?: string | null
    start_date?: string | null
    end_date?: string | null
    _rx_end?: string | null
    reason_stopped?: string | null
    stopped?: boolean | 0 | 1 | null
    medication_status?: string | null
    stopped_date?: string | null
    effective_status?: string | null
    status?: string | null
    is_prn?: boolean | 0 | 1 | null
    instructions?: string | null
    dose_notes?: string | null
    patient_frequency?: string | null
    written_frequency?: string | null
    frequency?: string | null
  },
  filterKey: string,
  asOf: Date = new Date()
): boolean {
  const isStopped = isMedicationStopped(order)
  // Stopped lines belong only under the Stopped tab — not All / Reg Psy / etc.
  if (filterKey === '__stopped__') return isStopped
  if (isStopped) return false
  // Expired-by-end-date lines stay visible under All only — not Active Psy/Med/etc.
  if (filterKey === 'All') return true
  if (isMedicationEndDatePassed(order, asOf)) return false
  const future = isFuturePlanByStartDate(order, asOf)
  if (filterKey === 'Future Plan') return future
  // Real types only include lines that have started (not future-dated)
  if (future) return false
  if (filterKey === 'PRN') {
    const coded = normalizePrescriptionType(order.medication_type)
    if (coded === 'PRN' || order.is_prn === true || order.is_prn === 1) return true
    // Legacy lines carry the type only in the free text ("3BDPRN").
    return !coded && inferPrescriptionTypeFromOrder(order)?.type === 'PRN'
  }
  if (filterKey === 'STAT') {
    const coded = normalizePrescriptionType(order.medication_type)
    if (coded === 'STAT') return true
    return !coded && inferPrescriptionTypeFromOrder(order)?.type === 'STAT'
  }
  return normalizePrescriptionType(order.medication_type) === filterKey
}

/** Types doctors/nurses may pick when creating or adding a medication line. */
export const SELECTABLE_PRESCRIPTION_TYPES = [
  'STAT',
  'PRN',
  'Regular - Psy (Active)',
  'Regular - Med (Active)',
  'Regular - Psy (Inactive)',
  'Regular - Med (Inactive)',
  'Long Acting Medicine',
] as const

/** Map Prescription Type to API fields (is_prn, is_long_acting_medicine) before save. */
export function normalizeMedicationOrderForSave<T extends Record<string, unknown>>(
  row: T & {
    medication_type?: string | null
    is_prn?: boolean
    is_long_acting?: boolean
    long_acting_frequency?: string | null
    patient_frequency?: string | null
  }
): T & {
  medication_type?: string
  is_prn: boolean
  is_long_acting_medicine: boolean
  patient_frequency?: string
  long_acting_frequency?: string
} {
  const medicationType = normalizePrescriptionType(row.medication_type)
  const flags = flagsFromPrescriptionType(medicationType)
  const { is_long_acting: _la, is_prn: _prn, ...rest } = row
  let patientFrequency: string | undefined =
    rest.patient_frequency != null ? String(rest.patient_frequency).trim() || undefined : undefined
  let longActingFrequency: string | undefined =
    rest.long_acting_frequency != null ? String(rest.long_acting_frequency).trim() || undefined : undefined
  if (flags.is_long_acting) {
    const lf = (longActingFrequency || patientFrequency || 'Weekly').trim()
    longActingFrequency = lf
    patientFrequency = lf
  }
  return {
    ...(rest as T),
    medication_type: medicationType || undefined,
    patient_frequency: patientFrequency,
    long_acting_frequency: longActingFrequency,
    is_prn: flags.is_prn,
    is_long_acting_medicine: flags.is_long_acting,
  }
}
