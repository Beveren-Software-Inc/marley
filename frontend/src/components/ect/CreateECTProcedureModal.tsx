import { useEffect, useState } from 'react'
import { createECTProcedure } from '../../services/ectProcedure'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { fetchHealthcarePractitioners, type LinkFieldOption } from '../../services/common'
import { toast } from '../../hooks/useToast'

interface CreateECTProcedureModalProps {
  onClose: () => void
  onSuccess?: () => void
  initialPatient?: string
}

export const CreateECTProcedureModal = ({
  onClose,
  onSuccess,
  initialPatient,
}: CreateECTProcedureModalProps) => {
  const now = new Date()
  const [formData, setFormData] = useState({
    patient: initialPatient || '',
    patient_name: '',
    date: now.toISOString().slice(0, 10),
    npo_since: '',
    consultant_doctor: '',
    assistant_doctor: '',
    anaesthetist: '',
    type_of_anaesthesia: '',
    date_of_session: '',
    no_of_session: '',
    bp: '',
    hr: '',
    temp: '',
    resp_rate: '',
    spo2: '',
    energy: '',
    gtcs_for: '',
    bp_after: '',
    hr_after: '',
    resp_rate_after: '',
    spo2_after: '',
    progress_plan: '',
    other_complications: '',
    sign_date: '',
    consultant_sign_date: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientQuery, setPatientQuery] = useState(initialPatient || '')
  const [patientLoading, setPatientLoading] = useState(false)

  const [consultantOptions, setConsultantOptions] = useState<LinkFieldOption[]>([])
  const [assistantOptions, setAssistantOptions] = useState<LinkFieldOption[]>([])
  const [anaesthetistOptions, setAnaesthetistOptions] = useState<LinkFieldOption[]>([])

  const [consultantOpen, setConsultantOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [anaesthetistOpen, setAnaesthetistOpen] = useState(false)

  const [consultantQuery, setConsultantQuery] = useState('')
  const [assistantQuery, setAssistantQuery] = useState('')
  const [anaesthetistQuery, setAnaesthetistQuery] = useState('')

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.patient) {
      setError('Patient is required')
      return
    }

    try {
      setLoading(true)
      setError(null)

      await createECTProcedure({
        patient: formData.patient,
        patient_name: formData.patient_name || undefined,
        date: formData.date || undefined,
        npo_since: formData.npo_since || undefined,
        consultant_doctor: formData.consultant_doctor || undefined,
        assistant_doctor: formData.assistant_doctor || undefined,
        anaesthetist: formData.anaesthetist || undefined,
        type_of_anaesthesia: formData.type_of_anaesthesia || undefined,
        date_of_session: formData.date_of_session || undefined,
        no_of_session: formData.no_of_session ? Number(formData.no_of_session) : undefined,
        bp: formData.bp || undefined,
        hr: formData.hr || undefined,
        temp: formData.temp || undefined,
        resp_rate: formData.resp_rate || undefined,
        spo2: formData.spo2 || undefined,
        energy: formData.energy || undefined,
        gtcs_for: formData.gtcs_for || undefined,
        bp_after: formData.bp_after || undefined,
        hr_after: formData.hr_after || undefined,
        resp_rate_after: formData.resp_rate_after || undefined,
        spo2_after: formData.spo2_after || undefined,
        progress_plan: formData.progress_plan || undefined,
        other_complications: formData.other_complications || undefined,
        sign_date: formData.sign_date || undefined,
        consultant_sign_date: formData.consultant_sign_date || undefined,
      })

      toast.success('ECT Procedure created successfully')
      onSuccess?.()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create ECT Procedure'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialPatient) {
      const load = async () => {
        try {
          const patients = await fetchPatients(1, 0, initialPatient)
          if (patients.length > 0) {
            setPatientQuery(patients[0].patient_name)
            setFormData(prev => ({
              ...prev,
              patient: patients[0].name,
              patient_name: patients[0].patient_name,
            }))
          }
        } catch (err) {
          console.error('Failed to load initial patient for ECT Procedure:', err)
        }
      }
      load()
    }
  }, [initialPatient])

  useEffect(() => {
    if (!patientOpen) return
    const t = setTimeout(async () => {
      try {
        setPatientLoading(true)
        let results: PatientListItem[] = []
        if (patientQuery.trim() === '') {
          results = await fetchPatients(20, 0)
        } else {
          results = await searchPatients(patientQuery, 20)
        }
        setPatientOptions(results)
      } catch (err) {
        console.error('Failed to search patients for ECT Procedure:', err)
        setPatientOptions([])
      } finally {
        setPatientLoading(false)
      }
    }, patientQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [patientQuery, patientOpen])

  useEffect(() => {
    if (!consultantOpen) return
    const t = setTimeout(async () => {
      try {
        const results = await fetchHealthcarePractitioners(consultantQuery || undefined)
        setConsultantOptions(results)
      } catch {
        setConsultantOptions([])
      }
    }, consultantQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [consultantQuery, consultantOpen])

  useEffect(() => {
    if (!assistantOpen) return
    const t = setTimeout(async () => {
      try {
        const results = await fetchHealthcarePractitioners(assistantQuery || undefined)
        setAssistantOptions(results)
      } catch {
        setAssistantOptions([])
      }
    }, assistantQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [assistantQuery, assistantOpen])

  useEffect(() => {
    if (!anaesthetistOpen) return
    const t = setTimeout(async () => {
      try {
        const results = await fetchHealthcarePractitioners(anaesthetistQuery || undefined)
        setAnaesthetistOptions(results)
      } catch {
        setAnaesthetistOptions([])
      }
    }, anaesthetistQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [anaesthetistQuery, anaesthetistOpen])

  const handlePatientSelect = (p: PatientListItem) => {
    setFormData(prev => ({
      ...prev,
      patient: p.name,
      patient_name: p.patient_name,
    }))
    setPatientQuery(p.patient_name)
    setPatientOpen(false)
  }

  const handleConsultantSelect = (d: LinkFieldOption) => {
    setFormData(prev => ({
      ...prev,
      consultant_doctor: d.name,
    }))
    setConsultantQuery(d.label)
    setConsultantOpen(false)
  }

  const handleAssistantSelect = (d: LinkFieldOption) => {
    setFormData(prev => ({
      ...prev,
      assistant_doctor: d.name,
    }))
    setAssistantQuery(d.label)
    setAssistantOpen(false)
  }

  const handleAnaesthetistSelect = (d: LinkFieldOption) => {
    setFormData(prev => ({
      ...prev,
      anaesthetist: d.name,
    }))
    setAnaesthetistQuery(d.label)
    setAnaesthetistOpen(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-semibold text-slate-900">Create ECT Procedure</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1 overflow-hidden">
          {error && (
            <div className="mx-4 mt-3 bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 flex-shrink-0">
              {error}
            </div>
          )}

          <div className="p-4 overflow-y-auto flex-1 min-h-0 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Patient <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={patientQuery}
                  onChange={(e) => {
                    setPatientQuery(e.target.value)
                    setPatientOpen(true)
                  }}
                  onFocus={() => setPatientOpen(true)}
                  placeholder="Search patient..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {patientLoading && (
                  <div className="absolute right-3 top-2.5 text-slate-400 text-xs">Loading...</div>
                )}
                {patientOpen && patientOptions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {patientOptions.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => handlePatientSelect(p)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                      >
                        <div className="font-medium">{p.patient_name}</div>
                        {p.mobile && <div className="text-xs text-slate-500">{p.mobile}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => handleChange('date', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">NPO Since</label>
                <input
                  type="date"
                  value={formData.npo_since}
                  onChange={(e) => handleChange('npo_since', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Consultant Doctor</label>
                <div className="relative">
                  <input
                    type="text"
                    value={consultantQuery}
                    onChange={(e) => {
                      setConsultantQuery(e.target.value)
                      setConsultantOpen(true)
                    }}
                    onFocus={() => setConsultantOpen(true)}
                    placeholder="Search consultant..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  {consultantOpen && consultantOptions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {consultantOptions.map((d) => (
                        <button
                          key={d.name}
                          type="button"
                          onClick={() => handleConsultantSelect(d)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                        >
                          <div className="font-medium">{d.label}</div>
                          {d.department && (
                            <div className="text-xs text-slate-500">{d.department}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Assistant Doctor</label>
                <div className="relative">
                  <input
                    type="text"
                    value={assistantQuery}
                    onChange={(e) => {
                      setAssistantQuery(e.target.value)
                      setAssistantOpen(true)
                    }}
                    onFocus={() => setAssistantOpen(true)}
                    placeholder="Search assistant..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  {assistantOpen && assistantOptions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {assistantOptions.map((d) => (
                        <button
                          key={d.name}
                          type="button"
                          onClick={() => handleAssistantSelect(d)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                        >
                          <div className="font-medium">{d.label}</div>
                          {d.department && (
                            <div className="text-xs text-slate-500">{d.department}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Anaesthetist</label>
                <div className="relative">
                  <input
                    type="text"
                    value={anaesthetistQuery}
                    onChange={(e) => {
                      setAnaesthetistQuery(e.target.value)
                      setAnaesthetistOpen(true)
                    }}
                    onFocus={() => setAnaesthetistOpen(true)}
                    placeholder="Search anaesthetist..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  {anaesthetistOpen && anaesthetistOptions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {anaesthetistOptions.map((d) => (
                        <button
                          key={d.name}
                          type="button"
                          onClick={() => handleAnaesthetistSelect(d)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                        >
                          <div className="font-medium">{d.label}</div>
                          {d.department && (
                            <div className="text-xs text-slate-500">{d.department}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date of Session</label>
                <input
                  type="date"
                  value={formData.date_of_session}
                  onChange={(e) => handleChange('date_of_session', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">No of Session</label>
                <input
                  type="number"
                  value={formData.no_of_session}
                  onChange={(e) => handleChange('no_of_session', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  min={0}
                />
              </div>
            </div>

            <div className="grid grid-cols-5 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">BP</label>
                <input
                  type="text"
                  value={formData.bp}
                  onChange={(e) => handleChange('bp', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">HR</label>
                <input
                  type="text"
                  value={formData.hr}
                  onChange={(e) => handleChange('hr', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Temp</label>
                <input
                  type="text"
                  value={formData.temp}
                  onChange={(e) => handleChange('temp', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Resp Rate</label>
                <input
                  type="text"
                  value={formData.resp_rate}
                  onChange={(e) => handleChange('resp_rate', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">SPO2</label>
                <input
                  type="text"
                  value={formData.spo2}
                  onChange={(e) => handleChange('spo2', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Energy</label>
                <input
                  type="text"
                  value={formData.energy}
                  onChange={(e) => handleChange('energy', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">GTCs For</label>
                <input
                  type="text"
                  value={formData.gtcs_for}
                  onChange={(e) => handleChange('gtcs_for', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">BP After</label>
                <input
                  type="text"
                  value={formData.bp_after}
                  onChange={(e) => handleChange('bp_after', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">HR After</label>
                <input
                  type="text"
                  value={formData.hr_after}
                  onChange={(e) => handleChange('hr_after', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Resp Rate After</label>
                <input
                  type="text"
                  value={formData.resp_rate_after}
                  onChange={(e) => handleChange('resp_rate_after', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">SPO2 After</label>
                <input
                  type="text"
                  value={formData.spo2_after}
                  onChange={(e) => handleChange('spo2_after', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Progress Plan</label>
              <textarea
                value={formData.progress_plan}
                onChange={(e) => handleChange('progress_plan', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm min-h-[70px]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Other Complications / Contraindications
              </label>
              <textarea
                value={formData.other_complications}
                onChange={(e) => handleChange('other_complications', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm min-h-[70px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Sign Date</label>
                <input
                  type="date"
                  value={formData.sign_date}
                  onChange={(e) => handleChange('sign_date', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Consultant Sign Date
                </label>
                <input
                  type="date"
                  value={formData.consultant_sign_date}
                  onChange={(e) => handleChange('consultant_sign_date', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save ECT Procedure'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

