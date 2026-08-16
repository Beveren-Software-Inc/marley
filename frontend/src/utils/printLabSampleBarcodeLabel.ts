/** Open the sample label page (same click-to-URL pattern as Lab Test Print). */
export function openLabSampleBarcodePrint(serviceRequestName: string): void {
  const params = new URLSearchParams({
    name: serviceRequestName,
    trigger_print: '1',
  })
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  window.open(`${base}/lab_sample_barcode?${params.toString()}`, '_blank', 'noopener,noreferrer')
}
