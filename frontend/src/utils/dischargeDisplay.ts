import { resolveAdmissionStayDays } from './admissionDateTime'

export interface DischargeDateFields {
  discharge_date?: string | null
  final_discharge_date?: string | null
}

/** Prefer discharge_date; fall back to final_discharge_date for Oracle/imported rows. */
export function resolveDischargeDisplayDate(record: DischargeDateFields): string | undefined {
  const primary = (record.discharge_date || '').trim()
  if (primary) return primary
  const fallback = (record.final_discharge_date || '').trim()
  return fallback || undefined
}

export interface SpendDaysFields {
  /** Discharge duration as stored on the Discharge (legacy import copies SPEND_DAYS here). */
  duration?: string | null
  spend_days?: string | null
  admission_spend_days?: string | null
  admitted_datetime?: string | null
  admission_date?: string | null
  admission_time?: string | null
  discharge_date?: string | null
  final_discharge_date?: string | null
  display_discharge_date?: string | null
}

/**
 * Spend days shown on the discharge UI.
 * - Stored value (legacy SPEND_DAYS) always wins — it is displayed as-is, never recalculated
 * - Nothing stored → calculate from admission → discharge, counting both the admission day
 *   and the discharge day (+1)
 */
export function resolveSpendDays(record: SpendDaysFields): string | undefined {
  for (const value of [record.duration, record.spend_days, record.admission_spend_days]) {
    const text = (value || '').trim()
    if (text) return text
  }

  const days = resolveAdmissionStayDays({
    admitted_datetime: record.admitted_datetime,
    admission_date: record.admission_date,
    admission_time: record.admission_time,
    discharge_datetime:
      record.display_discharge_date || record.discharge_date || record.final_discharge_date,
  })
  return days === null ? undefined : String(days)
}
