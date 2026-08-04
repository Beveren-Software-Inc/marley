export interface PharmacyGiveOutWarehouseOptions {
  warehouses: { name: string; label: string }[]
  default_warehouse?: string
  mini_warehouse?: string
  /** Branch pharmacy/prescription warehouse from Healthcare Settings */
  pharmacy_warehouse?: string
  cost_center?: string
  /** When true, nurses must pick batch / dispensing lot on the give-out form. */
  display_batch_and_lot_on_pharmacy_giveout?: boolean
}

export async function fetchPharmacyGiveOutWarehouses(
  inpatientRecord?: string,
  patientVisit?: string
): Promise<PharmacyGiveOutWarehouseOptions> {
  const { apiRequest } = await import('./apiClient')
  const params = new URLSearchParams()
  if (inpatientRecord) params.append('inpatient_record', inpatientRecord)
  if (patientVisit) params.append('patient_visit', patientVisit)
  return apiRequest<PharmacyGiveOutWarehouseOptions>(
    `/api/method/healthcare.api.patient_medication_order.get_nursing_pharmacy_giveout_warehouses?${params.toString()}`
  )
}

export interface PharmacyGiveOutRow {
  name: string
  patient: string
  patient_name?: string
  posting_date?: string
  start_date?: string
  status?: string
  inpatient_record?: string
  source_prescription?: string
  sales_order?: string
  invoice?: string
  reference_doctype?: string
  reference_document_name?: string
  giveout_charge_percent?: number
  medication_count?: number
  medications_summary?: string
  service_count?: number
  services_summary?: string
}

export interface PharmacyGiveOutServiceLine {
  item_code?: string
  item_name?: string
  qty?: number
  rate?: number
  amount?: number
  uom?: string
}

export async function fetchPharmacyGiveOutServices(giveOutName: string): Promise<{
  sales_order?: string
  services: PharmacyGiveOutServiceLine[]
  services_summary?: string
}> {
  const { apiRequest } = await import('./apiClient')
  const params = new URLSearchParams()
  params.append('name', giveOutName)
  return apiRequest<{
    sales_order?: string
    services: PharmacyGiveOutServiceLine[]
    services_summary?: string
  }>(
    `/api/method/healthcare.api.patient_medication_order.get_nursing_pharmacy_giveout_services?${params.toString()}`
  )
}

export async function fetchNursingPharmacyGiveOuts(opts?: {
  patient?: string
  inpatientRecord?: string
  fromDate?: string
  toDate?: string
  search?: string
  limit?: number
  offset?: number
}): Promise<PharmacyGiveOutRow[]> {
  const params = new URLSearchParams()
  if (opts?.patient) params.append('patient', opts.patient)
  if (opts?.inpatientRecord) params.append('inpatient_record', opts.inpatientRecord)
  if (opts?.fromDate) params.append('from_date', opts.fromDate)
  if (opts?.toDate) params.append('to_date', opts.toDate)
  if (opts?.search) params.append('search', opts.search)
  params.append('limit', String(opts?.limit ?? 50))
  params.append('offset', String(opts?.offset ?? 0))

  const response = await fetch(
    `/api/method/healthcare.api.patient_medication_order.get_nursing_pharmacy_giveouts?${params.toString()}`
  )
  const resData = await response.json()

  if (resData?.exc_type) {
    throw new Error(resData?.message || 'Failed to load pharmacy give-out records')
  }

  if (Array.isArray(resData?.message)) {
    return resData.message as PharmacyGiveOutRow[]
  }

  return []
}

export async function cancelNursingPharmacyGiveOut(name: string): Promise<{ cancelled: string }> {
  const { apiRequest } = await import('./apiClient')
  return apiRequest<{ cancelled: string }>(
    '/api/method/healthcare.api.patient_medication_order.cancel_nursing_pharmacy_giveout',
    {
      method: 'POST',
      body: JSON.stringify({ name }),
    }
  )
}

/** @deprecated Use cancelNursingPharmacyGiveOut */
export async function deleteNursingPharmacyGiveOut(name: string): Promise<{ cancelled: string }> {
  return cancelNursingPharmacyGiveOut(name)
}

export function isPharmacyGiveOutInvoiced(row: Pick<PharmacyGiveOutRow, 'invoice' | 'sales_order'>): boolean {
  const invoice = row.invoice?.trim()
  const salesOrder = row.sales_order?.trim()
  if (!invoice || !salesOrder) return false
  return invoice !== salesOrder
}

export async function fetchItemRate(itemCode: string, uom?: string): Promise<number> {
  if (!itemCode?.trim()) return 0
  const { apiRequest } = await import('./apiClient')
  const params = new URLSearchParams()
  params.append('item_code', itemCode.trim())
  if (uom?.trim()) params.append('uom', uom.trim())
  const result = await apiRequest<{ item_code: string; rate: number; stock_uom?: string }>(
    `/api/method/healthcare.api.patient_medication_order.get_item_rate_api?${params.toString()}`
  )
  return Number(result?.rate) || 0
}

export interface PharmacyGiveOutServiceItem {
  id: string
  name: string
  item_code?: string
  price?: number
  rate?: number
  uom?: string
  template_dt?: string | null
  template_dn?: string | null
  is_pharmacy_service?: number
}

export async function fetchPharmacyGiveOutServiceItems(
  search?: string,
  careContext?: string
): Promise<PharmacyGiveOutServiceItem[]> {
  const { apiRequest } = await import('./apiClient')
  const params = new URLSearchParams()
  if (search?.trim()) params.append('search', search.trim())
  if (careContext) params.append('care_context', careContext)
  const result = await apiRequest<PharmacyGiveOutServiceItem[]>(
    `/api/method/healthcare.api.patient_medication_order.get_pharmacy_giveout_service_items?${params.toString()}`
  )
  return Array.isArray(result) ? result : []
}

export async function fetchItemRates(itemCodes: string[]): Promise<Record<string, number>> {
  const codes = [...new Set(itemCodes.map((c) => c.trim()).filter(Boolean))]
  if (!codes.length) return {}
  const params = new URLSearchParams()
  params.append('item_codes', JSON.stringify(codes))
  const response = await fetch(
    `/api/method/healthcare.api.patient_medication_order.get_item_rates_api?${params.toString()}`
  )
  const resData = await response.json()
  if (resData?.exc_type) {
    throw new Error(resData?.message || 'Failed to load item rates')
  }
  return (resData?.message as Record<string, number>) || {}
}
