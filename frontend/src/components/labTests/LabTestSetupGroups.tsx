import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Pencil } from 'lucide-react'
import {
  bulkUpdateLabTestTemplatesQuick,
  fetchLabTestTemplateList,
  fetchUoms,
  type LabTestTemplateListRow,
  type LinkFieldOption,
} from '../../services/common'
import { fetchLabMasterListHtml } from '../../services/labTests'
import { DashboardCard } from '../ui/DashboardCard'
import { toast } from '../../hooks/useToast'
import { useCareContext } from '../../providers/CareContextProvider'

interface LabTestSetupGroupsProps {
  refreshKey?: number
  onEditClick?: (name: string) => void
}

type ChildDraft = {
  lab_test_name: string
  result_kind: 'Single' | 'Multiple'
  result_mul_val: string
  female_min_range: string
  female_max_range: string
  male_min_range: string
  male_max_range: string
  min_range: string
  max_range: string
  lab_test_uom: string
  lab_test_rate: string
  op_rate: string
}

/** True group template (parent of children). */
function isGroupTemplate(row: LabTestTemplateListRow): boolean {
  return Boolean(row.is_group)
}

function formatRate(value: number | string | null | undefined): string {
  if (value == null || value === '') return ''
  const n = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(n)) return String(value)
  return String(n)
}

function asStr(value: unknown): string {
  if (value == null) return ''
  return String(value)
}

function ipRate(row: LabTestTemplateListRow): string {
  return formatRate(row.inpatient_rate ?? row.lab_test_rate)
}

function opRate(row: LabTestTemplateListRow): string {
  return formatRate(row.outpatient_rate ?? row.op_rate)
}

function isMultipleResultType(row: LabTestTemplateListRow): boolean {
  if (row.is_multiple === 1 || row.is_multiple === true) return true
  const v = asStr(row.result_type).trim().toUpperCase()
  return v === 'M' || v === 'MULTIPLE'
}

function draftFromRow(row: LabTestTemplateListRow): ChildDraft {
  return {
    lab_test_name: asStr(row.lab_test_name),
    result_kind: isMultipleResultType(row) ? 'Multiple' : 'Single',
    result_mul_val: asStr(row.result_mul_val),
    female_min_range: asStr(row.female_min_range),
    female_max_range: asStr(row.female_max_range),
    male_min_range: asStr(row.male_min_range),
    male_max_range: asStr(row.male_max_range),
    min_range: asStr(row.min_range),
    max_range: asStr(row.max_range),
    lab_test_uom: asStr(row.lab_test_uom),
    lab_test_rate: ipRate(row),
    op_rate: opRate(row),
  }
}

function draftsEqual(a: ChildDraft, b: ChildDraft): boolean {
  return (
    a.lab_test_name === b.lab_test_name &&
    a.result_kind === b.result_kind &&
    a.result_mul_val === b.result_mul_val &&
    a.female_min_range === b.female_min_range &&
    a.female_max_range === b.female_max_range &&
    a.male_min_range === b.male_min_range &&
    a.male_max_range === b.male_max_range &&
    a.min_range === b.min_range &&
    a.max_range === b.max_range &&
    a.lab_test_uom === b.lab_test_uom &&
    a.lab_test_rate === b.lab_test_rate &&
    a.op_rate === b.op_rate
  )
}

function parseOptionalNumber(value: string | number | null | undefined): number | null {
  const t = asStr(value).trim()
  if (!t) return null
  const n = Number(t)
  return Number.isNaN(n) ? null : n
}

function trimOrNull(value: string | number | null | undefined): string | null {
  const t = asStr(value).trim()
  return t || null
}

function trimOrEmpty(value: string | number | null | undefined): string {
  return asStr(value).trim()
}

