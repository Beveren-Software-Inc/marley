import type { LabTest, LabTestLine } from '../../services/labTests'

/** Open the parent Lab Test document from a flattened legacy line row. */
export function resolveLabTestDocName(lt: LabTest): string {
  return lt.legacy_parent_name || lt.name
}

function legacyLineSortKey(line: LabTestLine, index: number): number {
  const sr = line.sr_num
  if (sr === undefined || sr === null || sr === '') return index
  const n = Number(sr)
  return Number.isFinite(n) ? n : index
}

/** Flatten legacy imports: one list row per LAB 00-04 child line (history singles). */
export function expandLegacyLabTestsForDisplay(labTests: LabTest[]): LabTest[] {
  const expanded: LabTest[] = []

  for (const parent of labTests) {
    const isLegacy = Boolean(parent.is_legacy_import)
    const lines = parent.lab_test_lines || []

    if (!isLegacy || lines.length === 0) {
      expanded.push(parent)
      continue
    }

    const sorted = [...lines].sort(
      (a, b) => legacyLineSortKey(a, lines.indexOf(a)) - legacyLineSortKey(b, lines.indexOf(b))
    )

    for (let index = 0; index < sorted.length; index += 1) {
      const line = sorted[index]
      const sub = (line.lab_sub_num || '').trim()
      const subTemplateName = (line.lab_sub_template_name || '').trim()
      const group = (line.group_name || line.lab_group_num || '').trim()
      const lineKey = `${parent.name}::${line.sr_num || index}::${sub || index}`
      const result = (line.lab_result_value || '').trim()
      const lineAmount =
        typeof line.lab_amt_net === 'number'
          ? line.lab_amt_net
          : typeof line.lab_amt_book === 'number'
            ? line.lab_amt_book
            : undefined

      expanded.push({
        ...parent,
        name: lineKey,
        legacy_parent_name: parent.name,
        is_legacy_line_row: true,
        legacy_line_key: lineKey,
        lab_test_name: subTemplateName || sub || group || parent.lab_test_name || parent.template || parent.name,
        template: line.lab_group_num || parent.template,
        lab_test_group: line.lab_group_num || parent.lab_test_group,
        custom_result: result,
        results: result,
        result_flag: '',
        amount: lineAmount ?? parent.amount,
        grand_total: lineAmount ?? parent.grand_total,
        date: parent.date,
        result_date: parent.result_date || parent.date,
        submitted_date: parent.submitted_date,
        creation: parent.creation,
        is_group_lab_test: 0,
        service_request: undefined,
      })
    }
  }

  return expanded
}

export function isLegacyHistoryLabRow(lt: LabTest): boolean {
  return Boolean(lt.is_legacy_line_row || (lt.is_legacy_import && !lt.legacy_parent_name))
}

/** Status pill colors — keep in sync with LabTestList / LabTestDetails. */
export const LAB_TEST_STATUS_COLORS: Record<string, string> = {
  Reviewed: 'success',
  Rejected: 'danger',
  Completed: 'success',
  'Pending Review': 'warning',
  Submitted: 'info',
  Cancelled: 'default',
  Draft: 'warning',
  Pending: 'warning',
  Requested: 'info',
  'Awaiting sample collection': 'warning',
  'Sample Collection in Progress': 'info',
  'Sample collection in progress': 'info',
  'Sample Collected': 'info',
  'Testing in progress': 'info',
}

export function labTestStatusColor(status?: string | null): string {
  const key = (status || 'Draft').trim()
  return LAB_TEST_STATUS_COLORS[key] || 'default'
}
