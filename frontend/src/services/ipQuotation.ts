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

export interface IPQuotationDetail extends IPQuotationRow {
  quotation_to?: string
  customer?: string
  company?: string
  transaction_date?: string
  valid_till?: string
  items?: Array<{
    item_code?: string
    item_name?: string
    qty?: number
    rate?: number
    amount?: number
  }>
  terms?: string
  remarks?: string
  creation?: string
  modified?: string
  owner?: string
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

export async function fetchIPQuotationDetail(name: string): Promise<IPQuotationDetail> {
  const res = await fetch(`/api/resource/Quotation/${encodeURIComponent(name)}`)
  const data = await res.json()

  if (data?.data) {
    const d = data.data as Record<string, unknown>
    const items = Array.isArray(d.items) ? (d.items as Record<string, unknown>[]) : []
    return {
      name: String(d.name || ''),
      date: String(d.transaction_date || d.posting_date || ''),
      status: String(d.status || ''),
      patient: String(d.patient || ''),
      patient_name: String(d.custom_patient_name || d.patient_name || ''),
      inpatient_admission: String(d.custom_inpatient_admission || ''),
      package_name: String(d.custom_package || ''),
      grand_total: typeof d.grand_total === 'number' ? d.grand_total : Number(d.grand_total || 0),
      currency: String(d.currency || ''),
      quotation_to: String(d.quotation_to || ''),
      customer: String(d.customer || ''),
      company: String(d.company || ''),
      transaction_date: String(d.transaction_date || ''),
      valid_till: String(d.valid_till || ''),
      items: items.map((item) => ({
        item_code: String(item.item_code || ''),
        item_name: String(item.item_name || ''),
        qty: typeof item.qty === 'number' ? item.qty : Number(item.qty || 0),
        rate: typeof item.rate === 'number' ? item.rate : Number(item.rate || 0),
        amount: typeof item.amount === 'number' ? item.amount : Number(item.amount || 0),
      })),
      terms: String(d.terms || ''),
      remarks: String(d.remarks || ''),
      creation: String(d.creation || ''),
      modified: String(d.modified || ''),
      owner: String(d.owner || ''),
    }
  }
  if (data?.exception) {
    throw new Error(data.message || 'Failed to fetch quotation details')
  }
  throw new Error('Invalid response format')
}