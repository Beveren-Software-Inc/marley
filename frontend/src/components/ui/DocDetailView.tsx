import { useState, useEffect } from 'react'
import { fetchDoc } from '../../services/common'

const SKIP_KEYS = new Set([
  'owner', 'creation', 'modified', 'modified_by', 'docstatus', 'idx',
  'parent', 'parenttype', 'parentfield', 'naming_series', '__islocal', '__unsaved'
])

function formatLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
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

interface DocDetailViewProps {
  doctype: string
  name: string
  onUpdate?: () => void
}

export function DocDetailView({ doctype, name, onUpdate }: DocDetailViewProps) {
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
            {key.toLowerCase().includes('note') || key.toLowerCase().includes('comment') || key.toLowerCase().includes('warning') || key.toLowerCase().includes('instruction') ? (
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
