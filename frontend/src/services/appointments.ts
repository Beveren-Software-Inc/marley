export interface Appointment {
  name: string
  patient?: string
  patient_name?: string
  patient_sex?: string
  patient_age?: string
  appointment_date?: string
  appointment_time?: string
  status?: string
  appointment_type?: string
  department?: string
  practitioner?: string
  practitioner_name?: string
  company?: string
  cost_center?: string
  service_unit?: string
  notes?: string
  temporary_patient_name?: string
  temporary_mobile_no?: string
  referring_practitioner?: string
  mode_of_payment?: string
  paid_amount?: number
  source?: string
  invoiced?: number
  ref_sales_invoice?: string
  sales_order?: string
}

export interface AppointmentSalesOrderResult {
  sales_order: string
  sales_order_status?: string
  existing?: boolean
  sales_invoice?: string | null
  invoiced?: number
}

export interface CreateAppointmentData {
  patient?: string
  appointment_type: string
  appointment_date: string
  appointment_time?: string
  practitioner?: string
  cost_center?: string
  /** Duration in minutes (custom booking or slot override). */
  duration?: number
  temporary_patient_name?: string
  temporary_mobile_no?: string
  notes?: string
}

export interface AppointmentPage {
  data: Appointment[]
  total_count: number
}

export async function fetchPractitionerAppointments(
  limit: number = 50,
  offset: number = 0,
  status?: string,
  search?: string,
  date_from?: string,
  date_to?: string,
): Promise<AppointmentPage> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (status) params.append('status', status)
  if (search) params.append('search', search)
  if (date_from) params.append('date_from', date_from)
  if (date_to) params.append('date_to', date_to)

  const response = await fetch(
    `/api/method/healthcare.api.patient_appointment.get_practitioner_appointments?${params.toString()}`
  )
  const resData = await response.json()

  if (resData?.message && typeof resData.message === 'object' && Array.isArray(resData.message.data)) {
    return resData.message as AppointmentPage
  }
  return { data: [], total_count: 0 }
}

export async function fetchAllAppointments(
  limit: number = 50,
  offset: number = 0,
  status?: string,
  patient?: string,
  search?: string,
  practitioner?: string,
  date_from?: string,
  date_to?: string,
): Promise<AppointmentPage> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  if (status) params.append('status', status)
  if (patient) params.append('patient', patient)
  if (search) params.append('search', search)
  if (practitioner) params.append('practitioner', practitioner)
  if (date_from) params.append('date_from', date_from)
  if (date_to) params.append('date_to', date_to)

  const response = await fetch(
    `/api/method/healthcare.api.patient_appointment.get_all_appointments?${params.toString()}`
  )
  const resData = await response.json()

  if (resData?.message && typeof resData.message === 'object' && Array.isArray(resData.message.data)) {
    return resData.message as AppointmentPage
  }
  return { data: [], total_count: 0 }
}

export interface AppointmentCostCenterOptions {
  cost_centers: { name: string; label: string }[]
  default_cost_center: string
  restricted: boolean
  locked: boolean
}

export async function fetchAppointmentCostCenterOptions(): Promise<AppointmentCostCenterOptions> {
  const response = await fetch(
    '/api/method/healthcare.api.patient_appointment.get_appointment_cost_center_options',
    { credentials: 'include' }
  )
  const resData = await response.json()
  const msg = resData?.message
  if (msg && typeof msg === 'object') {
    return msg as AppointmentCostCenterOptions
  }
  return {
    cost_centers: [],
    default_cost_center: '',
    restricted: false,
    locked: false,
  }
}

export async function createAppointment(data: CreateAppointmentData): Promise<Appointment> {
  const csrf = (window as any).csrf_token
  const response = await fetch(
    '/api/method/healthcare.api.patient_appointment.create_appointment',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {})
      },
      body: JSON.stringify({ data })
    }
  )
  const resData = await response.json()

  if (resData?.message) {
    return resData.message as Appointment
  } else {
    throw new Error(resData?.exc_type ? resData.exc : 'Failed to create appointment')
  }
}

