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
  // Legacy Oracle only — mapped Prescription Type of redundancy code 4.
  'Contraindicated',
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

// ─── Legacy Oracle lines (a redundancy code instead of a coded type) ─────────
/** Fields only Oracle-imported lines carry — their Prescription Type was never coded. */
const LEGACY_LINE_FIELDS = [
  'redundancy_type',
  'medicine_no',
  'old_medicine_code',
  'old_medicine_name',
  'trans_num',
] as const

export type LegacyPrescriptionLineSource = {
  /** Server flag set next to ``resolved_prescription_type``. */
  is_legacy_line?: boolean | number | null
  /** Flag the prescription / clinical-note payloads already carry for legacy lines. */
  is_legacy?: boolean | number | null
  /** Coded Prescription Type — a line that has one is not an untyped legacy line. */
  medication_type?: string | null
  /** Legacy Oracle line: Prescription Type is stored only as this redundancy code. */
  redundancy_type?: number | string | null
  medicine_no?: string | null
  old_medicine_code?: string | null
  old_medicine_name?: string | null
  trans_num?: string | null
}

/**
 * True for an Oracle-imported line (it carries an Oracle marker, not a coded type).
 *
 * Detected from the line itself — the prescription ``legacy`` flag is unreliable (Oracle
 * rows synced by the current import carry ``legacy = 0`` while every line still only has
 * a ``redundancy_type`` and an empty ``medication_type``).
 */
export function isLegacyPrescriptionLine(order?: LegacyPrescriptionLineSource | null): boolean {
  if (!order) return false
  if (String(order.medication_type ?? '').trim() !== '') return false
  if (order.is_legacy_line === true || order.is_legacy_line === 1) return true
  if (order.is_legacy === true || order.is_legacy === 1) return true
  return LEGACY_LINE_FIELDS.some((field) => String(order[field] ?? '').trim() !== '')
}

/**
 * Oracle fills the ``dc`` column with a free-text end note — ``DC``, ``DC by: ABRAR``,
 * ``D/c``, ``stopped``, but also ``CHANGED``, ``dose increased``, ``by.Dr.AK``, a date —
 * so anything written there (except a placeholder) means the line was discontinued.
 */
const DC_PLACEHOLDER_VALUES = new Set(['', '-', '--', '.', '0', 'no', 'n/a', 'na', 'nil', 'none'])

export function isLegacyLineDiscontinued(
  order?: { dc?: string | null; medication_status?: string | null } | null,
): boolean {
  if (!order) return false
  if (String(order.medication_status || '').trim().toLowerCase() === 'discontinued') return true
  return !DC_PLACEHOLDER_VALUES.has(String(order.dc || '').trim().toLowerCase())
}

/** Inactive twin of a Regular type — a DC'd line was stopped, so it is not Active. */
export function inactivePrescriptionType(medicationType?: string | null): string {
  const type = normalizePrescriptionType(medicationType)
  if (type === 'Regular - Med (Active)') return 'Regular - Med (Inactive)'
  if (type === 'Regular - Psy (Active)') return 'Regular - Psy (Inactive)'
  return type
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
  /**
   * Free-text instruction — legacy Oracle DOSE_NOTES was imported here. This is the
   * only free-text field the type is read from; administration dose notes are ignored.
   */
  instructions?: string | null
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
  // Legacy type is read from the instruction field only — never from dose notes.
  const fromInstructions = detectPrescriptionTypeInText(textOf(order.instructions))
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
    inferred.source === 'instructions' ? 'the instructions' : 'the frequency'
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
 * True when the parent prescription itself has already ended (``_rx_end`` in the past).
 *
 * Legacy Oracle prescriptions ended years ago: measured against today every one of their
 * lines looks expired, the type chips show 0 and everything lands under "All". A finished
 * prescription is history, so its lines keep their own type bucket instead.
 */
export function isPrescriptionOver(
  order?: { _rx_end?: string | null } | null,
  asOf: Date = new Date()
): boolean {
  const end = String(order?._rx_end || '').trim().slice(0, 10)
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
    /** Legacy Oracle line: Prescription Type mapped from the redundancy code. */
    resolved_prescription_type?: string | null
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
    patient_frequency?: string | null
    written_frequency?: string | null
    frequency?: string | null
    /** Oracle DC note / line-left-import markers (legacy lines only). */
    dc?: string | null
  } & LegacyPrescriptionLineSource,
  filterKey: string,
  asOf: Date = new Date()
): boolean {
  const isStopped = isMedicationStopped(order)
  // Stopped lines belong only under the Stopped tab — not All / Reg Psy / etc.
  if (filterKey === '__stopped__') return isStopped
  if (isStopped) return false
  // Expired-by-end-date lines stay visible under All only — not Active Psy/Med/etc.
  // A finished prescription (legacy Oracle imports) is history: every line keeps its
  // own type bucket instead of disappearing into "All".
  if (filterKey === 'All') return true
  if (!isPrescriptionOver(order, asOf) && isMedicationEndDatePassed(order, asOf)) return false
  const future = isFuturePlanByStartDate(order, asOf)
  if (filterKey === 'Future Plan') return future
  // Real types only include lines that have started (not future-dated)
  if (future) return false
  // Coded Prescription Type first; legacy Oracle lines only have a redundancy code, which
  // the API maps through the Prescription Type doctype (``resolved_prescription_type``).
  // A DC'd legacy line is the Inactive twin of its mapped Regular type.
  const explicitType = normalizePrescriptionType(order.medication_type)
  const mappedType = normalizePrescriptionType(order.resolved_prescription_type)
  const coded =
    explicitType ||
    (isLegacyLineDiscontinued(order) ? inactivePrescriptionType(mappedType) : mappedType)
  // A legacy line's type is never guessed from its free text: without a mapped type the
  // line simply has no Prescription Type (it shows under All only).
  const canInferType = !coded && !isLegacyPrescriptionLine(order)
  if (filterKey === 'PRN') {
    if (coded === 'PRN' || order.is_prn === true || order.is_prn === 1) return true
    // New lines may carry the type only in the free text ("3BDPRN").
    return canInferType && inferPrescriptionTypeFromOrder(order)?.type === 'PRN'
  }
  if (filterKey === 'STAT') {
    if (coded === 'STAT') return true
    return canInferType && inferPrescriptionTypeFromOrder(order)?.type === 'STAT'
  }
  return coded === filterKey
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
