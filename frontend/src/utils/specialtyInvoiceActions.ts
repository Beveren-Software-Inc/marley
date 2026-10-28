/** Submitted Sales Invoice (ERPNext docstatus). */
const SUBMITTED = 1

function normalizeDocstatus(ds: unknown): number | undefined {
  if (ds === null || ds === undefined) return undefined
  if (typeof ds === 'string' && ds.trim() === '') return undefined
  const n = Number(ds)
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

/**
 * ERPNext statuses that mean "nothing can be collected here", even when the invoice
 * still shows a balance. Everything else (Unpaid, Overdue, Partly Paid, Submitted,
 * …) is payable as long as money is outstanding.
 */
const NON_PAYABLE_STATUSES = new Set([
  'paid',
  'cancelled',
  'return',
  'credit note issued',
  'internal transfer',
  'draft',
])

/** Lower-cases the ERPNext status and drops the " and Discounted" suffix. */
function normalizeStatus(status?: string): string {
  const s = (status || '').toLowerCase().trim()
  return s.replace(/\s+and\s+discounted$/, '').trim()
}

function isEffectivelySubmitted(row: { docstatus?: number | string; status?: string }): boolean {
  const n = normalizeDocstatus(row.docstatus)
  if (n === SUBMITTED) return true
  if (n === 0 || n === 2) return false
  const s = normalizeStatus(row.status)
  return s !== 'draft' && s !== 'cancelled'
}

export function canRecordPaymentAgainstSalesInvoice(row: {
  docstatus?: number | string
  outstanding_amount: number
  status?: string
}): boolean {
  if (!isEffectivelySubmitted(row)) return false
  if (Number(row.outstanding_amount) <= 0) return false
  // Gate on the balance, not on the status text: ERPNext reports "Submitted" for an
  // invoice whose due date has passed while its payment-schedule date has not (which
  // is what you get after cancelling the only Payment Entry of a credit invoice).
  return !NON_PAYABLE_STATUSES.has(normalizeStatus(row.status))
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
