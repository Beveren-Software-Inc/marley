import type { LabTestTemplateDetails, NormalTestResultRow } from '../../services/labTests'

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
