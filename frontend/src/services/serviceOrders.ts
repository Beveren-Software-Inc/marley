// services/serviceOrders.ts
import { ensureCSRF } from './apiClient'

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

export interface OutpatientBalance {
  visit_id: string
  patient_name: string
  patient_id: string
  visit_date: string
  practitioner?: string
  total_amount: number
  total_paid: number
  outstanding_amount: number
  days_overdue: number
  last_invoice_date?: string
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


// Add to services/serviceOrders.ts

export interface InpatientBalance {
  admission_id: string
  patient_name: string
  patient_id: string
  admission_date: string
  discharge_date?: string
  cost_center?: string
  total_amount: number
  total_paid: number
  outstanding_amount: number
  days_overdue: number
  last_invoice_date?: string
}

export interface InvoiceItem {
  item_code: string
  item_name: string
  description?: string
  qty: number
  rate: number
  amount: number
  discount_amount?: number
  net_amount: number
}

export interface InvoiceDetails {
  name: string
  customer: string
  customer_name: string
  posting_date: string
  due_date: string
  grand_total: number
  outstanding_amount: number
  status: string
  cost_center: string
  items: InvoiceItem[]
  company: string
  department: string
}

export interface PaymentResponse {
  success: boolean
  message: string
  payment_entry?: string
}


export async function fetchInpatientBalances(patientId?: string): Promise<InpatientBalance[]> {
  let url = '/api/method/healthcare.api.billing.get_inpatient_balances'
  if (patientId) {
    url += `?patient=${encodeURIComponent(patientId)}`
  }
  const response = await fetch(url)
  const data = await response.json()

  if (!response.ok) throw new Error(data.message || 'Failed to fetch inpatient balances')
  return data.message || []
}


// Add these new API functions

export const getInvoiceDetails = async (invoiceName: string): Promise<InvoiceDetails | null> => {
  try {
    const response = await fetch('/api/method/healthcare.api.billing.get_invoice_details', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 'X-Frappe-CSRF-Token': frappe.csrf_token
      },
      body: JSON.stringify({ invoice_name: invoiceName })
    })
    
    const result = await response.json()
    if (result.message) {
      return result.message
    }
    throw new Error('Failed to load invoice details')
  } catch (error) {
    console.error('Error loading invoice details:', error)
    throw error
  }
}

export const getInvoiceItems = async (invoiceName: string): Promise<InvoiceItem[]> => {
  try {
    const response = await fetch('/api/method/healthcare.api.billing.get_invoice_items', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 'X-Frappe-CSRF-Token': frappe.csrf_token
      },
      body: JSON.stringify({ invoice_name: invoiceName })
    })
    
    const result = await response.json()
    if (result.message) {
      return result.message
    }
    throw new Error('Failed to load invoice items')
  } catch (error) {
    console.error('Error loading invoice items:', error)
    throw error
  }
}

export const createPaymentEntry = async (
  invoiceName: string,
  paymentAmount: number,
  paymentMode: string,
  costCenter?: string,
  department?: string,
  referenceNumber?: string
): Promise<PaymentResponse> => {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()
  const response = await fetch('/api/method/healthcare.api.billing.create_payment_entry', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify({
      invoice_name: invoiceName,
      payment_amount: paymentAmount,
      payment_mode: paymentMode,
      cost_center: costCenter,
      department,
      reference_number: referenceNumber,
    }),
  })

  const result = await response.json()
  if (!response.ok) {
    throw new Error(
      typeof result?.message === 'string' ? result.message : result?.exc || 'Failed to create payment entry'
    )
  }
  if (result.message) {
    return result.message as PaymentResponse
  }
  throw new Error('Failed to create payment entry')
}

export async function fetchOutpatientBalances(patientId?: string): Promise<OutpatientBalance[]> {
  let url = '/api/method/healthcare.api.billing.get_outpatient_balances'
  if (patientId) {
    url += `?patient=${encodeURIComponent(patientId)}`
  }
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'Failed to fetch outpatient balances')
  return data.message || []
}


// Add to services/serviceOrders.ts

export async function fetchInvoicesByReference(
  referenceType: 'Inpatient Admission' | 'Patient Visit',
  referenceName: string,
  patient?: string
): Promise<ServiceInvoice[]> {
  let url = `/api/method/healthcare.api.service_orders.get_invoices_by_reference?reference_type=${encodeURIComponent(referenceType)}&reference_name=${encodeURIComponent(referenceName)}`
  if (patient) {
    url += `&patient=${encodeURIComponent(patient)}`
  }
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'Failed to fetch invoices')
  return data.message || []
}


// Add to services/serviceOrders.ts

