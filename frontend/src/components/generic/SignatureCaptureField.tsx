import { useCallback, useEffect, useState } from 'react'
import { SignaturePad } from '../ui/SignaturePad'
import { captureSignatureToField, fetchSignatureValue } from '../../services/signatureUpload'
import { toast } from '../../hooks/useToast'

/**
 * REC-061 / REC-062 - signature capture with automatic upload.
 * Draws, uploads and writes the file URL back to the document field in one step,
 * replacing the manual sign-then-attach flow.
 */

interface SignatureCaptureFieldProps {
  doctype: string
  docname: string
  fieldname: string
  label: string
  /** Optional caption, e.g. who is expected to sign. */
  hint?: string
  onCaptured?: (url: string) => void
}

export const SignatureCaptureField = ({
  doctype,
  docname,
  fieldname,
  label,
  hint,
  onCaptured,
}: SignatureCaptureFieldProps) => {
  const [existingUrl, setExistingUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!docname) return
    setLoading(true)
    try {
      setExistingUrl(await fetchSignatureValue(doctype, docname, fieldname))
    } catch {
      setExistingUrl('')
    } finally {
      setLoading(false)
    }
  }, [doctype, docname, fieldname])

  useEffect(() => {
    load()
  }, [load])

  const handleSave = async (file: File) => {
    if (!docname) {
      toast.error('Save the document before capturing a signature.')
      return
    }
    setUploading(true)
    try {
      const url = await captureSignatureToField(doctype, docname, fieldname, file)
      setExistingUrl(url)
      onCaptured?.(url)
      toast.success(`${label} captured`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Signature upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2">
        <div className="text-sm font-medium text-slate-800">{label}</div>
        {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
      </div>
      {loading ? (
        <p className="py-4 text-center text-xs text-slate-500">Loading…</p>
      ) : (
        <SignaturePad
          onSave={handleSave}
          onClear={() => setExistingUrl('')}
          existingUrl={existingUrl}
          uploading={uploading}
        />
      )}
      {existingUrl && (
        <p className="mt-2 text-[11px] text-green-700">
          Signed and uploaded automatically — stored on {doctype}.{fieldname}
        </p>
      )}
    </div>
  )
}
