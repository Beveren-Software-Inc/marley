import type { Observation } from '../../services/observations'

/** Treat observations without DC as ongoing only when start_date is within the last 30 days. */
export const OBSERVATION_ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

function parseObservationStartDate(startDate?: string | null): Date | null {
  if (!startDate) return null
  const date = new Date(startDate)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Ongoing observation: no DC date, start_date set, and start within the last 30 days. */
export function isObservationActive(
  obs: Pick<Observation, 'dc_date' | 'start_date'>,
): boolean {
  if (obs.dc_date) return false
  const start = parseObservationStartDate(obs.start_date)
  if (!start) return false
  return start.getTime() >= Date.now() - OBSERVATION_ACTIVE_WINDOW_MS
}
