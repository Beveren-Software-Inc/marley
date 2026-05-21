// import { messageFromFrappeResponse } from './apiClient'

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

// ─── Service ──────────────────────────────────────────────────────────────────

export async function createPaymentEntry(
  data: CreatePaymentEntryData
): Promise<CreatePaymentEntryResult> {
  const csrf =
    (window as any).csrf_token ||
    (await (await import('./apiClient')).ensureCSRF())

  const response = await fetch(
    '/api/method/healthcare.api.payment_entry.create_payment_entry',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({ data }),
    }
  )

  const resData = await response.json().catch(() => ({}))

//   if (!response.ok || resData?.exc) {
//     const msg = messageFromFrappeResponse(resData as Record<string, unknown>)
//     throw new Error(msg || `Failed to create payment entry (${response.status})`)
//   }

  const msg = resData?.message
  if (msg && typeof msg === 'object' && (msg as { name?: string }).name) {
    return msg as CreatePaymentEntryResult
  }
  if (msg && typeof msg === 'string' && msg.trim()) {
    return { name: '', server_message: msg.trim() }
  }

   throw new Error(`Upload failed: HTTP ${response.status}`)
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────
export async function fetchSalesInvoices(search?: string, patient?: string): Promise<{ name: string; label: string }[]> {
  const params = new URLSearchParams({ doctype: 'Sales Invoice', ...(search ? { txt: search } : {}), ...(patient ? { filters: JSON.stringify({ patient }) } : {}) })
  const res = await fetch(`/api/method/frappe.client.get_list?${params}`)
  const data = await res.json()
  return (data?.message ?? []).map((r: any) => ({ name: r.name, label: r.name }))
}

export async function fetchSalesOrders(search?: string, patient?: string): Promise<{ name: string; label: string }[]> {
  const params = new URLSearchParams({ doctype: 'Sales Order', ...(search ? { txt: search } : {}), ...(patient ? { filters: JSON.stringify({ patient }) } : {}) })
  const res = await fetch(`/api/method/frappe.client.get_list?${params}`)
  const data = await res.json()
  return (data?.message ?? []).map((r: any) => ({ name: r.name, label: r.name }))
}

export async function fetchSalesInvoiceSummary(invoiceName: string): Promise<SalesInvoiceSummary> {
  const params = new URLSearchParams({ invoice_name: invoiceName })
  const res = await fetch(
    `/api/method/healthcare.api.common.get_sales_invoice_with_items?${params.toString()}`,
    { credentials: 'include' },
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
  const res = await fetch(`/api/method/frappe.client.get_list?doctype=Mode+of+Payment&fields=["name"]&limit=50`)
  const data = await res.json()
  return (data?.message ?? []).map((r: any) => r.name)
}