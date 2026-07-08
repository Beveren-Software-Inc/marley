import { useEffect, useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import {
  fetchCostCenters,
  fetchHealthcarePractitioners,
  fetchInpatientAdmissions,
  fetchMedicalDepartments,
  getCurrentUserPractitioner,
  syncCostCenterFromCareEpisode,
  type LinkFieldOption,
} from '../../services/common'
import { searchPatients, type PatientListItem } from '../../services/patients'
import { createDoctorOrder, fetchNextDoctorOrderTransNo } from '../../services/doctorOrder'
import { useCareContext } from '../../providers/CareContextProvider'

interface CreateDoctorOrderModalProps {
  onClose: () => void
  onSuccess: () => void
  patient?: string
  title?: string
}

export const CreateDoctorOrderModal = ({
  onClose,
  onSuccess,
  patient: patientProp,
  title = 'Add Doctors Order',
}: CreateDoctorOrderModalProps) => {
  const { mode, activeAdmission, costCenterCompany, userCostCenter } = useCareContext()

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextTransNo, setNextTransNo] = useState('')
  const [transNoLoading, setTransNoLoading] = useState(true)

  const [doctorOrder, setDoctorOrder] = useState('')
  const [department, setDepartment] = useState('')
  const [departmentQuery, setDepartmentQuery] = useState('')
  const [departmentOptions, setDepartmentOptions] = useState<LinkFieldOption[]>([])
  const [departmentOpen, setDepartmentOpen] = useState(false)
  const [patientId, setPatientId] = useState(patientProp || '')
  const [patientName, setPatientName] = useState('')
  const [admission, setAdmission] = useState(mode === 'IP' && activeAdmission ? activeAdmission : '')
  const [costCenter, setCostCenter] = useState('')
  const [doctor, setDoctor] = useState('')
  const [doctorName, setDoctorName] = useState('')

  // Global branch is the default; care-episode sync below overrides it when set.
  useEffect(() => {
    if (!userCostCenter) return
    setCostCenter((prev) => prev || userCostCenter)
  }, [userCostCenter])

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

  const [doctorOptions, setDoctorOptions] = useState<LinkFieldOption[]>([])
  const [doctorOpen, setDoctorOpen] = useState(false)
  const [doctorQuery, setDoctorQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    setTransNoLoading(true)
    fetchNextDoctorOrderTransNo()
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
    if (!departmentOpen) return
    fetchMedicalDepartments(departmentQuery || undefined).then(setDepartmentOptions).catch(() => setDepartmentOptions([]))
  }, [departmentQuery, departmentOpen])

  useEffect(() => {
    getCurrentUserPractitioner().then(async (practId) => {
      if (!practId) return
      setDoctor(practId)
      const rows = await fetchHealthcarePractitioners(practId)
      const label = rows[0]?.label || rows[0]?.name || practId
      setDoctorName(label)
      setDoctorQuery(label)
    })
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
    if (mode !== 'IP' || !admission) return
    let cancelled = false
    void syncCostCenterFromCareEpisode('IP', {
      inpatientRecord: admission,
      admissions: admissionOptions,
    }).then((cc) => {
      if (cancelled || !cc) return
      setCostCenter(cc)
      setCcQuery(cc)
    })
    return () => {
      cancelled = true
    }
  }, [mode, admission, admissionOptions])

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

  useEffect(() => {
    if (!doctorOpen) return
    fetchHealthcarePractitioners(doctorQuery).then(setDoctorOptions)
  }, [doctorOpen, doctorQuery])

  const handleSave = async () => {
    if (!patientId.trim()) {
      setError('Patient is required')
      return
    }
    if (!doctorOrder.trim()) {
      setError('Order description is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await createDoctorOrder({
        patient: patientId,
        patient_name: patientName || undefined,
        inpatient_admission: admission || undefined,
        cost_center: costCenter || undefined,
        doctor: doctor || undefined,
        doctor_name: doctorName || undefined,
        doctor_order: doctorOrder.trim(),
        department: department || undefined,
      })
      if (!result.success) {
        throw new Error(result.message || 'Failed to save doctor order')
      }
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save doctor order')
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
            Saved to Doctor Order
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

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Doctor</label>
            <input
              type="text"
              value={doctorQuery}
              onChange={(e) => {
                setDoctorQuery(e.target.value)
                setDoctor('')
                setDoctorOpen(true)
              }}
              onFocus={() => setDoctorOpen(true)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Search doctor…"
            />
            {doctorOpen && doctorOptions.length > 0 && (
              <div className="mt-1 border border-slate-200 rounded-md bg-white shadow-lg max-h-36 overflow-auto">
                {doctorOptions.map((d) => (
                  <button
                    key={d.name}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                    onClick={() => {
                      setDoctor(d.name)
                      setDoctorName(d.label || d.name)
                      setDoctorQuery(d.label || d.name)
                      setDoctorOpen(false)
                    }}
                  >
                    {d.label || d.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Order description *</label>
            <textarea
              value={doctorOrder}
              onChange={(e) => setDoctorOrder(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Enter doctors order…"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Department</label>
            <input
              type="text"
              value={departmentQuery || department}
              onChange={(e) => {
                setDepartmentQuery(e.target.value)
                setDepartment('')
                setDepartmentOpen(true)
              }}
              onFocus={() => setDepartmentOpen(true)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Search department…"
            />
            {departmentOpen && departmentOptions.length > 0 && (
              <div className="mt-1 border border-slate-200 rounded-md bg-white shadow-lg max-h-36 overflow-auto">
                {departmentOptions.map((d) => (
                  <button
                    key={d.name}
                    type="button"
                    onClick={() => {
                      setDepartment(d.name)
                      setDepartmentQuery(d.label || d.name)
                      setDepartmentOpen(false)
                    }}
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    {d.label || d.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Branch</label>
            <input
              type="text"
              value={ccQuery || costCenter}
              onChange={(e) => {
                setCcQuery(e.target.value)
                setCostCenter('')
                setCcOpen(true)
              }}
              onFocus={() => setCcOpen(true)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Branch…"
            />
            {ccOpen && ccOptions.length > 0 && (
              <div className="mt-1 border border-slate-200 rounded-md bg-white shadow-lg max-h-36 overflow-auto">
                {ccOptions.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                    onClick={() => {
                      setCostCenter(c.name)
                      setCcQuery(c.label || c.name)
                      setCcOpen(false)
                    }}
                  >
                    {c.label || c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200">
          <button type="button" onClick={onClose} className={CM_BTN_CANCEL} disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} className={CM_BTN_PRIMARY} disabled={saving}>
            {saving ? 'Saving…' : 'Save order'}
          </button>
        </div>
      </div>
    </div>
  )
}
