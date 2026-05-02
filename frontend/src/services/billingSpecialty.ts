export interface SpecialtyInvoiceRow {
  name: string
  /** 0 draft, 1 submitted, 2 cancelled */
  docstatus?: number
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

export interface SalesInvoiceDetail {
  name: string
  docstatus: number
  company?: string
  customer: string
  customer_name?: string | null
  posting_date?: string
  due_date?: string
  grand_total: number
  outstanding_amount: number
  status: string
  cost_center?: string
  custom_created_at?: string | null
  collection_cost_center_name?: string | null
  custom_internal_employee?: number
  custom_reference_type?: string | null
  custom_reference_name?: string | null
  patient?: string | null
  items: Array<{
    item_code: string
    item_name?: string
    description?: string
    qty: number
    rate?: number
    amount?: number
    net_amount?: number
  }>
}

export async function fetchSalesInvoiceDetail(invoiceName: string): Promise<SalesInvoiceDetail> {
  const res = await fetch('/api/method/healthcare.api.billing.get_invoice_details', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoice_name: invoiceName }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.message || 'Failed to load invoice')
  const msg = data.message
  if (!msg) throw new Error('Invoice not found')
  return msg as SalesInvoiceDetail
}

export async function submitSalesInvoiceDoc(invoiceName: string): Promise<void> {
  const res = await fetch('/api/method/healthcare.api.billing.submit_sales_invoice_doc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoice_name: invoiceName }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.message || 'Submit failed')
}

export async function cancelOrDeleteSalesInvoice(invoiceName: string): Promise<void> {
  const res = await fetch('/api/method/healthcare.api.billing.cancel_or_delete_sales_invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoice_name: invoiceName }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.message || 'Cancel failed')
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
