export type DischargeChecklistStatus = 'complete' | 'finance_pending' | 'incomplete' | 'none'

export interface DischargeChecklistSummary {
  checklist_status: DischargeChecklistStatus
  checklist_total: number
  checklist_completed: number
  checklist_incomplete: number
}

const FINANCE_CHECKLIST_PATTERNS = [
  'billing finalization',
  'final financial check',
  'final finance check',
]

export function isFinanceChecklistItem(actionRequired?: string | null): boolean {
  const label = (actionRequired || '').trim().toLowerCase()
  if (!label) return false
  return FINANCE_CHECKLIST_PATTERNS.some((pattern) => label.includes(pattern))
}

const DISCHARGE_MEDICATION_CHECKLIST_PATTERNS = [
  'discharge medication entered',
  'discharged medication entered',
]

/** Checklist rows that should auto-complete when a discharge prescription is created. */
export function isDischargeMedicationChecklistItem(actionRequired?: string | null): boolean {
  const label = (actionRequired || '').trim().toLowerCase()
  if (!label) return false
  return DISCHARGE_MEDICATION_CHECKLIST_PATTERNS.some((pattern) => label.includes(pattern))
}

export function isChecklistRowComplete(click?: boolean | number | null): boolean {
  return click === true || click === 1
}

export function summarizeDischargeChecklistStatus(
  rows: Array<{ action_required?: string; click?: boolean | number | null }> | undefined
): DischargeChecklistSummary {
  const list = rows ?? []
  const total = list.length

  if (!total) {
    return {
      checklist_status: 'none',
      checklist_total: 0,
      checklist_completed: 0,
      checklist_incomplete: 0,
    }
  }

  const incompleteRows = list.filter((row) => !isChecklistRowComplete(row.click))
  const completed = total - incompleteRows.length
  const incomplete = incompleteRows.length

  if (incomplete === 0) {
    return {
      checklist_status: 'complete',
      checklist_total: total,
      checklist_completed: completed,
      checklist_incomplete: 0,
    }
  }

  const hasNonFinancePending = incompleteRows.some(
    (row) => !isFinanceChecklistItem(row.action_required)
  )

  return {
    checklist_status: hasNonFinancePending ? 'incomplete' : 'finance_pending',
    checklist_total: total,
    checklist_completed: completed,
    checklist_incomplete: incomplete,
  }
}

export function canSubmitDischargeWithChecklist(
  rows: Array<{ action_required?: string; click?: boolean | number | null }> | undefined
): boolean {
  const { checklist_status } = summarizeDischargeChecklistStatus(rows)
  return checklist_status === 'complete' || checklist_status === 'finance_pending' || checklist_status === 'none'
}

export const CHECKLIST_STATUS_LABELS: Record<DischargeChecklistStatus, string> = {
  complete: 'Checklist complete',
  finance_pending: 'Finance pending',
  incomplete: 'Checklist incomplete',
  none: 'No checklist',
}

export const CHECKLIST_STATUS_COLORS: Record<
  Exclude<DischargeChecklistStatus, 'none' | 'complete'>,
  'danger' | 'warning'
> = {
  incomplete: 'danger',
  finance_pending: 'warning',
}
