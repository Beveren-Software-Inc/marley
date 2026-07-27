import { useState } from 'react'
import { PenLine } from 'lucide-react'
import { SignaturePad, attachFileDisplayUrl } from '../ui/SignaturePad'
import { uploadPatientFile } from '../../services/patients'
import { signPrescription } from '../../services/prescriptions'
import { toast } from '../../hooks/useToast'
import { prescriptionNeedsSignature, prescriptionIsSigned } from '../../utils/prescriptionSigning'

interface SignPrescriptionPanelProps {
  prescriptionName: string
  currentSignature?: string | null
  status?: string
  newSystem?: 0 | 1
  onSigned?: () => void
  compact?: boolean
}

export const SignPrescriptionPanel = ({
  prescriptionName,
  currentSignature,
  status,
  newSystem,
  onSigned,
  compact = false,
}: SignPrescriptionPanelProps) => {
  const [signatureUploading, setSignatureUploading] = useState(false)
  const [attachmentUploading, setAttachmentUploading] = useState(false)
  const [pendingSignature, setPendingSignature] = useState<string | null>(null)

  // Only use saved document state — pending local upload must not hide the sign UI.
  const needsSign = prescriptionNeedsSignature({
    new_system: newSystem,
    doctors_signature: currentSignature ?? undefined,
    status,
  })

  const displaySignature = currentSignature || pendingSignature
  const busy = signatureUploading || attachmentUploading

  const persistSignature = async (fileUrl: string) => {
    await signPrescription(prescriptionName, fileUrl)
    toast.success('Prescription signed')
    setPendingSignature(null)
    onSigned?.()
  }

  const handleSignatureSave = async (file: File) => {
    setSignatureUploading(true)
    try {
      const fileUrl = await uploadPatientFile(file)
      if (!fileUrl) throw new Error('No URL returned from signature upload')
      setPendingSignature(fileUrl)
      await persistSignature(fileUrl)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sign prescription'
      toast.error(message)
    } finally {
      setSignatureUploading(false)
    }
  }

  const handleSignatureAttachment = async (file: File | null) => {
    if (!file) return
    setAttachmentUploading(true)
    try {
      const fileUrl = await uploadPatientFile(file)
      if (!fileUrl) throw new Error('No URL returned from upload')
      setPendingSignature(fileUrl)
      await persistSignature(fileUrl)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to sign prescription')
    } finally {
      setAttachmentUploading(false)
    }
  }

  if (!needsSign && prescriptionIsSigned({ new_system: newSystem, doctors_signature: currentSignature ?? undefined, status })) {
    return (
      <div className={`rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ${compact ? '' : 'mb-4'}`}>
        <div className="font-medium">Signed prescription</div>
        <p className="text-xs text-emerald-800 mt-1">Medicine can be given from this prescription.</p>
        {currentSignature && (
          <img
            src={attachFileDisplayUrl(currentSignature)}
            alt="Doctor signature"
            className="mt-2 max-h-16 object-contain"
          />
        )}
      </div>
    )
  }

  if (!needsSign) return null

  return (
    <div className={`rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 space-y-3 ${compact ? '' : 'mb-4'}`}>
      <div>
        <div className="flex items-center gap-1.5 text-sm font-medium text-amber-900">
          <PenLine className="h-4 w-4" />
          Signature required
        </div>
        <p className="text-xs text-amber-800 mt-1">
          Draw a signature or upload a file into Doctors Signature. Nurses can give medicine only after
          it is signed.
        </p>
      </div>
      <div className="rounded-lg border border-amber-100 bg-white p-3">
        <SignaturePad
          onSave={handleSignatureSave}
          onClear={() => setPendingSignature(null)}
          existingUrl={attachFileDisplayUrl(displaySignature)}
          uploading={busy}
        />
      </div>
      <div className="rounded-lg border border-amber-100 bg-white p-3">
        <span className="text-xs font-medium text-amber-900">Or upload signature file</span>
        <p className="text-xs text-amber-800 mt-1 mb-2">
          Goes to the same Doctors Signature field.
        </p>
        <input
          type="file"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0] || null
            void handleSignatureAttachment(file)
            e.target.value = ''
          }}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
        {attachmentUploading && (
          <p className="text-xs text-amber-800 mt-2">Uploading into signature…</p>
        )}
      </div>
    </div>
  )
}
