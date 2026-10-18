import { Fragment } from 'react'
import type { LabTestTemplateDetails, NormalTestResultRow } from '../../services/labTests'

export interface TotalInclusionLine {
  title: string
  /** Collection the total is shown under. */
  collection: string
  instructions?: string
  /** Value from Multiple Results.total, shown in the Result column. */
  total?: number | string | null
  male_min_range?: number | string | null
  male_max_range?: number | string | null
  female_min_range?: number | string | null
  female_max_range?: number | string | null
}

export function flagOn(value: unknown): boolean {
  if (value === true || value === 1) return true
  const text = String(value ?? '').trim().toLowerCase()
  return text === '1' || text === 'yes' || text === 'true'
}

/** Multiple template entered as unit rows, grouped by collection. */
export function groupCollectionsEnabled(details: LabTestTemplateDetails): boolean {
  return (
    flagOn(details.is_multiple) &&
    !flagOn(details.display_one_result) &&
    flagOn(details.group_as_per_collection)
  )
}

export function groupResultRows(
  rows: NormalTestResultRow[],
  enabled: boolean,
): Array<{ name: string; indexes: number[] }> {
  if (!enabled) return [{ name: '', indexes: rows.map((_, index) => index) }]
  const order: string[] = []
  const groups = new Map<string, number[]>()
  rows.forEach((row, index) => {
    const name = (row.collection_name || '').trim() || 'Other'
    if (!groups.has(name)) {
      groups.set(name, [])
      order.push(name)
    }
    groups.get(name)!.push(index)
  })
  return order.map((name) => ({ name, indexes: groups.get(name) || [] }))
}

function rangeNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : parseFloat(String(value))
  return Number.isFinite(n) ? n : null
}

/** Rows ticked Total Inclusion: title + range + instructions, not a result input. */
export function totalInclusionLines(details: LabTestTemplateDetails): TotalInclusionLine[] {
  if (!flagOn(details.is_multiple) || flagOn(details.display_one_result)) return []
  const lines: TotalInclusionLine[] = []
  for (const row of details.multiple_result_type || []) {
    if (!flagOn(row.total_inclusion)) continue
    const title = (row.test_unit || '').trim()
    if (!title) continue
    lines.push({
      title,
      collection: (row.total_inclusion_collection || '').trim(),
      instructions: row.instructions || '',
      total: row.total,
      male_min_range: row.male_min_range,
      male_max_range: row.male_max_range,
      female_min_range: row.female_min_range,
      female_max_range: row.female_max_range,
    })
  }
  return lines
}

export function totalInclusionTitles(details: LabTestTemplateDetails): Set<string> {
  return new Set(totalInclusionLines(details).map((line) => line.title))
}

/** Drop total-inclusion units so they are not offered as result inputs. */
export function withoutTotalInclusionRows(
  rows: NormalTestResultRow[],
  details: LabTestTemplateDetails,
): NormalTestResultRow[] {
  const titles = totalInclusionTitles(details)
  if (!titles.size) return rows
  return rows.filter((row) => !titles.has((row.lab_test_event || row.lab_test_name || '').trim()))
}

export function inclusionRange(
  line: TotalInclusionLine,
  sex?: string,
): { min: number | null; max: number | null } {
  const s = (sex || '').toLowerCase()
  const female = { min: rangeNumber(line.female_min_range), max: rangeNumber(line.female_max_range) }
  const male = { min: rangeNumber(line.male_min_range), max: rangeNumber(line.male_max_range) }
  if (s === 'female' && (female.min != null || female.max != null)) return female
  if (s === 'male' && (male.min != null || male.max != null)) return male
  if (male.min != null || male.max != null) return male
  if (female.min != null || female.max != null) return female
  return { min: null, max: null }
}

/** Sum of numeric results in one collection. Text results are skipped. */
export function collectionResultTotal(
  rows: Array<{ collection_name?: string; result_value?: string }>,
  collection: string,
): number | null {
  const target = collection.trim() || 'Other'
  let sum = 0
  let any = false
  for (const row of rows) {
    const name = (row.collection_name || '').trim() || 'Other'
    if (name !== target) continue
    const n = parseFloat(row.result_value || '')
    if (!Number.isFinite(n)) continue
    sum += n
    any = true
  }
  return any ? sum : null
}

/** Result-column value: the template Total when set, otherwise the collection sum. */
export function inclusionResultValue(
  line: TotalInclusionLine,
  rows: Array<{ collection_name?: string; result_value?: string }>,
): number | null {
  const fromField = rangeNumber(line.total)
  if (fromField != null) return fromField
  return collectionResultTotal(rows, line.collection || 'Other')
}

