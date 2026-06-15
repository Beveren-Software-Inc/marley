/** Human-readable labels for common Frappe mandatory field names */
const MANDATORY_FIELD_LABELS: Record<string, string> = {
  cost_center: 'Branch',
  practitioner: 'Practitioner',
  patient: 'Patient',
  patient_visit: 'Patient visit',
  inpatient_record: 'Inpatient admission',
  template_dt: 'Template type',
  template_dn: 'Template',
  order_date: 'Order date',
  order_time: 'Order time',
}

function labelForField(field: string): string {
  const key = field.trim()
  return (
    MANDATORY_FIELD_LABELS[key] ||
    key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  )
}

function messageFromMandatoryExc(exc: string): string | null {
  const match = exc.match(/MandatoryError:\s*\[[^\]]+\]:\s*([^\n]+)/)
  if (!match) return null
  const fields = match[1].split(',').map((f) => f.trim()).filter(Boolean)
  if (!fields.length) return null
  return `Please provide: ${fields.map(labelForField).join(', ')}.`
}

function messageFromExceptionString(exc: string): string | null {
  const mandatory = messageFromMandatoryExc(exc)
  if (mandatory) return mandatory

  const patterns = [
    /ValidationError:\s*(.+?)(?:\n|$)/s,
    /frappe\.exceptions\.ValidationError:\s*(.+?)(?:\n|$)/s,
    /frappe\.exceptions\.\w+:\s*(.+?)(?:\n|$)/s,
  ]
  for (const re of patterns) {
    const m = exc.match(re)
    if (m?.[1]) {
      const msg = m[1].trim()
      if (msg && !msg.includes('Traceback') && msg.length < 500) return msg
    }
  }
  return null
}

function parseServerMessages(raw: unknown): string | null {
  if (!raw) return null
  try {
    const arr = typeof raw === 'string' ? (JSON.parse(raw) as unknown[]) : raw
    if (!Array.isArray(arr)) return null
    for (const item of arr) {
      let parsed: { message?: string } | null = null
      if (typeof item === 'string') {
        try {
          parsed = JSON.parse(item) as { message?: string }
        } catch {
          const trimmed = item.trim()
          if (trimmed && !trimmed.startsWith('[') && !trimmed.includes('Traceback')) {
            return trimmed
          }
        }
      } else if (item && typeof item === 'object') {
        parsed = item as { message?: string }
      }
      const msg = parsed?.message?.trim()
      if (msg && !msg.includes('Traceback')) return msg
    }
  } catch {
    /* ignore */
  }
  return null
}

/**
 * Extract a short user-facing message from a Frappe `/api/method` JSON response.
 * Avoids showing full Python tracebacks in the UI.
 */
export function frappeErrorMessage(
  out: Record<string, unknown>,
  fallback = 'Something went wrong. Please try again.'
): string {
  const fromServer = parseServerMessages(out._server_messages)
  if (fromServer) return fromServer

  const msg = out.message
  if (typeof msg === 'string' && msg.trim() && !msg.trim().startsWith('[')) {
    return msg.trim()
  }
  if (msg && typeof msg === 'object' && typeof (msg as { message?: string }).message === 'string') {
    const inner = (msg as { message: string }).message.trim()
    if (inner && !inner.includes('Traceback')) return inner
  }

  if (typeof out.exc === 'string' && out.exc.trim()) {
    const fromExc = messageFromExceptionString(out.exc)
    if (fromExc) return fromExc
    if (!out.exc.includes('Traceback')) {
      const last = out.exc.split('\n').filter(Boolean).pop()?.trim()
      if (last && last.length < 300) return last
    }
  }

  if (typeof out.exc_type === 'string' && out.exc_type === 'MandatoryError') {
    return 'Please fill in all required fields before saving.'
  }

  return fallback
}
