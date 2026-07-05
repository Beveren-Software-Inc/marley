import { useEffect, useState } from 'react'
import {
  CREATE_MODAL_OVERLAY,
  CM_BTN_OUTLINE_CANCEL,
  CM_BTN_OUTLINE_SAVE,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { updateMainNursingNote, type MainNursingNoteRow } from '../../services/mainNursingNote'
import { appendNursingNoteLine, formatNursingNoteTimestamp } from '../../constants/nursingShift'
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
  const [existingNotes, setExistingNotes] = useState(row.nursing_notes || '')
  const [appendNote, setAppendNote] = useState('')
  const [noteTime, setNoteTime] = useState(() => formatNursingNoteTimestamp())

  useEffect(() => {
    setExistingNotes(row.nursing_notes || '')
    setAppendNote('')
  }, [row])

  useEffect(() => {
    const tick = setInterval(() => {
      setNoteTime(formatNursingNoteTimestamp())
    }, 60_000)
    return () => clearInterval(tick)
  }, [])

  const previewLine = appendNote.trim()
    ? `[${noteTime}] ${appendNote.trim()}`
    : ''

  const initialNotes = row.nursing_notes || ''
  const isDirty = existingNotes !== initialNotes || appendNote.trim().length > 0

  const handleSave = async () => {
    let finalNotes = existingNotes.trim()
    if (appendNote.trim()) {
      finalNotes = appendNursingNoteLine(finalNotes, appendNote.trim(), noteTime)
    }
    if (!isDirty) {
      setError('No changes to save')
      return
    }
    blockIfEditingLocked()
    setSaving(true)
    setError(null)
    try {
      const result = await updateMainNursingNote({
        name: row.name,
        nursing_notes: finalNotes,
        replace_notes: true,
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
          <h2 className="text-lg font-semibold text-slate-900">Edit Nursing Note</h2>
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
            <label className="block text-xs font-medium text-slate-700 mb-1">Nursing notes</label>
            <textarea
              value={existingNotes}
              onChange={(e) => setExistingNotes(e.target.value)}
              rows={8}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Edit existing nursing notes…"
              autoFocus
            />
            <p className="mt-1 text-[11px] text-slate-500">
              You can edit the full note text above, including previously saved entries.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="block text-xs font-medium text-slate-700">Append note (optional)</label>
              <span className="text-[11px] text-slate-500">Will be stamped {noteTime}</span>
            </div>
            <textarea
              value={appendNote}
              onChange={(e) => setAppendNote(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Add a new timestamped entry…"
            />
            {previewLine ? (
              <p className="mt-2 text-xs text-slate-500">
                Will append: <span className="text-slate-700">{previewLine}</span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={CM_BTN_OUTLINE_CANCEL}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isDirty}
            className={CM_BTN_OUTLINE_SAVE}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
