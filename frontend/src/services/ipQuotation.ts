export interface IPQuotationRow {
  name: string
  date?: string
  status?: string
  patient?: string
  patient_name?: string
  inpatient_admission?: string
  package_name?: string
  grand_total?: number
  currency?: string
}

export async function fetchIPQuotations(opts?: {
  fromDate?: string
  toDate?: string
  status?: string
  limit?: number
  offset?: number
}): Promise<IPQuotationRow[]> {
  const params = new URLSearchParams()
  if (opts?.fromDate) params.append('from_date', opts.fromDate)
  if (opts?.toDate) params.append('to_date', opts.toDate)
  if (opts?.status) params.append('status', opts.status)
  params.append('limit', String(opts?.limit ?? 50))
  params.append('offset', String(opts?.offset ?? 0))

  const res = await fetch(`/api/method/healthcare.api.ip_quotation.get_ip_quotations?${params.toString()}`)
  const data = await res.json()

  if (data?.exc_type || data?.exc || !res.ok) {
    throw new Error(typeof data?.message === 'string' ? data.message : 'Failed to fetch IP quotations')
  }
  return Array.isArray(data?.message) ? (data.message as IPQuotationRow[]) : []
}

