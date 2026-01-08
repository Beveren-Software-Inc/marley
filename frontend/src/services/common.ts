export interface LinkFieldOption {
  name: string
  label: string
  department?: string
  medical_role?: string
  item_code?: string
  item_group?: string
  code_value?: string
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


