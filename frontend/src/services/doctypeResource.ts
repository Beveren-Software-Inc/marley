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
}

export async function fetchDoctypeRows(
  doctype: string,
  fields: string[],
  filters: Record<string, any> = {},
  limit = 100,
  orderBy = 'modified desc'
): Promise<Record<string, any>[]> {
  const params = new URLSearchParams()
  params.set('fields', JSON.stringify(fields))
  params.set('limit_page_length', String(limit))
  params.set('order_by', orderBy)

  const active = Object.entries(filters).filter(
    ([, v]) => v !== undefined && v !== null && v !== ''
  )
  if (active.length) {
    params.set('filters', JSON.stringify(active.map(([k, v]) => [k, '=', v])))
  }

  const res = await apiRequest<{ data: Record<string, any>[] }>(
    `/api/resource/${encodeURIComponent(doctype)}?${params.toString()}`
  )
  return res?.data ?? []
}

export async function createDoctypeRow(
  doctype: string,
  payload: Record<string, any>
): Promise<{ name: string }> {
  const res = await apiRequest<{ data: { name: string } }>(
    `/api/resource/${encodeURIComponent(doctype)}`,
    { method: 'POST', body: JSON.stringify(payload) }
  )
  return res?.data ?? { name: '' }
}

export async function fetchLinkOptions(
  doctype: string,
  limit = 200,
  filters: Record<string, any> = {}
): Promise<string[]> {
  const rows = await fetchDoctypeRows(doctype, ['name'], filters, limit, 'name asc')
  return rows.map((r) => r.name)
}
