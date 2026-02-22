// import { messageFromFrappeResponse } from './apiClient'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreatePaymentEntryData {
  visit?: string
  reference_doctype: 'Sales Invoice' | 'Sales Order'
  reference_name: string
  paid_amount: number
  mode_of_payment: string
  remarks?: string
  patient?: string
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

export async function fetchModeOfPayments(): Promise<string[]> {
  const res = await fetch(`/api/method/frappe.client.get_list?doctype=Mode+of+Payment&fields=["name"]&limit=50`)
  const data = await res.json()
  return (data?.message ?? []).map((r: any) => r.name)
}