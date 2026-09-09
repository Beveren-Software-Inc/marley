/** Open the patient admission barcode (PB) label — same size/pattern as lab sample barcode. */
export function openPatientAdmissionBarcodePrint(admissionName: string): void {
  const params = new URLSearchParams({
    name: admissionName,
    trigger_print: '1',
  })
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  window.open(`${base}/patient_admission_barcode?${params.toString()}`, '_blank', 'noopener,noreferrer')
}
