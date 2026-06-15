import { useEffect, useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { createMainNursingNote, fetchNextMainNursingNoteTransNo } from '../../services/mainNursingNote'
import {
  fetchCostCenters,
  fetchInpatientAdmissions,
  type LinkFieldOption,
} from '../../services/common'
import { searchPatients, type PatientListItem } from '../../services/patients'
import { useCareContext } from '../../providers/CareContextProvider'

interface CreateMainNursingNoteModalProps {
  onClose: () => void
  onSuccess: () => void
  patient?: string
}

export const CreateMainNursingNoteModal = ({
  onClose,
  onSuccess,
  patient: patientProp,
}: CreateMainNursingNoteModalProps) => {
  const { mode, activeAdmission, costCenterCompany } = useCareContext()

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextTransNo, setNextTransNo] = useState<string>('')
  const [transNoLoading, setTransNoLoading] = useState(true)

  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [startTime, setStartTime] = useState(new Date().toTimeString().slice(0, 5))
  const [shift, setShift] = useState('')
  const [nursingNotes, setNursingNotes] = useState('')
  const [patientId, setPatientId] = useState(patientProp || '')
  const [patientName, setPatientName] = useState('')
  const [admission, setAdmission] = useState(mode === 'IP' && activeAdmission ? activeAdmission : '')
  const [costCenter, setCostCenter] = useState(costCenterCompany || '')

  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientQuery, setPatientQuery] = useState('')
  const [patientLoading, setPatientLoading] = useState(false)

  const [admissionOptions, setAdmissionOptions] = useState<LinkFieldOption[]>([])
  const [admissionOpen, setAdmissionOpen] = useState(false)
  const [admissionQuery, setAdmissionQuery] = useState('')

  const [ccOptions, setCcOptions] = useState<LinkFieldOption[]>([])
  const [ccOpen, setCcOpen] = useState(false)
  const [ccQuery, setCcQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    setTransNoLoading(true)
    fetchNextMainNursingNoteTransNo()
      .then((no) => {
        if (!cancelled) setNextTransNo(no)
      })
      .catch(() => {
        if (!cancelled) setNextTransNo('')
      })
      .finally(() => {
        if (!cancelled) setTransNoLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!patientProp) return
    setPatientId(patientProp)
    searchPatients(patientProp, 1).then((rows) => {
      const p = rows[0]
      if (p) {
        setPatientName(p.patient_name || p.name)
        setPatientQuery(p.patient_name || p.name)
      }
    })
  }, [patientProp])

  useEffect(() => {
    if (!patientId) return
    fetchInpatientAdmissions(patientId).then((rows) => {
      setAdmissionOptions(rows)
      if (mode === 'IP' && activeAdmission && rows.some((r) => r.name === activeAdmission)) {
        setAdmission(activeAdmission)
        setAdmissionQuery(activeAdmission)
      } else if (rows.length === 1) {
        setAdmission(rows[0].name)
        setAdmissionQuery(rows[0].label || rows[0].name)
      }
    })
  }, [patientId, mode, activeAdmission])

  useEffect(() => {
    if (!patientOpen) return
    const t = setTimeout(async () => {
      setPatientLoading(true)
      try {
        setPatientOptions(await searchPatients(patientQuery || '', 20))
      } finally {
        setPatientLoading(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [patientQuery, patientOpen])

  useEffect(() => {
    if (!admissionOpen || !patientId) return
    fetchInpatientAdmissions(patientId, admissionQuery).then(setAdmissionOptions)
  }, [admissionOpen, admissionQuery, patientId])

  useEffect(() => {
    if (!ccOpen) return
    fetchCostCenters(costCenterCompany, ccQuery).then(setCcOptions)
  }, [ccOpen, ccQuery, costCenterCompany])

  const handleSave = async () => {
    if (!patientId.trim()) {
      setError('Patient is required')
      return
    }
    if (!nursingNotes.trim()) {
      setError('Nursing notes are required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await createMainNursingNote({
        admission: admission || undefined,
        file_no: patientId,
        patient_name: patientName || undefined,
        date,
        data: startTime,
        shift: shift || undefined,
        nursing_notes: nursingNotes.trim(),
        cost_center: costCenter || undefined,
      })
      if (!result.success) {
        throw new Error(result.message || 'Failed to save nursing note')
      }
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save nursing note')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-lg')}>
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Add Nursing Note</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Saved to Main Nursing Note
            {transNoLoading ? (
              <span className="ml-1 text-slate-400">· assigning trans no…</span>
            ) : nextTransNo ? (
              <span className="ml-1 font-medium text-slate-700">· Trans no {nextTransNo}</span>
            ) : null}
          </p>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{error}</div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Patient *</label>
            <input
              type="text"
              value={patientQuery}
              onChange={(e) => {
                setPatientQuery(e.target.value)
                setPatientId('')
                setPatientOpen(true)
              }}
              onFocus={() => setPatientOpen(true)}
              disabled={Boolean(patientProp)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              placeholder="Search patient…"
            />
            {patientOpen && !patientProp && (
              <div className="mt-1 border border-slate-200 rounded-md bg-white shadow-lg max-h-40 overflow-auto z-10">
                {patientLoading && <div className="px-3 py-2 text-xs text-slate-500">Searching…</div>}
                {patientOptions.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                    onClick={() => {
                      setPatientId(p.name)
                      setPatientName(p.patient_name || p.name)
                      setPatientQuery(p.patient_name || p.name)
                      setPatientOpen(false)
                    }}
                  >
                    {p.patient_name || p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Admission</label>
            <input
              type="text"
              value={admissionQuery}
              onChange={(e) => {
                setAdmissionQuery(e.target.value)
                setAdmission('')
                setAdmissionOpen(true)
              }}
              onFocus={() => patientId && setAdmissionOpen(true)}
              disabled={!patientId}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              placeholder={patientId ? 'Select admission…' : 'Select patient first'}
            />
            {admissionOpen && admissionOptions.length > 0 && (
              <div className="mt-1 border border-slate-200 rounded-md bg-white shadow-lg max-h-36 overflow-auto">
                {admissionOptions.map((a) => (
                  <button
                    key={a.name}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                    onClick={() => {
                      setAdmission(a.name)
                      setAdmissionQuery(a.label || a.name)
                      setAdmissionOpen(false)
                    }}
                  >
                    {a.label || a.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nursing date *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Start time</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Shift</label>
            <input
              type="text"
              value={shift}
              onChange={(e) => setShift(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Shift code"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Branch</label>
            <input
              type="text"
              value={ccQuery || costCenter}
              onChange={(e) => {
                setCcQuery(e.target.value)
                setCostCenter(e.target.value)
                setCcOpen(true)
              }}
              onFocus={() => setCcOpen(true)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            {ccOpen && ccOptions.length > 0 && (
              <div className="mt-1 border border-slate-200 rounded-md bg-white shadow-lg max-h-36 overflow-auto">
                {ccOptions.map((cc) => (
                  <button
                    key={cc.name}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                    onClick={() => {
                      setCostCenter(cc.name)
                      setCcQuery(cc.label || cc.name)
                      setCcOpen(false)
                    }}
                  >
                    {cc.label || cc.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nursing notes *</label>
            <textarea
              value={nursingNotes}
              onChange={(e) => setNursingNotes(e.target.value)}
              rows={6}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Enter nursing note…"
            />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={CM_BTN_CANCEL} disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} className={CM_BTN_PRIMARY} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
