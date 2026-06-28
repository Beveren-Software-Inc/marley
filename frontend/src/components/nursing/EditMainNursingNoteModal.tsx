import { useEffect, useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { updateMainNursingNote, type MainNursingNoteRow } from '../../services/mainNursingNote'
import { formatNursingNoteTimestamp } from '../../constants/nursingShift'
import { useRejectEditModeWhenLocked } from '../../hooks/useRejectEditModeWhenLocked'
import { useBlockIfEditingLocked } from '../../hooks/useBlockIfEditingLocked'

interface EditMainNursingNoteModalProps {
  row: MainNursingNoteRow
  onClose: () => void
  onSuccess: () => void
}

export const EditMainNursingNoteModal = ({
  row,
  onClose,
  onSuccess,
}: EditMainNursingNoteModalProps) => {
  useRejectEditModeWhenLocked(true, onClose)
  const blockIfEditingLocked = useBlockIfEditingLocked()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appendNote, setAppendNote] = useState('')
  const [noteTime, setNoteTime] = useState(() => formatNursingNoteTimestamp())

  useEffect(() => {
    const tick = setInterval(() => {
      setNoteTime(formatNursingNoteTimestamp())
    }, 60_000)
    return () => clearInterval(tick)
  }, [])

  const previewLine = appendNote.trim()
    ? `[${noteTime}] ${appendNote.trim()}`
    : ''

  const handleSave = async () => {
    if (!appendNote.trim()) {
      setError('Enter a note to append')
      return
    }
    blockIfEditingLocked()
    setSaving(true)
    setError(null)
    try {
      const result = await updateMainNursingNote({
        name: row.name,
        append_notes: appendNote.trim(),
        time: noteTime,
      })
      if (!result.success) {
        throw new Error(result.message || 'Failed to update nursing note')
      }
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update nursing note')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-lg')}>
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Append Nursing Note</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {row.shift || 'Shift'} · {row.date || '—'}
            {row.trans_no ? ` · Trans ${row.trans_no}` : ''}
          </p>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs font-medium text-slate-500">Patient</div>
              <div className="text-slate-900">{row.patient_name || row.file_no || '—'}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Shift</div>
              <div className="text-slate-900">{row.shift || '—'}</div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Existing nursing notes</label>
            <textarea
              value={row.nursing_notes || ''}
              readOnly
              rows={8}
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="block text-xs font-medium text-slate-700">Add note *</label>
              <span className="text-[11px] text-slate-500">Will be stamped {noteTime}</span>
            </div>
            <textarea
              value={appendNote}
              onChange={(e) => setAppendNote(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Enter update for this shift…"
              autoFocus
            />
            {previewLine ? (
              <p className="mt-2 text-xs text-slate-500">
                Will append: <span className="text-slate-700">{previewLine}</span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={CM_BTN_CANCEL} disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} className={CM_BTN_PRIMARY} disabled={saving}>
            {saving ? 'Saving…' : 'Append note'}
          </button>
        </div>
      </div>
    </div>
  )
}
