import { apiRequest } from './apiClient'

/**
 * Thin generic wrapper over Frappe's /api/resource endpoint.
 *
 * Used by DoctypeListPanel so simple master/record screens (consent forms,
 * promotions, quality indicators, IP medical reports) do not each need a
 * bespoke service module.
 */

export type FieldType =
  | 'Data'
  | 'Select'
  | 'Link'
  | 'Date'
  | 'Datetime'
  | 'Currency'
  | 'Float'
  | 'Int'
  | 'Check'
  | 'Small Text'
  | 'Text Editor'

export interface FieldSpec {
  fieldname: string
  label: string
  fieldtype: FieldType
  options?: string
  reqd?: boolean
  default?: string | number
  description?: string
}

export interface ColumnSpec {
  fieldname: string
  label: string
  width?: string
  /** Cells may return plain text or JSX (links, badges). */
  render?: (row: Record<string, any>) => import('react').ReactNode
  /** Display-only column (e.g. action links) — not a doc field, so it must not
   *  be requested from the list API (a non-existent fieldname 417s the call). */
  virtual?: boolean
}

export async function fetchDoctypeRows(
  doctype: string,
  fields: string[],
  filters: Record<string, any> = {},
  limit = 100,
  orderBy = 'modified desc',
  /** Parent DOCTYPE name — required by the API when listing a child table. */
  parentDoctype?: string
): Promise<Record<string, any>[]> {
  const params = new URLSearchParams()
  params.set('fields', JSON.stringify(fields))
  params.set('limit_page_length', String(limit))
  params.set('order_by', orderBy)
  if (parentDoctype) params.set('parent', parentDoctype)

  const active = Object.entries(filters).filter(
    ([, v]) => v !== undefined && v !== null && v !== ''
  )
  if (active.length) {
    params.set('filters', JSON.stringify(active.map(([k, v]) => [k, '=', v])))
  }

  // apiRequest already unwraps Frappe's `{ data: ... }` envelope.
  const res = await apiRequest<Record<string, any>[] | { data?: Record<string, any>[] }>(
    `/api/resource/${encodeURIComponent(doctype)}?${params.toString()}`
  )
  if (Array.isArray(res)) return res
  if (res && Array.isArray(res.data)) return res.data
  return []
}

export async function createDoctypeRow(
  doctype: string,
  payload: Record<string, any>
): Promise<{ name: string }> {
  // apiRequest already unwraps Frappe's `{ data: ... }` envelope.
  const res = await apiRequest<{ name?: string; data?: { name: string } }>(
    `/api/resource/${encodeURIComponent(doctype)}`,
    { method: 'POST', body: JSON.stringify(payload) }
  )
  if (res?.name) return { name: res.name }
  if (res?.data?.name) return { name: res.data.name }
  return { name: '' }
}

export async function fetchLinkOptions(
  doctype: string,
  limit = 200,
  filters: Record<string, any> = {}
): Promise<string[]> {
  const rows = await fetchDoctypeRows(doctype, ['name'], filters, limit, 'name asc')
  return rows.map((r) => r.name)
}
