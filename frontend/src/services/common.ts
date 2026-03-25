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

export interface ChecklistItem {
  name: string
  action_required: string
  department: string
  department_label?: string
  user: string
  name1: string
  date_time: string
  click: boolean
  description?: string
}

export async function fetchPrintFormats(doctype: string): Promise<string[]> {
  if (!doctype) return ['Standard']
  const response = await fetch(
    `/api/method/healthcare.api.common.get_print_formats?doctype=${encodeURIComponent(doctype)}`
  )
  const resData = await response.json()
  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as string[]
  }
  return ['Standard']
}

export async function fetchUoms(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  const url = `/api/method/healthcare.api.common.get_uoms${params.toString() ? `?${params.toString()}` : ''}`
  try {
    const response = await fetch(url, { credentials: 'include' })
    const resData = await response.json()
    return Array.isArray(resData?.message) ? resData.message : []
  } catch { return [] }
}

export async function fetchColors(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  const url = `/api/method/healthcare.api.common.get_colors${params.toString() ? `?${params.toString()}` : ''}`
  try {
    const response = await fetch(url, { credentials: 'include' })
    const resData = await response.json()
    return Array.isArray(resData?.message) ? resData.message : []
  } catch { return [] }
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

export async function fetchAnaesthesiaTypes(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  const url = `/api/method/healthcare.api.common.get_anaesthesia_types${params.toString() ? `?${params.toString()}` : ''}`
  const response = await fetch(url)
  const resData = await response.json()
  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LinkFieldOption[]
  }
  return []
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

/** Fetch Document Type list for Patient document dropdown. */
export async function fetchDocumentTypes(): Promise<{ name: string; document_name?: string }[]> {
  const res = await fetch(
    '/api/resource/Document%20Type?fields=["name","document_name"]&limit_page_length=200'
  )
  const data = await res.json()
  if (!Array.isArray(data?.data)) return []
  return data.data
}

/** Fetch a single document by doctype and name (Frappe resource API). */
export async function fetchDoc(doctype: string, name: string): Promise<Record<string, unknown>> {
  const res = await fetch(
    `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`
  )
  const data = await res.json()
  if (data?.exception) throw new Error(data.message || 'Failed to fetch document')
  if (!data?.data) throw new Error('Invalid response format')
  return data.data as Record<string, unknown>
}

export interface CreateLeadSourceData {
  source: string
}

export async function createLeadSource(
  data: CreateLeadSourceData
): Promise<{ name: string; source: string }> {
  const { apiRequest } = await import('./apiClient')

  const created = await apiRequest<{ name: string; source: string }>(
    '/api/resource/Patient%20Source',
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

export async function fetchHealthcareInsurance(
  search?: string
): Promise<LinkFieldOption[]> {
  console.log('fetchHealthcareInsurance called with search:', search)
  const params = new URLSearchParams()
  if (search) params.append('search', search)

  const url =
    `/api/method/healthcare.api.common.get_healthcare_insurance` +
    `${params.toString() ? `?${params.toString()}` : ''}`

  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LinkFieldOption[]
  } else {
    return []
  }
}

export interface LabTestTemplateOption extends LinkFieldOption {
  outpatient_rate?: number
  inpatient_rate?: number
}

export async function fetchLabTestTemplates(search?: string, department?: string): Promise<LabTestTemplateOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  if (department) params.append('department', department)
  
  const url = `/api/method/healthcare.api.common.get_lab_test_templates${params.toString() ? `?${params.toString()}` : ''}`
  
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LabTestTemplateOption[]
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
  if (search) params.append('search', search)

  const url =
    `/api/method/healthcare.api.common.get_companies` +
    (params.toString() ? `?${params.toString()}` : '')

  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LinkFieldOption[]
  }

  return []
}

export async function fetchCostCenters(company?: string, search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (company) params.append('company', company)
  if (search) params.append('search', search)

  const url =
    `/api/method/healthcare.api.common.get_cost_centers` +
    (params.toString() ? `?${params.toString()}` : '')

  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LinkFieldOption[]
  }

  return []
}


export async function fetchBranches(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  const url =
    `/api/method/healthcare.api.common.get_branches` +
    (params.toString() ? `?${params.toString()}` : '')
  const response = await fetch(url)
  const resData = await response.json()
  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LinkFieldOption[]
  }
  return []
}

export interface EmployeeOption {
  name: string
  label: string
  designation?: string
  department?: string
}

export async function fetchEmployees(search?: string): Promise<EmployeeOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  const url =
    `/api/method/healthcare.api.common.get_employees` +
    (params.toString() ? `?${params.toString()}` : '')
  const response = await fetch(url)
  const resData = await response.json()
  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as EmployeeOption[]
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

