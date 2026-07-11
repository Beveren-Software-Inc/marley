import { useState } from 'react'
import { X } from 'lucide-react'
import { toast } from '../../hooks/useToast'
import { updateFollowUpRemarks } from '../../services/followUp'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'

export interface FollowUpRemarkTarget {
  name?: string
  patient_name?: string
  remarks?: string
  reference_doctype?: string
  reference_name?: string
  follow_up_type?: string
}

interface AddFollowUpRemarkModalProps {
  target: FollowUpRemarkTarget
  onClose: () => void
  onSuccess?: (result: { name: string; remarks: string }) => void
}

export function AddFollowUpRemarkModal({ target, onClose, onSuccess }: AddFollowUpRemarkModalProps) {
  const [remarks, setRemarks] = useState(() => (target.remarks || '').replace(/<[^>]+>/g, '').trim())
  const [saving, setSaving] = useState(false)
  const hasExisting = Boolean((target.remarks || '').replace(/<[^>]+>/g, '').trim())

  const handleSave = async () => {
    const value = remarks.trim()
    if (!value) {
      toast.error('Please enter a remark')
      return
    }
    if (!target.name && !(target.reference_doctype && target.reference_name && target.follow_up_type)) {
      toast.error('Missing follow-up reference')
      return
    }

    setSaving(true)
    try {
      const result = await updateFollowUpRemarks({
        name: target.name,
        remarks: value,
        reference_doctype: target.reference_doctype,
        reference_name: target.reference_name,
        follow_up_type: target.follow_up_type,
      })
      toast.success(hasExisting ? 'Remark updated' : 'Remark added')
      onSuccess?.(result)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save remark')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY} role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className={createModalShellClass('max-w-md overflow-hidden')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-teal-50 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-emerald-950">
              {hasExisting ? 'Edit Remark' : 'Add Remark'}
            </h2>
            {target.patient_name ? (
              <p className="mt-0.5 truncate text-sm text-emerald-800/80">{target.patient_name}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <label className="block text-sm font-medium text-slate-700">
            Remark
            <textarea
              autoFocus
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={5}
              placeholder="Enter follow-up remark…"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-emerald-100 bg-emerald-50/40 px-5 py-3">
          <button type="button" onClick={onClose} className={CM_BTN_CANCEL} disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={() => void handleSave()} disabled={saving} className={CM_BTN_PRIMARY}>
            {saving ? 'Saving…' : hasExisting ? 'Update Remark' : 'Add Remark'}
          </button>
        </div>
      </div>
    </div>
  )
}
