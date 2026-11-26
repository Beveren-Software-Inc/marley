/** Open the patient barcode label (same size/pattern as the lab sample barcode). */
export function openPatientBarcodePrint(patient: string): void {
  const params = new URLSearchParams({
    name: patient,
    trigger_print: '1',
  })
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  window.open(`${base}/patient_barcode?${params.toString()}`, '_blank', 'noopener,noreferrer')
}
