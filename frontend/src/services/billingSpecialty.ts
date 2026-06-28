import { ensureCSRF } from './apiClient'

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
    name?: string
    item_code: string
    item_name?: string
    description?: string
    qty: number
    rate?: number
    price_list_rate?: number
    amount?: number
    discount_amount?: number
    discount_percentage?: number
    net_amount?: number
    cost_center?: string | null
  }>
}

// export async function fetchSalesInvoiceDetail(invoiceName: string): Promise<SalesInvoiceDetail> {
//   const res = await fetch('/api/method/healthcare.api.billing.get_invoice_details', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ invoice_name: invoiceName }),
//   })
//   const data = await res.json()
//   if (!res.ok) throw new Error(data?.message || 'Failed to load invoice')
//   const msg = data.message
//   if (!msg) throw new Error('Invoice not found')
//   return msg as SalesInvoiceDetail
// }

export async function fetchSalesInvoiceDetail(invoiceName: string): Promise<SalesInvoiceDetail> {
  const params = new URLSearchParams()
  params.append('invoice_name', invoiceName)

  const res = await fetch(
    `/api/method/healthcare.api.billing.get_invoice_details?${params.toString()}`
  )

  const data = await res.json()
  const msg = data.message

  if (!res.ok) throw new Error(data?.message || 'Failed to load invoice')
  if (!msg) throw new Error('Invoice not found')

  return msg as SalesInvoiceDetail
}

export async function submitSalesInvoiceDoc(invoiceName: string): Promise<void> {
  const csrf = await ensureCSRF()
  const res = await fetch('/api/method/healthcare.api.billing.submit_sales_invoice_doc', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify({ invoice_name: invoiceName }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.message || 'Submit failed')
}

export async function cancelOrDeleteSalesInvoice(invoiceName: string): Promise<void> {
  const csrf = await ensureCSRF()
  const res = await fetch('/api/method/healthcare.api.billing.cancel_or_delete_sales_invoice', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify({ invoice_name: invoiceName }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.message || 'Cancel failed')
}

export type SalesInvoiceItemUpdate = {
  name?: string
  item_code?: string
  item_name?: string
  description?: string
  uom?: string
  qty?: number
  rate?: number
  discount_amount?: number
  discount_percentage?: number
  cost_center?: string
}

export async function updateSalesInvoiceItems(
  invoiceName: string,
  items: SalesInvoiceItemUpdate[],
): Promise<SalesInvoiceDetail> {
  const csrf = await ensureCSRF()
  const res = await fetch('/api/method/healthcare.api.billing.update_sales_invoice_items', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify({ invoice_name: invoiceName, items }),
  })
  const data = await res.json()
  if (!res.ok) {
    const msg =
      typeof data?.message === 'string'
        ? data.message
        : data?.exc || data?._server_messages || 'Failed to save invoice'
    throw new Error(typeof msg === 'string' ? msg : 'Failed to save invoice')
  }
  if (!data.message) throw new Error('Failed to save invoice')
  return data.message as SalesInvoiceDetail
}

export interface InternalBillingSummary {
  invoice_count: number
  total_billed: number
  total_outstanding: number
}

export interface DispatchedEmployeeMedicationRow {
  name: string
  transaction_date: string
  customer: string
  customer_name?: string | null
  employee_name?: string | null
  grand_total: number
  company?: string
  status: string
  cost_center?: string | null
  collection_cost_center_name?: string | null
  delivery_note?: string | null
}

export async function fetchDispatchedEmployeeMedication(): Promise<DispatchedEmployeeMedicationRow[]> {
  const params = new URLSearchParams()
  params.append('limit_page_length', '200')

  const res = await fetch(
    `/api/method/healthcare.api.billing.list_dispatched_employee_medication?${params.toString()}`
  )

  const data = await res.json()
  if (!res.ok) throw new Error(data?.message || 'Failed to load dispatched medication')
  return (data.message || []) as DispatchedEmployeeMedicationRow[]
}

export async function createInternalEmployeeInvoiceFromSalesOrder(
  salesOrderName: string,
): Promise<{ name: string; customer: string; grand_total: number; sales_order: string }> {
  const csrf = await ensureCSRF()
  const res = await fetch(
    '/api/method/healthcare.api.billing.create_internal_employee_invoice_from_sales_order',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({ sales_order_name: salesOrderName }),
    },
  )
  const data = await res.json()
  if (!res.ok) throw new Error(data?.message || 'Failed to create invoice from sales order')
  return data.message
}



export async function fetchAdditionalCollectionInvoices(): Promise<SpecialtyInvoiceRow[]> {
  const params = new URLSearchParams()
  params.append('limit_page_length', '200')

  const res = await fetch(
    `/api/method/healthcare.api.billing.list_additional_collection_invoices?${params.toString()}`
  )

  const data = await res.json()
  console.log("NOthing at all", data.message)
  return (data.message || []) as SpecialtyInvoiceRow[]
}



export async function fetchInternalEmployeeInvoices(): Promise<SpecialtyInvoiceRow[]> {
  const params = new URLSearchParams()
  params.append('limit_page_length', '200')

  const res = await fetch(
    `/api/method/healthcare.api.billing.list_internal_employee_invoices?${params.toString()}`
  )

  const data = await res.json()
  return (data.message || []) as SpecialtyInvoiceRow[]
}


export async function fetchInternalEmployeeBillingSummary(): Promise<InternalBillingSummary> {
  const res = await fetch(
    '/api/method/healthcare.api.billing.get_internal_employee_billing_summary'
  )

  const data = await res.json()
  return data.message as InternalBillingSummary
}
