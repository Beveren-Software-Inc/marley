export async function fetchECTChartHtml(opts: {
  patient?: string
  month: string
  anaesthetist?: string
  costCenter?: string
}): Promise<string> {
  const params = new URLSearchParams()
  if (opts.patient) params.set('patient', opts.patient)
  if (opts.month) params.set('month', opts.month)
  if (opts.anaesthetist) params.set('anaesthetist', opts.anaesthetist)
  if (opts.costCenter) params.set('cost_center', opts.costCenter)
  const res = await fetch(
    `/api/method/healthcare.api.ect_chart_print.get_ect_chart_html?${params}`,
    { credentials: 'include' },
  )
  const data = await res.json()
  if (data?.exception) {
    let message = 'Failed to build ECT Chart PDF'
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
  throw new Error('Invalid ECT Chart PDF response')
}