export interface UpdateAppointmentStatusResult {
  patient_visit?: string
}

/** Update appointment status; optional `notes` appends to the appointment Notes field (e.g. reception arrival). */
export async function updateAppointmentStatus(
  appointmentId: string,
  status: string,
  notes?: string,
  checkoutTime?: string
): Promise<UpdateAppointmentStatusResult> {
  const csrf = (window as any).csrf_token
  const body: Record<string, string> = {
    appointment_id: appointmentId,
    status,
  }
  if (notes !== undefined && notes !== '') {
    body.notes = notes
  }
  if (checkoutTime !== undefined && checkoutTime !== '') {
    body.checkout_time = checkoutTime
  }
  const response = await fetch(
    '/api/method/healthcare.healthcare.doctype.patient_appointment.patient_appointment.update_status',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify(body),
    }
  )
  const resData = await response.json()
  if (resData?.exc) {
    throw new Error(resData.exc_type ? `${resData.exc_type}: ${resData.exc}` : resData.exc)
  }
  if (resData?.message && typeof resData.message === 'object') {
    return resData.message as UpdateAppointmentStatusResult
  }
  return {}
}

/** Appointment has no linked Patient record (walk-in or incomplete booking). */
export function appointmentNeedsRegistration(
  apt: Pick<Appointment, 'patient'>,
): boolean {
  return !apt.patient?.trim()
}

/** Walk-in booking: temporary name on file and no patient linked yet. */
export function isWalkInAppointment(apt: Pick<Appointment, 'patient' | 'temporary_patient_name'>): boolean {
  return appointmentNeedsRegistration(apt) && Boolean(apt.temporary_patient_name?.trim())
}

export async function linkWalkInAppointmentToPatient(
  appointmentName: string,
  patient: string,
): Promise<Appointment> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()
  const response = await fetch(
    '/api/method/healthcare.api.patient_appointment.link_walk_in_appointment_to_patient',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({ appointment_name: appointmentName, patient }),
    },
  )
  const resData = await response.json()
  if (resData?.exc) {
    throw new Error(messageFromExc(resData.exc, resData.exc_type))
  }
  if (resData?.message && typeof resData.message === 'object') {
    return resData.message as Appointment
  }
  throw new Error('Failed to link patient to appointment')
}

export async function createAppointmentSalesOrder(
  appointmentName: string,
  createSalesInvoice = false,
): Promise<AppointmentSalesOrderResult> {
  const { ensureCSRF } = await import('./apiClient')
  const csrf = await ensureCSRF()
  const response = await fetch(
    '/api/method/healthcare.api.patient_appointment.create_sales_order_from_appointment',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({
        appointment_name: appointmentName,
        create_sales_invoice: createSalesInvoice ? 1 : 0,
      }),
    },
  )
  const resData = await response.json()
  if (resData?.exc) {
    throw new Error(messageFromExc(resData.exc, resData.exc_type))
  }
  if (resData?.message && typeof resData.message === 'object') {
    return resData.message as AppointmentSalesOrderResult
  }
  throw new Error('Failed to create Sales Order for appointment')
}

export async function createEncounterFromAppointment(appointmentId: string): Promise<string> {
  const csrf = (window as any).csrf_token
  const response = await fetch(
    '/api/method/healthcare.healthcare.doctype.patient_appointment.patient_appointment.create_encounter_from_appointment',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {})
      },
      body: JSON.stringify({ appointment_id: appointmentId })
    }
  )
  const resData = await response.json()
  if (resData?.exc) {
    throw new Error(resData.exc_type ? `${resData.exc_type}: ${resData.exc}` : resData.exc)
  }
  if (typeof resData?.message === 'string') {
    return resData.message
  }
  throw new Error('Invalid response from create_encounter_from_appointment')
}

export type ReminderChannel = 'email' | 'whatsapp' | 'sms'

