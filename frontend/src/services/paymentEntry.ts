// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreatePaymentEntryData {
  visit?: string
  appointment?: string
  reference_doctype: 'Sales Invoice' | 'Sales Order'
  reference_name: string
  paid_amount: number
  mode_of_payment: string
  remarks?: string
  patient?: string
}

export interface SalesInvoiceSummary {
  name: string
  grand_total: number
  outstanding_amount: number
  status?: string
}

export interface CreatePaymentEntryResult {
  name: string
  server_message?: string
}

export interface PaymentReferenceOption {
  name: string
  label: string
  outstanding_amount?: number
  grand_total?: number
  customer_name?: string
  patient_name?: string
}

// ─── Service ──────────────────────────────────────────────────────────────────

async function paymentApiRequest<T>(
  method: string,
  body?: Record<string, unknown>
): Promise<T> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = (window as any).csrf_token || (await ensureCSRF())

  const response = await fetch(`/api/method/${method}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify(body ?? {}),
  })

  const resData = await response.json().catch(() => ({}))

  if (!response.ok || resData?.exc) {
    const msg =
      typeof resData?.message === 'string'
        ? resData.message
        : resData?.exc || `Request failed (${response.status})`
    throw new Error(String(msg))
  }

  return resData?.message as T
}

export async function createPaymentEntry(
  data: CreatePaymentEntryData
): Promise<CreatePaymentEntryResult> {
  const msg = await paymentApiRequest<CreatePaymentEntryResult | string>(
    'healthcare.api.payment_entry.create_payment_entry',
    { data }
  )

  if (msg && typeof msg === 'object' && (msg as CreatePaymentEntryResult).name) {
    return msg as CreatePaymentEntryResult
  }
  if (typeof msg === 'string' && msg.trim()) {
    return { name: '', server_message: msg.trim() }
  }
  throw new Error('Failed to create payment entry')
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

export async function fetchSalesInvoices(
  search?: string,
  patient?: string
): Promise<PaymentReferenceOption[]> {
  const rows = await paymentApiRequest<PaymentReferenceOption[]>(
    'healthcare.api.payment_entry.search_sales_invoices_for_payment',
    {
      search: search || '',
      patient: patient || '',
      limit: 30,
    }
  )
  return Array.isArray(rows) ? rows : []
}

export async function fetchSalesOrders(
  search?: string,
  patient?: string
): Promise<PaymentReferenceOption[]> {
  const rows = await paymentApiRequest<PaymentReferenceOption[]>(
    'healthcare.api.payment_entry.search_sales_orders_for_payment',
    {
      search: search || '',
      patient: patient || '',
      limit: 30,
    }
  )
  return Array.isArray(rows) ? rows : []
}

export async function fetchSalesInvoiceSummary(invoiceName: string): Promise<SalesInvoiceSummary> {
  const params = new URLSearchParams({ invoice_name: invoiceName })
  const res = await fetch(
    `/api/method/healthcare.api.common.get_sales_invoice_with_items?${params.toString()}`,
    { credentials: 'include' }
  )
  const data = await res.json()
  const msg = data?.message
  if (!msg || typeof msg !== 'object' || !msg.name) {
    throw new Error('Could not load sales invoice details')
  }
  return {
    name: msg.name,
    grand_total: Number(msg.grand_total) || 0,
    outstanding_amount: Number(msg.outstanding_amount) || 0,
    status: msg.status,
  }
}

export async function fetchModeOfPayments(): Promise<string[]> {
  const res = await fetch(
    `/api/method/frappe.client.get_list?doctype=Mode+of+Payment&fields=["name"]&limit=50`,
    { credentials: 'include' }
  )
  const data = await res.json()
  return (data?.message ?? []).map((r: { name: string }) => r.name)
}
