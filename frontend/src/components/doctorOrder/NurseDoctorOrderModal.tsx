import { useEffect, useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import {
  fetchHealthcarePractitioners,
  getCurrentUserPractitioner,
  type LinkFieldOption,
} from '../../services/common'
import {
  updateDoctorOrderNurseResponse,
  type DoctorOrderRow,
} from '../../services/doctorOrder'

interface NurseDoctorOrderModalProps {
  order: DoctorOrderRow
  onClose: () => void
  onSuccess: () => void
}

export const NurseDoctorOrderModal = ({ order, onClose, onSuccess }: NurseDoctorOrderModalProps) => {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nursesRemarks, setNursesRemarks] = useState(order.nurses_remarks || '')
  const [finished, setFinished] = useState(order.status === 'Finished')
  const [nurse, setNurse] = useState(order.nurse || '')
  const [nurseName, setNurseName] = useState(order.nurse_name || '')
  const [nurseQuery, setNurseQuery] = useState(order.nurse_name || order.nurse || '')
  const [nurseOpen, setNurseOpen] = useState(false)
  const [nurseOptions, setNurseOptions] = useState<LinkFieldOption[]>([])

  useEffect(() => {
    if (order.nurse) return
    getCurrentUserPractitioner().then(async (practId) => {
      if (!practId) return
      setNurse(practId)
      const rows = await fetchHealthcarePractitioners(practId)
      const label = rows[0]?.label || rows[0]?.name || practId
      setNurseName(label)
      setNurseQuery(label)
    })
  }, [order.nurse])

  useEffect(() => {
    if (!nurseOpen) return
    fetchHealthcarePractitioners(nurseQuery).then(setNurseOptions)
  }, [nurseOpen, nurseQuery])

  const handleSave = async () => {
    if (!nursesRemarks.trim() && !finished) {
      setError('Enter nurse remarks or mark the order as finished')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await updateDoctorOrderNurseResponse({
        name: order.name,
        nurses_remarks: nursesRemarks.trim() || undefined,
        finished,
        nurse: nurse || undefined,
        nurse_name: nurseName || undefined,
      })
      if (!result.success) {
        throw new Error(result.message || 'Failed to update doctor order')
      }
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update doctor order')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-lg')}>
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Nurse note on order</h2>
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{order.doctor_order || order.trans_no}</p>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{error}</div>
          )}

          <div className="rounded-md bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700">
            <p className="font-medium text-slate-900 mb-1">Doctor order</p>
            <p className="whitespace-pre-wrap">{order.doctor_order || '—'}</p>
            <p className="mt-2 text-slate-500">
              By {order.doctor_name || order.doctor || '—'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nurse</label>
            <input
              type="text"
              value={nurseQuery}
              onChange={(e) => {
                setNurseQuery(e.target.value)
                setNurse('')
                setNurseOpen(true)
              }}
              onFocus={() => setNurseOpen(true)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Search nurse…"
            />
            {nurseOpen && nurseOptions.length > 0 && (
              <div className="mt-1 border border-slate-200 rounded-md bg-white shadow-lg max-h-36 overflow-auto">
                {nurseOptions.map((n) => (
                  <button
                    key={n.name}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                    onClick={() => {
                      setNurse(n.name)
                      setNurseName(n.label || n.name)
                      setNurseQuery(n.label || n.name)
                      setNurseOpen(false)
                    }}
                  >
                    {n.label || n.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nurses remarks</label>
            <textarea
              value={nursesRemarks}
              onChange={(e) => setNursesRemarks(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Document nursing actions or response…"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={finished}
              onChange={(e) => setFinished(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
            />
            <span className="text-sm text-slate-800">Mark order as finished</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200">
          <button type="button" onClick={onClose} className={CM_BTN_CANCEL} disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} className={CM_BTN_PRIMARY} disabled={saving}>
            {saving ? 'Saving…' : 'Save nurse note'}
          </button>
        </div>
      </div>
    </div>
  )
}
