export async function fetchNursingCarePlanHtml(opts: {
  patient?: string
  admission?: string
  date: string
}): Promise<string> {
  const params = new URLSearchParams()
  if (opts.patient) params.set('patient', opts.patient)
  if (opts.admission) params.set('admission', opts.admission)
  if (opts.date) params.set('date', opts.date)
  const res = await fetch(
    `/api/method/healthcare.api.nursing_care_plan_print.get_nursing_care_plan_html?${params}`,
    { credentials: 'include' }
  )
  const data = await res.json()
  if (data?.exception) {
    let message = 'Failed to build nursing care plan PDF'
    try {
      const raw = data._server_messages
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      const first = Array.isArray(parsed) ? parsed[0] : parsed
      const obj = typeof first === 'string' ? JSON.parse(first) : first
      if (obj?.message) message = String(obj.message)
    } catch {
      if (typeof data.message === 'string' && data.message.trim()) message = data.message
    }
    throw new Error(message)
  }
  const msg = data?.message
  if (typeof msg === 'string' && msg.trim()) return msg
  if (msg && typeof msg === 'object' && typeof (msg as { html?: string }).html === 'string') {
    return (msg as { html: string }).html
  }
  throw new Error('Invalid nursing care plan PDF response')
}
