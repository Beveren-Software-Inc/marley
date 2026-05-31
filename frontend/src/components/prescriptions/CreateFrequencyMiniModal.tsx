import { useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY_STACK,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import {
  createLongActingFrequency,
  createPrescriptionFrequency,
  type LinkFieldOption,
} from '../../services/common'
import { toast } from '../../hooks/useToast'

export type CreateFrequencyKind = 'regular' | 'long_acting'

interface CreateFrequencyMiniModalProps {
  kind: CreateFrequencyKind
  initialName?: string
  onClose: () => void
  onCreated: (option: LinkFieldOption) => void
}

export function CreateFrequencyMiniModal({
  kind,
  initialName = '',
  onClose,
  onCreated,
}: CreateFrequencyMiniModalProps) {
  const [name, setName] = useState(initialName)
  const [timesPerDay, setTimesPerDay] = useState('1')
  const [intervalDays, setIntervalDays] = useState('7')
  const [saving, setSaving] = useState(false)

  const title = kind === 'long_acting' ? 'Create Long Acting Frequency' : 'Create Prescription Frequency'

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Frequency name is required')
      return
    }
    try {
      setSaving(true)
      const created =
        kind === 'long_acting'
          ? await createLongActingFrequency(trimmed, parseInt(intervalDays, 10) || 7)
          : await createPrescriptionFrequency(trimmed, parseInt(timesPerDay, 10) || 1)
      toast.success('Frequency created')
      onCreated(created)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create frequency')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={CREATE_MODAL_OVERLAY_STACK}
      onClick={onClose}
    >
      <div
        className={createModalShellClass('w-full max-w-sm p-6')}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-slate-900 mb-4">{title}</h3>

        <div className="space-y-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Frequency name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleCreate()
                }
              }}
              placeholder={kind === 'long_acting' ? 'e.g. Every 6 Weeks' : 'e.g. TDS, BD, OD'}
              autoFocus
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {kind === 'regular' ? (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Times per day
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={timesPerDay}
                onChange={(e) => setTimesPerDay(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Interval (days)
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={intervalDays}
                onChange={(e) => setIntervalDays(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={saving || !name.trim()}
            className={CM_BTN_PRIMARY}
          >
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
