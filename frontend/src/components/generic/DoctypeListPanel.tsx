import { useCallback, useEffect, useState } from 'react'
import {
  createDoctypeRow,
  fetchDoctypeRows,
  fetchLinkOptions,
  type ColumnSpec,
  type FieldSpec,
} from '../../services/doctypeResource'
import { toast } from '../../hooks/useToast'

interface DoctypeListPanelProps {
  doctype: string
  columns: ColumnSpec[]
  /** Extra fields to fetch but not display (used by render callbacks). */
  extraFields?: string[]
  filters?: Record<string, any>
  /** Field spec for the inline create form. Omit to hide the New button. */
  createFields?: FieldSpec[]
  /** Values forced onto every created record. */
  createDefaults?: Record<string, any>
  emptyMessage?: string
  limit?: number
  orderBy?: string
  refreshKey?: number | string
}

const STATUS_TONE: Record<string, string> = {
  Draft: 'bg-slate-100 text-slate-700 border-slate-200',
  Signed: 'bg-green-100 text-green-800 border-green-200',
  Issued: 'bg-green-100 text-green-800 border-green-200',
  Declined: 'bg-red-100 text-red-800 border-red-200',
  Cancelled: 'bg-red-100 text-red-800 border-red-200',
}

export const DoctypeListPanel = ({
  doctype,
  columns,
  extraFields = [],
  filters = {},
  createFields,
  createDefaults = {},
  emptyMessage,
  limit = 100,
  orderBy = 'modified desc',
  refreshKey,
}: DoctypeListPanelProps) => {
  const [rows, setRows] = useState<Record<string, any>[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Record<string, any>>({})
  const [linkOptions, setLinkOptions] = useState<Record<string, string[]>>({})
  const [localRefresh, setLocalRefresh] = useState(0)

  const fieldNames = Array.from(
    new Set(['name', ...columns.map((c) => c.fieldname), ...extraFields])
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await fetchDoctypeRows(doctype, fieldNames, filters, limit, orderBy))
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctype, JSON.stringify(filters), limit, orderBy])

  useEffect(() => {
    load()
  }, [load, refreshKey, localRefresh])

  // Preload Link field options when the create form opens.
  useEffect(() => {
    if (!showForm || !createFields) return
    const links = createFields.filter((f) => f.fieldtype === 'Link' && f.options)
    links.forEach(async (f) => {
      if (linkOptions[f.fieldname]) return
      try {
        const opts = await fetchLinkOptions(f.options as string)
        setLinkOptions((prev) => ({ ...prev, [f.fieldname]: opts }))
      } catch {
        /* leave as free text */
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm, createFields])

  const openForm = () => {
    const seed: Record<string, any> = {}
    createFields?.forEach((f) => {
      if (f.default !== undefined) seed[f.fieldname] = f.default
    })
    setForm(seed)
    setShowForm(true)
  }

  const submit = async () => {
    if (!createFields) return
    const missing = createFields.filter((f) => f.reqd && !form[f.fieldname])
    if (missing.length) {
      toast.error(`${missing[0].label} is required`)
      return
    }
    setSaving(true)
    try {
      await createDoctypeRow(doctype, { ...form, ...createDefaults })
      toast.success(`${doctype} created`)
      setShowForm(false)
      setLocalRefresh((n) => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to create ${doctype}`)
    } finally {
      setSaving(false)
    }
  }

  const cell = (row: Record<string, any>, col: ColumnSpec) => {
    if (col.render) return col.render(row)
    const value = row[col.fieldname]
    if (value === null || value === undefined || value === '') return '—'
    if (col.fieldname === 'status' || col.fieldname === 'report_status') {
      const tone = STATUS_TONE[value] || 'bg-slate-100 text-slate-700 border-slate-200'
      return (
        <span className={`inline-block rounded border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
          {value}
        </span>
      )
    }
    return String(value)
  }

  return (
    <div className="space-y-3">
      {createFields && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={openForm}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            New
          </button>
        </div>
      )}

      {showForm && createFields && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {createFields.map((f) => (
              <div key={f.fieldname} className="space-y-1">
                <label className="block text-xs font-medium text-slate-600">
                  {f.label}
                  {f.reqd && <span className="text-red-500"> *</span>}
                </label>
                {f.fieldtype === 'Select' ? (
                  <select
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    value={form[f.fieldname] ?? ''}
                    onChange={(e) => setForm({ ...form, [f.fieldname]: e.target.value })}
                  >
                    <option value="">Select…</option>
                    {(f.options || '').split('\n').filter(Boolean).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : f.fieldtype === 'Link' ? (
                  <input
                    list={`opts-${f.fieldname}`}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    value={form[f.fieldname] ?? ''}
                    onChange={(e) => setForm({ ...form, [f.fieldname]: e.target.value })}
                  />
                ) : f.fieldtype === 'Check' ? (
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={Boolean(form[f.fieldname])}
                    onChange={(e) => setForm({ ...form, [f.fieldname]: e.target.checked ? 1 : 0 })}
                  />
                ) : f.fieldtype === 'Small Text' || f.fieldtype === 'Text Editor' ? (
                  <textarea
                    rows={2}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    value={form[f.fieldname] ?? ''}
                    onChange={(e) => setForm({ ...form, [f.fieldname]: e.target.value })}
                  />
                ) : (
                  <input
                    type={
                      f.fieldtype === 'Date'
                        ? 'date'
                        : f.fieldtype === 'Datetime'
                          ? 'datetime-local'
                          : ['Currency', 'Float', 'Int'].includes(f.fieldtype)
                            ? 'number'
                            : 'text'
                    }
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    value={form[f.fieldname] ?? ''}
                    onChange={(e) => setForm({ ...form, [f.fieldname]: e.target.value })}
                  />
                )}
                {f.fieldtype === 'Link' && (
                  <datalist id={`opts-${f.fieldname}`}>
                    {(linkOptions[f.fieldname] || []).map((o) => (
                      <option key={o} value={o} />
                    ))}
                  </datalist>
                )}
                {f.description && (
                  <p className="text-[11px] text-slate-500">{f.description}</p>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={submit}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {columns.map((c) => (
                <th key={c.fieldname} className="px-3 py-2 text-left font-medium" style={{ width: c.width }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-slate-500">
                  {emptyMessage || `No ${doctype} records yet.`}
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => (
                <tr key={row.name} className="border-t border-slate-100 hover:bg-slate-50">
                  {columns.map((c) => (
                    <td key={c.fieldname} className="px-3 py-2 align-top">
                      {cell(row, c)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
