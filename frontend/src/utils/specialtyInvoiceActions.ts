/** Submitted Sales Invoice (ERPNext docstatus). */
const SUBMITTED = 1

function normalizeDocstatus(ds: unknown): number | undefined {
  if (ds === null || ds === undefined) return undefined
  if (typeof ds === 'string' && ds.trim() === '') return undefined
  const n = Number(ds)
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

function isEffectivelySubmitted(row: { docstatus?: number | string; status: string }): boolean {
  const n = normalizeDocstatus(row.docstatus)
  if (n === SUBMITTED) return true
  if (n === 0 || n === 2) return false
  const s = (row.status || '').toLowerCase().trim()
  return s !== 'draft' && s !== 'cancelled'
}

export function canRecordPaymentAgainstSalesInvoice(row: {
  docstatus?: number | string
  outstanding_amount: number
  status: string
}): boolean {
  if (!isEffectivelySubmitted(row)) return false
  if (Number(row.outstanding_amount) <= 0) return false
  const s = (row.status || '').toLowerCase().trim()
  if (s === 'paid' || s === 'cancelled') return false
  return (
    s === 'unpaid' ||
    s === 'overdue' ||
    s === 'partially paid' ||
    s === 'partly paid'
  )
}

export function isSubmittedSalesInvoice(docstatus?: number | string): boolean {
  return normalizeDocstatus(docstatus) === SUBMITTED
}

export function isDraftSalesInvoice(docstatus?: number | string): boolean {
  return normalizeDocstatus(docstatus) === 0
}

/** Cancel invoice action: only when clearly submitted (docstatus 1). */
export function canCancelSubmittedSalesInvoiceRow(docstatus?: number | string): boolean {
  return normalizeDocstatus(docstatus) === SUBMITTED
}