export async function sendAppointmentReminder(
  appointmentName: string,
  channel: ReminderChannel = 'sms'
): Promise<{ sent: boolean; channel: string; appointment: string }> {
  const csrf = await ensureCSRF()
  const res = await fetch(
    '/api/method/healthcare.healthcare.doctype.patient_appointment.patient_appointment.send_appointment_reminder_manual',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({ appointment_name: appointmentName, channel }),
    }
  )
  const data = await res.json()
  if (data?.exc) throw new Error(messageFromExc(data.exc, data.exc_type))
  return (data?.message as { sent: boolean; channel: string; appointment: string }) || { sent: true, channel, appointment: appointmentName }
}

export async function sendAppointmentRemindersBulk(
  appointmentNames: string[],
  channel: ReminderChannel = 'sms'
): Promise<{ sent: number; failed: number }> {
  const csrf = await ensureCSRF()
  const res = await fetch(
    '/api/method/healthcare.healthcare.doctype.patient_appointment.patient_appointment.send_appointment_reminders_bulk',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({ appointment_names: JSON.stringify(appointmentNames), channel }),
    }
  )
  const data = await res.json()
  if (data?.exc) throw new Error(messageFromExc(data.exc, data.exc_type))
  return (data?.message as { sent: number; failed: number }) || { sent: 0, failed: 0 }
}

/** Base URL for Frappe app (same origin). */
function appBase(): string {
  if (typeof window === 'undefined') return '/app'
  const base = window.location.origin
  return `${base}/app`
}

/** Base URL for healthcare app (same origin, with router basename in production). */
function healthcareAppBase(): string {
  if (typeof window === 'undefined') return ''
  const base = window.location.origin
  const basename = (window as any).__HEALTHCARE_ROUTER_BASENAME__ as string | undefined
  return `${base}${basename || ''}`
}

/** Open Patient Appointment form in new tab (for Reschedule). */
export function getAppointmentFormUrl(appointmentName: string): string {
  return `${appBase()}/patient-appointment/${encodeURIComponent(appointmentName)}`
}

/** Open new Vital Signs form with patient and appointment pre-filled. */
export function getVitalSignsNewUrl(patient: string, appointment: string, company?: string): string {
  const params = new URLSearchParams()
  params.set('patient', patient)
  params.set('appointment', appointment)
  if (company) params.set('company', company)
  return `${appBase()}/vital-signs/new?${params.toString()}`
}

/** Open Patient Visit form in same app (new tab). Uses /patient-visit/:name route. */
export function getPatientVisitFormUrl(visitName: string): string {
  return `${healthcareAppBase()}/patient-visit/${encodeURIComponent(visitName)}`
}

/** Availability slot from get_availability_data (one time slot). */
export interface AvailabilitySlotInfo {
  from_time: string
  to_time: string
  duration?: number
  maximum_appointments?: number
}

/** Booked appointment in a slot detail. */
export interface SlotAppointment {
  name: string
  appointment_time: string
  duration: number
  appointment_date?: string
}

/** One schedule block from get_availability_data. */
export interface SlotDetail {
  slot_name: string
  service_unit: string | null
  avail_slot: AvailabilitySlotInfo[]
  appointments: SlotAppointment[]
  allow_overlap?: number
  service_unit_capacity?: number
  tele_conf?: number
}

export interface GetAvailabilityDataResponse {
  slot_details: SlotDetail[]
  fee_validity: unknown
  /** Set when slots cannot be loaded (e.g. practitioner has no schedule). */
  user_message?: string
}

/** Extract a short user-facing message from Frappe exception (avoid full traceback). */
export function messageFromExc(exc: string, excType?: string): string {
  if (!exc || typeof exc !== 'string') return excType ? String(excType) : 'Request failed'
  let text = exc.trim()
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text) as unknown
      if (Array.isArray(parsed) && parsed[0]) text = String(parsed[0])
    } catch {
      /* use raw */
    }
  }
  const validationMatch = text.match(/ValidationError:\s*(.+?)(?:\n|$)/s)
  if (validationMatch) return validationMatch[1].trim()
  const lastLine = text.split('\n').filter(Boolean).pop() || text
  const match =
    lastLine.match(/^(?:[\w.]+\.)?ValidationError:\s*(.+)$/) || lastLine.match(/^(.+)$/)
  return (match ? match[1].trim() : lastLine) || (excType ? String(excType) : 'Request failed')
}

