import type { ReactNode } from 'react'
import { RichTextContent } from '../ui/RichTextContent'

export type DocRecord = Record<string, unknown>

export function displayValue(value: unknown): string {
  if (value == null || value === '') return '—'
  if (typeof value === 'number' && !Number.isNaN(value)) return String(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

export function hasValue(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value.trim() !== '' && value !== '<p><br></p>'
  if (typeof value === 'number') return !Number.isNaN(value)
  if (Array.isArray(value)) return value.length > 0
  return true
}

export function isChecked(value: unknown): boolean {
  return value === 1 || value === true || value === '1'
}

export function formatDate(value?: unknown): string {
  if (value == null || value === '') return '—'
  try {
    return new Date(String(value)).toLocaleDateString('en-GB')
  } catch {
    return String(value)
  }
}

export function formatDateTime(value?: unknown): string {
  if (value == null || value === '') return '—'
  try {
    return new Date(String(value)).toLocaleString('en-GB')
  } catch {
    return String(value)
  }
}

export function formatTime(value?: unknown): string {
  if (value == null || value === '') return '—'
  const s = String(value)
  return s.length >= 5 ? s.slice(0, 5) : s
}

export function fileHref(path: unknown): string | null {
  if (path == null || String(path).trim() === '') return null
  const s = String(path)
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:')) return s
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}${s.startsWith('/') ? s : `/${s}`}`
}

export function DataTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-sky-100/80 bg-white/90 px-3 py-2.5 shadow-sm ring-1 ring-sky-50/80">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-800/60">{label}</p>
      <p className="mt-1 text-sm font-medium leading-snug text-slate-900 break-words">{value}</p>
    </div>
  )
}

export function VitalTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-sky-200/70 bg-gradient-to-br from-white to-sky-50/60 px-3 py-3 text-center shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-700/70">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-sky-950">{value}</p>
    </div>
  )
}

export function NoteBlock({ label, value }: { label: string; value: string }) {
  const looksHtml = /<\/?[a-z][\s\S]*>/i.test(value)
  return (
    <div className="rounded-lg border border-sky-100/70 bg-white/90 px-4 py-3 shadow-sm ring-1 ring-sky-50/80">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-800/60">{label}</p>
      {looksHtml ? (
        <div className="mt-2 text-sm leading-relaxed text-slate-800">
          <RichTextContent value={value} />
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{value}</p>
      )}
    </div>
  )
}

export function ChipList({ items }: { items: string[] }) {
  if (!items.length) {
    return <p className="text-sm text-slate-500">None marked</p>
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex items-center rounded-md border border-sky-200/80 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-900"
        >
          {item}
        </span>
      ))}
    </div>
  )
}

export function AttachBlock({ label, path }: { label: string; path: unknown }) {
  const href = fileHref(path)
  if (!href) return null
  const isImage = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(href) || href.startsWith('data:image')
  return (
    <div className="rounded-lg border border-sky-100/70 bg-white/90 px-4 py-3 shadow-sm ring-1 ring-sky-50/80">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-800/60">{label}</p>
      {isImage ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="mt-2 block">
          <img src={href} alt={label} className="max-h-36 max-w-full rounded-md border border-slate-200 object-contain" />
        </a>
      ) : (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex text-sm font-medium text-primary hover:underline"
        >
          Open attachment
        </a>
      )}
    </div>
  )
}

export function MetaFooter({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Record metadata</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>
    </section>
  )
}

export function tilesFrom(
  doc: DocRecord,
  fields: Array<{ key: string; label: string; format?: (v: unknown) => string }>
): Array<{ label: string; value: string }> {
  return fields
    .filter((f) => hasValue(doc[f.key]))
    .map((f) => ({
      label: f.label,
      value: f.format ? f.format(doc[f.key]) : displayValue(doc[f.key]),
    }))
}

export function checkedLabels(
  doc: DocRecord,
  fields: Array<{ key: string; label: string }>
): string[] {
  return fields.filter((f) => isChecked(doc[f.key])).map((f) => f.label)
}

export function SimpleTable({
  rows,
  columns,
}: {
  rows: Record<string, unknown>[]
  columns: Array<{ key: string; label: string }>
}) {
  if (!rows.length) return <p className="text-sm text-slate-500">No rows</p>
  return (
    <div className="overflow-x-auto rounded-lg border border-sky-100">
      <table className="min-w-full text-sm">
        <thead className="bg-sky-50/80">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-sky-800/70"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sky-50 bg-white">
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2 text-slate-800">
                  {c.key === 'checked' || c.key === 'is_checked'
                    ? isChecked(row[c.key])
                      ? 'Yes'
                      : 'No'
                    : displayValue(row[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
