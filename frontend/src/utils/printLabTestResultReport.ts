import { fetchLabRequestReview } from '../services/serviceRequests'

export const LAB_TEST_PRINT_FORMAT = 'Lab Test Print'
export const LAB_TEST_EXTERNAL_PRINT_FORMAT = 'Lab Test External Print'

/**
 * Open a Lab Test print view.
 *
 * ``Lab Test Print`` (Laboratory Report) and ``Lab Test External Print`` both
 * expand to every Lab Test on the parent Service Request when present.
 */
export function openLabTestResultReportPrint(
  labTestName: string,
  format: string = LAB_TEST_PRINT_FORMAT,
): void {
  const name = (labTestName || '').trim()
  if (!name) return
  const params = new URLSearchParams({
    doctype: 'Lab Test',
    name,
    format: format || LAB_TEST_PRINT_FORMAT,
    trigger_print: '1',
    no_letterhead: '0',
  })
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  window.open(`${base}/printview?${params.toString()}`, '_blank', 'noopener,noreferrer')
}

/**
 * Print the Laboratory Report for a whole Lab Request (used from listing rows).
 *
 * Resolves one linked Lab Test first — the print format then expands to the full
 * request — so the output matches printing from the Lab Request review modal.
 * Returns the Lab Test name used, or ``null`` when the request has no linked test.
 */
export async function openLabRequestResultReportPrint(
  serviceRequestName: string,
  format: string = LAB_TEST_PRINT_FORMAT,
): Promise<string | null> {
  const review = await fetchLabRequestReview(serviceRequestName)
  const labTestName =
    (review.lab_tests || []).map((lt) => (lt.name || '').trim()).find(Boolean) ||
    (review.groups || [])
      .flatMap((g) => g.tests || [])
      .map((t) => (t.lab_test || '').trim())
      .find(Boolean) ||
    ''
  if (!labTestName) return null
  openLabTestResultReportPrint(labTestName, format)
  return labTestName
}
