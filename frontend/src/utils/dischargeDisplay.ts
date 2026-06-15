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

export function resolveSpendDays(record: {
  duration?: string | null
  spend_days?: string | null
  admission_spend_days?: string | null
}): string | undefined {
  for (const value of [record.duration, record.spend_days, record.admission_spend_days]) {
    const text = (value || '').trim()
    if (text) return text
  }
  return undefined
}
