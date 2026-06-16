import { canEditUnassignedDischargeChecklistLine, isAdmin } from '../config/permissions'

export interface DischargeChecklistDepartmentScope {
  department?: string
  department_2?: string
}

export interface DischargeChecklistTemplateRow extends DischargeChecklistDepartmentScope {
  action_required?: string
  sr_num?: string
  department_label?: string
  department_2_label?: string
}

function normalizeDepartmentId(dept: string): string {
  return dept.trim().toLowerCase()
}

function departmentsMatch(userDept: string, assignedDept: string): boolean {
  return normalizeDepartmentId(userDept) === normalizeDepartmentId(assignedDept)
}

export function canUserEditDischargeChecklistItem(
  item: DischargeChecklistDepartmentScope,
  userDepartments: string[] | undefined,
  roles: string[] | undefined,
): boolean {
  if (roles?.length && isAdmin(roles)) {
    return true
  }

  const assigned = [item.department, item.department_2].filter(Boolean) as string[]
  if (assigned.length === 0) {
    return canEditUnassignedDischargeChecklistLine(roles)
  }

  const mine = userDepartments ?? []
  if (!mine.length) {
    return false
  }

  return assigned.some((dept) => mine.some((userDept) => departmentsMatch(userDept, dept)))
}

export function checklistItemDepartmentLabel(
  item: DischargeChecklistDepartmentScope & {
    department_label?: string
    department_2_label?: string
  },
): string {
  const labels = [item.department_label, item.department_2_label].filter(Boolean)
  if (labels.length) return labels.join(' / ')
  const ids = [item.department, item.department_2].filter(Boolean) as string[]
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
    if (!templateRow && item.department) {
      return {
        ...item,
        department_label: item.department_label || item.department,
      }
    }
    if (!templateRow) return item

    const department = item.department || templateRow.department
    const department_2 = item.department_2 || templateRow.department_2

    return {
      ...item,
      department,
      department_2,
      department_label: item.department_label || templateRow.department_label || department,
      department_2_label: item.department_2_label || templateRow.department_2_label || department_2,
    }
  })
}
