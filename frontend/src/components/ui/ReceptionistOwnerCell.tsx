import { useEffect, useRef, useState } from 'react'
import { fetchUsers, type LinkFieldOption } from '../../services/common'
import { reassignEntryUser } from '../../services/entryUser'
import { toast } from '../../hooks/useToast'

interface ReceptionistOwnerCellProps {
  doctype: 'Payment Entry' | 'Patient Visit'
  docName: string
  /** Credited user id (payment/visit owner, else doc owner) */
  userId?: string | null
  /** Display name */
  userLabel?: string | null
  onChanged?: (userId: string, fullName: string) => void
  className?: string
}

/**
 * Clickable receptionist name — opens a picker of Receptionist-role /
 * Reception-department users and reassigns visit_owner / custom_payment_owner.
 */
export function ReceptionistOwnerCell({
  doctype,
  docName,
  userId,
  userLabel,
  onChanged,
  className = '',
}: ReceptionistOwnerCellProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<LinkFieldOption[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const display = (userLabel || userId || '—').trim() || '—'

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    fetchUsers(query || undefined, 'Receptionist')
      .then((rows) => {
        if (!cancelled) setOptions(rows)
      })
      .catch(() => {
        if (!cancelled) setOptions([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, query])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const pick = async (user: LinkFieldOption) => {
    if (user.name === userId) {
      setOpen(false)
      return
    }
    try {
      setSaving(true)
      const res = await reassignEntryUser(doctype, docName, user.name)
      const fullName = res.full_name || user.label || user.name
      toast.success(`Receptionist updated to ${fullName}`)
      onChanged?.(user.name, fullName)
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update receptionist')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={rootRef} className={`relative inline-block max-w-full ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
          setQuery('')
        }}
        disabled={saving}
        className="text-left text-primary hover:underline font-medium disabled:opacity-60 max-w-[12rem] truncate"
        title="Change receptionist"
      >
        {saving ? 'Saving…' : display}
      </button>
      {open && (
        <div
          className="absolute z-40 left-0 mt-1 w-64 rounded-md border border-slate-200 bg-white shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-2 border-b border-slate-100">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search receptionist…"
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {loading && (
              <p className="px-3 py-2 text-xs text-slate-500">Loading…</p>
            )}
            {!loading && options.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-500">No receptionists found</p>
            )}
            {options.map((u) => (
              <button
                key={u.name}
                type="button"
                onClick={() => pick(u)}
                className={`block w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${
                  u.name === userId ? 'bg-primary/5 text-primary font-medium' : 'text-slate-700'
                }`}
              >
                <div className="truncate">{u.label}</div>
                <div className="text-[11px] text-slate-400 truncate">{u.name}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
