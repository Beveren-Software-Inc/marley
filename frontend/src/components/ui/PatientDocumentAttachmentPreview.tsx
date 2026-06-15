import { useEffect, useState } from 'react'
import { ExternalLink, FileText } from 'lucide-react'
import { attachFileDisplayUrl } from './SignaturePad'

function fileExtension(url: string, fileName?: string): string {
  const source = (fileName || url).split('?')[0].toLowerCase()
  const match = source.match(/\.([a-z0-9]+)$/i)
  return match?.[1] ?? ''
}

function isImageExtension(ext: string, url: string): boolean {
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return true
  return url.includes('signature_')
}

function isPdfExtension(ext: string): boolean {
  return ext === 'pdf'
}

function resolveDisplayUrl(url?: string | null): string | undefined {
  if (!url?.trim()) return undefined
  if (url.startsWith('data:') || url.startsWith('http')) return url
  return attachFileDisplayUrl(url)
}

interface PatientDocumentAttachmentPreviewProps {
  url?: string | null
  fileName?: string
  /** Shorter max height for dense forms */
  compact?: boolean
}

/** Inline preview for patient document attachments (images, PDFs, other files). */
export function PatientDocumentAttachmentPreview({
  url,
  fileName,
  compact = false,
}: PatientDocumentAttachmentPreviewProps) {
  const displayUrl = resolveDisplayUrl(url)
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [displayUrl])

  if (!displayUrl) return null

  const ext = fileExtension(displayUrl, fileName)
  const maxImageHeight = compact ? 'max-h-48' : 'max-h-80'
  const tryImagePreview = !isPdfExtension(ext) && !imageFailed
  const openLink = (
    <a
      href={displayUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
    >
      <ExternalLink className="h-3 w-3 shrink-0" />
      Open in new tab
    </a>
  )

  if (tryImagePreview && (isImageExtension(ext, displayUrl) || !ext)) {
    return (
      <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-white p-2">
        <img
          src={displayUrl}
          alt={fileName || 'Attached document'}
          className={`${maxImageHeight} w-full rounded object-contain`}
          onError={() => setImageFailed(true)}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-green-700">✓ File attached</span>
          {openLink}
        </div>
      </div>
    )
  }

  if (isPdfExtension(ext)) {
    return (
      <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-white overflow-hidden">
        <iframe
          src={displayUrl}
          title={fileName || 'PDF preview'}
          className="h-80 w-full border-0 bg-slate-50"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-2 py-2">
          <span className="text-xs text-green-700">✓ File attached</span>
          {openLink}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <FileText className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="truncate text-xs text-slate-700" title={fileName || displayUrl}>
          {fileName || 'Attached file'}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-green-700">✓ File attached</span>
        {openLink}
      </div>
    </div>
  )
}
