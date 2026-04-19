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
  department?:string,
  referenceNumber?: string
): Promise<PaymentResponse> => {
  try {
    const response = await fetch('/api/method/healthcare.api.billing.create_payment_entry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 'X-Frappe-CSRF-Token': frappe.csrf_token
      },
      body: JSON.stringify({
        invoice_name: invoiceName,
        payment_amount: paymentAmount,
        payment_mode: paymentMode,
        cost_center: costCenter,
        department:department,
        reference_number: referenceNumber
      })
    })
    
    const result = await response.json()
    if (result.message) {
      return result.message
    }
    throw new Error('Failed to create payment entry')
  } catch (error) {
    console.error('Error creating payment entry:', error)
    throw error
  }
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