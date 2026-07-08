import { useState, useEffect } from 'react'
import { Check, X } from 'lucide-react'
import { fetchDoc } from '../../services/common'
import { RichTextContent } from './RichTextContent'

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

/** Check if table is a document/attachment table (has document URL field) — e.g. patient_document, patient_documents, documents */
function isDocumentTable(value: Record<string, unknown>[]): boolean {
  if (value.length === 0) return false
  const first = value[0] as Record<string, unknown>
  const docUrl = first.document ?? first.attach
  return typeof docUrl === 'string' && (docUrl.startsWith('/') || docUrl.startsWith('http'))
}

/** Render document/attachment table with clickable Open links (Patient Upload Document shape). */
function DocumentsTableFieldView({ value }: { value: Record<string, unknown>[] }) {
  if (value.length === 0) return <span className="text-slate-500">No documents</span>
  return (
    <div className="space-y-2">
      {(value as Array<Record<string, unknown>>).map((row, i) => {
        const docUrl = (row.document ?? row.attach) as string | undefined
        const file_name = (row.file_name ?? row.document_name) as string | undefined
        const document_type = row.document_type as string | undefined
        const transaction_no = row.transaction_no != null && row.transaction_no !== '' ? String(row.transaction_no) : ''
        const label = file_name || document_type || 'Document'
        const hasMeta = Boolean(document_type || transaction_no)
        return (
          <div key={i} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2">
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-800 truncate">{label}</div>
              {hasMeta && (
                <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 mt-0.5">
                  {document_type ? <span>Type: {document_type}</span> : null}
                  {transaction_no ? <span>Txn: {transaction_no}</span> : null}
                </div>
              )}
            </div>
            {docUrl && (
              <a href={docUrl.startsWith('http') ? docUrl : `${typeof window !== 'undefined' ? window.location.origin : ''}${docUrl}`} target="_blank" rel="noopener noreferrer" className="shrink-0 inline-flex items-center px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 rounded-md hover:bg-primary/5">
                Open
              </a>
            )}
          </div>
        )
      })}
    </div>
  )
}

function isChecklistTable(value: Record<string, unknown>[]): boolean {
  if (value.length === 0) return false
  const first = value[0]
  return 'checked' in first && ('item_name' in first || 'checklist' in first)
}

function isCheckedValue(value: unknown): boolean {
  return value === 1 || value === true || value === '1'
}

/** Checklist child rows — green tick when checked, X when not. */
function ChecklistTableFieldView({ value }: { value: Record<string, unknown>[] }) {
  if (value.length === 0) return <span className="text-slate-500">No checklist items</span>

  return (
    <ul className="space-y-2">
      {value.map((row, i) => {
        const checked = isCheckedValue(row.checked)
        const label = String(row.item_name ?? row.checklist ?? '—')
        return (
          <li
            key={i}
            className={`flex items-start gap-2.5 rounded-md border px-3 py-2 ${
              checked ? 'border-green-200 bg-green-50/60' : 'border-slate-200 bg-slate-50/50'
            }`}
          >
            {checked ? (
              <Check className="w-4 h-4 text-green-600 shrink-0 mt-0.5" strokeWidth={2.5} aria-label="Completed" />
            ) : (
              <X className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" strokeWidth={2.5} aria-label="Not completed" />
            )}
            <span className={`text-sm leading-snug ${checked ? 'text-slate-800' : 'text-slate-600'}`}>{label}</span>
          </li>
        )
      })}
    </ul>
  )
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

  // Priority keys shown at the top regardless of alphabetical order
  const TOP_KEYS = ['name', 'patient', 'patient_name', 'status', 'remarks']
  const isTextBlock = (key: string) =>
    key === 'description' ||
    key.toLowerCase().includes('note') ||
    key.toLowerCase().includes('comment') ||
    key.toLowerCase().includes('warning') ||
    key.toLowerCase().includes('instruction') ||
    key.toLowerCase().includes('remark')

  const allEntries = Object.entries(doc).filter(([k]) => !SKIP_KEYS.has(k) && !k.startsWith('_'))

  const topEntries = TOP_KEYS
    .map((k) => allEntries.find(([key]) => key === k))
    .filter(Boolean) as [string, unknown][]

  const restEntries = allEntries
    .filter(([k]) => !TOP_KEYS.includes(k))
    .sort(([a], [b]) => a.localeCompare(b))

  const entries = [...topEntries, ...restEntries]

  return (
    <dl className="space-y-3">
      {entries.map(([key, value]) => {
        const isEmpty = value == null || value === ''
        // Always show remarks section even when empty, so user knows it exists
        const isRemarks = key === 'remarks'
        if (isEmpty && !isRemarks) return (
          <div key={key} className="border-b border-slate-100 pb-2 last:border-0">
            <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">{formatLabel(key)}</dt>
            <dd className="mt-0.5 text-sm text-slate-400">—</dd>
          </div>
        )
        return (
          <div key={key} className={`border-b pb-2 last:border-0 ${isRemarks ? 'border-amber-100' : 'border-slate-100'}`}>
            <dt className={`text-xs font-medium uppercase tracking-wide ${isRemarks ? 'text-amber-700' : 'text-slate-500'}`}>
              {formatLabel(key)}
            </dt>
            <dd className="mt-1 text-sm text-slate-900 break-words">
              {isTableValue(value) ? (
                isDocumentTable(value) ? (
                  <DocumentsTableFieldView value={value} />
                ) : isChecklistTable(value) ? (
                  <ChecklistTableFieldView value={value} />
                ) : (
                  <TableFieldView value={value} />
                )
              ) : isRemarks ? (
                isEmpty ? (
                  <span className="text-slate-400 italic text-sm">NO REMARKS ADDED YET.</span>
                ) : (
                  <div className="whitespace-pre-wrap bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-sm text-slate-800 leading-relaxed">
                    {formatValue(value)}
                  </div>
                )
              ) : isTextBlock(key) ? (
                <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
                  <RichTextContent value={String(value)} />
                </div>
              ) : (
                formatValue(value)
              )}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
