export interface SpecialtyInvoiceRow {
  name: string
  posting_date: string
  customer: string
  customer_name?: string | null
  grand_total: number
  outstanding_amount: number
  status: string
  company?: string
  custom_created_at?: string | null
  collection_cost_center_name?: string | null
  custom_reference_type?: string | null
  custom_reference_name?: string | null
  patient?: string | null
}

export interface InternalBillingSummary {
  invoice_count: number
  total_billed: number
  total_outstanding: number
}

export async function fetchAdditionalCollectionInvoices(): Promise<SpecialtyInvoiceRow[]> {
  const res = await fetch('/api/method/healthcare.api.billing.list_additional_collection_invoices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit_page_length: 200 }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.message || 'Failed to load invoices')
  return (data.message || []) as SpecialtyInvoiceRow[]
}

export async function fetchInternalEmployeeInvoices(): Promise<SpecialtyInvoiceRow[]> {
  const res = await fetch('/api/method/healthcare.api.billing.list_internal_employee_invoices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit_page_length: 200 }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.message || 'Failed to load invoices')
  return (data.message || []) as SpecialtyInvoiceRow[]
}

export async function fetchInternalEmployeeBillingSummary(): Promise<InternalBillingSummary> {
  const res = await fetch('/api/method/healthcare.api.billing.get_internal_employee_billing_summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.message || 'Failed to load summary')
  return data.message as InternalBillingSummary
}
