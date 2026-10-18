import { apiRequest } from './apiClient'

export interface PackageReferenceOption {
  value: string
  label: string
  description?: string
}

export interface PackageServiceRow {
  name?: string
  service_type: string
  reference_doctype?: string | null
  reference: string
  reference_label?: string | null
  quantity_days?: number | null
  is_unlimited?: number | boolean | null
}

export interface PackageDurationRow {
  name?: string
  duration_class: string
  duration_name?: string | null
  from_day?: number | null
  to_day?: number | null
  amount?: number | null
}

export interface InpatientPackageRecord {
  name: string
  package_name?: string | null
  package_category?: string | null
  category_name?: string | null
  no_of_days?: number | null
  package_rate?: number | null
  base_total?: number | null
  is_daily_default?: number | boolean | null
  active?: number | boolean | null
  cost_center?: string | null
  company?: string | null
  modified?: string | null
  services?: PackageServiceRow[]
  duration_pricing?: PackageDurationRow[]
}

export interface PackageServiceTypeOption {
  value: string
  label: string
  reference_doctype: string
  hint?: string
}

export interface PackageSelectOption {
  value: string
  label: string
  currency?: string
  company?: string
}

export interface PackageDurationClassOption extends PackageSelectOption {
  from_day?: number | null
  to_day?: number | null
}

export interface PackageManagementMeta {
  default_currency: string
  default_company?: string | null
  companies: PackageSelectOption[]
  categories: PackageSelectOption[]
  duration_classes: PackageDurationClassOption[]
  cost_centers: PackageSelectOption[]
  service_types: PackageServiceTypeOption[]
}

export interface PackageManagementData {
  packages: InpatientPackageRecord[]
  meta: PackageManagementMeta
  can_manage: boolean
}

export interface SavePackageServicePayload {
  service_type: string
  reference: string
  quantity_days: number
  is_unlimited: boolean
}

export interface SavePackageDurationPayload {
  duration_class: string
  amount: number
}

export interface SaveInpatientPackagePayload {
  name: string
  company: string
  package_category: string | null
  cost_center: string | null
  no_of_days: number
  package_rate: number
  base_total: number
  is_daily_default: boolean
  active: boolean
  services: SavePackageServicePayload[]
  duration_pricing: SavePackageDurationPayload[]
}

const METHOD_ROOT = '/api/method/healthcare.api.inpatient_package'

export async function fetchPackageManagementData(): Promise<PackageManagementData> {
  return apiRequest<PackageManagementData>(`${METHOD_ROOT}.get_package_management_data`)
}

export async function searchPackageServiceReferences(
  serviceType: string,
  query: string,
): Promise<PackageReferenceOption[]> {
  const params = new URLSearchParams({ service_type: serviceType, limit: '20' })
  const term = query.trim()
  if (term) params.set('query', term)
  return apiRequest<PackageReferenceOption[]>(
    `${METHOD_ROOT}.search_package_service_references?${params.toString()}`,
  )
}

export async function saveInpatientPackage(
  payload: SaveInpatientPackagePayload,
): Promise<InpatientPackageRecord> {
  const response = await apiRequest<{ package: InpatientPackageRecord }>(
    `${METHOD_ROOT}.save_inpatient_package`,
    {
      method: 'POST',
      body: JSON.stringify({ package: JSON.stringify(payload) }),
    },
  )
  return response.package
}
