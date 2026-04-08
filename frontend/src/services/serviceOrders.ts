// services/serviceOrders.ts
export interface ServiceOrder {
  name: string
  customer: string
  customer_name: string
  transaction_date: string
  status: string
  grand_total: number
  total: number
  custom_reference_type: 'Patient Visit' | 'Inpatient Admission'
  custom_reference_name: string
  custom_base_reference: string
  custom_base_reference_name: string
  patient: string
  patient_name: string
  docstatus: number
  invoice_status?: string
  invoice_name?: string
  invoice_amount?: number
}

export interface ServiceInvoice {
  name: string
  customer: string
  customer_name: string
  posting_date: string
  due_date: string
  status: string
  grand_total: number
  outstanding_amount: number
  paid_amount: number
  custom_reference_type: string
  custom_reference_name: string
  patient: string
  patient_name: string
  order_count?: number
}

export interface OrderSummary {
  total_orders: number
  total_amount: number
  draft: { count: number; amount: number }
  submitted: { count: number; amount: number }
  cancelled: { count: number; amount: number }
  invoiced: { count: number; amount: number }
  partially_invoiced: { count: number; amount: number }
  not_invoiced: { count: number; amount: number }
}

export interface InvoiceSummary {
  total_invoices: number
  total_amount: number
  total_paid: number
  total_outstanding: number
  paid: { count: number; amount: number }
  unpaid: { count: number; amount: number }
  overdue: { count: number; amount: number }
  partially_paid: { count: number; amount: number }
}

export async function fetchServiceOrders(
  referenceType?: string,
  referenceName?: string,
  patient?: string,
  status?: string
): Promise<ServiceOrder[]> {
  const params = new URLSearchParams()
  if (referenceType) params.append('reference_type', referenceType)
  if (referenceName) params.append('reference_name', referenceName)
  if (patient) params.append('patient', patient)
  if (status) params.append('status', status)

  const response = await fetch(
    `/api/method/healthcare.api.sales_order.get_service_orders?${params.toString()}`
  )
  const data = await response.json()
  return data.message || []
}

export async function fetchServiceOrderSummary(
  referenceType?: string,
  referenceName?: string,
  patient?: string
): Promise<OrderSummary> {
  const params = new URLSearchParams()
  if (referenceType) params.append('reference_type', referenceType)
  if (referenceName) params.append('reference_name', referenceName)
  if (patient) params.append('patient', patient)

  const response = await fetch(
    `/api/method/healthcare.api.sales_order.get_service_order_summary?${params.toString()}`
  )
  const data = await response.json()
  return data.message || {}
}

export async function fetchServiceInvoices(
  referenceType?: string,
  referenceName?: string,
  patient?: string,
  status?: string
): Promise<ServiceInvoice[]> {
  const params = new URLSearchParams()
  if (referenceType) params.append('reference_type', referenceType)
  if (referenceName) params.append('reference_name', referenceName)
  if (patient) params.append('patient', patient)
  if (status) params.append('status', status)

  const response = await fetch(
    `/api/method/healthcare.api.sales_invoice.get_service_invoices?${params.toString()}`
  )
  const data = await response.json()

  console.log("Huko wapi response data:", data) // Add this line to log the response data
  return data.message || []
}

export async function fetchInvoiceSummary(
  referenceType?: string,
  referenceName?: string,
  patient?: string
): Promise<InvoiceSummary> {
  const params = new URLSearchParams()
  if (referenceType) params.append('reference_type', referenceType)
  if (referenceName) params.append('reference_name', referenceName)
  if (patient) params.append('patient', patient)

  const response = await fetch(
    `/api/method/healthcare.api.sales_invoice.get_invoice_summary?${params.toString()}`
  )
  const data = await response.json()
  return data.message || {}
}

export async function createBulkInvoice(referenceType: string, referenceName: string): Promise<string> {
  const params = new URLSearchParams()
  params.append('reference_type', referenceType)
  params.append('reference_name', referenceName)

  const response = await fetch(
    `/api/method/healthcare.api.sales_order.create_bulk_invoice?${params.toString()}`,
    { method: 'POST' }
  )
  const data = await response.json()
  return data.message
}

export async function createServiceOrder(data: any): Promise<string> {
  const response = await fetch('/api/method/healthcare.api.sales_order.create_service_order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  const result = await response.json()
  return result.message
}

