import { apiRequest } from './apiClient'

const BASE = '/api/method/healthcare.api.pharmacy'

export interface BatchRow {
  name: string
  item?: string
  item_name?: string
  expiry_date?: string
  batch_qty?: number
  stock_uom?: string
  warehouse?: string
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

export async function getBatchesExpiringInDays(days = 7, limit = 200, warehouse?: string): Promise<BatchRow[]> {
  const params = new URLSearchParams({ days: String(days), limit: String(limit) })
  if (warehouse) params.set('warehouse', warehouse)
  const data = await apiRequest<BatchRow[]>(`${BASE}.get_batches_expiring_in_days?${params}`)
  return Array.isArray(data) ? data : []
}

export async function getLowStockItems(limit = 100, threshold?: number, warehouse?: string): Promise<LowStockRow[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (threshold != null) params.set('threshold', String(threshold))
  if (warehouse) params.set('warehouse', warehouse)
  const data = await apiRequest<LowStockRow[]>(`${BASE}.get_low_stock_items?${params}`)
  return Array.isArray(data) ? data : []
}

export interface PharmacyWarehouseOption {
  warehouse: string
  pos_profile: string
  company?: string
}

export interface PharmacyWarehouseContext {
  has_pos_profiles: boolean
  warehouses: PharmacyWarehouseOption[]
  selected_warehouse: string
  saved_warehouse: string
  open_pos_profile?: string | null
  open_pos_entry?: string | null
  default_warehouse?: string
}

export async function fetchPharmacyWarehouseContext(autoSave = true): Promise<PharmacyWarehouseContext> {
  const params = new URLSearchParams({ auto_save: autoSave ? '1' : '0' })
  const data = await apiRequest<PharmacyWarehouseContext>(`${BASE}.get_pharmacy_warehouse_context?${params}`)
  return data
}

export async function setPharmacyWarehousePreference(
  warehouse: string
): Promise<{ status: string; warehouse: string }> {
  return apiRequest<{ status: string; warehouse: string }>(
    `${BASE}.set_pharmacy_warehouse_preference`,
    {
      method: 'POST',
      body: JSON.stringify({ warehouse }),
    }
  )
}

export interface ItemBatchSearchRow {
  item_code: string
  item_name: string
  batch?: string | null
  stock_quantity: number
  stock_uom?: string | null
  expiry_date?: string | null
  warehouse?: string | null
}

export async function searchItemOrBatch(query: string, limit = 100, warehouse?: string): Promise<ItemBatchSearchRow[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (query.trim()) params.set('query', query.trim())
  if (warehouse) params.set('warehouse', warehouse)
  const data = await apiRequest<ItemBatchSearchRow[]>(`${BASE}.search_item_or_batch?${params}`)
  return Array.isArray(data) ? data : []
}

export interface MaterialRequestOptions {
  companies: string[]
  warehouses: string[]
  cost_centers: string[]
  default_warehouse?: string
}

export async function getMaterialRequestOptions(): Promise<MaterialRequestOptions> {
  const data = await apiRequest<{
    companies?: string[] | { name: string }[]
    warehouses?: string[] | { name: string }[]
    cost_centers?: string[] | { name: string }[]
    default_warehouse?: string
  }>(`${BASE}.get_material_request_options`)
  const norm = (arr: string[] | { name: string }[] | undefined): string[] => {
    if (!Array.isArray(arr)) return []
    return arr.map((c) => (typeof c === 'string' ? c : c?.name ?? '')).filter(Boolean)
  }
  return {
    companies: norm(data?.companies),
    warehouses: norm(data?.warehouses),
    cost_centers: norm(data?.cost_centers),
    default_warehouse: data?.default_warehouse || undefined,
  }
}

export async function createMaterialRequest(params: {
  company: string
  material_request_type: string
  schedule_date?: string
  set_warehouse?: string
  cost_center?: string
  /** 1 = Medical, 0 = Consumable → Material Request.custom_is_medical */
  is_medical: 0 | 1
  items: { item_code: string; qty: number; warehouse?: string }[]
}): Promise<{ name: string }> {
  return apiRequest<{ name: string }>(`${BASE}.create_material_request`, {
    method: 'POST',
    body: JSON.stringify(params)
  })
}
