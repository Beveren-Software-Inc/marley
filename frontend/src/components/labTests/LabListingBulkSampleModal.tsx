import { useEffect, useState } from 'react'
import { Droplet, X } from 'lucide-react'
import { createSampleCollectionForLabRequests } from '../../services/labTests'
import { toast } from '../../hooks/useToast'
import { CREATE_MODAL_OVERLAY } from '../ui/CreateModalChrome'
import type { ServiceRequest } from '../../services/serviceRequests'

export function LabListingBulkSampleModal({
  requests,
  onClose,
  onSaved,
}: {
  requests: ServiceRequest[]
  onClose: () => void
  onSaved: () => void
}) {
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSave = async () => {
    const names = requests.map((r) => r.name).filter(Boolean)
    if (!names.length) {
      setError('No Lab Requests selected.')
      return
    }
    try {
      setSaving(true)
      setError(null)
      const res = await createSampleCollectionForLabRequests(names, notes.trim() || undefined)
      toast.success(
        `Sample collected for ${res.count} test${res.count === 1 ? '' : 's'} across ${res.request_count} request${res.request_count === 1 ? '' : 's'}`
      )
      onSaved()
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to collect samples'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY} onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Collect sample for selected requests</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Applies to all tests on {requests.length} selected Lab Request
              {requests.length === 1 ? '' : 's'}. Collected by is you.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-lg leading-none text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="max-h-36 overflow-auto rounded-md border border-slate-200 bg-slate-50">
            <ul className="divide-y divide-slate-100">
              {requests.map((sr) => (
                <li key={sr.name} className="px-3 py-2 text-xs">
                  <span className="font-medium text-slate-800">{sr.template_name || sr.template_dn || sr.name}</span>
                  <span className="ml-2 font-mono text-slate-500">{sr.name}</span>
                  <span className="ml-2 text-slate-500">{sr.patient_name || sr.patient}</span>
                </li>
              ))}
            </ul>
          </div>

          {error ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {error}
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Collection notes (optional)…"
              rows={3}
              className="min-h-[72px] w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-white"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            <Droplet className="h-3.5 w-3.5" />
            {saving ? 'Collecting…' : 'Collect sample'}
          </button>
        </div>
      </div>
    </div>
  )
}
