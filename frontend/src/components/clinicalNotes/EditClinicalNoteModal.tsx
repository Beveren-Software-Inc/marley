import { useEffect, useState } from 'react'
import {
  CM_BTN_OUTLINE_CANCEL,
  CM_BTN_OUTLINE_SAVE,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { updateClinicalNote, type ClinicalNote } from '../../services/clinicalNotes'
import {
  CLINICAL_NOTE_EDIT_LOCKED_MESSAGE,
  isClinicalNoteEditableWithin24h,
} from '../../constants/nursingShift'
import { useRejectEditModeWhenLocked } from '../../hooks/useRejectEditModeWhenLocked'
import { useBlockIfEditingLocked } from '../../hooks/useBlockIfEditingLocked'
import { useCareContext } from '../../providers/CareContextProvider'
import { toast } from '../../hooks/useToast'

interface EditClinicalNoteModalProps {
  note: ClinicalNote
  onClose: () => void
  onSuccess: () => void
  title?: string
}

function toDatetimeLocalValue(value?: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) {
    // Already "YYYY-MM-DDTHH:mm" or "YYYY-MM-DD HH:mm:ss"
    const normalized = value.trim().replace(' ', 'T')
    return normalized.slice(0, 16)
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function stripHtmlForEdit(html?: string | null): string {
  if (!html) return ''
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return (tmp.textContent || tmp.innerText || '').trim()
}

export function EditClinicalNoteModal({
  note,
  onClose,
  onSuccess,
  title = 'Edit Therapy Note',
}: EditClinicalNoteModalProps) {
  useRejectEditModeWhenLocked(true, onClose)
  const blockIfEditingLocked = useBlockIfEditingLocked()
  const { therapyNoteUneditableIn24Hour } = useCareContext()
  const editWindowOpen = isClinicalNoteEditableWithin24h(
    note.creation,
    therapyNoteUneditableIn24Hour
  )

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [noteText, setNoteText] = useState(() => stripHtmlForEdit(note.note))
  const [postingDate, setPostingDate] = useState(() => toDatetimeLocalValue(note.posting_date))

  useEffect(() => {
    if (editWindowOpen) return
    toast.error(CLINICAL_NOTE_EDIT_LOCKED_MESSAGE)
    onClose()
  }, [editWindowOpen, onClose])

  useEffect(() => {
    setNoteText(stripHtmlForEdit(note.note))
    setPostingDate(toDatetimeLocalValue(note.posting_date))
  }, [note])

  const initialNote = stripHtmlForEdit(note.note)
  const initialPosting = toDatetimeLocalValue(note.posting_date)
  const isDirty = noteText.trim() !== initialNote || postingDate !== initialPosting

  const handleSave = async () => {
    if (!noteText.trim()) {
      setError('Note is required')
      return
    }
    if (!isDirty) {
      setError('No changes to save')
      return
    }
    if (!editWindowOpen) {
      setError(CLINICAL_NOTE_EDIT_LOCKED_MESSAGE)
      return
    }
    try {
      blockIfEditingLocked()
    } catch {
      return
    }

    setSaving(true)
    setError(null)
    try {
      await updateClinicalNote({
        name: note.name,
        note: noteText.trim(),
        posting_date: postingDate || undefined,
      })
      toast.success('Therapy note updated')
      onSuccess()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to update therapy note'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-lg')}>
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {therapyNoteUneditableIn24Hour
              ? 'Editable for 24 hours after creation'
              : 'Editing allowed (24-hour lock is off in Healthcare Settings)'}
            {' · '}
            {note.name}
          </p>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Posting Date
            </label>
            <input
              type="datetime-local"
              value={postingDate}
              onChange={(e) => setPostingDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Note <span className="text-red-500">*</span>
            </label>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={8}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y min-h-[140px]"
              placeholder="Enter therapy note…"
            />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={CM_BTN_OUTLINE_CANCEL} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={CM_BTN_OUTLINE_SAVE}
            disabled={saving || !editWindowOpen}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
