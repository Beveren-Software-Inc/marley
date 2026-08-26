import { useState } from 'react'
import { reassignEntryUser } from '../../services/entryUser'
import { toast } from '../../hooks/useToast'
import { useAuth } from '../../providers/AuthProvider'

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
 * Clickable receptionist name — assigns the logged-in user as the credited
 * receptionist (visit_owner / custom_payment_owner) without a picker.
 */
export function ReceptionistOwnerCell({
  doctype,
  docName,
  userId,
  userLabel,
  onChanged,
  className = '',
}: ReceptionistOwnerCellProps) {
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)

  const display = (userLabel || userId || '—').trim() || '—'
  const currentUserId = user?.name?.trim() || ''
  const alreadySelf = Boolean(currentUserId && userId === currentUserId)

  const assignSelf = async () => {
    if (!currentUserId) {
      toast.error('You must be logged in to assign yourself as receptionist')
      return
    }
    if (alreadySelf) {
      toast.info('You are already the receptionist')
      return
    }
    try {
      setSaving(true)
      const res = await reassignEntryUser(doctype, docName, currentUserId)
      const fullName = res.full_name || user?.full_name || currentUserId
      toast.success(`Receptionist updated to ${fullName}`)
      onChanged?.(currentUserId, fullName)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update receptionist')
    } finally {
      setSaving(false)
    }
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        void assignSelf()
      }}
      disabled={saving}
      className={`text-left text-primary hover:underline font-medium disabled:opacity-60 block max-w-[9.5rem] truncate ${className}`}
      title={alreadySelf ? display : 'Click to assign yourself as receptionist'}
    >
      {saving ? 'Saving…' : display}
    </button>
  )
}
