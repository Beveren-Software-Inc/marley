export interface LabTest {
  name: string
  patient: string
  patient_name?: string
  practitioner?: string
  practitioner_name?: string
  lab_test_name?: string
  template?: string
  status?: string
  result_date?: string
  submitted_date?: string
  approved_date?: string
  invoiced?: number
  department?: string
}

export async function fetchLabTests(
  limit: number = 50,
  offset: number = 0,
  patient?: string,
  status?: string,
  pending_review: boolean = false
): Promise<LabTest[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (patient) params.append('patient', patient)
  if (status) params.append('status', status)
  if (pending_review) params.append('pending_review', '1')

  const response = await fetch(
    `/api/method/healthcare.api.lab_test.get_lab_tests?${params.toString()}`
  )
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LabTest[]
  } else {
    return []
  }
}

export async function fetchLabTest(name: string): Promise<LabTest> {
  const response = await fetch(
    `/api/method/healthcare.api.lab_test.get_lab_test?name=${encodeURIComponent(name)}`
  )
  const resData = await response.json()

  if (resData?.message) {
    return resData.message as LabTest
  } else {
    throw new Error('Invalid response format')
  }
}

export interface CreateLabTestData {
  patient: string
  template?: string
  practitioner?: string
  date?: string
  time?: string
  department?: string
  service_unit?: string
  status?: string
}

export async function createLabTest(data: CreateLabTestData): Promise<LabTest> {
  const response = await fetch('/api/method/healthcare.api.lab_test.create_lab_test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data })
  })

  const resData = await response.json()

  if (!response.ok) {
    const errorMessage = resData?.message?.message || resData?.message || 'Failed to create lab test'
    throw new Error(errorMessage)
  }

  if (resData?.message) {
    return resData.message as LabTest
  } else {
    throw new Error('Invalid response format')
  }
}




