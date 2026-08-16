import { canEditUnassignedDischargeChecklistLine, isAdmin } from '../config/permissions'

export interface DischargeChecklistDepartmentScope {
  department?: string
  department_2?: string
  department_3?: string
}

export interface DischargeChecklistTemplateRow extends DischargeChecklistDepartmentScope {
  action_required?: string
  sr_num?: string
  department_label?: string
  department_2_label?: string
  department_3_label?: string
}

export interface DischargeChecklistToggleRow extends DischargeChecklistDepartmentScope {
  name: string
  action_required?: string
  sr_num?: string
  click?: boolean | number | null
  department_label?: string
  department_2_label?: string
  department_3_label?: string
}

function normalizeDepartmentId(dept: string): string {
  return dept.trim().toLowerCase()
}

function departmentsMatch(userDept: string, assignedDept: string): boolean {
  return normalizeDepartmentId(userDept) === normalizeDepartmentId(assignedDept)
}

function assignedDepartments(item: DischargeChecklistDepartmentScope): string[] {
  return [item.department, item.department_2, item.department_3].filter(Boolean) as string[]
}

export function isChecklistRowComplete(click?: boolean | number | null): boolean {
  return click === true || click === 1
}

export function sortChecklistByOrder<T extends { sr_num?: string; name: string }>(items: T[]): T[] {
  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aNum = parseInt((a.item.sr_num || '').trim(), 10)
      const bNum = parseInt((b.item.sr_num || '').trim(), 10)
      const aValid = !Number.isNaN(aNum)
      const bValid = !Number.isNaN(bNum)
      if (aValid && bValid) return aNum - bNum
      if (aValid) return -1
      if (bValid) return 1
      return a.index - b.index
    })
    .map(({ item }) => item)
}

const CHECKLIST_UNCHECK_ROLES = ['administrator', 'system manager']

/** Only System Manager and Administrator may reverse a completed checklist tick. */
export function canUncheckDischargeChecklistItem(roles: string[] | undefined): boolean {
  if (!roles?.length) return false
  return roles.some((role) => CHECKLIST_UNCHECK_ROLES.includes(role.trim().toLowerCase()))
}

export function isFirstChecklistItem<T extends { name: string; sr_num?: string }>(
  items: T[],
  target: T,
): boolean {
  const sorted = sortChecklistByOrder(items)
  return sorted[0]?.name === target.name
}

export function isFirstChecklistItemComplete<T extends DischargeChecklistToggleRow>(items: T[]): boolean {
  const sorted = sortChecklistByOrder(items)
  if (!sorted.length) return true
  return isChecklistRowComplete(sorted[0].click)
}

export function hasLaterCompletedChecklistItems<T extends DischargeChecklistToggleRow>(
  items: T[],
  target: T,
): boolean {
  const sorted = sortChecklistByOrder(items)
  const index = sorted.findIndex((row) => row.name === target.name)
  if (index < 0) return false
  return sorted.slice(index + 1).some((row) => isChecklistRowComplete(row.click))
}

export function canUserEditDischargeChecklistItem(
  item: DischargeChecklistDepartmentScope,
  userDepartments: string[] | undefined,
  roles: string[] | undefined,
): boolean {
  if (roles?.length && isAdmin(roles)) {
    return true
  }

  const assigned = assignedDepartments(item)
  if (assigned.length === 0) {
    return canEditUnassignedDischargeChecklistLine(roles)
  }

  const mine = userDepartments ?? []
  if (!mine.length) {
    return false
  }

  return assigned.some((dept) => mine.some((userDept) => departmentsMatch(userDept, dept)))
}

export function canToggleDischargeChecklistItem(
  item: DischargeChecklistToggleRow,
  items: DischargeChecklistToggleRow[],
  userDepartments: string[] | undefined,
  roles: string[] | undefined,
): { allowed: boolean; reason?: string } {
  if (!canUserEditDischargeChecklistItem(item, userDepartments, roles)) {
    return {
      allowed: false,
      reason: `Assigned to ${checklistItemDepartmentLabel(item)}. Only staff in that department can update this line.`,
    }
  }

  if (isChecklistRowComplete(item.click)) {
    if (!canUncheckDischargeChecklistItem(roles)) {
      return {
        allowed: false,
        reason: 'Completed checklist items cannot be unchecked. Ask a System Manager or Administrator if this needs to be reversed.',
      }
    }
    if (isFirstChecklistItem(items, item) && hasLaterCompletedChecklistItems(items, item)) {
      return {
        allowed: false,
        reason: 'Uncheck other completed items before unchecking the first checklist item.',
      }
    }
    return { allowed: true }
  }

  if (!isFirstChecklistItem(items, item) && !isFirstChecklistItemComplete(items)) {
    return {
      allowed: false,
      reason: 'Complete the first checklist item before other items can be checked.',
    }
  }

  return { allowed: true }
}

export function checklistItemDepartmentLabel(
  item: DischargeChecklistDepartmentScope & {
    department_label?: string
    department_2_label?: string
    department_3_label?: string
  },
): string {
  const labels = [item.department_label, item.department_2_label, item.department_3_label].filter(Boolean)
  if (labels.length) return labels.join(' / ')
  const ids = assignedDepartments(item)
  return ids.join(' / ') || 'Unassigned'
}

function normalizeChecklistAction(text: string | undefined): string {
  return (text || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Fill missing department fields from the discharge template master. */
export function mergeChecklistWithTemplateDepartments<T extends DischargeChecklistTemplateRow>(
  items: T[],
  templateItems: DischargeChecklistTemplateRow[],
): T[] {
  if (!templateItems.length) return items

  const byAction = new Map<string, DischargeChecklistTemplateRow>()
  const bySr = new Map<string, DischargeChecklistTemplateRow>()
  for (const row of templateItems) {
    const action = normalizeChecklistAction(row.action_required)
    if (action && !byAction.has(action)) byAction.set(action, row)
    const sr = (row.sr_num || '').trim()
    if (sr && !bySr.has(sr)) bySr.set(sr, row)
  }

  return items.map((item) => {
    const sr = (item.sr_num || '').trim()
    const templateRow =
      (sr && bySr.get(sr)) || byAction.get(normalizeChecklistAction(item.action_required))
    if (!templateRow) {
      return {
        ...item,
        department_label: item.department_label || item.department,
      }
    }

    const department = item.department || templateRow.department
    const department_2 = item.department_2 || templateRow.department_2
    const department_3 = item.department_3 || templateRow.department_3

    return {
      ...item,
      department,
      department_2,
      department_3,
      department_label: item.department_label || templateRow.department_label || department,
      department_2_label: item.department_2_label || templateRow.department_2_label || department_2,
      department_3_label: item.department_3_label || templateRow.department_3_label || department_3,
    }
  })
}
