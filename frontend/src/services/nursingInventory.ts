// services/nursingInventory.ts

import type { WarehouseContext } from '../components/nursingInventory/MiniWarehouseInventoryContext'
import { apiRequest } from './apiClient'

function withWarehouseContext(url: string, warehouseContext: WarehouseContext = 'nurse'): string {
  if (warehouseContext === 'nurse') return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}warehouse_context=${encodeURIComponent(warehouseContext)}`
}

export interface StockLedgerItem {
  item_code: string
  item_name: string
  category?: string
  item_group?: string
  current_stock: number
  actual_qty?: number
  reorder_level: number
  uom?: string
  unit_price: number
  valuation_rate?: number
  last_updated: string
}

export interface MaterialRequestItem {
  item_code: string
  item_name: string
  quantity: number
  uom: string
  notes?: string
}

export interface MaterialRequest {
  name: string
  cost_center: string
  warehouse?: string
  request_date: string
  status: string
  items: MaterialRequestItem[]
  requested_by: string
  approved_by?: string
  notes?: string
}

export interface StockReconciliation {
  name: string
  cost_center: string
  warehouse?: string
  reconciliation_date: string
  notes?: string
  items: {
    item_code: string
    item_name: string
    system_quantity: number
    physical_quantity: number
    difference: number
    notes?: string
  }[]
  status: 'Draft' | 'Completed'
  reconciled_by: string
}

export interface MaterialReceipt {
  name: string
  cost_center: string
  warehouse?: string
  receipt_date: string
  notes?: string
  supplier?: string
  invoice_number?: string
  items: {
    item_code: string
    item_name: string
    quantity: number
    unit_price: number
    total_price: number
    batch_number?: string
    expiry_date?: string
  }[]
  total_amount: number
  received_by: string
  status: 'Draft' | 'Completed'
}

// Fetch stock ledger for a cost center
export async function fetchStockLedger(
  costCenter: string,
  warehouseContext: WarehouseContext = 'nurse'
): Promise<StockLedgerItem[]> {
  const response = await fetch(
    withWarehouseContext(
      `/api/method/healthcare.api.nursing_inventory.get_stock_ledger?cost_center=${encodeURIComponent(costCenter)}`,
      warehouseContext
    )
  )
  const data = await response.json()
  return data.message || []
}

// Fetch item groups for filtering
export async function fetchItemGroups(search?: string): Promise<{ name: string; label: string }[]> {
  let url = '/api/method/healthcare.api.nursing_inventory.get_item_groups'
  if (search) url += `?search=${encodeURIComponent(search)}`
  const response = await fetch(url)
  const data = await response.json()
  return data.message || []
}

// Create material request
export async function createMaterialRequest(
  data: Omit<MaterialRequest, 'name' | 'status'> & { warehouse_context?: WarehouseContext; status?: string }
): Promise<{ name: string; status?: string }> {
  return apiRequest('/api/method/healthcare.api.nursing_inventory.create_material_request', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// Fetch material requests for a cost center
export async function fetchMaterialRequests(
  costCenter: string,
  status?: string,
  warehouseContext: WarehouseContext = 'nurse'
): Promise<MaterialRequest[]> {
  let url = withWarehouseContext(
    `/api/method/healthcare.api.nursing_inventory.get_material_requests?cost_center=${encodeURIComponent(costCenter)}`,
    warehouseContext
  )
  if (status) url += `&status=${status}`
  const response = await fetch(url)
  const data = await response.json()

  console.log("Fetched material requests:", data.message)
  return data.message || []
}

// Create stock reconciliation
export async function createStockReconciliation(
  data: Omit<StockReconciliation, 'name'> & { warehouse_context?: WarehouseContext; custom_notes?: string }
): Promise<{ name: string }> {
  return apiRequest('/api/method/healthcare.api.nursing_inventory.create_stock_reconciliation', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// Fetch stock reconciliations
export async function getStockReconciliations(
  costCenter: string,
  warehouseContext: WarehouseContext = 'nurse'
): Promise<StockReconciliation[]> {
  const response = await fetch(
    withWarehouseContext(
      `/api/method/healthcare.api.nursing_inventory.get_stock_reconciliations?cost_center=${encodeURIComponent(costCenter)}`,
      warehouseContext
    )
  )
  const data = await response.json()
  return data.message || []
}

// Create material receipt
export async function createMaterialReceipt(
  data: Omit<MaterialReceipt, 'name'> & { warehouse_context?: WarehouseContext; custom_notes?: string }
): Promise<{ name: string }> {
  return apiRequest('/api/method/healthcare.api.nursing_inventory.create_material_receipt', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// Fetch items for dropdown
export async function fetchInventoryItems(search?: string): Promise<{ code: string; name: string; uom: string; price: number }[]> {
  let url = '/api/method/healthcare.api.nursing_inventory.get_inventory_items'
  if (search) url += `?search=${encodeURIComponent(search)}`
  const response = await fetch(url)
  const data = await response.json()
  return data.message || []
}

export async function fetchItemUomOptions(itemCode: string): Promise<{ name: string; label: string }[]> {
  const response = await fetch(
    `/api/method/healthcare.api.nursing_inventory.get_item_uom_options?item_code=${encodeURIComponent(itemCode)}`
  )
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'Failed to fetch item units')
  return data.message || []
}

// Fetch cost centers for the user
export async function fetchUserCostCenters(): Promise<{ name: string; label: string }[]> {
  const response = await fetch('/api/method/healthcare.api.nursing_inventory.get_user_cost_centers')
  const data = await response.json()
  return data.message || []
}

// Add to services/nursingInventory.ts

export async function getWarehousesForCostCenter(
  costCenter: string,
  warehouseContext: WarehouseContext = 'nurse'
): Promise<{ name: string; label: string }[]> {
  const response = await fetch(
    withWarehouseContext(
      `/api/method/healthcare.api.nursing_inventory.get_warehouses_for_cost_center?cost_center=${encodeURIComponent(costCenter)}`,
      warehouseContext
    )
  )
  const data = await response.json()
  return data.message || []
}


export async function getAllCostCenters(
  warehouseContext: WarehouseContext = 'nurse'
): Promise<{ name: string; label: string }[]> {
  const response = await fetch(
    withWarehouseContext('/api/method/healthcare.api.nursing_inventory.get_all_cost_centers', warehouseContext)
  )
  const data = await response.json()
  console.log("Cost centers:", data.message)
  return data.message || []
}

export async function fetchMaterialReceipts(
  costCenter: string,
  warehouseContext: WarehouseContext = 'nurse'
): Promise<MaterialReceipt[]> {
  const response = await fetch(
    withWarehouseContext(
      `/api/method/healthcare.api.nursing_inventory.get_material_receipts?cost_center=${encodeURIComponent(costCenter)}`,
      warehouseContext
    )
  )
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'Failed to fetch material receipts')
  return data.message || []
}

export async function getItemBatches(itemCode: string, warehouse: string) {
  return apiRequest('/api/method/healthcare.api.nursing_inventory.get_item_batches', {
    method: 'POST',
    body: JSON.stringify({ item_code: itemCode, warehouse }),
  })
}

export async function getItemSerials(itemCode: string, warehouse: string) {
  return apiRequest('/api/method/healthcare.api.nursing_inventory.get_item_serials', {
    method: 'POST',
    body: JSON.stringify({ item_code: itemCode, warehouse }),
  })
}

export async function getBatchSerials(batchNo: string, warehouse: string) {
  return apiRequest('/api/method/healthcare.api.nursing_inventory.get_batch_details_with_serials', {
    method: 'POST',
    body: JSON.stringify({ batch_no: batchNo, warehouse }),
  })
}