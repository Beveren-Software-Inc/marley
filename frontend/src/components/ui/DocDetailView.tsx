import { useState, useEffect } from 'react'
import { fetchDoc } from '../../services/common'

const SKIP_KEYS = new Set([
  'owner', 'creation', 'modified', 'modified_by', 'docstatus', 'idx',
  'parent', 'parenttype', 'parentfield', 'naming_series', '__islocal', '__unsaved'
])

const TABLE_ROW_SKIP = new Set([
  'owner', 'creation', 'modified', 'modified_by', 'docstatus', 'idx',
  'parent', 'parenttype', 'parentfield', 'doctype', 'name', '__islocal', '__unsaved'
])

function formatLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatCellValue(value: unknown): string {
  if (value == null || value === '') return '-'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return '-'
  if (typeof value === 'string' && (value.match(/^\d{4}-\d{2}-\d{2}/) || value.match(/^\d{4}-\d{2}-\d{2}T/))) {
    try {
      const d = new Date(value)
      if (!isNaN(d.getTime())) return d.toLocaleString()
    } catch {}
  }
  return String(value)
}

function formatValue(value: unknown): string {
  if (value == null || value === '') return '-'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'string' && (value.match(/^\d{4}-\d{2}-\d{2}/) || value.match(/^\d{4}-\d{2}-\d{2}T/))) {
    try {
      const d = new Date(value)
      if (!isNaN(d.getTime())) return d.toLocaleString()
    } catch {}
  }
  return String(value)
}

function isTableValue(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => item != null && typeof item === 'object' && !Array.isArray(item))
}

function TableFieldView({ value }: { value: Record<string, unknown>[] }) {
  if (value.length === 0) return <span className="text-slate-500">—</span>
  const keys = Array.from(
    value.reduce<Set<string>>((set, row) => {
      Object.keys(row).filter((k) => !TABLE_ROW_SKIP.has(k)).forEach((k) => set.add(k))
      return set
    }, new Set())
  ).sort((a, b) => {
    const order = ['action_required', 'department', 'date_time', 'description', 'name1', 'user']
    const ai = order.indexOf(a)
    const bi = order.indexOf(b)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.localeCompare(b)
  })
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="min-w-full text-sm border border-slate-200 rounded-md">
        <thead>
          <tr className="bg-slate-50">
            {keys.map((k) => (
              <th key={k} className="px-2 py-1.5 text-left font-medium text-slate-600 border-b border-slate-200">
                {formatLabel(k)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {value.map((row, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0">
              {keys.map((k) => (
                <td key={k} className="px-2 py-1.5 text-slate-800">
                  {formatCellValue(row[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface DocDetailViewProps {
  doctype: string
  name: string
  onUpdate?: () => void
}

export function DocDetailView({ doctype, name }: DocDetailViewProps) {
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchDoc(doctype, name)
      .then((data) => { if (!cancelled) setDoc(data) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [doctype, name])

  if (loading) return <div className="text-sm text-slate-500">Loading...</div>
  if (error) return <div className="text-sm text-red-600">{error}</div>
  if (!doc) return null

  const entries = Object.entries(doc)
    .filter(([k]) => !SKIP_KEYS.has(k) && !k.startsWith('_'))
    .sort(([a], [b]) => a.localeCompare(b))

  return (
    <dl className="space-y-3">
      {entries.map(([key, value]) => (
        <div key={key} className="border-b border-slate-100 pb-2 last:border-0">
          <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">{formatLabel(key)}</dt>
          <dd className="mt-0.5 text-sm text-slate-900 break-words">
            {isTableValue(value) ? (
              <TableFieldView value={value} />
            ) : key.toLowerCase().includes('note') || key.toLowerCase().includes('comment') || key.toLowerCase().includes('warning') || key.toLowerCase().includes('instruction') ? (
              <pre className="whitespace-pre-wrap font-sans text-slate-800 bg-slate-50 p-3 rounded-md text-sm">{formatValue(value)}</pre>
            ) : (
              formatValue(value)
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}
