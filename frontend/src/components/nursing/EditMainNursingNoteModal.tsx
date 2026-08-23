import { useEffect, useState } from 'react'
import {
  CREATE_MODAL_OVERLAY,
  CM_BTN_OUTLINE_CANCEL,
  CM_BTN_OUTLINE_SAVE,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import {
  updateMainNursingNote,
  type MainNursingNoteEntryRow,
  type MainNursingNoteRow,
} from '../../services/mainNursingNote'
import {
  formatNursingNoteTimestamp,
  isMainNursingNoteEditable,
  MAIN_NURSING_NOTE_EDIT_LOCKED_MESSAGE,
} from '../../constants/nursingShift'
import { useRejectEditModeWhenLocked } from '../../hooks/useRejectEditModeWhenLocked'
import { useBlockIfEditingLocked } from '../../hooks/useBlockIfEditingLocked'
import { toast } from '../../hooks/useToast'

interface EditMainNursingNoteModalProps {
  row: MainNursingNoteRow
  onClose: () => void
  onSuccess: () => void
}

function entryTimeLabel(entry: MainNursingNoteEntryRow): string {
  return formatNursingNoteTimestamp(entry.note_time) || '—'
}

export const EditMainNursingNoteModal = ({
  row,
  onClose,
  onSuccess,
}: EditMainNursingNoteModalProps) => {
  useRejectEditModeWhenLocked(true, onClose)
  const blockIfEditingLocked = useBlockIfEditingLocked()
  const editWindowOpen = isMainNursingNoteEditable(row.modified || row.creation)

  useEffect(() => {
    if (editWindowOpen) return
    toast.error(MAIN_NURSING_NOTE_EDIT_LOCKED_MESSAGE)
    onClose()
  }, [editWindowOpen, onClose])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appendNote, setAppendNote] = useState('')
  const [noteTime, setNoteTime] = useState(() => formatNursingNoteTimestamp())
  const existingEntries = row.entries?.filter((entry) => (entry.note || '').trim()) || []

  useEffect(() => {
    setAppendNote('')
  }, [row])

  useEffect(() => {
    const tick = setInterval(() => {
      setNoteTime(formatNursingNoteTimestamp())
    }, 60_000)
    return () => clearInterval(tick)
  }, [])

  const handleSave = async () => {
    if (!appendNote.trim()) {
      setError('Enter a note to append')
      return
    }
    if (!editWindowOpen) {
      setError(MAIN_NURSING_NOTE_EDIT_LOCKED_MESSAGE)
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
        throw new Error(result.message || 'Failed to append nursing note')
      }
      toast.success('Note appended')
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to append nursing note')
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
              <div className="text-xs font-medium text-slate-500">Created by</div>
              <div className="text-slate-900">{row.user_name || row.user || '—'}</div>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-700 mb-2">Saved entries</div>
            {existingEntries.length > 0 ? (
              <div className="space-y-2">
                {existingEntries.map((entry, index) => (
                  <div
                    key={entry.name || `${entry.authored_by}-${index}`}
                    className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span className="font-medium text-slate-700">
                        {entry.authored_by_name || entry.authored_by || 'Unknown'}
                      </span>
                      <span>{entryTimeLabel(entry)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{entry.note}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                {row.nursing_notes || 'No notes yet.'}
              </p>
            )}
            <p className="mt-2 text-[11px] text-slate-500">
              Previous lines stay as they were. Your new text is saved under your name.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="block text-xs font-medium text-slate-700">Append note *</label>
              <span className="text-[11px] text-slate-500">Will be stamped {noteTime}</span>
            </div>
            <textarea
              value={appendNote}
              onChange={(e) => setAppendNote(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Add your update for this shift…"
              autoFocus
            />
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
            onClick={() => void handleSave()}
            disabled={saving || !appendNote.trim()}
            className={CM_BTN_OUTLINE_SAVE}
          >
            {saving ? 'Saving…' : 'Append'}
          </button>
        </div>
      </div>
    </div>
  )
}
