/** Open the patient visit barcode (PB) label — same size/pattern as the admission label. */
export function openPatientVisitBarcodePrint(visitName: string): void {
  const params = new URLSearchParams({
    name: visitName,
    trigger_print: '1',
  })
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  window.open(`${base}/patient_visit_barcode?${params.toString()}`, '_blank', 'noopener,noreferrer')
}