export async function fetchDosageForms(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  const res = await fetch(`/api/method/healthcare.api.common.get_dosage_forms?${params.toString()}`)
  const data = await res.json()
  return Array.isArray(data?.message) ? (data.message as LinkFieldOption[]) : []
}

export async function fetchPrescriptionFrequencies(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  const res = await fetch(`/api/method/healthcare.api.common.get_prescription_frequencies?${params.toString()}`)
  const data = await res.json()
  return Array.isArray(data?.message) ? (data.message as LinkFieldOption[]) : []
}

export async function fetchRouteOfAdministrationList(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  const res = await fetch(`/api/method/healthcare.api.common.get_route_of_administration_list?${params.toString()}`)
  const data = await res.json()
  return Array.isArray(data?.message) ? (data.message as LinkFieldOption[]) : []
}

export async function fetchDiagnosis(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  const res = await fetch(`/api/method/healthcare.api.common.get_diagnosis?${params.toString()}`)
  const data = await res.json()
  return Array.isArray(data?.message) ? (data.message as LinkFieldOption[]) : []
}

export async function fetchComplaints(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  const res = await fetch(`/api/method/healthcare.api.common.get_complaints?${params.toString()}`)
  const data = await res.json()
  return Array.isArray(data?.message) ? (data.message as LinkFieldOption[]) : []
}

export async function createDiagnosis(diagnosis: string): Promise<string> {
  const res = await fetch('/api/method/healthcare.api.common.create_diagnosis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ diagnosis: diagnosis.trim() }),
  })
  const data = await res.json()
  if (data?.exc_type) throw new Error(data?.message || 'Failed to create diagnosis')
  return (data?.message as string) || diagnosis.trim()
}

export async function createComplaint(complaints: string): Promise<string> {
  const res = await fetch('/api/method/healthcare.api.common.create_complaint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ complaints: complaints.trim() }),
  })
  const data = await res.json()
  if (data?.exc_type) throw new Error(data?.message || 'Failed to create complaint')
  return (data?.message as string) || complaints.trim()
}

export interface EncounterDiagnosisSymptoms {
  diagnosis: { name: string; label?: string }[]
  symptoms: { name: string; label?: string }[]
}

export async function getEncounterDiagnosisSymptoms(
  parentDoctype: string,
  parentName: string
): Promise<EncounterDiagnosisSymptoms> {
  const params = new URLSearchParams()
  params.append('parent_doctype', parentDoctype)
  params.append('parent_name', parentName)
  const res = await fetch(`/api/method/healthcare.api.encounter_diagnosis.get_encounter_diagnosis_symptoms?${params.toString()}`)
  const data = await res.json()
  if (data?.exc_type) throw new Error(data?.message || 'Failed to load')
  return (data?.message || { diagnosis: [], symptoms: [] }) as EncounterDiagnosisSymptoms
}

export async function updateEncounterDiagnosisSymptoms(
  parentDoctype: string,
  parentName: string,
  diagnosis: { name: string }[],
  symptoms: { name: string }[]
): Promise<void> {
  const res = await fetch('/api/method/healthcare.api.encounter_diagnosis.update_encounter_diagnosis_symptoms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parent_doctype: parentDoctype,
      parent_name: parentName,
      diagnosis,
      symptoms,
    }),
  })
  const data = await res.json()
  if (data?.exc_type) throw new Error(data?.message || 'Failed to save')
}

export interface PatientDiagnosisRow {
  name?: string
  diagnosis: string
  details?: string
  posting_date?: string
}

export interface PatientDiagnosisAggRow extends PatientDiagnosisRow {
  parent: string
  parent_type: 'Patient Visit' | 'Inpatient Admission'
  parent_date?: string
}

export async function getAllPatientDiagnoses(patient: string): Promise<PatientDiagnosisAggRow[]> {
  const params = new URLSearchParams({ patient })
  const res = await fetch(`/api/method/healthcare.api.common.get_all_patient_diagnoses?${params}`)
  const data = await res.json()
  if (data?.exc_type) throw new Error(data?.message || 'Failed to load diagnoses')
  return (Array.isArray(data?.message) ? data.message : []) as PatientDiagnosisAggRow[]
}

export async function getPatientDiagnosis(
  parentDoctype: string,
  parentName: string
): Promise<PatientDiagnosisRow[]> {
  const params = new URLSearchParams({ parent_doctype: parentDoctype, parent_name: parentName })
  const res = await fetch(`/api/method/healthcare.api.common.get_patient_diagnosis?${params}`)
  const data = await res.json()
  if (data?.exc_type) throw new Error(data?.message || 'Failed to load diagnosis')
  return (Array.isArray(data?.message) ? data.message : []) as PatientDiagnosisRow[]
}