/** LAB-001, LAB-002, LAB-010 — not lexicographic LAB-1, LAB-10, LAB-2. */
function compareLabTestNo(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

const cellInputClass =
  'w-full min-w-[2.75rem] max-w-[6.5rem] rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] text-slate-800 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

/**
 * Lab Setup tab: compact parent (group) list on top; children of the selected
 * parent in a details card below (inline-editable + Save).
 */
export const LabTestSetupGroups = ({ refreshKey = 0, onEditClick }: LabTestSetupGroupsProps) => {
  const { userCostCenter } = useCareContext()
  const [allRows, setAllRows] = useState<LabTestTemplateListRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedParent, setSelectedParent] = useState<string | null>(null)
  const [parentSearch, setParentSearch] = useState('')
  const [drafts, setDrafts] = useState<Record<string, ChildDraft>>({})
  const [saving, setSaving] = useState(false)
  const [exportingMasterList, setExportingMasterList] = useState(false)
  const [uomOptions, setUomOptions] = useState<LinkFieldOption[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchLabTestTemplateList()
      setAllRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load templates')
      setAllRows([])
    } finally {
      setLoading(false)
    }
  }, [refreshKey])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    fetchUoms()
      .then((opts) => {
        if (!cancelled) setUomOptions(opts)
      })
      .catch(() => {
        if (!cancelled) setUomOptions([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const parents = useMemo(() => {
    // Only true group templates — do not list standalone singles here.
    const list = allRows.filter((r) => !r.disabled && isGroupTemplate(r))
    list.sort((a, b) => compareLabTestNo(a.name, b.name))
    const q = parentSearch.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.lab_test_name || '').toLowerCase().includes(q) ||
        (r.department || '').toLowerCase().includes(q),
    )
  }, [allRows, parentSearch])

  useEffect(() => {
    if (!parents.length) {
      setSelectedParent(null)
      return
    }
    if (selectedParent && parents.some((p) => p.name === selectedParent)) return
    setSelectedParent(parents[0].name)
  }, [parents, selectedParent])

  const selectedParentRow = useMemo(
    () => parents.find((p) => p.name === selectedParent) || null,
    [parents, selectedParent],
  )

  const children = useMemo(() => {
    if (!selectedParentRow) return []
    return allRows
      .filter(
        (r) =>
          !r.is_group &&
          (r.lab_group || '').trim() === selectedParentRow.name &&
          !r.disabled,
      )
      .sort((a, b) => compareLabTestNo(a.name, b.name))
  }, [allRows, selectedParentRow])

  // Reset drafts when the visible children set changes (parent switch / reload).
  useEffect(() => {
    const next: Record<string, ChildDraft> = {}
    for (const row of children) {
      next[row.name] = draftFromRow(row)
    }
    setDrafts(next)
  }, [children])

  const dirtyNames = useMemo(() => {
    const names: string[] = []
    for (const row of children) {
      const draft = drafts[row.name]
      if (!draft) continue
      if (!draftsEqual(draft, draftFromRow(row))) names.push(row.name)
    }
    return names
  }, [children, drafts])

  const updateDraft = (name: string, patch: Partial<ChildDraft>) => {
    setDrafts((prev) => {
      const base = prev[name] || draftFromRow(children.find((c) => c.name === name)!)
      return { ...prev, [name]: { ...base, ...patch } }
    })
  }

  const handleSave = async () => {
    if (!dirtyNames.length) {
      toast.info('No changes to save')
      return
    }
    setSaving(true)
    try {
      const updates: Array<{ name: string; fields: Record<string, unknown> }> = []
      for (const name of dirtyNames) {
        const draft = drafts[name]
        const original = children.find((c) => c.name === name)
        if (!draft || !original) continue
        const baseline = draftFromRow(original)
        if (draftsEqual(draft, baseline)) continue

        updates.push({
          name,
          fields: {
            lab_test_name: trimOrEmpty(draft.lab_test_name),
            result_type: draft.result_kind === 'Multiple' ? 'M' : 'S',
            is_multiple: draft.result_kind === 'Multiple' ? 1 : 0,
            result_mul_val:
              draft.result_kind === 'Multiple' ? trimOrNull(draft.result_mul_val) : null,
            female_min_range: trimOrNull(draft.female_min_range),
            female_max_range: trimOrNull(draft.female_max_range),
            male_min_range: trimOrNull(draft.male_min_range),
            male_max_range: trimOrNull(draft.male_max_range),
            min_range: trimOrNull(draft.min_range),
            max_range: trimOrNull(draft.max_range),
            lab_test_uom: trimOrNull(draft.lab_test_uom),
            lab_test_rate: parseOptionalNumber(draft.lab_test_rate),
            op_rate: parseOptionalNumber(draft.op_rate),
          },
        })
      }

      if (!updates.length) {
        toast.info('No changes to save')
        return
      }

      const result = await bulkUpdateLabTestTemplatesQuick(updates)
      const ok = result.updated.length
      const failed = result.failed.length

      // Apply saved drafts locally — avoid a full list refetch after save.
      if (ok > 0) {
        const saved = new Set(result.updated)
        setAllRows((prev) =>
          prev.map((row) => {
            if (!saved.has(row.name)) return row
            const draft = drafts[row.name]
            if (!draft) return row
            const ip = parseOptionalNumber(draft.lab_test_rate)
            const op = parseOptionalNumber(draft.op_rate)
            return {
              ...row,
              lab_test_name: trimOrEmpty(draft.lab_test_name),
              result_type: draft.result_kind === 'Multiple' ? 'M' : 'S',
              is_multiple: draft.result_kind === 'Multiple' ? 1 : 0,
              result_mul_val:
                draft.result_kind === 'Multiple' ? trimOrEmpty(draft.result_mul_val) : '',
              female_min_range: trimOrEmpty(draft.female_min_range),
              female_max_range: trimOrEmpty(draft.female_max_range),
              male_min_range: trimOrEmpty(draft.male_min_range),
              male_max_range: trimOrEmpty(draft.male_max_range),
              min_range: trimOrEmpty(draft.min_range),
              max_range: trimOrEmpty(draft.max_range),
              lab_test_uom: trimOrEmpty(draft.lab_test_uom),
              lab_test_rate: ip ?? 0,
              op_rate: op ?? undefined,
              inpatient_rate: ip ?? 0,
              outpatient_rate: op ?? 0,
            }
          }),
        )
      }

      if (failed === 0) {
        toast.success(`Saved ${ok} template${ok === 1 ? '' : 's'}`)
      } else if (ok > 0) {
        toast.error(`Saved ${ok}, failed ${failed}`)
      } else {
        toast.error(result.failed[0]?.error || 'Failed to save template changes')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save template changes')
    } finally {
      setSaving(false)
    }
  }

  const saveHeader = (
    <button
      type="button"
      onClick={() => void handleSave()}
      disabled={saving || dirtyNames.length === 0}
      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
        dirtyNames.length > 0 && !saving
          ? 'bg-primary text-white hover:bg-primary/90'
          : 'cursor-not-allowed bg-slate-200 text-slate-500'
      }`}
      title={
        dirtyNames.length
          ? `Save ${dirtyNames.length} changed template${dirtyNames.length === 1 ? '' : 's'}`
          : 'No unsaved changes'
      }
    >
      {saving ? 'Saving…' : dirtyNames.length ? `Save (${dirtyNames.length})` : 'Save'}
    </button>
  )

  const downloadMasterList = async () => {
    setExportingMasterList(true)
    try {
      const html = await fetchLabMasterListHtml({
        costCenter: userCostCenter || undefined,
      })
      const win = window.open('', '_blank', 'width=1200,height=900')
      if (!win) {
        toast.error('Pop-up blocked. Allow pop-ups to download the PDF.')
        return
      }
      win.document.open()
      win.document.write(html)
      win.document.close()
      win.focus()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to download lab master list')
    } finally {
      setExportingMasterList(false)
    }
  }

  const masterListButton = (
    <button
      type="button"
      onClick={() => void downloadMasterList()}
      disabled={loading || exportingMasterList}
      className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
      title="Download Lab Test Price List"
      aria-label="Download Lab Test Price List"
    >
      <Download className="h-3.5 w-3.5" strokeWidth={2.25} />
    </button>
  )

  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      <DashboardCard
        title="Lab groups (parents)"
        filterable={false}
        noHeightLimit
        className="shrink-0"
        headerExtra={masterListButton}
      >
        <div className="flex flex-col gap-2 p-1">
          <input
            type="search"
            value={parentSearch}
            onChange={(e) => setParentSearch(e.target.value)}
            placeholder="Search groups…"
            className="w-full max-w-sm rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {loading ? (
            <div className="text-center text-sm text-slate-400 py-3">Loading…</div>
          ) : error ? (
            <div className="text-sm text-red-600 py-2">{error}</div>
          ) : parents.length === 0 ? (
            <div className="text-center text-sm text-slate-400 py-3">
              {parentSearch.trim() ? 'No groups match your search' : 'NO LAB GROUPS YET'}
            </div>
          ) : (
            <div
              className="overflow-y-auto max-h-48 rounded-md border border-slate-100"
              style={{ scrollbarWidth: 'thin' }}
            >
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr className="text-left">
                    <th className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                      ID
                    </th>
                    <th className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Name
                    </th>
                    <th className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 text-right whitespace-nowrap">
                      IP
                    </th>
                    <th className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 text-right whitespace-nowrap">
                      OP
                    </th>
                    <th className="px-2 py-1.5 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parents.map((p) => {
                    const active = p.name === selectedParent
                    return (
                      <tr
                        key={p.name}
                        onClick={() => setSelectedParent(p.name)}
                        className={`cursor-pointer transition-colors ${
                          active
                            ? 'bg-violet-50 text-violet-900'
                            : 'bg-white text-slate-800 hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-3 py-2 font-mono text-[11px] whitespace-nowrap text-slate-600">
                          {p.name}
                        </td>
                        <td className="px-3 py-2 font-medium min-w-0">
                          <span className="line-clamp-1">{p.lab_test_name || p.name}</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-[12px] text-slate-700 whitespace-nowrap">
                          {ipRate(p) || '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-[12px] text-slate-700 whitespace-nowrap">
                          {opRate(p) || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                          {onEditClick ? (
                            <button
                              type="button"
                              onClick={() => onEditClick(p.name)}
                              className="inline-flex items-center rounded border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                              title="Edit group template"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DashboardCard>

      <DashboardCard
        title={
          selectedParentRow
            ? `Children — ${selectedParentRow.lab_test_name || selectedParentRow.name}`
            : 'Children'
        }
        filterable={false}
        noHeightLimit
        className="flex-1 min-h-0"
        headerExtra={children.length > 0 ? saveHeader : undefined}
      >
        {!selectedParent ? (
          <div className="text-center text-sm text-slate-400 py-8">Select a lab group above</div>
        ) : children.length === 0 ? (
          <div className="text-center text-sm text-slate-400 py-8">
            No child templates linked to this group
          </div>
        ) : (
          <div className="overflow-auto max-h-[min(55vh,520px)]" style={{ scrollbarWidth: 'thin' }}>
            <table className="min-w-full text-[11px] leading-tight">
              <thead className="sticky top-0 bg-slate-50 z-10">
                <tr className="text-left">
                  <th className="px-1.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">ID</th>
                  <th className="px-1.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Name</th>
                  <th className="px-1.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">Result</th>
                  <th
                    className="px-1.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap"
                    title="Result Mul Val (when Multiple)"
                  >
                    MaX
                  </th>
                  <th className="px-1.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">F-Min</th>
                  <th className="px-1.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">F-Max</th>
                  <th className="px-1.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">M-Min</th>
                  <th className="px-1.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">M-Max</th>
                  <th className="px-1.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">G-Min</th>
                  <th className="px-1.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">G-Max</th>
                  <th className="px-1.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">Unit</th>
                  <th className="px-1.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">IP</th>
                  <th className="px-1.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">OP</th>
                  <th className="px-1 py-1.5 w-7" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {children.map((row) => {
                  const draft = drafts[row.name] || draftFromRow(row)
                  const dirty = !draftsEqual(draft, draftFromRow(row))
                  const multiple = draft.result_kind === 'Multiple'
                  return (
                    <tr
                      key={row.name}
                      className={dirty ? 'bg-amber-50/60 hover:bg-amber-50' : 'hover:bg-slate-50'}
                    >
                      <td className="px-1.5 py-1 font-mono text-slate-600 whitespace-nowrap">
                        {row.name}
                      </td>
                      <td className="px-1 py-0.5">
                        <input
                          type="text"
                          value={draft.lab_test_name}
                          onChange={(e) => updateDraft(row.name, { lab_test_name: e.target.value })}
                          className={`${cellInputClass} max-w-[9rem] min-w-[5rem]`}
                        />
                      </td>
                      <td className="px-1 py-0.5">
                        <select
                          value={draft.result_kind}
                          onChange={(e) =>
                            updateDraft(row.name, {
                              result_kind: e.target.value as 'Single' | 'Multiple',
                              result_mul_val:
                                e.target.value === 'Multiple' ? draft.result_mul_val : '',
                            })
                          }
                          className={`${cellInputClass} max-w-[5.5rem]`}
                        >
                          <option value="Single">Single</option>
                          <option value="Multiple">Multiple</option>
                        </select>
                      </td>
                      <td className="px-1 py-0.5">
                        {multiple ? (
                          <input
                            type="text"
                            value={draft.result_mul_val}
                            onChange={(e) =>
                              updateDraft(row.name, { result_mul_val: e.target.value })
                            }
                            className={`${cellInputClass} max-w-[7rem]`}
                            title="Result Mul Val"
                          />
                        ) : (
                          <span className="px-1 text-slate-400">—</span>
                        )}
                      </td>
                      {(
                        [
                          ['female_min_range', draft.female_min_range],
                          ['female_max_range', draft.female_max_range],
                          ['male_min_range', draft.male_min_range],
                          ['male_max_range', draft.male_max_range],
                          ['min_range', draft.min_range],
                          ['max_range', draft.max_range],
                        ] as const
                      ).map(([key, value]) => (
                        <td key={key} className="px-1 py-0.5">
                          <input
                            type="text"
                            value={value}
                            onChange={(e) => updateDraft(row.name, { [key]: e.target.value })}
                            className={`${cellInputClass} tabular-nums`}
                          />
                        </td>
                      ))}
                      <td className="px-1 py-0.5">
                        <select
                          value={draft.lab_test_uom}
                          onChange={(e) => updateDraft(row.name, { lab_test_uom: e.target.value })}
                          className={`${cellInputClass} max-w-[5.5rem]`}
                          title="Lab Test UOM"
                        >
                          <option value="">—</option>
                          {draft.lab_test_uom &&
                          !uomOptions.some(
                            (o) => o.name === draft.lab_test_uom || o.label === draft.lab_test_uom,
                          ) ? (
                            <option value={draft.lab_test_uom}>{draft.lab_test_uom}</option>
                          ) : null}
                          {uomOptions.map((o) => (
                            <option key={o.name} value={o.name}>
                              {o.label || o.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-1 py-0.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={draft.lab_test_rate}
                          onChange={(e) => updateDraft(row.name, { lab_test_rate: e.target.value })}
                          className={`${cellInputClass} tabular-nums max-w-[4.5rem]`}
                        />
                      </td>
                      <td className="px-1 py-0.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={draft.op_rate}
                          onChange={(e) => updateDraft(row.name, { op_rate: e.target.value })}
                          className={`${cellInputClass} tabular-nums max-w-[4.5rem]`}
                        />
                      </td>
                      <td className="px-1 py-1">
                        {onEditClick ? (
                          <button
                            type="button"
                            onClick={() => onEditClick(row.name)}
                            className="inline-flex items-center rounded border border-slate-200 p-0.5 text-slate-500 hover:bg-slate-50"
                            title="Open full edit"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </DashboardCard>
    </div>
  )
}
