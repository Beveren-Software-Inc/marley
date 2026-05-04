/** Submitted Sales Invoice (ERPNext docstatus). */
const SUBMITTED = 1

export function canRecordPaymentAgainstSalesInvoice(row: {
  docstatus?: number
  outstanding_amount: number
  status: string
}): boolean {
  if (row.docstatus !== SUBMITTED) return false
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

export function isSubmittedSalesInvoice(docstatus?: number): boolean {
  return docstatus === SUBMITTED
}

export function isDraftSalesInvoice(docstatus?: number): boolean {
  return docstatus === 0
}
