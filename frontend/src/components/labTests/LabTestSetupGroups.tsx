import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlaskConical, Layers, Pencil } from 'lucide-react'
import { fetchLabTestTemplateList, type LabTestTemplateListRow } from '../../services/common'
import { DashboardCard } from '../ui/DashboardCard'

interface LabTestSetupGroupsProps {
  refreshKey?: number
  onEditClick?: (name: string) => void
}

/** True group template (parent of children). */
function isGroupTemplate(row: LabTestTemplateListRow): boolean {
  return Boolean(row.is_group)
}

/**
 * Single template with no lab_group — treated as its own one-test "group"
 * in Lab Setup (appears in parents and as its sole child).
 */
function isStandaloneSingle(row: LabTestTemplateListRow): boolean {
  return !row.is_group && !(row.lab_group || '').trim()
}

function childCountForParent(allRows: LabTestTemplateListRow[], parent: LabTestTemplateListRow): number {
  if (isStandaloneSingle(parent)) return 1
  return allRows.filter(
    (r) => !r.is_group && (r.lab_group || '').trim() === parent.name && !r.disabled,
  ).length
}

/**
 * Lab Setup tab: compact parent (group) list on top; children of the selected
 * parent in a details card below.
 * Ungrouped singles are shown as a group of one.
 */
export const LabTestSetupGroups = ({ refreshKey = 0, onEditClick }: LabTestSetupGroupsProps) => {
  const [allRows, setAllRows] = useState<LabTestTemplateListRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedParent, setSelectedParent] = useState<string | null>(null)
  const [parentSearch, setParentSearch] = useState('')

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

  const parents = useMemo(() => {
    // Real groups + ungrouped singles (each single acts as its own group).
    const list = allRows.filter(
      (r) => !r.disabled && (isGroupTemplate(r) || isStandaloneSingle(r)),
    )
    list.sort((a, b) =>
      (a.lab_test_name || a.name).localeCompare(b.lab_test_name || b.name, undefined, {
        sensitivity: 'base',
      }),
    )
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
    // Standalone single → show itself as the only child.
    if (isStandaloneSingle(selectedParentRow)) return [selectedParentRow]
    return allRows.filter(
      (r) =>
        !r.is_group &&
        (r.lab_group || '').trim() === selectedParentRow.name &&
        !r.disabled,
    )
  }, [allRows, selectedParentRow])

  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      <DashboardCard
        title="Lab groups (parents)"
        filterable={false}
        noHeightLimit
        className="shrink-0"
      >
        <div className="flex flex-col gap-2 p-1">
          <input
            type="search"
            value={parentSearch}
            onChange={(e) => setParentSearch(e.target.value)}
            placeholder="Search groups or singles…"
            className="w-full max-w-sm rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {loading ? (
            <div className="text-center text-sm text-slate-400 py-3">Loading…</div>
          ) : error ? (
            <div className="text-sm text-red-600 py-2">{error}</div>
          ) : parents.length === 0 ? (
            <div className="text-center text-sm text-slate-400 py-3">
              {parentSearch.trim() ? 'No templates match your search' : 'NO LAB TEMPLATES YET'}
            </div>
          ) : (
            <div
              className="overflow-y-auto max-h-40 rounded-md border border-slate-100"
              style={{ scrollbarWidth: 'thin' }}
            >
              <div className="flex flex-col divide-y divide-slate-100">
                {parents.map((p) => {
                  const active = p.name === selectedParent
                  const standalone = isStandaloneSingle(p)
                  const count = childCountForParent(allRows, p)
                  return (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => setSelectedParent(p.name)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                        active
                          ? 'bg-violet-50 text-violet-900'
                          : 'bg-white text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      {standalone ? (
                        <FlaskConical
                          className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-violet-600' : 'text-slate-400'}`}
                        />
                      ) : (
                        <Layers
                          className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-violet-600' : 'text-slate-400'}`}
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{p.lab_test_name || p.name}</span>
                        <span className="ml-1.5 font-mono text-[11px] text-slate-400">{p.name}</span>
                      </span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          standalone
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-violet-100 text-violet-700'
                        }`}
                      >
                        {standalone ? 'Single' : 'Group'}
                      </span>
                      {p.department ? (
                        <span className="shrink-0 text-[11px] text-slate-500">{p.department}</span>
                      ) : null}
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                          active
                            ? 'bg-violet-200/80 text-violet-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {count}
                      </span>
                      {onEditClick ? (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation()
                            onEditClick(p.name)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation()
                              e.preventDefault()
                              onEditClick(p.name)
                            }
                          }}
                          className="shrink-0 rounded border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                          title={standalone ? 'Edit template' : 'Edit group template'}
                        >
                          <Pencil className="h-3 w-3" />
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </DashboardCard>

      <DashboardCard
        title={
          selectedParentRow
            ? `${isStandaloneSingle(selectedParentRow) ? 'Test' : 'Children'} — ${
                selectedParentRow.lab_test_name || selectedParentRow.name
              }`
            : 'Children'
        }
        filterable={false}
        noHeightLimit
        className="flex-1 min-h-0"
      >
        {!selectedParent ? (
          <div className="text-center text-sm text-slate-400 py-8">Select a lab group above</div>
        ) : children.length === 0 ? (
          <div className="text-center text-sm text-slate-400 py-8">
            No child templates linked to this group
          </div>
        ) : (
          <div className="overflow-auto max-h-[min(55vh,520px)]" style={{ scrollbarWidth: 'thin' }}>
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 z-10">
                <tr className="text-left">
                  <th className="px-3 py-2 text-xs font-semibold text-slate-600">ID</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-600">Name</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-600">Department</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-600">Format</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-600">Unit</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-600">Rate</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {children.map((row) => (
                  <tr key={row.name} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-slate-700">{row.name}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">
                      {row.lab_test_name || '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{row.department || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {row.lab_test_template_type || '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{row.lab_test_uom || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {row.lab_test_rate != null ? row.lab_test_rate : '—'}
                    </td>
                    <td className="px-2 py-2">
                      {onEditClick ? (
                        <button
                          type="button"
                          onClick={() => onEditClick(row.name)}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                          title="Edit template"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashboardCard>
    </div>
  )
}
