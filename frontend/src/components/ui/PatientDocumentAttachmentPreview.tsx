import { useEffect, useState } from 'react'
import { ExternalLink, FileText, Printer } from 'lucide-react'
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

export function resolvePatientDocumentDisplayUrl(url?: string | null): string | undefined {
  if (!url?.trim()) return undefined
  if (url.startsWith('data:') || url.startsWith('http')) return url
  return attachFileDisplayUrl(url)
}

/** Open attached file in a new tab for viewing. */
export function viewPatientDocument(url?: string | null): void {
  const displayUrl = resolvePatientDocumentDisplayUrl(url)
  if (!displayUrl) return
  window.open(displayUrl, '_blank', 'noopener,noreferrer')
}

/** Open a print-friendly window for the attached file (image/PDF/other). */
export function printPatientDocument(url?: string | null, fileName?: string): void {
  const displayUrl = resolvePatientDocumentDisplayUrl(url)
  if (!displayUrl) return

  const ext = fileExtension(displayUrl, fileName)
  const title = (fileName || 'Document').replace(/[<>&"]/g, '')

  if (isImageExtension(ext, displayUrl) || (!ext && displayUrl.includes('signature_'))) {
    const win = window.open('', '_blank')
    if (!win) {
      window.open(displayUrl, '_blank', 'noopener,noreferrer')
      return
    }
    win.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
      <style>html,body{margin:0;padding:0;background:#fff}img{max-width:100%;height:auto;display:block;margin:0 auto}</style>
      </head><body><img src="${displayUrl}" alt="${title}" onload="window.focus();window.print()" /></body></html>`)
    win.document.close()
    return
  }

  const win = window.open(displayUrl, '_blank', 'noopener,noreferrer')
  if (!win) return
  const tryPrint = () => {
    try {
      win.focus()
      win.print()
    } catch {
      /* cross-origin PDFs may block; user can print from the opened tab */
    }
  }
  win.addEventListener('load', tryPrint)
  // Fallback if load already fired or never fires (some PDF viewers)
  setTimeout(tryPrint, 800)
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
  const displayUrl = resolvePatientDocumentDisplayUrl(url)
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [displayUrl])

  if (!displayUrl) return null

  const ext = fileExtension(displayUrl, fileName)
  const maxImageHeight = compact ? 'max-h-48' : 'max-h-80'
  const tryImagePreview = !isPdfExtension(ext) && !imageFailed

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => viewPatientDocument(displayUrl)}
        className="inline-flex items-center gap-1 rounded-md border border-primary/30 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/5"
      >
        <ExternalLink className="h-3 w-3 shrink-0" />
        View
      </button>
      <button
        type="button"
        onClick={() => printPatientDocument(displayUrl, fileName)}
        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        <Printer className="h-3 w-3 shrink-0" />
        Print
      </button>
    </div>
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
          {actions}
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
          {actions}
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
        {actions}
      </div>
    </div>
  )
}
