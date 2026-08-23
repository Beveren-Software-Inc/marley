import { useState } from 'react'
import { Pencil } from 'lucide-react'

interface NursingNoteEditableCardProps {
  note: string
  authorLabel?: string
  timeLabel?: string
  canEdit?: boolean
  disabled?: boolean
  onSave: (next: string) => Promise<void>
}

export const NursingNoteEditableCard = ({
  note,
  authorLabel,
  timeLabel,
  canEdit = false,
  disabled = false,
  onSave,
}: NursingNoteEditableCardProps) => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startEdit = () => {
    setDraft(note)
    setError(null)
    setEditing(true)
  }

  const cancelEdit = () => {
    setDraft(note)
    setError(null)
    setEditing(false)
  }

  const saveEdit = async () => {
    const next = draft.trim()
    if (!next) {
      setError('Note cannot be empty')
      return
    }
    if (next === (note || '').trim()) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(next)
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save note')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      {(authorLabel || timeLabel || canEdit) && (
        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
          <span className="font-medium text-slate-700">{authorLabel || 'Note'}</span>
          <div className="flex items-center gap-1 shrink-0">
            {timeLabel ? <span>{timeLabel}</span> : null}
            {canEdit && !editing ? (
              <button
                type="button"
                onClick={startEdit}
                disabled={disabled}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-white hover:text-primary"
                title="Edit this note"
                aria-label="Edit this note"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      )}
      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            disabled={saving || disabled}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
            autoFocus
          />
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saving}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void saveEdit()}
              disabled={saving || disabled || !draft.trim()}
              className="rounded-md bg-primary px-2.5 py-1 text-xs text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <p className={`${authorLabel || timeLabel || canEdit ? 'mt-1' : ''} whitespace-pre-wrap text-sm text-slate-800`}>
          {note || '—'}
        </p>
      )}
    </div>
  )
}
