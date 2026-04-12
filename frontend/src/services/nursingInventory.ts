// services/nursingInventory.ts

export interface StockLedgerItem {
  item_code: string
  item_name: string
  category?: string
  current_stock: number
  reorder_level: number
  uom?: string
  unit_price: number
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
  request_date: string
  status: 'Draft' | 'Submitted' | 'Approved' | 'Rejected' | 'Issued'
  items: MaterialRequestItem[]
  requested_by: string
  approved_by?: string
  notes?: string
}

export interface StockReconciliation {
  name: string
  cost_center: string
  reconciliation_date: string
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
  receipt_date: string
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
export async function fetchStockLedger(costCenter: string): Promise<StockLedgerItem[]> {
  const response = await fetch(`/api/method/healthcare.api.nursing_inventory.get_stock_ledger?cost_center=${encodeURIComponent(costCenter)}`)
  const data = await response.json()
  return data.message || []
}

// Create material request
export async function createMaterialRequest(data: Omit<MaterialRequest, 'name'>): Promise<{ name: string }> {
  const response = await fetch('/api/method/healthcare.api.nursing_inventory.create_material_request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.message || 'Failed to create material request')
  return result.message
}

// Fetch material requests for a cost center
export async function fetchMaterialRequests(costCenter: string, status?: string): Promise<MaterialRequest[]> {
  let url = `/api/method/healthcare.api.nursing_inventory.get_material_requests?cost_center=${encodeURIComponent(costCenter)}`
  if (status) url += `&status=${status}`
  const response = await fetch(url)
  const data = await response.json()
  return data.message || []
}

// Create stock reconciliation
export async function createStockReconciliation(data: Omit<StockReconciliation, 'name'>): Promise<{ name: string }> {
  const response = await fetch('/api/method/healthcare.api.nursing_inventory.create_stock_reconciliation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.message || 'Failed to create stock reconciliation')
  return result.message
}

// Create material receipt
export async function createMaterialReceipt(data: Omit<MaterialReceipt, 'name'>): Promise<{ name: string }> {
  const response = await fetch('/api/method/healthcare.api.nursing_inventory.create_material_receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.message || 'Failed to create material receipt')
  return result.message
}

// Fetch items for dropdown
export async function fetchInventoryItems(search?: string): Promise<{ code: string; name: string; uom: string; price: number }[]> {
  let url = '/api/method/healthcare.api.nursing_inventory.get_inventory_items'
  if (search) url += `?search=${encodeURIComponent(search)}`
  const response = await fetch(url)
  const data = await response.json()
  return data.message || []
}

// Fetch cost centers for the user
export async function fetchUserCostCenters(): Promise<{ name: string; label: string }[]> {
  const response = await fetch('/api/method/healthcare.api.nursing_inventory.get_user_cost_centers')
  const data = await response.json()
  return data.message || []
}