export function formatInclusionTotal(total: number | null): string {
  if (total == null) return '—'
  const rounded = Math.round(total * 1000) / 1000
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

export function visibleInstructions(html?: string): string {
  const raw = html || ''
  const text = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text ? raw : ''
}

export function inclusionsForCollection(
  details: LabTestTemplateDetails,
  collectionName: string,
): TotalInclusionLine[] {
  const target = (collectionName || '').trim()
  return totalInclusionLines(details).filter((line) => line.collection === target)
}

export function unmatchedInclusions(
  details: LabTestTemplateDetails,
  collectionNames: string[],
): TotalInclusionLine[] {
  const known = new Set(collectionNames.map((name) => (name || '').trim()))
  return totalInclusionLines(details).filter((line) => !known.has(line.collection))
}

export function TotalInclusionRows({
  line,
  rows,
  sex,
  colSpan,
  showStatus,
}: {
  line: TotalInclusionLine
  rows: Array<{ collection_name?: string; result_value?: string }>
  sex?: string
  colSpan: number
  showStatus: boolean
}) {
  const { min, max } = inclusionRange(line, sex)
  const total = inclusionResultValue(line, rows)
  const totalText = formatInclusionTotal(total)
  const low = total != null && min != null && total < min
  const high = total != null && max != null && total > max
  const instructions = visibleInstructions(line.instructions)
  return (
    <Fragment>
      <tr className={low ? 'bg-yellow-50' : high ? 'bg-red-50' : 'bg-slate-50'}>
        <td className="px-2 py-1">
          <div className="text-xs font-semibold text-slate-900">{line.title}</div>
        </td>
        <td className="px-2 py-1 text-center text-xs font-medium text-slate-700">{min != null ? min : '—'}</td>
        <td className="px-2 py-1 text-center text-xs font-medium text-slate-700">{max != null ? max : '—'}</td>
        <td className="px-2 py-1 text-xs font-semibold text-slate-900">{totalText}</td>
        {showStatus ? (
          <td className="px-2 py-1 text-xs text-slate-500">{low ? 'Low' : high ? 'High' : total != null && (min != null || max != null) ? 'Normal' : '—'}</td>
        ) : null}
        <td className="px-2 py-1" />
      </tr>
      {instructions ? (
        <tr className="bg-slate-50">
          <td colSpan={colSpan} className="px-2 py-1 text-[11px] leading-snug text-slate-600 [&_p]:m-0">
            <div dangerouslySetInnerHTML={{ __html: instructions }} />
          </td>
        </tr>
      ) : null}
    </Fragment>
  )
}

/** Saved-result views: title, range, collection total, instructions. No result input. */
export function SavedInclusionRows({
  line,
  rows,
  sex,
  colSpan,
}: {
  line: TotalInclusionLine
  rows: Array<{ collection_name?: string; result_value?: string }>
  sex?: string
  colSpan: number
}) {
  const { min, max } = inclusionRange(line, sex)
  const total = inclusionResultValue(line, rows)
  const range =
    min != null || max != null ? `${min != null ? min : '—'} – ${max != null ? max : '—'}` : '—'
  const instructions = visibleInstructions(line.instructions)
  return (
    <Fragment>
      <tr className="bg-slate-50">
        <td className="px-3 py-2 text-xs font-semibold text-slate-900">{line.title}</td>
        <td className="px-3 py-2 text-xs font-semibold text-slate-900">{formatInclusionTotal(total)}</td>
        <td colSpan={Math.max(colSpan - 2, 1)} className="px-3 py-2 text-xs text-slate-600">
          Range {range}
        </td>
      </tr>
      {instructions ? (
        <tr className="bg-slate-50">
          <td colSpan={colSpan} className="px-3 py-1.5 text-[11px] leading-snug text-slate-600 [&_p]:m-0">
            <div dangerouslySetInnerHTML={{ __html: instructions }} />
          </td>
        </tr>
      ) : null}
    </Fragment>
  )
}

export function SpecimenAndCommentFields({
  showSpecimen,
  specimen,
  onSpecimen,
  showComment,
  comment,
  onComment,
}: {
  showSpecimen: boolean
  specimen: string
  onSpecimen: (value: string) => void
  showComment: boolean
  comment: string
  onComment: (value: string) => void
}) {
  if (!showSpecimen && !showComment) return null
  return (
    <div className="space-y-1.5">
      {showSpecimen ? (
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-slate-600">Specimen Type</label>
          <input
            type="text"
            value={specimen}
            onChange={(e) => onSpecimen(e.target.value)}
            placeholder="Specimen type"
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      ) : null}
      {showComment ? (
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-slate-600">Comment</label>
          <textarea
            className="min-h-[44px] w-full rounded border border-slate-300 px-2 py-1 text-xs"
            value={comment}
            onChange={(e) => onComment(e.target.value)}
            placeholder="Comment for this lab test"
          />
        </div>
      ) : null}
    </div>
  )
}
