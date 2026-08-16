import { useEffect, useState } from 'react'
import { Ban } from 'lucide-react'
import { ConfirmActionModal } from '../ui/ConfirmActionModal'
import { fetchPatientSummary, setPatientBlacklist } from '../../services/patients'
import { toast } from '../../hooks/useToast'

interface BlacklistPatientModalProps {
  open: boolean
  patientName: string
  patientLabel?: string
  initialBlacklisted?: boolean
  initialReason?: string | null
  onClose: () => void
  onSaved: (isBlacklisted: boolean, reason: string | null) => void
}

export function BlacklistPatientModal({
  open,
  patientName,
  patientLabel,
  initialBlacklisted = false,
  initialReason = '',
  onClose,
  onSaved,
}: BlacklistPatientModalProps) {
  const [checked, setChecked] = useState(Boolean(initialBlacklisted))
  const [reason, setReason] = useState(initialReason || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setChecked(Boolean(initialBlacklisted))
    setReason(initialReason || '')
    setError(null)
    let cancelled = false
    fetchPatientSummary(patientName)
      .then((data) => {
        if (cancelled) return
        setChecked(Boolean(data.is_blacklist || data.is_black_list))
        setReason(data.blacklist_reason || '')
      })
      .catch(() => {
        /* keep initial values */
      })
    return () => {
      cancelled = true
    }
  }, [open, patientName, initialBlacklisted, initialReason])

  const handleConfirm = async () => {
    if (checked && !reason.trim()) {
      setError('Enter a reason when blacklisting a patient.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await setPatientBlacklist(patientName, checked, reason.trim())
      const nextReason = result.blacklist_reason || null
      toast.success(result.is_black_list ? 'Patient blacklisted' : 'Patient removed from blacklist')
      onSaved(Boolean(result.is_black_list), nextReason)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update blacklist')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ConfirmActionModal
      open={open}
      title="Patient blacklist"
      subtitle={patientLabel ? `Mark whether ${patientLabel} should be blacklisted.` : 'Tick blacklist and enter a reason.'}
      icon={<Ban className="h-5 w-5" />}
      tone="danger"
      loading={saving}
      confirmLabel={checked ? 'Save blacklist' : 'Save'}
      onClose={onClose}
      onConfirm={handleConfirm}
    >
      <label className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => {
            setChecked(e.target.checked)
            setError(null)
          }}
          className="mt-0.5 h-4 w-4 rounded border-red-300 text-red-600 focus:ring-red-500"
        />
        <span className="text-sm font-medium text-red-950">Blacklist this patient</span>
      </label>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Reason {checked ? <span className="text-red-500">*</span> : null}
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Why is this patient being blacklisted?"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200"
        />
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </ConfirmActionModal>
  )
}
