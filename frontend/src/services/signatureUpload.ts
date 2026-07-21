import { apiRequest, ensureCSRF } from './apiClient'

/**
 * REC-061 / REC-062 - capture a signature and auto-upload it, then write the
 * resulting file_url straight onto the target document field. This is the piece
 * that was missing: SignaturePad already existed, but every consumer wired its
 * own bespoke upload, and the admission forms had none at all.
 */

export async function uploadSignatureFile(
  file: File,
  opts: { doctype?: string; docname?: string; isPrivate?: boolean } = {}
): Promise<string> {
  const csrf = (window as any).csrf_token || (await ensureCSRF())
  const form = new FormData()
  form.append('file', file)
  form.append('is_private', opts.isPrivate === false ? '0' : '1')
  form.append('folder', 'Home/Attachments')
  // Frappe rejects upload_file when docname is supplied for an unsaved doc, so
  // only attach when we genuinely have a saved target.
  if (opts.doctype && opts.docname) {
    form.append('doctype', opts.doctype)
    form.append('docname', opts.docname)
  }
  if (csrf) form.append('csrf_token', csrf)

  const base = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : ''
  const res = await fetch(`${base}/api/method/upload_file`, {
    method: 'POST',
    headers: csrf ? { 'X-Frappe-CSRF-Token': csrf } : {},
    body: form,
    credentials: 'include',
  })

  const data = await res.json().catch(() => ({} as any))
  if (data?.exc) {
    let reason = 'Signature upload failed'
    try {
      const msgs = JSON.parse(data._server_messages || '[]')
      reason = JSON.parse(msgs[0] || '{}')?.message || reason
    } catch {
      reason = data?.message || reason
    }
    throw new Error(reason)
  }
  if (!res.ok) throw new Error(`Signature upload failed: HTTP ${res.status}`)

  const url = data?.message?.file_url
  if (!url) throw new Error('Signature upload returned no file URL')
  return url
}

/** Upload the signature and persist it onto a field of a saved document. */
export async function captureSignatureToField(
  doctype: string,
  docname: string,
  fieldname: string,
  file: File
): Promise<string> {
  const fileUrl = await uploadSignatureFile(file, { doctype, docname })
  await apiRequest(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(docname)}`, {
    method: 'PUT',
    body: JSON.stringify({ [fieldname]: fileUrl }),
  })
  return fileUrl
}

export async function fetchSignatureValue(
  doctype: string,
  docname: string,
  fieldname: string
): Promise<string> {
  const res = await apiRequest<{ data: Record<string, any> }>(
    `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(docname)}?fields=${encodeURIComponent(
      JSON.stringify([fieldname])
    )}`
  )
  return res?.data?.[fieldname] || ''
}
