export interface LinkFieldOption {
  name: string
  label: string
  department?: string
  medical_role?: string
  item_code?: string
  item_group?: string
  code_value?: string
  country?: string
}

export async function fetchMedicalDepartments(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  
  const url = `/api/method/healthcare.api.common.get_medical_departments${params.toString() ? `?${params.toString()}` : ''}`
  
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LinkFieldOption[]
  } else {
    return []
  }
}

export async function fetchHealthcarePractitioners(search?: string, department?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  if (department) params.append('department', department)
  
  const url = `/api/method/healthcare.api.common.get_healthcare_practitioners${params.toString() ? `?${params.toString()}` : ''}`
  
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LinkFieldOption[]
  } else {
    return []
  }
}

export async function fetchServiceUnitTypes(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  
  const url = `/api/method/healthcare.api.common.get_service_unit_types${params.toString() ? `?${params.toString()}` : ''}`
  
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LinkFieldOption[]
  } else {
    return []
  }
}

export async function fetchNursingChecklistTemplates(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  
  const url = `/api/method/healthcare.api.common.get_nursing_checklist_templates${params.toString() ? `?${params.toString()}` : ''}`
  
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LinkFieldOption[]
  } else {
    return []
  }
}

export async function fetchLeadSources(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  
  const url = `/api/method/healthcare.api.common.get_lead_sources${params.toString() ? `?${params.toString()}` : ''}`
  
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LinkFieldOption[]
  } else {
    return []
  }
}

export async function fetchNationalities(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)

  const url = `/api/method/healthcare.api.common.get_nationalities${
    params.toString() ? `?${params.toString()}` : ''
  }`

  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message.map((n: any) => ({
      name: n.name,
      label: n.nationality || n.name,
      country: n.country,
    }))
  }

  return []
}

/** Fetch Country list for link field (e.g. Patient address). */
export async function fetchCountries(): Promise<{ name: string }[]> {
  const res = await fetch('/api/resource/Country?fields=["name"]&limit_page_length=300')
  const data = await res.json()
  return Array.isArray(data?.data) ? data.data : []
}


export interface CreateLeadSourceData {
  source_name: string
}

export async function createLeadSource(
  data: CreateLeadSourceData
): Promise<{ name: string; source_name: string }> {
  const { apiRequest } = await import('./apiClient')

  const created = await apiRequest<{ name: string; source_name: string }>(
    '/api/resource/Lead%20Source',
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  )

  return created
}

export async function fetchUsers(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  
  const url = `/api/method/healthcare.api.common.get_users${params.toString() ? `?${params.toString()}` : ''}`
  
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LinkFieldOption[]
  } else {
    return []
  }
}

export async function fetchDischargeTemplates(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  
  const url = `/api/method/healthcare.api.common.get_discharge_templates${params.toString() ? `?${params.toString()}` : ''}`
  
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LinkFieldOption[]
  } else {
    return []
  }
}

export async function fetchLabTestTemplates(search?: string, department?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  if (department) params.append('department', department)
  
  const url = `/api/method/healthcare.api.common.get_lab_test_templates${params.toString() ? `?${params.toString()}` : ''}`
  
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LinkFieldOption[]
  } else {
    return []
  }
}

export async function fetchClinicalNoteTypes(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  
  const url = `/api/method/healthcare.api.common.get_clinical_note_types${params.toString() ? `?${params.toString()}` : ''}`
  
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LinkFieldOption[]
  } else {
    return []
  }
}

export async function fetchAppointmentTypes(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  
  const url = `/api/method/healthcare.api.common.get_appointment_types${params.toString() ? `?${params.toString()}` : ''}`
  
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LinkFieldOption[]
  } else {
    return []
  }
}

export async function fetchMedicalRoles(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  
  const url = `/api/method/healthcare.api.common.get_medical_roles${params.toString() ? `?${params.toString()}` : ''}`
  
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LinkFieldOption[]
  } else {
    return []
  }
}

export async function fetchObservationTemplates(search?: string, department?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  if (department) params.append('department', department)
  
  const url = `/api/method/healthcare.api.common.get_observation_templates${params.toString() ? `?${params.toString()}` : ''}`
  
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LinkFieldOption[]
  } else {
    return []
  }
}

export async function getPractitionerMedicalRole(practitioner: string): Promise<string | null> {
  const response = await fetch(
    `/api/method/healthcare.api.common.get_practitioner_medical_role?practitioner=${encodeURIComponent(practitioner)}`
  )
  const resData = await response.json()

  if (resData?.message) {
    return resData.message as string
  } else {
    return null
  }
}

export async function fetchCompanies(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append("search", search)

  const url =
    `/api/method/healthcare.api.common.get_companies` +
    (params.toString() ? `?${params.toString()}` : "")

  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LinkFieldOption[]
  }

  return []
}

