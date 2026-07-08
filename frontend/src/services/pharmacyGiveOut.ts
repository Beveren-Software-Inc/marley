export interface PharmacyGiveOutWarehouseOptions {
  warehouses: { name: string; label: string }[]
  default_warehouse?: string
  mini_warehouse?: string
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
  medication_count?: number
  medications_summary?: string
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
