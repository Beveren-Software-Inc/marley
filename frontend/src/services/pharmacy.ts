import { apiRequest } from './apiClient'

const BASE = '/api/method/healthcare.api.pharmacy'

export interface BatchRow {
  name: string
  item?: string
  item_name?: string
  expiry_date?: string
  batch_qty?: number
  stock_uom?: string
}

export interface LowStockRow {
  item_code: string
  item_name: string
  warehouse?: string
  actual_qty: number
  reorder_level?: number
}

export async function getBatchesExpiringTomorrow(limit = 100): Promise<BatchRow[]> {
  const data = await apiRequest<BatchRow[]>(`${BASE}.get_batches_expiring_tomorrow?limit=${limit}`)
  return Array.isArray(data) ? data : []
}

export async function getBatchesExpiringInWeek(limit = 200): Promise<BatchRow[]> {
  const data = await apiRequest<BatchRow[]>(`${BASE}.get_batches_expiring_in_week?limit=${limit}`)
  return Array.isArray(data) ? data : []
}

export async function getBatchesExpiringInDays(days = 7, limit = 200): Promise<BatchRow[]> {
  const data = await apiRequest<BatchRow[]>(`${BASE}.get_batches_expiring_in_days?days=${days}&limit=${limit}`)
  return Array.isArray(data) ? data : []
}

export async function getLowStockItems(limit = 100, threshold?: number): Promise<LowStockRow[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (threshold != null) params.set('threshold', String(threshold))
  const data = await apiRequest<LowStockRow[]>(`${BASE}.get_low_stock_items?${params}`)
  return Array.isArray(data) ? data : []
}

export interface ItemBatchSearchRow {
  item_code: string
  item_name: string
  batch?: string | null
  stock_quantity: number
  stock_uom?: string | null
  expiry_date?: string | null
}

export async function searchItemOrBatch(query: string, limit = 100): Promise<ItemBatchSearchRow[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (query.trim()) params.set('query', query.trim())
  const data = await apiRequest<ItemBatchSearchRow[]>(`${BASE}.search_item_or_batch?${params}`)
  return Array.isArray(data) ? data : []
}