export async function fetchCostCenters(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append("search", search)

  const url =
    `/api/method/healthcare.api.common.get_cost_centers` +
    (params.toString() ? `?${params.toString()}` : "")

  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LinkFieldOption[]
  }

  return []
}



export async function fetchItems(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  
  const url = `/api/method/healthcare.api.common.get_items${params.toString() ? `?${params.toString()}` : ''}`
  
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LinkFieldOption[]
  } else {
    return []
  }
}

export async function fetchWarehouses(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  params.append('fields', JSON.stringify(['name', 'warehouse_name']))
  if (search) {
    params.append(
      'filters',
      JSON.stringify([['Warehouse', 'warehouse_name', 'like', `%${search}%`]])
    )
  }
  params.append('limit_page_length', '50')

  const url = `/api/resource/Warehouse?${params.toString()}`

  const response = await fetch(url)
  const resData = await response.json()

  const data = (resData?.data || resData?.message) as any

  if (Array.isArray(data)) {
    return data.map((w: any) => ({
      name: w.name,
      label: w.warehouse_name || w.name
    })) as LinkFieldOption[]
  } else {
    return []
  }
}

export async function fetchServiceRequestTemplateTypes(): Promise<LinkFieldOption[]> {
  const response = await fetch('/api/method/healthcare.api.common.get_service_request_template_types')
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LinkFieldOption[]
  } else {
    return []
  }
}

export async function fetchServiceRequestTemplates(templateDt: string, search?: string, department?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  params.append('template_dt', templateDt)
  if (search) params.append('search', search)
  if (department) params.append('department', department)
  
  const url = `/api/method/healthcare.api.common.get_service_request_templates?${params.toString()}`
  
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LinkFieldOption[]
  } else {
    return []
  }
}

export async function fetchServiceRequestStatuses(search?: string): Promise<LinkFieldOption[]> {
  try {
    console.log('fetchServiceRequestStatuses: Starting fetch...', search)
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    
    const url = `/api/method/healthcare.api.common.get_service_request_statuses${params.toString() ? `?${params.toString()}` : ''}`
    console.log('fetchServiceRequestStatuses: URL:', url)
    
    const response = await fetch(url)
    console.log('fetchServiceRequestStatuses: Response status:', response.status, response.statusText)
    
    if (!response.ok) {
      console.error('fetchServiceRequestStatuses: Response not OK:', response.status, response.statusText)
      const text = await response.text()
      console.error('fetchServiceRequestStatuses: Response text:', text)
      return []
    }
    
    const resData = await response.json()
    console.log('fetchServiceRequestStatuses: Response data:', resData)

    if (resData?.message && Array.isArray(resData.message)) {
      console.log('Service Request Statuses loaded:', resData.message.length, 'items')
      return resData.message as LinkFieldOption[]
    } else {
      console.warn('Unexpected response format for service request statuses:', resData)
      return []
    }
  } catch (error) {
    console.error('Error fetching service request statuses:', error)
    if (error instanceof Error) {
      console.error('Error details:', error.message, error.stack)
    }
    return []
  }
}

export interface CreatePractitionerData {
  first_name: string
  middle_name?: string
  last_name?: string
  gender?: string
  status?: string
  mobile_phone?: string
  office_phone?: string
  department?: string
  medical_role?: string
}

export async function createPractitioner(data: CreatePractitionerData): Promise<{ name: string; practitioner_name: string }> {
  const { apiRequest } = await import('./apiClient')
  
  const response = await apiRequest('/api/method/healthcare.api.common.create_healthcare_practitioner', {
    method: 'POST',
    body: JSON.stringify({ data }),
  })
  
  if (response?.message) {
    return response.message as { name: string; practitioner_name: string }
  } else {
    throw new Error('Invalid response format')
  }
}



export const fetchDischargeChecklist = async (templateName: string): Promise<ChecklistItem[]> => {
  const response = await fetch(
    `/api/resource/Discharge Template/${encodeURIComponent(templateName)}`,
    { headers: { 'Content-Type': 'application/json' } }
  )
  if (!response.ok) throw new Error('Failed to fetch discharge template')
  const data = await response.json()

  // The child table field name on your Discharge Template doctype —
  // adjust `discharge_checklist` to whatever the actual fieldname is.
  const rows = data?.data?.discharge_checklist ?? []

  return rows.map((row: any) => ({
    name: row.name,
    action_required: row.action_required,
    department: row.department,
    department_label: row.department, // If you have a display label, map it here
    user: row.user ?? '',
    name1: row.name1 ?? '',
    date_time: row.date_time ?? '',
    click: row.click === 1 || row.click === true,
    description: row.description ?? '',
  }))
}
