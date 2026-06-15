import { useEffect, useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { DocumentTypeSelect } from '../ui/DocumentTypeSelect'
import { PatientDocumentAttachmentPreview } from '../ui/PatientDocumentAttachmentPreview'
import { fetchDocumentTypes } from '../../services/common'
import { uploadPatientFile, type PatientDocumentRow } from '../../services/patients'
import { fetchPatientVisit, updatePatientVisitDocuments } from '../../services/patientVisits'
import { fetchInpatientRecord, updateInpatientAdmission } from '../../services/inpatientRecords'
import { toast } from '../../hooks/useToast'

export type UploadDocumentsTarget =
  | { doctype: 'Patient Visit'; name: string; label?: string }
  | { doctype: 'Inpatient Admission'; name: string; label?: string }

interface UploadPatientDocumentsModalProps {
  target: UploadDocumentsTarget
  onClose: () => void
  onSuccess?: () => void
}

export function UploadPatientDocumentsModal({
  target,
  onClose,
  onSuccess,
}: UploadPatientDocumentsModalProps) {
  const [documents, setDocuments] = useState<PatientDocumentRow[]>([])
  const [documentTypes, setDocumentTypes] = useState<{ name: string; document_name?: string }[]>([])
  const [documentUploading, setDocumentUploading] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [types, record] = await Promise.all([
          fetchDocumentTypes().catch(() => []),
          target.doctype === 'Patient Visit'
            ? fetchPatientVisit(target.name)
            : fetchInpatientRecord(target.name),
        ])
        if (cancelled) return
        setDocumentTypes(types)
        const existing =
          target.doctype === 'Patient Visit'
            ? (record as { documents?: PatientDocumentRow[] }).documents || []
            : (record as { e_signatures?: PatientDocumentRow[]; patient_documents?: PatientDocumentRow[] })
                .e_signatures ||
              (record as { patient_documents?: PatientDocumentRow[] }).patient_documents ||
              []
        setDocuments(
          existing.length > 0
            ? existing.map((row) => ({
                file_name: row.file_name || '',
                document_type: row.document_type || '',
                transaction_no: row.transaction_no || '',
                upload_remarks: row.upload_remarks || '',
                document: row.document || '',
              }))
            : [{ file_name: '', document_type: '', transaction_no: '', upload_remarks: '' }]
        )
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load documents')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [target.doctype, target.name])

  const addDocumentRow = () =>
    setDocuments((prev) => [
      ...prev,
      { file_name: '', document_type: '', transaction_no: '', upload_remarks: '' },
    ])

  const removeDocumentRow = (idx: number) =>
    setDocuments((prev) => prev.filter((_, i) => i !== idx))

  const updateDocumentRow = (idx: number, field: keyof PatientDocumentRow, value: string) => {
    setDocuments((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  const handleDocumentFile = async (idx: number, file: File | null) => {
    if (!file) return
    setDocumentUploading(idx)
    try {
      const file_url = await uploadPatientFile(file)
      if (!file_url) throw new Error('No URL returned from upload')
      setDocuments((prev) => {
        const next = [...prev]
        next[idx] = {
          ...next[idx],
          document: file_url,
          file_name: next[idx].file_name?.trim() || file.name,
        }
        return next
      })
      toast.success('File uploaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'File upload failed')
    } finally {
      setDocumentUploading(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const payload = documents.filter(
      (d) =>
        (d.file_name || '').trim() ||
        (d.document_type || '').trim() ||
        (d.document || '').trim()
    )
    try {
      if (target.doctype === 'Patient Visit') {
        await updatePatientVisitDocuments(target.name, payload)
      } else {
        await updateInpatientAdmission(target.name, { patient_documents: payload })
      }
      toast.success('Documents saved')
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save documents')
    } finally {
      setSaving(false)
    }
  }

  const title =
    target.label ||
    (target.doctype === 'Patient Visit' ? `Upload Documents — ${target.name}` : `Upload Documents — ${target.name}`)

  return (
    <div className={CREATE_MODAL_OVERLAY} onClick={onClose}>
      <div
        className={createModalShellClass('max-w-2xl')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Add or update patient documents for this {target.doctype === 'Patient Visit' ? 'visit' : 'admission'}.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 max-h-[60vh] overflow-y-auto space-y-4">
            {loading ? (
              <p className="text-sm text-slate-500 py-6 text-center">Loading documents…</p>
            ) : (
              <>
                {documents.map((row, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Document #{idx + 1}
                      </span>
                      {documents.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeDocumentRow(idx)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-0.5">
                          File Name
                        </label>
                        <input
                          value={row.file_name}
                          onChange={(e) => updateDocumentRow(idx, 'file_name', e.target.value)}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-0.5">
                          Document Type
                        </label>
                        <DocumentTypeSelect
                          value={row.document_type || ''}
                          onChange={(v) => updateDocumentRow(idx, 'document_type', v)}
                          types={documentTypes}
                          onTypesUpdated={setDocumentTypes}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-0.5">
                          Transaction No
                        </label>
                        <input
                          value={row.transaction_no || ''}
                          onChange={(e) => updateDocumentRow(idx, 'transaction_no', e.target.value)}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-0.5">
                          Upload Remarks
                        </label>
                        <input
                          value={row.upload_remarks || ''}
                          onChange={(e) => updateDocumentRow(idx, 'upload_remarks', e.target.value)}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-0.5">
                          File Attachment
                        </label>
                        <input
                          type="file"
                          disabled={documentUploading === idx}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) handleDocumentFile(idx, f)
                            e.target.value = ''
                          }}
                          className="w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-white"
                        />
                        {row.document && documentUploading !== idx && (
                          <PatientDocumentAttachmentPreview
                            url={row.document}
                            fileName={row.file_name}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addDocumentRow}
                  className="text-sm text-primary font-medium hover:underline"
                >
                  + Add document
                </button>
              </>
            )}

            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL} disabled={saving}>
              Cancel
            </button>
            <button type="submit" disabled={saving || loading} className={CM_BTN_PRIMARY}>
              {saving ? 'Saving…' : 'Save Documents'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
