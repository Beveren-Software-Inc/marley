import type { LabTest, LabTestLine } from '../../services/labTests'

/**
 * Reference min/max for list UI.
 * Whole numbers → ``6``; values with a fraction → up to 3 decimals (``0.600000000`` → ``0.6``).
 */
export function formatLabRangeBound(value?: number | string | null): string {
  if (value === null || value === undefined) return ''
  const text = String(value).trim().replace(/,/g, '')
  if (!text) return ''
  const num = Number(text)
  if (!Number.isFinite(num)) return String(value).trim()
  if (Math.abs(num - Math.round(num)) < 1e-9) return String(Math.round(num))
  return String(parseFloat(num.toFixed(3)))
}

/** LAB-001, LAB-002, LAB-010 — natural order by template id, not display name. */
export function compareLabTestTemplateCode(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

export function sortLabRequestReviewGroups<
  T extends { template: string; tests?: Array<{ template: string }> },
>(groups: T[]): T[] {
  return [...groups]
    .sort((a, b) => compareLabTestTemplateCode(a.template, b.template))
    .map((g) => ({
      ...g,
      tests: [...(g.tests || [])].sort((a, b) =>
        compareLabTestTemplateCode(a.template, b.template),
      ),
    }))
}

export type LabResultFlag = '' | 'Low' | 'High' | 'Critically Low' | 'Critically High' | 'Normal'

/** Parse a reference range such as ``4 - 11``, ``4 – 11``, ``<200`` or ``>5``. */
export function parseLabReferenceRange(raw?: string | null): {
  min: number | null
  max: number | null
} {
  if (raw == null) return { min: null, max: null }
  const text = String(raw).replace(/[–—]/g, '-').replace(/,/g, '').trim()
  if (!text) return { min: null, max: null }

  const between = text.match(/^(-?\d+(?:\.\d+)?)\s*(?:-|to)\s*(-?\d+(?:\.\d+)?)$/i)
  if (between) return { min: Number(between[1]), max: Number(between[2]) }

  const upper = text.match(/^[<≤]\s*=?\s*(-?\d+(?:\.\d+)?)$/)
  if (upper) return { min: null, max: Number(upper[1]) }

  const lower = text.match(/^[>≥]\s*=?\s*(-?\d+(?:\.\d+)?)$/)
  if (lower) return { min: Number(lower[1]), max: null }

  return { min: null, max: null }
}

function finiteRangeBound(value?: number | string | null): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

/**
 * Result flag for a lab line, using the patient-specific bounds resolved by the
 * detail API and falling back to the stored normal-range text.
 */
export function labResultFlag(
  resultValue?: string | null,
  rangeMin?: number | string | null,
  rangeMax?: number | string | null,
  normalRange?: string | null,
): LabResultFlag {
  const text = (resultValue || '').replace(/,/g, '').trim()
  if (!text) return ''
  const value = Number(text)
  if (!Number.isFinite(value)) return ''

  let min = finiteRangeBound(rangeMin)
  let max = finiteRangeBound(rangeMax)
  // Templates store an unset pair as 0 / 0; do not flag against it.
  if (min === 0 && max === 0) {
    min = null
    max = null
  }
  if (min == null || max == null) {
    const parsed = parseLabReferenceRange(normalRange)
    if (min == null) min = parsed.min
    if (max == null) max = parsed.max
  }
  if (min == null && max == null) return ''

  // Match the list/critical-value convention used elsewhere in the lab UI.
  if (min != null && max != null) {
    if (value > max * 2) return 'Critically High'
    if (value < min * 0.5) return 'Critically Low'
  }
  if (max != null && value > max) return 'High'
  if (min != null && value < min) return 'Low'
  return 'Normal'
}

/** Open the parent Lab Test document from a flattened legacy line row. */
export function resolveLabTestDocName(lt: LabTest): string {
  return lt.legacy_parent_name || lt.name
}

/**
 * Result values stored inside a legacy ``custom_result`` HTML table.
 *
 * Oracle imports write the result as a table — ``Panel | Test Name | Test Code |
 * Result`` (older rows: ``Panel | Test Code | Result``) — so stripping the tags
 * leaves the labels glued to the value (``LAB-007-001 0.94``). Screens must show
 * the Result column only: ``['0.94']``.
 *
 * The stored HTML is authored through the result-save endpoint on an unfiltered
 * field, so it is parsed into an **inert** document (``DOMParser``) instead of a
 * live ``innerHTML`` sink: scripts never run and ``<img onerror>`` / other
 * handlers never fire while we only read the last cell of each row.
 */
export function resultValuesFromHtml(html?: string | null): string[] {
  const raw = (html || '').trim()
  if (!raw || !/<table[\s>]/i.test(raw) || typeof DOMParser === 'undefined') return []

  let doc: Document
  try {
    doc = new DOMParser().parseFromString(raw, 'text/html')
  } catch {
    return []
  }

  const values: string[] = []
  doc.querySelectorAll('table tr').forEach((row) => {
    const cells = Array.from(row.querySelectorAll('td'))
    // Header rows hold <th> only — they are not result lines.
    if (cells.length === 0) return
    const value = (cells[cells.length - 1].textContent || '').trim()
    if (value) values.push(value)
  })
  return values
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
      // Preserve the imported panel code/name so the report list can group
      // legacy child lines under a panel header (like current CBC groups).
      const groupCode = (line.lab_group_num || '').trim()
      const groupName = (line.group_name || '').trim()
      const group = groupName || groupCode || ''
      // Prefer the panel name resolved by the API (LAB-001 → CBC). Older API
      // responses only carry the code, so also use the parent template name
      // when this line belongs to the parent's primary panel.
      const resolvedGroupName = (line.lab_group_name || '').trim()
      const parentTemplate = (parent.template || '').trim()
      const parentGroupName =
        groupCode && parentTemplate && groupCode.toUpperCase() === parentTemplate.toUpperCase()
          ? (parent.lab_test_name || '').trim()
          : ''
      const groupDisplayName =
        resolvedGroupName ||
        (groupName && groupName.toUpperCase() !== groupCode.toUpperCase() ? groupName : '') ||
        parentGroupName ||
        (parent.lab_test_group_name || '').trim()
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
        legacy_sub_template: sub || undefined,
        lab_test_name: subTemplateName || sub || group || parent.lab_test_name || parent.template || parent.name,
        template: sub || line.lab_group_num || parent.template,
        lab_test_group: groupCode || group || parent.lab_test_group,
        lab_test_group_name: groupDisplayName || undefined,
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

/**
 * Key used to group lab rows for display.
 *
 * Modern grouped requests use the Service Request + panel code. Legacy imports
 * have no Service Request (their child lines are flattened for display), so the
 * child lines are scoped to their legacy parent document + panel instead. This
 * keeps an imported CBC's WBC/RBC/HGB/HCT lines under one group header without
 * merging panels from different historical reports.
 */
export function labTestDisplayGroupKey(lt: LabTest): string | null {
  const group = (lt.lab_test_group || '').trim()
  if (lt.is_legacy_line_row) {
    if (!group) return null
    const legacyParent = (lt.legacy_parent_name || '').trim()
    if (!legacyParent) return null
    return `legacy::${legacyParent}::${group}`
  }
  if (!lt.is_group_lab_test || !lt.service_request) return null
  const sr = (lt.service_request || '').trim()
  return group ? `${sr}::${group}` : sr
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
