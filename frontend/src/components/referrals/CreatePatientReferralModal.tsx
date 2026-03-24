import { useState, useEffect, useRef } from 'react'
import { createPatientReferral, searchReferralSourceDocs, type ReferralSourceDoc } from '../../services/patientReferral'
import { searchPatients, type PatientListItem } from '../../services/patients'
import { fetchCostCenters, fetchHealthcarePractitioners, type LinkFieldOption } from '../../services/common'
import { toast } from '../../hooks/useToast'
import { X } from 'lucide-react'

type SourceDoctype = 'Patient Visit' | 'Inpatient Admission'

interface CreatePatientReferralModalProps {
  onClose: () => void
  onSuccess: (name: string) => void
  /** Pre-fill patient (read-only when provided) */
  initialPatient?: string
  initialPatientName?: string
  /** When opened from a Visit/Admission, pre-fill and lock these two */
  referredFromDoctype?: SourceDoctype
  referredFromDocname?: string
}

export const CreatePatientReferralModal = ({
  onClose,
  onSuccess,
  initialPatient,
  initialPatientName,
  referredFromDoctype: propDoctype,
  referredFromDocname: propDocname,
}: CreatePatientReferralModalProps) => {
  const today = new Date().toISOString().split('T')[0]
  const patientDropRef = useRef<HTMLUListElement>(null)
  const doctorDropRef = useRef<HTMLUListElement>(null)
  const sourceDropRef = useRef<HTMLUListElement>(null)

  // ── form state ─────────────────────────────────────────────────
  const [patient, setPatient] = useState(initialPatient ?? '')
  const [referralDate, setReferralDate] = useState(today)
  const [referredToHospital, setReferredToHospital] = useState('')
  const [referredToDoctor, setReferredToDoctor] = useState('')
  const [referredToAddress, setReferredToAddress] = useState('')
  const [referredToContact, setReferredToContact] = useState('')
  const [reasonForReferral, setReasonForReferral] = useState('')
  const [referralStatus, setReferralStatus] = useState('Pending')
  const [notes, setNotes] = useState('')
  const [costCenter, setCostCenter] = useState('')

  // referred_from – editable only when prop is NOT supplied
  const [sourceDoctype, setSourceDoctype] = useState<SourceDoctype | ''>(propDoctype ?? '')
  const [sourceDocname, setSourceDocname] = useState(propDocname ?? '')

  // referral_doctor (Link → Healthcare Practitioner)
  const [referralDoctor, setReferralDoctor] = useState('')
  const [doctorQuery, setDoctorQuery] = useState('')
  const [doctorResults, setDoctorResults] = useState<LinkFieldOption[]>([])
  const [doctorOpen, setDoctorOpen] = useState(false)

  // patient search
  const [patientQuery, setPatientQuery] = useState(initialPatientName ?? initialPatient ?? '')
  const [patientResults, setPatientResults] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)

  // source document search (dynamic link)
  const [sourceQuery, setSourceQuery] = useState(propDocname ?? '')
  const [sourceResults, setSourceResults] = useState<ReferralSourceDoc[]>([])
  const [sourceOpen, setSourceOpen] = useState(false)

  const [costCenters, setCostCenters] = useState<LinkFieldOption[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // ── load option lists ───────────────────────────────────────────
  useEffect(() => {
    fetchCostCenters().then(setCostCenters).catch(() => {})
  }, [])

  // ── patient search ──────────────────────────────────────────────
  useEffect(() => {
    if (!patientOpen || !!initialPatient) return
    const t = setTimeout(() => {
      searchPatients(patientQuery).then(setPatientResults).catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [patientQuery, patientOpen, initialPatient])

  // ── referral_doctor search ──────────────────────────────────────
  useEffect(() => {
    if (!doctorOpen) return
    const t = setTimeout(() => {
      fetchHealthcarePractitioners(doctorQuery)
        .then(setDoctorResults)
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [doctorQuery, doctorOpen])

  // ── source document search ──────────────────────────────────────
  // Immediately load + open dropdown when doctype is selected or patient changes
  useEffect(() => {
    if (propDoctype || !sourceDoctype) return
    setSourceDocname('')
    setSourceQuery('')
    setSourceResults([])
    searchReferralSourceDocs(sourceDoctype, patient || undefined, undefined)
      .then(results => {
        setSourceResults(results)
        setSourceOpen(true)
      })
      .catch(() => {})
  }, [sourceDoctype, patient, propDoctype])

  // Re-filter as user types in the source field
  useEffect(() => {
    if (!sourceOpen || !sourceDoctype || !!propDoctype) return
    if (!sourceQuery) return           // empty query already loaded above
    const t = setTimeout(() => {
      searchReferralSourceDocs(sourceDoctype, patient || undefined, sourceQuery)
        .then(setSourceResults)
        .catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [sourceQuery, sourceOpen, sourceDoctype, patient, propDoctype])

  // ── validation ──────────────────────────────────────────────────
  const validate = () => {
    const e: Record<string, string> = {}
    if (!patient) e.patient = 'Patient is required'
    if (!referralDate) e.referralDate = 'Referral date is required'
    if (!referredToHospital) e.referredToHospital = 'Referred to hospital is required'
    if (!reasonForReferral) e.reasonForReferral = 'Reason for referral is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // ── submit ──────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate()) return
    setSubmitting(true)
    try {
      const result = await createPatientReferral({
        patient,
        referral_date: referralDate,
        referred_to_hospital: referredToHospital,
        referred_to_doctor: referredToDoctor || undefined,
        referred_to_address: referredToAddress || undefined,
        referred_to_contact: referredToContact || undefined,
        reason_for_referral: reasonForReferral,
        referral_status: referralStatus,
        notes: notes || undefined,
        cost_center: costCenter || undefined,
        referred_from_doctype: (propDoctype || sourceDoctype) || undefined,
        referred_from_docname: (propDocname || sourceDocname) || undefined,
        referral_doctor: referralDoctor || undefined,
      })
      toast.success(`Referral ${result.name} created`)
      onSuccess(result.name)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create referral')
    } finally {
      setSubmitting(false)
    }
  }

  const cls = (field: string) =>
    `w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-primary ${
      errors[field] ? 'border-red-400' : 'border-slate-300'
    }`

  const isSourceLocked = !!propDoctype

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Create Patient Referral</h2>
            {propDoctype && propDocname && (
              <p className="text-xs text-slate-500 mt-0.5">
                From {propDoctype}: <span className="font-medium text-slate-700">{propDocname}</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* Patient + Date */}
          <div className="grid grid-cols-2 gap-4">
            {/* Patient */}
            <div className="relative">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Patient <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={patientQuery}
                onChange={e => {
                  setPatientQuery(e.target.value)
                  setPatient('')
                  setPatientOpen(true)
                }}
                onFocus={() => setPatientOpen(true)}
                onBlur={() => setTimeout(() => setPatientOpen(false), 150)}
                placeholder="Search patient…"
                className={cls('patient')}
                readOnly={!!initialPatient}
              />
              {patientOpen && patientResults.length > 0 && !initialPatient && (
                <ul ref={patientDropRef} className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto text-sm">
                  {patientResults.map(p => (
                    <li
                      key={p.name}
                      className="px-3 py-2 hover:bg-slate-50 cursor-pointer"
                      onMouseDown={() => {
                        setPatient(p.name)
                        setPatientQuery(p.patient_name ?? p.name)
                        setPatientOpen(false)
                        setErrors(prev => ({ ...prev, patient: '' }))
                      }}
                    >
                      <span className="font-medium">{p.patient_name}</span>
                      <span className="text-slate-400 ml-1 text-xs">{p.name}</span>
                    </li>
                  ))}
                </ul>
              )}
              {errors.patient && <p className="mt-1 text-xs text-red-500">{errors.patient}</p>}
            </div>

            {/* Referral Date */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Referral Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={referralDate}
                onChange={e => { setReferralDate(e.target.value); setErrors(p => ({ ...p, referralDate: '' })) }}
                className={cls('referralDate')}
              />
              {errors.referralDate && <p className="mt-1 text-xs text-red-500">{errors.referralDate}</p>}
            </div>
          </div>

          {/* ── Referred From (visible + editable when not pre-filled) ── */}
          <div className="grid grid-cols-2 gap-4">
            {/* Referred From Doctype */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Referred From (Type)</label>
              {isSourceLocked ? (
                <input
                  type="text"
                  value={propDoctype}
                  readOnly
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-slate-50 text-slate-500"
                />
              ) : (
                <select
                  value={sourceDoctype}
                  onChange={e => {
                    setSourceDoctype(e.target.value as SourceDoctype | '')
                    setSourceOpen(false)
                  }}
                  className={cls('sourceDoctype')}
                >
                  <option value="">— None —</option>
                  <option value="Patient Visit">Patient Visit</option>
                  <option value="Inpatient Admission">Inpatient Admission</option>
                </select>
              )}
            </div>

            {/* Referred From Docname (Dynamic Link) */}
            <div className="relative">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Reference Document
                {sourceDoctype && patient && !isSourceLocked && (
                  <span className="ml-1 text-[10px] text-slate-400 font-normal">
                    (filtered by selected patient)
                  </span>
                )}
              </label>
              {isSourceLocked ? (
                <input
                  type="text"
                  value={propDocname}
                  readOnly
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-slate-50 text-slate-500"
                />
              ) : (
                <>
                  <input
                    type="text"
                    value={sourceQuery}
                    onChange={e => {
                      setSourceQuery(e.target.value)
                      setSourceDocname('')
                      setSourceOpen(true)
                    }}
                    onFocus={() => {
                      if (!sourceDoctype) return
                      setSourceOpen(true)
                    }}
                    onBlur={() => setTimeout(() => setSourceOpen(false), 200)}
                    placeholder={sourceDoctype ? `Select ${sourceDoctype}…` : 'Select type first'}
                    disabled={!sourceDoctype}
                    className={`${cls('sourceDocname')} disabled:bg-slate-50 disabled:text-slate-400`}
                  />
                  {sourceOpen && (
                    <ul ref={sourceDropRef} className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-56 overflow-y-auto text-sm">
                      {sourceResults.length === 0 ? (
                        <li className="px-3 py-3 text-slate-400 text-xs text-center italic">
                          {patient ? 'No records found for this patient' : 'Select a patient first to filter records'}
                        </li>
                      ) : (
                        sourceResults.map(r => (
                          <li
                            key={r.name}
                            className="px-3 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0"
                            onMouseDown={() => {
                              setSourceDocname(r.name)
                              setSourceQuery(r.name)
                              setSourceOpen(false)
                            }}
                          >
                            <div className="font-mono text-xs font-semibold text-slate-800">{r.name}</div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {r.patient_name}
                              {(r.encounter_date || r.admission_date) && (
                                <span className="ml-2">{r.encounter_date ?? r.admission_date}</span>
                              )}
                              <span className={`ml-2 px-1 rounded text-[10px] font-medium ${r.status === 'Admitted' || r.status === 'Open' ? 'text-green-700 bg-green-50' : 'text-slate-500 bg-slate-100'}`}>
                                {r.status}
                              </span>
                            </div>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Referred To Hospital + Referred To Doctor */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Referred To Hospital <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={referredToHospital}
                onChange={e => { setReferredToHospital(e.target.value); setErrors(p => ({ ...p, referredToHospital: '' })) }}
                placeholder="Hospital name…"
                className={cls('referredToHospital')}
              />
              {errors.referredToHospital && <p className="mt-1 text-xs text-red-500">{errors.referredToHospital}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Referred To Doctor</label>
              <input
                type="text"
                value={referredToDoctor}
                onChange={e => setReferredToDoctor(e.target.value)}
                placeholder="Name of receiving doctor…"
                className={cls('referredToDoctor')}
              />
            </div>
          </div>

          {/* Referral Doctor (who suggested — Link → Healthcare Practitioner) */}
          <div className="relative">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Referral Doctor <span className="text-xs font-normal text-slate-400">(practitioner who suggested this referral)</span>
            </label>
            <input
              type="text"
              value={doctorQuery}
              onChange={e => {
                setDoctorQuery(e.target.value)
                setReferralDoctor('')
                setDoctorOpen(true)
              }}
              onFocus={() => setDoctorOpen(true)}
              onBlur={() => setTimeout(() => setDoctorOpen(false), 150)}
              placeholder="Search practitioner…"
              className={cls('referralDoctor')}
            />
            {doctorOpen && doctorResults.length > 0 && (
              <ul ref={doctorDropRef} className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto text-sm">
                {doctorResults.map(d => (
                  <li
                    key={d.name}
                    className="px-3 py-2 hover:bg-slate-50 cursor-pointer"
                    onMouseDown={() => {
                      setReferralDoctor(d.name)
                      setDoctorQuery(d.label ?? d.name)
                      setDoctorOpen(false)
                    }}
                  >
                    <span className="font-medium">{d.label ?? d.name}</span>
                    {d.label && <span className="text-slate-400 ml-1 text-xs">{d.name}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Address + Contact */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Hospital Address</label>
              <textarea
                rows={2}
                value={referredToAddress}
                onChange={e => setReferredToAddress(e.target.value)}
                placeholder="Address…"
                className={`${cls('referredToAddress')} resize-none`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Hospital Contact</label>
              <input
                type="text"
                value={referredToContact}
                onChange={e => setReferredToContact(e.target.value)}
                placeholder="Phone / email…"
                className={cls('referredToContact')}
              />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Reason for Referral <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={reasonForReferral}
              onChange={e => { setReasonForReferral(e.target.value); setErrors(p => ({ ...p, reasonForReferral: '' })) }}
              placeholder="Clinical reason for this referral…"
              className={`${cls('reasonForReferral')} resize-none`}
            />
            {errors.reasonForReferral && <p className="mt-1 text-xs text-red-500">{errors.reasonForReferral}</p>}
          </div>

          {/* Status + Cost Center */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Referral Status</label>
              <select
                value={referralStatus}
                onChange={e => setReferralStatus(e.target.value)}
                className={cls('referralStatus')}
              >
                <option value="Pending">Pending</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Cost Center</label>
              <select
                value={costCenter}
                onChange={e => setCostCenter(e.target.value)}
                className={cls('costCenter')}
              >
                <option value="">— Select —</option>
                {costCenters.map(cc => (
                  <option key={cc.name} value={cc.name}>{cc.label ?? cc.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Additional Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any additional notes…"
              className={`${cls('notes')} resize-none`}
            />
          </div>

          {/* Info banner when source doc is locked */}
          {propDoctype && propDocname && (
            <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-700">
              Upon creation, the status of <strong>{propDoctype}</strong>{' '}
              (<strong>{propDocname}</strong>) will be updated to{' '}
              <strong>External Referral</strong>.
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3 bg-slate-50 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create Referral'}
          </button>
        </div>
      </div>
    </div>
  )
}
