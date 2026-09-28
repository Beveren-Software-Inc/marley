import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Paperclip, X } from 'lucide-react'
import { CREATE_MODAL_OVERLAY, CREATE_MODAL_OVERLAY_STACK } from '../ui/CreateModalChrome'
import { DocumentTypeSelect } from '../ui/DocumentTypeSelect'
import { fetchDocumentTypes } from '../../services/common'
import { uploadPatientFile } from '../../services/patients'
import {
  attachLabTestDocument,
  fetchLabTest,
  type LabTestDocumentRow,
} from '../../services/labTests'
import { toast } from '../../hooks/useToast'

const INPUT_CLASS =
  'w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary'

export interface AttachLabTestDocumentModalProps {
  /** Lab Test document name the file is attached to. */
  labTestName: string
  /** Optional label (test / template name) shown next to the lab test id. */
  labTestLabel?: string
  /** Render on top of another modal (e.g. the Lab Request review modal). */
  elevated?: boolean
  onClose: () => void
  /** Called after the document row is persisted, with the refreshed attachment list. */
  onAttached?: (result: { documents: LabTestDocumentRow[]; documents_count: number }) => void
}

/**
 * Small "upload document" dialog used by the Tests & Results list and the Lab Request modal.
 *
 * Three inputs only — the file, its document type and remarks. The file is uploaded straight
 * away (`uploadPatientFile`) and the row is then appended to the Lab Test "Uploaded Documents"
 * child table (`Patient Upload Document`) through `attach_lab_test_document`, with the latest
 * file mirrored into the Lab Test "Upload" Attach field (desk parity). Works before sample
 * collection, after collection and once the test is finished — unlike result entry, which waits
 * for the sample.
 */
export function AttachLabTestDocumentModal({
  labTestName,
  labTestLabel,
  elevated = false,
  onClose,
  onAttached,
}: AttachLabTestDocumentModalProps) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [existing, setExisting] = useState<LabTestDocumentRow[]>([])
  const [documentTypes, setDocumentTypes] = useState<{ name: string; document_name?: string }[]>([])
  const [fileUrl, setFileUrl] = useState('')
  const [documentType, setDocumentType] = useState('')
  const [uploadRemarks, setUploadRemarks] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  const busy = uploading || saving

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        setLoading(true)
        const [doc, types] = await Promise.all([
          fetchLabTest(labTestName),
          fetchDocumentTypes().catch(() => []),
        ])
        if (cancelled) return
        setExisting(
          ((doc.documents || []) as LabTestDocumentRow[]).filter((row) => (row.document || '').trim())
        )
        setDocumentTypes(types)
        setLoadError(null)
      } catch (e) {
        if (cancelled) return
        setLoadError(e instanceof Error ? e.message : 'Failed to load lab test documents')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [labTestName])

  const handlePickFile = async (file: File | null) => {
    if (!file) return
    setUploading(true)
    try {
      const uploaded = await uploadPatientFile(file)
      if (!uploaded) throw new Error('No URL returned from upload')
      setFileUrl(uploaded)
      toast.success('File uploaded')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'File upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleAttach = async () => {
    if (!fileUrl) {
      toast.error('Choose a file to upload first.')
      return
    }
    setSaving(true)
    try {
      const res = await attachLabTestDocument(labTestName, {
        fileUrl,
        documentType,
        uploadRemarks,
      })
      toast.success('Document uploaded to lab test')
      onAttached?.({ documents: res.documents, documents_count: res.documents_count })
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to upload document')
    } finally {
      setSaving(false)
    }
  }

  if (typeof document === 'undefined') return null

  const overlayClass =
    elevated && CREATE_MODAL_OVERLAY_STACK
      ? CREATE_MODAL_OVERLAY_STACK
      : CREATE_MODAL_OVERLAY || 'fixed inset-0 z-50 flex items-center justify-center bg-black/40'

  return createPortal(
    <div
      className={overlayClass}
      data-healthcare-modal
      onClick={() => {
        if (!busy) onClose()
      }}
    >
      <div
        className="mx-4 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-start justify-between border-b border-slate-200 p-4">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Paperclip className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Upload document</h2>
              <p className="text-xs text-slate-500">
                {labTestLabel ? `${labTestLabel} — ` : ''}
                {labTestName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-slate-400 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {loadError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {loadError}
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              File <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0] || null
                void handlePickFile(file)
                e.target.value = ''
              }}
              className="w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:text-white disabled:opacity-60"
            />
            <div className="mt-1 min-h-[1rem] text-xs">
              {uploading ? (
                <span className="text-slate-500">Uploading…</span>
              ) : fileUrl ? (
                <span className="text-green-600">✓ File uploaded</span>
              ) : (
                <span className="text-slate-400">Reports, scans and other lab documents.</span>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Document Type</label>
            <DocumentTypeSelect
              value={documentType}
              onChange={setDocumentType}
              types={documentTypes}
              onTypesUpdated={setDocumentTypes}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Remarks</label>
            <textarea
              value={uploadRemarks}
              onChange={(e) => setUploadRemarks(e.target.value)}
              disabled={busy}
              rows={2}
              placeholder="Optional"
              className={`${INPUT_CLASS} resize-none`}
            />
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Attached{existing.length ? ` (${existing.length})` : ''}
            </p>
            {loading ? (
              <p className="text-xs text-slate-500">Loading…</p>
            ) : existing.length === 0 ? (
              <p className="text-xs text-slate-400">No documents attached to this lab test yet.</p>
            ) : (
              <ul className="space-y-1">
                {existing.map((row, idx) => (
                  <li
                    key={row.name || `${row.document}-${idx}`}
                    className="flex items-center gap-2 text-xs"
                  >
                    <Paperclip className="h-3 w-3 shrink-0 text-slate-400" />
                    <a
                      href={row.document || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-primary hover:underline"
                    >
                      {row.file_name || row.document_name || row.document}
                    </a>
                    {row.document_type ? (
                      <span className="shrink-0 text-slate-400">{row.document_type}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-shrink-0 justify-end gap-2 border-t border-slate-200 bg-white p-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleAttach()}
            disabled={busy || loading || !fileUrl}
            title={
              !fileUrl ? 'Choose and upload a file first' : 'File the uploaded document on this lab test'
            }
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