/** Friendly copy for schedule / availability API failures. */
export function friendlyAvailabilityMessage(raw: string): string {
  const msg = messageFromExc(raw)
  if (/practitioner schedule|Healthcare Practitioner Schedule/i.test(msg)) {
    if (msg.includes('has no practitioner schedule')) {
      return msg.includes('Custom time')
        ? msg
        : `${msg.replace(/\.\s*$/, '')}, or use Custom time to book.`
    }
    return 'This practitioner has no schedule set up. Open the Healthcare Practitioner record and add entries under Practitioner Schedules, or use Custom time to book.'
  }
  if (/holiday/i.test(msg)) {
    return msg
  }
  if (/leave/i.test(msg)) {
    return msg
  }
  if (/Traceback|File \"/i.test(msg)) {
    return 'Could not load schedule slots. Check the practitioner schedule or use Custom time.'
  }
  return msg
}

/** Ensure CSRF token exists (fetch from API if missing). Required for POST on 8000/live. */
async function ensureCSRF(): Promise<string | null> {
  let token = (window as any).csrf_token
  if (token) return token
  const base = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : ''
  try {
    const resp = await fetch(`${base}/api/method/frappe.sessions.get_csrf_token`, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' }
    })
    if (!resp.ok) return null
    const data = await resp.json().catch(() => ({} as any))
    token = data?.message ?? data?.data ?? null
    if (token) (window as any).csrf_token = token
    return token
  } catch {
    return null
  }
}

/** Fetch available slots for a practitioner on a date (for reschedule/book or new booking). Pass appointmentName "new" for new appointment. */
export async function getAvailabilityData(
  date: string,
  practitioner: string,
  appointmentName: string
): Promise<GetAvailabilityDataResponse> {
  const appointmentParam =
    !appointmentName || appointmentName.trim().toLowerCase() === 'new'
      ? 'new'
      : JSON.stringify({ doctype: 'Patient Appointment', name: appointmentName })
  const path = '/api/method/healthcare.healthcare.doctype.patient_appointment.patient_appointment.get_availability_data'
  const csrf = await ensureCSRF()
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {})
    },
    body: JSON.stringify({
      date,
      practitioner,
      appointment: appointmentParam
    })
  })
  const resData = await response.json()
  if (resData?.exc) {
    throw new Error(friendlyAvailabilityMessage(String(resData.exc)))
  }
  const payload = resData?.message as GetAvailabilityDataResponse | undefined
  if (payload && Array.isArray(payload.slot_details)) {
    return payload
  }
  throw new Error('Could not load schedule slots. Please try again or use Custom time.')
}

/** Reschedule an appointment to a new date and time (and optional slot duration/service_unit). */
export async function rescheduleAppointment(
  appointmentId: string,
  appointmentDate: string,
  appointmentTime?: string,
  duration?: number,
  serviceUnit?: string
): Promise<{ name: string; appointment_date: string; appointment_time: string }> {
  const body: Record<string, unknown> = {
    appointment_id: appointmentId,
    appointment_date: appointmentDate,
    appointment_time: appointmentTime || undefined
  }
  if (duration != null) body.duration = duration
  if (serviceUnit != null) body.service_unit = serviceUnit

  const csrf = (window as any).csrf_token
  const response = await fetch(
    '/api/method/healthcare.healthcare.doctype.patient_appointment.patient_appointment.reschedule_appointment',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {})
      },
      body: JSON.stringify(body)
    }
  )
  const resData = await response.json()
  if (resData?.exc) {
    throw new Error(resData.exc_type ? `${resData.exc_type}: ${resData.exc}` : resData.exc)
  }
  if (resData?.message && typeof resData.message === 'object' && (resData.message as { name?: string }).name) {
    return resData.message as { name: string; appointment_date: string; appointment_time: string }
  }
  throw new Error('Invalid response from reschedule_appointment')
}