export async function savePatientDiagnosis(
  parentDoctype: string,
  parentName: string,
  rows: PatientDiagnosisRow[]
): Promise<void> {
  const res = await fetch('/api/method/healthcare.api.common.save_patient_diagnosis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parent_doctype: parentDoctype, parent_name: parentName, rows }),
  })
  const data = await res.json()
  if (data?.exc_type) throw new Error(data?.message || 'Failed to save diagnosis')
}

/** Fetch ERPNext Departments (Link to `Department`). */
export async function fetchDepartments(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  params.append('fields', JSON.stringify(['name', 'department_name']))
  if (search) {
    params.append(
      'filters',
      JSON.stringify([
        ['Department', 'name', 'like', `%${search}%`],
        ['Department', 'department_name', 'like', `%${search}%`],
      ])
    )
  }
  params.append('limit_page_length', '50')

  const url = `/api/resource/Department?${params.toString()}`
  const res = await fetch(url)
  const data = await res.json()

  const rows = (data?.data || data?.message) as any
  if (Array.isArray(rows)) {
    return rows.map((d: any) => ({
      name: d.name,
      label: d.department_name || d.name,
    })) as LinkFieldOption[]
  }
  return []
}

export async function fetchWarehouses(company?: string, search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  params.append('fields', JSON.stringify(['name', 'warehouse_name']))
  const filters: any[] = []
  // Only non-group warehouses
  filters.push(['Warehouse', 'is_group', '=', 0])
  if (company) {
    filters.push(['Warehouse', 'company', '=', company])
  }
  if (search) {
    filters.push(['Warehouse', 'warehouse_name', 'like', `%${search}%`])
  }
  if (filters.length) {
    params.append('filters', JSON.stringify(filters))
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


export async function fetchPatientVisits(
  patient?: string,
  search?: string
): Promise<LinkFieldOption[]> {
console.log("fetchPatientVisits called with patient:", patient, "search:", search)
  const params = new URLSearchParams()
  if (patient) params.append('patient', patient)
  if (search) params.append('search', search)
    
  const res = await fetch(
    `/api/method/healthcare.api.common.get_patient_visits?${params}`
  )
  console.log("response", res)
  const data = await res.json()
  return Array.isArray(data?.message) ? data.message : []
}


export async function fetchInpatientAdmissions(
  patient?: string,
  search?: string
): Promise<LinkFieldOption[]> {

  const params = new URLSearchParams()
  if (patient) params.append('patient', patient)
  if (search) params.append('search', search)

  const res = await fetch(
    `/api/method/healthcare.api.common.get_inpatient_admissions?${params}`
  )

  const data = await res.json()
  return Array.isArray(data?.message) ? data.message : []
}


export async function fetchSalutations(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)

  const url =
    `/api/method/healthcare.api.common.get_salutations${
      params.toString() ? `?${params.toString()}` : ''
    }`

  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LinkFieldOption[]
  }

  return []
}
export async function fetchPatientOptions(search?: string): Promise<LinkFieldOption[]> {
  const filters: [string, string, string][] = []
  if (search) filters.push(['patient_name', 'like', `%${search}%`])
  const params = new URLSearchParams({
    doctype: 'Patient',
    fields: JSON.stringify(['name', 'patient_name']),
    filters: JSON.stringify(filters),
    limit: '20',
    order_by: 'patient_name asc',
  })
  const res = await fetch(`/api/method/frappe.client.get_list?${params}`)
  const data = await res.json()
  return (data?.message || []).map((p: { name: string; patient_name?: string }) => ({
    name: p.name,
    label: p.patient_name ? `${p.patient_name} (${p.name})` : p.name,
  }))
}

export interface InsuranceClaimRow {
  name: string
  patient: string
  patient_name: string
  health_insurance: string
  insurance_payor: string
  claim_date: string
  status: string
  total_claimed: number
  total_approved: number
  total_rejected: number
  total_patient_liability: number
  sales_invoice: string
  authorization_no?: string
  remark?: string
}

export async function fetchInsuranceClaims(search?: string, patient?: string): Promise<InsuranceClaimRow[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  if (patient) params.append('patient', patient)

  const url = `/api/method/healthcare.api.common.get_insurance_claims${params.toString() ? `?${params.toString()}` : ''}`
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as InsuranceClaimRow[]
  }
  return []
}

