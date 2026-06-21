import { useState, useEffect, useCallback, useMemo } from 'react'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { toast } from '../../hooks/useToast'
import {
  fetchPharmacyDischargeChecklist,
  fetchPharmacyDischargePending,
  savePharmacyDischargeChecklist,
  type PharmacyDischargeChecklistItem,
  type PharmacyDischargePendingRow,
} from '../../services/pharmacyDischarge'
import { useAuth } from '../../providers/AuthProvider'
import { getPatientActiveAdmission } from '../../services/inpatientRecords'

function toFrappeDateTime(value?: string): string {
  if (!value) return ''
  let s = value.trim()
  if (s.includes('T')) {
    if (s.endsWith('Z')) s = s.slice(0, -1)
    s = s.replace('T', ' ')
  }
  if (s.length > 19) s = s.slice(0, 19)
  if (s.length === 16) s += ':00'
  return s
}

interface PharmacyDischargePanelProps {
  patient?: string
}

export function PharmacyDischargePanel({ patient }: PharmacyDischargePanelProps) {
  const { user } = useAuth()
  const loggedInUser = typeof user?.name === 'string' ? user.name : ''

  const [pendingQueue, setPendingQueue] = useState<PharmacyDischargePendingRow[]>([])
  const [queueLoading, setQueueLoading] = useState(true)

  const [selectedAdmission, setSelectedAdmission] = useState('')
  const [patientName, setPatientName] = useState('')
  const [admissionStatus, setAdmissionStatus] = useState('')

  const [items, setItems] = useState<PharmacyDischargeChecklistItem[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadQueue = useCallback(async () => {
    setQueueLoading(true)
    try {
      setPendingQueue(await fetchPharmacyDischargePending(50))
    } catch {
      setPendingQueue([])
    } finally {
      setQueueLoading(false)
    }
  }, [])

  useEffect(() => {
    loadQueue()
  }, [loadQueue])

  const loadChecklist = useCallback(async (admissionName: string) => {
    setLoading(true)
    try {
      const data = await fetchPharmacyDischargeChecklist(admissionName)
      setSelectedAdmission(data.admission)
      setPatientName(data.patient_name || data.patient || '')
      setAdmissionStatus(data.admission_status || '')
      setItems(data.checklist_items || [])
      if (!data.checklist_items?.length) {
        toast.error('No discharge checklist items assigned to your department for this admission.')
      }
    } catch (err) {
      setSelectedAdmission('')
      setItems([])
      toast.error(err instanceof Error ? err.message : 'Failed to load discharge checklist')
    } finally {
      setLoading(false)
    }
  }, [])

  const clearChecklist = useCallback(() => {
    setSelectedAdmission('')
    setPatientName('')
    setAdmissionStatus('')
    setItems([])
  }, [])

  useEffect(() => {
    clearChecklist()
    if (!patient) return

    let cancelled = false
    getPatientActiveAdmission(patient)
      .then((admission) => {
        if (cancelled || !admission?.name) return
        loadChecklist(admission.name)
      })
      .catch(() => {
        // No active admission — user can pick from pending list
      })
    return () => { cancelled = true }
  }, [patient, loadChecklist, clearChecklist])

  const filteredPending = useMemo(() => {
    const needsAction = pendingQueue.filter((row) => row.pending_count > 0)
    if (!patient) return needsAction
    return needsAction.filter((row) => row.patient === patient)
  }, [pendingQueue, patient])

  const toggleItem = (itemName: string) => {
    setItems((prev) =>
      prev.map((row) => {
        if (row.name !== itemName) return row
        const checking = !row.click
        return {
          ...row,
          click: checking,
          date_time: checking ? toFrappeDateTime(new Date().toISOString()) : '',
          user: checking ? loggedInUser || row.user : '',
        }
      })
    )
  }

  const handleSave = async () => {
    if (!selectedAdmission) {
      toast.error('Select a pending discharge first')
      return
    }
    setSaving(true)
    try {
      const result = await savePharmacyDischargeChecklist(
        selectedAdmission,
        items.map((item) => ({
          ...item,
          click: item.click ? 1 : 0,
          date_time: item.date_time ? toFrappeDateTime(item.date_time) : '',
        }))
      )
      setItems(result.checklist_items || [])
      toast.success('Checklist saved')
      loadQueue()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save checklist')
    } finally {
      setSaving(false)
    }
  }

  const completed = items.filter((i) => i.click).length
  const total = items.length
  const showPendingList = !selectedAdmission

  return (
    <div className="flex flex-col h-full min-h-0 space-y-4">
      <h2 className="font-semibold text-slate-800 text-sm md:text-base">Discharge verification</h2>

      {showPendingList && (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">
              {patient ? 'Pending for selected patient' : 'All pending discharges'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {patient
                ? 'Select a row to verify checklist items, or choose a patient above.'
                : 'Select a patient above to filter, or pick a row below to verify checklist items.'}
            </p>
          </div>
          {queueLoading ? (
            <div className="flex items-center justify-center py-10 text-slate-500 text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading pending discharges…
            </div>
          ) : filteredPending.length === 0 ? (
            <div className="py-10 px-4 text-center text-sm text-slate-500">
              {patient
                ? 'No pending checklist items for this patient in your department.'
                : 'No pending discharge checklist items for your department.'}
            </div>
          ) : (
            <>
              {loading && (
                <div className="flex items-center justify-center py-3 text-slate-500 text-sm gap-2 border-b border-slate-100">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading checklist…
                </div>
              )}
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-600 border-b border-slate-200 bg-primary/5">
                    <th className="py-2.5 px-4 font-medium">Patient</th>
                    <th className="py-2.5 px-4 font-medium">Admission</th>
                    <th className="py-2.5 px-4 font-medium text-right">Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPending.map((row) => (
                    <tr
                      key={row.admission}
                      className="border-b border-slate-100 hover:bg-primary/5 cursor-pointer"
                      onClick={() => loadChecklist(row.admission)}
                    >
                      <td className="py-2.5 px-4 text-slate-800">{row.patient_name || row.patient || '—'}</td>
                      <td className="py-2.5 px-4 text-slate-600">{row.admission}</td>
                      <td className="py-2.5 px-4 text-right">
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          {row.pending_count} item{row.pending_count === 1 ? '' : 's'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      )}

      {selectedAdmission && !loading && (
        <>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 flex items-center justify-between gap-2 flex-wrap">
            <div>
              <span className="font-medium text-slate-800">{selectedAdmission}</span>
              {patientName ? <> · {patientName}</> : null}
              {admissionStatus ? <> · {admissionStatus}</> : null}
              {total > 0 && (
                <span className="ml-2 text-slate-500">
                  {completed}/{total} done
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={clearChecklist}
              className="text-primary text-xs font-medium hover:underline shrink-0"
            >
              ← Back to list
            </button>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            {items.length === 0 ? (
              <div className="py-10 px-4 text-center text-sm text-slate-500">
                No checklist items for your department on this admission.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((item) => {
                  const done = Boolean(item.click)
                  return (
                    <li key={item.name}>
                      <button
                        type="button"
                        onClick={() => toggleItem(item.name)}
                        className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${
                          done ? 'bg-green-50/60' : 'hover:bg-slate-50'
                        }`}
                      >
                        {done ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                        ) : (
                          <Circle className="w-5 h-5 text-slate-300 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium ${done ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                            {item.action_required || 'Task'}
                          </p>
                          {item.date_time && done && (
                            <p className="text-xs text-slate-500 mt-0.5">{item.date_time}</p>
                          )}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {items.length > 0 && (
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save checklist'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
