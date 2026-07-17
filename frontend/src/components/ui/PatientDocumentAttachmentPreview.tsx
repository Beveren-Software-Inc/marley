import { useEffect, useState } from 'react'
import { ExternalLink, FileText, Printer } from 'lucide-react'
import { attachFileDisplayUrl } from './SignaturePad'

function fileExtension(url: string, fileName?: string): string {
  // Prefer the file URL — display labels often have no extension.
  for (const source of [url, fileName || '']) {
    const clean = source.split('?')[0].toLowerCase()
    const match = clean.match(/\.([a-z0-9]+)$/i)
    if (match) return match[1]
  }
  return ''
}

function isImageExtension(ext: string, url: string): boolean {
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return true
  if (url.startsWith('data:image/')) return true
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

/** Print an image via a hidden iframe so the browser print dialog opens in-place. */
function printImageInPlace(displayUrl: string, title: string): void {
  printImagesInPlace([{ url: displayUrl, label: title }], title)
}

/** Print one or more images on a single page via a hidden iframe. */
export function printImagesInPlace(
  images: Array<{ url: string; label?: string }>,
  title = 'Print'
): void {
  const resolved = images
    .map((img) => ({
      url: resolvePatientDocumentDisplayUrl(img.url) || '',
      label: (img.label || '').replace(/[<>&"]/g, ''),
    }))
    .filter((img) => img.url)

  if (!resolved.length) return

  const existing = document.getElementById('hc-attach-print-frame')
  if (existing) existing.remove()

  const iframe = document.createElement('iframe')
  iframe.id = 'hc-attach-print-frame'
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;'
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument || iframe.contentWindow?.document
  if (!doc) {
    iframe.remove()
    return
  }

  const safeTitle = title.replace(/[<>&"]/g, '')
  const multi = resolved.length > 1
  const blocks = resolved
    .map((img, idx) => {
      const safeUrl = img.url.replace(/"/g, '&quot;')
      const caption = img.label
        ? `<div class="caption">${img.label}</div>`
        : ''
      return `<div class="block">${caption}<img class="print-img" data-idx="${idx}" src="${safeUrl}" alt="${img.label || safeTitle}" /></div>`
    })
    .join('')

  doc.open()
  doc.write(`<!DOCTYPE html><html><head><title>${safeTitle}</title>
    <style>
      @page { margin: 8mm; size: auto; }
      html, body { margin: 0; padding: 0; background: #fff; }
      .page {
        display: flex;
        flex-direction: column;
        gap: ${multi ? '6mm' : '0'};
        min-height: 100vh;
        box-sizing: border-box;
        padding: 2mm;
      }
      .block {
        flex: ${multi ? '1 1 0' : '0 0 auto'};
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 0;
        page-break-inside: avoid;
      }
      .caption {
        font: 600 11px/1.3 system-ui, sans-serif;
        color: #334155;
        margin-bottom: 2mm;
        text-align: center;
      }
      img.print-img {
        max-width: 100%;
        max-height: ${multi ? '48vh' : '90vh'};
        width: auto;
        height: auto;
        object-fit: contain;
        display: block;
      }
    </style>
  </head><body><div class="page">${blocks}</div></body></html>`)
  doc.close()

  const cleanup = () => {
    try {
      iframe.remove()
    } catch {
      /* ignore */
    }
  }

  const runPrint = () => {
    const win = iframe.contentWindow
    if (!win) {
      cleanup()
      return
    }
    win.onafterprint = cleanup
    setTimeout(cleanup, 60_000)
    try {
      win.focus()
      win.print()
    } catch {
      cleanup()
    }
  }

  const imgs = Array.from(doc.querySelectorAll('img.print-img')) as HTMLImageElement[]
  if (!imgs.length) {
    setTimeout(runPrint, 100)
    return
  }

  let pending = imgs.length
  const onReady = () => {
    pending -= 1
    if (pending <= 0) setTimeout(runPrint, 50)
  }

  for (const img of imgs) {
    if (img.complete && img.naturalWidth > 0) {
      onReady()
    } else {
      img.onload = onReady
      img.onerror = onReady
    }
  }
}

export type PrintPatientDocumentOptions = {
  /** Force image print path (e.g. CPR photos with odd filenames). */
  asImage?: boolean
}

/** Open the system print dialog for an attached file (image/PDF/other). */
export function printPatientDocument(
  url?: string | null,
  fileName?: string,
  options?: PrintPatientDocumentOptions
): void {
  const displayUrl = resolvePatientDocumentDisplayUrl(url)
  if (!displayUrl) return

  const ext = fileExtension(displayUrl, fileName)
  const title = (fileName || 'Document').replace(/[<>&"]/g, '')
  const asImage = !!(options?.asImage || isImageExtension(ext, displayUrl))

  // Images: print in-place via hidden iframe (no new tab).
  if (asImage) {
    printImageInPlace(displayUrl, title)
    return
  }

  if (isPdfExtension(ext)) {
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
    setTimeout(tryPrint, 800)
    return
  }

  // Unknown file type — open then try print.
  const win = window.open(displayUrl, '_blank', 'noopener,noreferrer')
  if (!win) return
  setTimeout(() => {
    try {
      win.focus()
      win.print()
    } catch {
      /* ignore */
    }
  }, 800)
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