export interface InsurancePatientRegisterRow {
  name: string
  full_name: string
  national_id_cpr_no: string
  posting_date: string
  status: string
  insurance_provider: string
  approval_id: string
  approval_validitydays: number
  no_of_visits: string
  patient: string
  no_of_patient_visit?: number
}

export async function fetchInsurancePatientRegisters(search?: string): Promise<InsurancePatientRegisterRow[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)

  const url = `/api/method/healthcare.api.common.get_insurance_patient_registers${params.toString() ? `?${params.toString()}` : ''}`
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as InsurancePatientRegisterRow[]
  }
  return []
}

export async function linkPatientToInsuranceRegister(registerName: string, patient: string): Promise<void> {
  const url = `/api/method/healthcare.api.common.link_patient_to_insurance_register`
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': (window as any).csrf_token || '' },
    body: JSON.stringify({ register_name: registerName, patient }),
  })
}

export interface LabTestTemplateListRow {
  name: string
  lab_test_name: string
  department: string
  lab_test_template_type: string
  is_group: number
  is_billable: number
  disabled: number
}

export async function fetchLabTestTemplateList(search?: string): Promise<LabTestTemplateListRow[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)

  const url = `/api/method/healthcare.api.common.get_lab_test_templates${params.toString() ? `?${params.toString()}` : ''}`
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LabTestTemplateListRow[]
  }
  return []
}

export interface LabTestSampleOption {
  name: string
  sample: string
  sample_type: string
  sample_uom: string
}

export async function fetchLabTestSamples(search?: string): Promise<LabTestSampleOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)

  const url = `/api/method/healthcare.api.common.get_lab_test_samples${params.toString() ? `?${params.toString()}` : ''}`
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LabTestSampleOption[]
  }
  return []
}

export async function fetchSampleTypes(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)

  const url = `/api/method/healthcare.api.common.get_sample_types${params.toString() ? `?${params.toString()}` : ''}`
  const response = await fetch(url)
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return (resData.message as { name: string; sample_type: string }[]).map(t => ({
      name: t.name,
      label: t.sample_type || t.name,
    }))
  }
  return []
}

export async function fetchInpatientAdmissionOptions(search?: string, patient?: string): Promise<LinkFieldOption[]> {
  const filters: [string, string, string][] = []
  if (search) filters.push(['name', 'like', `%${search}%`])
  if (patient) filters.push(['patient', '=', patient])
  const params = new URLSearchParams({
    doctype: 'Inpatient Admission',
    fields: JSON.stringify(['name', 'patient', 'patient_name', 'status']),
    filters: JSON.stringify(filters),
    limit: '20',
    order_by: 'creation desc',
  })
  const res = await fetch(`/api/method/frappe.client.get_list?${params}`)
  const data = await res.json()
  return (data?.message || []).map((r: { name: string; patient?: string; patient_name?: string }) => ({
    name: r.name,
    label: `${r.name}${r.patient_name || r.patient ? ` – ${r.patient_name || r.patient}` : ''}`,
  }))
}

// ─── Health Insurance ─────────────────────────────────────────────────────────

export interface HealthInsuranceRow {
  name: string
  insurance_company: string
  insurance_type: string
  policy_no: string
  outpatient_discount: number
  inpatient_discount: number
  insurance_coverage_: number
  mode_of_payment: string
  insurance_no: string
}

export interface HealthInsuranceDetail {
  doc: Record<string, any>
  patient_count: number
  active_register_count: number
  unused_register_count: number
}

export async function fetchHealthInsurances(search?: string, insurance_company?: string): Promise<HealthInsuranceRow[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  if (insurance_company) params.append('insurance_company', insurance_company)
  const url = `/api/method/healthcare.api.common.get_health_insurances${params.toString() ? `?${params.toString()}` : ''}`
  const res = await fetch(url)
  const data = await res.json()
  return Array.isArray(data?.message) ? (data.message as HealthInsuranceRow[]) : []
}

export async function fetchHealthInsuranceDetail(name: string): Promise<HealthInsuranceDetail | null> {
  const params = new URLSearchParams({ name })
  const url = `/api/method/healthcare.api.common.get_health_insurance_detail?${params}`
  const res = await fetch(url)
  const data = await res.json()
  return data?.message ?? null
}

export async function fetchInsuranceCompanies(search?: string): Promise<LinkFieldOption[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  const url = `/api/method/healthcare.api.common.get_insurance_companies${params.toString() ? `?${params.toString()}` : ''}`
  const res = await fetch(url)
  const data = await res.json()
  return Array.isArray(data?.message)
    ? (data.message as { name: string }[]).map(r => ({ name: r.name, label: r.name }))
    : []
}