export interface ReferenceInvoice {
  name: string
  grand_total: number
  outstanding_amount: number
  posting_date: string
  status: string
}

export interface RelatedSalesOrderLine {
  item_code: string
  item_name: string
  description?: string
  qty: number
  rate?: number
  amount?: number
}

export interface RelatedSalesOrder {
  name: string
  transaction_date: string
  grand_total: number
  status: string
  customer?: string
  company?: string
  custom_reference_type?: string
  custom_reference_name?: string
  custom_base_reference?: string
  /** Reception-friendly e.g. Lab tests, Medication / pharmacy, IP / ward service */
  order_kind_label?: string
  items?: RelatedSalesOrderLine[]
}

export interface BillingInvoiceItemInput {
  item_code: string
  item_name?: string
  description?: string
  qty: number
  rate: number
  cost_center?: string
  /** Default sales / line UOM from Item (ERPNext resolution) */
  uom?: string
  /** Stock UOM from Item — shown for reference */
  stock_uom?: string
  /** UOM choices from Item (stock, sales, conversions) */
  uom_options?: string[]
  /** Last server pricing breakdown (service category multiplier, etc.) */
  billing_price_meta?: {
    base_rate: number
    multiplier: number
    patient_category: string | null
    pricing_source?: string | null
  }
}

export interface SalesItemPricingForBilling {
  rate: number
  base_rate?: number
  uom: string | null
  stock_uom: string | null
  item_name?: string | null
  price_list?: string | null
  is_service_item?: number
  is_stock_item?: number
  pricing_source?: string | null
  service_template_dt?: string | null
  service_template_dn?: string | null
  patient_category?: string | null
  multiplier?: number
  uom_options?: string[]
}

export async function fetchSalesItemPricingForBilling(params: {
  item_code: string
  company: string
  customer?: string
  patient?: string
  qty?: number
  posting_date?: string
  price_list?: string
  uom?: string
}): Promise<SalesItemPricingForBilling> {
  const csrf = await ensureCSRF()
  const response = await fetch('/api/method/healthcare.api.billing.get_sales_item_pricing_for_billing', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify(params),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.message || 'Failed to fetch item price')
  return data.message as SalesItemPricingForBilling
}

// services/serviceOrders.ts
export const getInvoicesByReference = async (referenceName: string, referenceType: string): Promise<ReferenceInvoice[]> => {
  try {
    const response = await fetch('/api/method/healthcare.api.billing.get_invoices_by_reference', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 'X-Frappe-CSRF-Token': frappe.csrf_token
      },
      body: JSON.stringify({ 
        reference_name: referenceName,
        reference_type: referenceType 
      })
    })
    
    const result = await response.json()
    console.log('API Response:', result); // Debug log
    
    if (result.message) {
      // Check if result.message is an array
      if (Array.isArray(result.message)) {
        return result.message
      }
      return []
    }
    return []
  } catch (error) {
    console.error('Error loading invoices by reference:', error)
    return []
  }
}

export async function fetchRelatedSalesOrders(
  referenceType: 'Patient Visit' | 'Inpatient Admission',
  referenceName: string
): Promise<RelatedSalesOrder[]> {
  const response = await fetch('/api/method/healthcare.api.billing.get_related_sales_orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference_type: referenceType, reference_name: referenceName }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.message || 'Failed to fetch related sales orders')
  return (data?.message || []) as RelatedSalesOrder[]
}

export async function createAdditionalCollectionInvoice(payload: {
  company: string
  customer?: string
  created_at_cost_center: string
  reference_type?: string
  reference_name?: string
  patient?: string
  posting_date?: string
  due_date?: string
  sales_orders?: string[]
  additional_items?: BillingInvoiceItemInput[]
}): Promise<{ name: string; grand_total: number; customer: string }> {
  const csrf = await ensureCSRF()
  const response = await fetch('/api/method/healthcare.api.billing.create_additional_collection_invoice', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
     },
    body: JSON.stringify(payload),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.message || 'Failed to create invoice')
  return data.message
}

export async function createInternalEmployeeInvoice(payload: {
  employee_name: string
  company: string
  created_at_cost_center: string
  items: BillingInvoiceItemInput[]
  posting_date?: string
  due_date?: string
  /** Optional Patient docname — used for service category multiplier on UI and stored on invoice */
  patient?: string
}): Promise<{ name: string; customer: string; grand_total: number }> {
  const csrf = await ensureCSRF()
  const response = await fetch('/api/method/healthcare.api.billing.create_internal_employee_invoice', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
     },
    body: JSON.stringify(payload),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.message || 'Failed to create internal invoice')
  return data.message
}