export async function createHealthInsurance(payload: Record<string, any>): Promise<{ name: string }> {
  const url = `/api/method/healthcare.api.common.create_health_insurance`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': (window as any).csrf_token || '' },
    body: JSON.stringify({ data: JSON.stringify(payload) }),
  })
  const data = await res.json()
  if (!res.ok || data.exc) throw new Error(data.exc_type || data.message || 'Failed to create')
  return data.message as { name: string }
}

export async function createInsuranceCompany(company_name: string): Promise<{ name: string }> {
  const url = `/api/method/healthcare.api.common.create_insurance_company`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': (window as any).csrf_token || '' },
    body: JSON.stringify({ company_name }),
  })
  const data = await res.json()
  if (!res.ok || data.exc) throw new Error(data.exc_type || data.message || 'Failed to create')
  return data.message as { name: string }
}

export async function fetchModeOfPayments(search?: string): Promise<LinkFieldOption[]> {
  const filters: [string, string, string][] = []
  if (search) filters.push(['name', 'like', `%${search}%`])
  const params = new URLSearchParams({
    doctype: 'Mode of Payment',
    fields: JSON.stringify(['name']),
    filters: JSON.stringify(filters),
    limit: '30',
    order_by: 'name asc',
  })
  const res = await fetch(`/api/method/frappe.client.get_list?${params}`)
  const data = await res.json()
  return (data?.message || []).map((r: { name: string }) => ({ name: r.name, label: r.name }))
}

export async function fetchItemCodes(search?: string): Promise<LinkFieldOption[]> {
  const filters: [string, string, string][] = [['disabled', '=', '0']]
  if (search) filters.push(['name', 'like', `%${search}%`])
  const params = new URLSearchParams({
    doctype: 'Item',
    fields: JSON.stringify(['name', 'item_name']),
    filters: JSON.stringify(filters),
    limit: '30',
    order_by: 'name asc',
  })
  const res = await fetch(`/api/method/frappe.client.get_list?${params}`)
  const data = await res.json()
  return (data?.message || []).map((r: { name: string; item_name?: string }) => ({
    name: r.name,
    label: r.item_name ? `${r.name} — ${r.item_name}` : r.name,
  }))
}

export interface InpatientPackageOption {
  name: string
  package_name: string
  package_rate: number
  no_of_days: number | null
  package_category: string
}

export async function fetchInpatientPackages(search?: string): Promise<InpatientPackageOption[]> {
  const params = new URLSearchParams()
  params.set('cmd', 'healthcare.healthcare.api.common.get_inpatient_packages')
  if (search) params.set('search', search)
  const res = await fetch(`/api/method/healthcare.healthcare.api.common.get_inpatient_packages?${params.toString()}`, { credentials: 'include' })
  if (!res.ok) return []
  const data = await res.json()
  return data.message ?? []
}

export async function fetchItemGroups(search?: string): Promise<LinkFieldOption[]> {
  const filters: [string, string, string][] = []
  if (search) filters.push(['name', 'like', `%${search}%`])
  const params = new URLSearchParams({
    doctype: 'Item Group',
    fields: JSON.stringify(['name']),
    filters: JSON.stringify(filters),
    limit: '30',
    order_by: 'name asc',
  })
  const res = await fetch(`/api/method/frappe.client.get_list?${params}`)
  const data = await res.json()
  return (data?.message || []).map((r: { name: string }) => ({ name: r.name, label: r.name }))
}

export interface SampleCollectionLabTest {
  name: string
  lab_test_name: string
  patient_name: string
}

export interface SampleCollectionRow {
  name: string
  patient: string
  patient_name: string | null
  patient_age: string | null
  sample: string
  sample_type: string | null
  sample_uom: string | null
  collected_by: string | null
  collector_name: string | null
  collected_time: string | null
  status: string
  lab_tests: SampleCollectionLabTest[]
}

export async function fetchSampleCollections(
  search?: string,
  patient?: string,
  page = 1,
  pageSize = 20,
): Promise<SampleCollectionRow[]> {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  if (patient) params.set('patient', patient)
  params.set('page', String(page))
  params.set('page_size', String(pageSize))
  try {
    const res = await fetch(
      `/api/method/healthcare.api.common.get_sample_collections?${params.toString()}`,
      { credentials: 'include' },
    )
    const data = await res.json()
    const msg = data?.message
    if (Array.isArray(msg)) return msg
    if (msg?.data && Array.isArray(msg.data)) return msg.data as SampleCollectionRow[]
    return []
  } catch { return [] }
}

