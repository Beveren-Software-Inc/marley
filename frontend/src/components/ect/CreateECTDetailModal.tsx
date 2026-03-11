import { useEffect, useState } from 'react'
import { createECTDetail } from '../../services/ectDetails'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { fetchHealthcarePractitioners, type LinkFieldOption } from '../../services/common'
import { toast } from '../../hooks/useToast'

interface CreateECTDetailModalProps {
  onClose: () => void
  onSuccess?: () => void
  initialPatient?: string
}

type ECTTab = 'procedure' | 'staff' | 'other'

function toFrappeDateTime(value: string): string {
  if (!value || !value.trim()) return ''
  let s = value.trim()
  if (s.includes('T')) {
    if (s.endsWith('Z')) s = s.slice(0, -1)
    s = s.replace('T', ' ')
  }
  if (s.length > 19) s = s.slice(0, 19)
  if (s.length === 16) s += ':00'
  return s
}

export const CreateECTDetailModal = ({
  onClose,
  onSuccess,
  initialPatient,
}: CreateECTDetailModalProps) => {
  const now = new Date()
  const [activeTab, setActiveTab] = useState<ECTTab>('procedure')
  const [formData, setFormData] = useState({
    patient: initialPatient || '',
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 5),
    source: '',
    duration: '',
    energy: '',
    _age: '',
    success: '',
    reference_doctype: '',
    reference_name: '',
    repeated: '',
    vitals: '',
    ecg: '',
    anathesiologist: '',
    assist_doctor: '',
    psychiatrist: '',
    nurse: '',
    doctors_name: '',
    ect_doctors_notes: '',
    date_and_time: '',
    nurse_name: '',
    ect_nurse_notes: '',
    n_date_and_time: '',
    bp_1: '',
    bp_2: '',
    psychology_doctor: '',
    anaesthetic_doctor: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientQuery, setPatientQuery] = useState(initialPatient || '')
  const [patientLoading, setPatientLoading] = useState(false)

  // Link-field dropdowns for staff on "Doctor & Nurse" tab
  const [anaesthesiologistOptions, setAnaesthesiologistOptions] = useState<LinkFieldOption[]>([])
  const [anaesthesiologistOpen, setAnaesthesiologistOpen] = useState(false)
  const [anaesthesiologistQuery, setAnaesthesiologistQuery] = useState('')

  const [assistDoctorOptions, setAssistDoctorOptions] = useState<LinkFieldOption[]>([])
  const [assistDoctorOpen, setAssistDoctorOpen] = useState(false)
  const [assistDoctorQuery, setAssistDoctorQuery] = useState('')

  const [psychiatristOptions, setPsychiatristOptions] = useState<LinkFieldOption[]>([])
  const [psychiatristOpen, setPsychiatristOpen] = useState(false)
  const [psychiatristQuery, setPsychiatristQuery] = useState('')

  const [nurseOptions, setNurseOptions] = useState<LinkFieldOption[]>([])
  const [nurseOpen, setNurseOpen] = useState(false)
  const [nurseQuery, setNurseQuery] = useState('')

  const [psychologyPractitioners, setPsychologyPractitioners] = useState<LinkFieldOption[]>([])
  const [psychologyOpen, setPsychologyOpen] = useState(false)
  const [psychologyQuery, setPsychologyQuery] = useState('')
  const [anaestheticPractitioners, setAnaestheticPractitioners] = useState<LinkFieldOption[]>([])
  const [anaestheticOpen, setAnaestheticOpen] = useState(false)
  const [anaestheticQuery, setAnaestheticQuery] = useState('')

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.patient) {
      setError('Patient is required')
      setActiveTab('procedure')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const timePart = formData.time ? `${formData.time}:00`.slice(0, 8) : undefined

      await createECTDetail({
        patient: formData.patient,
        date: formData.date || undefined,
        time: timePart,
        source: formData.source || undefined,
        duration: formData.duration ? Number(formData.duration) : undefined,
        energy: formData.energy || undefined,
        _age: formData._age ? Number(formData._age) : undefined,
        success: formData.success || undefined,
        reference_doctype: formData.reference_doctype || undefined,
        reference_name: formData.reference_name || undefined,
        repeated: formData.repeated || undefined,
        vitals: formData.vitals || undefined,
        ecg: formData.ecg || undefined,
        anathesiologist: formData.anathesiologist || undefined,
        assist_doctor: formData.assist_doctor || undefined,
        psychiatrist: formData.psychiatrist || undefined,
        nurse: formData.nurse || undefined,
        doctors_name: formData.doctors_name || undefined,
        ect_doctors_notes: formData.ect_doctors_notes || undefined,
        date_and_time: toFrappeDateTime(formData.date_and_time) || undefined,
        nurse_name: formData.nurse_name || undefined,
        ect_nurse_notes: formData.ect_nurse_notes || undefined,
        n_date_and_time: toFrappeDateTime(formData.n_date_and_time) || undefined,
        bp_1: formData.bp_1 || undefined,
        bp_2: formData.bp_2 || undefined,
        psychology_doctor: formData.psychology_doctor || undefined,
        anaesthetic_doctor: formData.anaesthetic_doctor || undefined,
      })

      toast.success('ECT Detail created successfully')
      onSuccess?.()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create ECT detail'
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
          }
        } catch (err) {
          console.error('Failed to load initial patient for ECT:', err)
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
        console.error('Failed to search patients for ECT:', err)
        setPatientOptions([])
      } finally {
        setPatientLoading(false)
      }
    }, patientQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [patientQuery, patientOpen])

  // Anaesthesiologist (link to Healthcare Practitioner)
  useEffect(() => {
    if (!anaesthesiologistOpen) return
    const t = setTimeout(async () => {
      try {
        const results = await fetchHealthcarePractitioners(anaesthesiologistQuery || undefined)
        setAnaesthesiologistOptions(results)
      } catch {
        setAnaesthesiologistOptions([])
      }
    }, anaesthesiologistQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [anaesthesiologistQuery, anaesthesiologistOpen])

  // Assist Doctor
  useEffect(() => {
    if (!assistDoctorOpen) return
    const t = setTimeout(async () => {
      try {
        const results = await fetchHealthcarePractitioners(assistDoctorQuery || undefined)
        setAssistDoctorOptions(results)
      } catch {
        setAssistDoctorOptions([])
      }
    }, assistDoctorQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [assistDoctorQuery, assistDoctorOpen])

  // Psychiatrist
  useEffect(() => {
    if (!psychiatristOpen) return
    const t = setTimeout(async () => {
      try {
        const results = await fetchHealthcarePractitioners(psychiatristQuery || undefined)
        setPsychiatristOptions(results)
      } catch {
        setPsychiatristOptions([])
      }
    }, psychiatristQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [psychiatristQuery, psychiatristOpen])

  // Nurse
  useEffect(() => {
    if (!nurseOpen) return
    const t = setTimeout(async () => {
      try {
        const results = await fetchHealthcarePractitioners(nurseQuery || undefined)
        setNurseOptions(results)
      } catch {
        setNurseOptions([])
      }
    }, nurseQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [nurseQuery, nurseOpen])

  useEffect(() => {
    if (!psychologyOpen) return
    const t = setTimeout(async () => {
      try {
        const results = await fetchHealthcarePractitioners(psychologyQuery || undefined)
        setPsychologyPractitioners(results)
      } catch (err) {
        setPsychologyPractitioners([])
      }
    }, psychologyQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [psychologyQuery, psychologyOpen])

  useEffect(() => {
    if (!anaestheticOpen) return
    const t = setTimeout(async () => {
      try {
        const results = await fetchHealthcarePractitioners(anaestheticQuery || undefined)
        setAnaestheticPractitioners(results)
      } catch (err) {
        setAnaestheticPractitioners([])
      }
    }, anaestheticQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [anaestheticQuery, anaestheticOpen])

  useEffect(() => {
    fetchHealthcarePractitioners().then(setPsychologyPractitioners).catch(() => {})
    fetchHealthcarePractitioners().then(setAnaestheticPractitioners).catch(() => {})
  }, [])

  const handlePatientSelect = (p: PatientListItem) => {
    setFormData(prev => ({ ...prev, patient: p.name }))
    setPatientQuery(p.patient_name)
    setPatientOpen(false)
  }

  const tabs: { id: ECTTab; label: string }[] = [
    { id: 'procedure', label: 'Procedure' },
    { id: 'staff', label: 'Doctor & Nurse' },
    { id: 'other', label: 'Other' },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-semibold text-slate-900">Create ECT Detail</h2>
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

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-4 flex-shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-primary text-primary bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1 overflow-hidden">
          {error && (
            <div className="mx-4 mt-3 bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 flex-shrink-0">
              {error}
            </div>
          )}

          <div className="p-4 overflow-y-auto flex-1 min-h-0">
            {/* Tab 1: Procedure */}
            {activeTab === 'procedure' && (
              <div className="space-y-4">
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
                    <label className="block text-sm font-medium text-slate-700 mb-1">Time</label>
                    <input
                      type="time"
                      value={formData.time}
                      onChange={(e) => handleChange('time', e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Source</label>
                  <input
                    type="text"
                    value={formData.source}
                    onChange={(e) => handleChange('source', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Optional"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Duration</label>
                    <input
                      type="text"
                      value={formData.duration}
                      onChange={(e) => handleChange('duration', e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      placeholder="e.g. minutes"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Energy</label>
                    <input
                      type="text"
                      value={formData.energy}
                      onChange={(e) => handleChange('energy', e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      placeholder="e.g. 50%"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">% Age</label>
                    <input
                      type="text"
                      value={formData._age}
                      onChange={(e) => handleChange('_age', e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      placeholder="Percent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Success</label>
                    <input
                      type="text"
                      value={formData.success}
                      onChange={(e) => handleChange('success', e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      placeholder="e.g. Yes / No"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Reference Doctype</label>
                    <input
                      type="text"
                      value={formData.reference_doctype}
                      onChange={(e) => handleChange('reference_doctype', e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      placeholder="e.g. DocType"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Reference Name</label>
                    <input
                      type="text"
                      value={formData.reference_name}
                      onChange={(e) => handleChange('reference_name', e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      placeholder="Document name"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Repeated</label>
                  <input
                    type="text"
                    value={formData.repeated}
                    onChange={(e) => handleChange('repeated', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Vitals</label>
                    <input
                      type="text"
                      value={formData.vitals}
                      onChange={(e) => handleChange('vitals', e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">ECG</label>
                    <input
                      type="text"
                      value={formData.ecg}
                      onChange={(e) => handleChange('ecg', e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Doctor & Nurse */}
            {activeTab === 'staff' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Anathesiologist</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={
                          anaesthesiologistOpen
                            ? anaesthesiologistQuery
                            : (anaesthesiologistOptions.find(p => p.name === formData.anathesiologist)?.label ||
                              formData.anathesiologist ||
                              '')
                        }
                        onChange={(e) => {
                          setAnaesthesiologistQuery(e.target.value)
                          if (!e.target.value) handleChange('anathesiologist', '')
                          setAnaesthesiologistOpen(true)
                        }}
                        onFocus={() => {
                          setAnaesthesiologistOpen(true)
                          if (!anaesthesiologistQuery && formData.anathesiologist) {
                            const label = anaesthesiologistOptions.find(p => p.name === formData.anathesiologist)?.label
                            if (label) setAnaesthesiologistQuery(label)
                          }
                        }}
                        placeholder="Search Healthcare Practitioner..."
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      {anaesthesiologistOpen && anaesthesiologistOptions.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                          {anaesthesiologistOptions.map((p) => (
                            <button
                              key={p.name}
                              type="button"
                              onClick={() => {
                                handleChange('anathesiologist', p.name)
                                setAnaesthesiologistQuery(p.label)
                                setAnaesthesiologistOpen(false)
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Assist Doctor</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={
                          assistDoctorOpen
                            ? assistDoctorQuery
                            : (assistDoctorOptions.find(p => p.name === formData.assist_doctor)?.label ||
                              formData.assist_doctor ||
                              '')
                        }
                        onChange={(e) => {
                          setAssistDoctorQuery(e.target.value)
                          if (!e.target.value) handleChange('assist_doctor', '')
                          setAssistDoctorOpen(true)
                        }}
                        onFocus={() => {
                          setAssistDoctorOpen(true)
                          if (!assistDoctorQuery && formData.assist_doctor) {
                            const label = assistDoctorOptions.find(p => p.name === formData.assist_doctor)?.label
                            if (label) setAssistDoctorQuery(label)
                          }
                        }}
                        placeholder="Search Healthcare Practitioner..."
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      {assistDoctorOpen && assistDoctorOptions.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                          {assistDoctorOptions.map((p) => (
                            <button
                              key={p.name}
                              type="button"
                              onClick={() => {
                                handleChange('assist_doctor', p.name)
                                setAssistDoctorQuery(p.label)
                                setAssistDoctorOpen(false)
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Psychiatrist</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={
                          psychiatristOpen
                            ? psychiatristQuery
                            : (psychiatristOptions.find(p => p.name === formData.psychiatrist)?.label ||
                              formData.psychiatrist ||
                              '')
                        }
                        onChange={(e) => {
                          setPsychiatristQuery(e.target.value)
                          if (!e.target.value) handleChange('psychiatrist', '')
                          setPsychiatristOpen(true)
                        }}
                        onFocus={() => {
                          setPsychiatristOpen(true)
                          if (!psychiatristQuery && formData.psychiatrist) {
                            const label = psychiatristOptions.find(p => p.name === formData.psychiatrist)?.label
                            if (label) setPsychiatristQuery(label)
                          }
                        }}
                        placeholder="Search Healthcare Practitioner..."
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      {psychiatristOpen && psychiatristOptions.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                          {psychiatristOptions.map((p) => (
                            <button
                              key={p.name}
                              type="button"
                              onClick={() => {
                                handleChange('psychiatrist', p.name)
                                setPsychiatristQuery(p.label)
                                setPsychiatristOpen(false)
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nurse</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={
                          nurseOpen
                            ? nurseQuery
                            : (nurseOptions.find(p => p.name === formData.nurse)?.label ||
                              formData.nurse ||
                              '')
                        }
                        onChange={(e) => {
                          setNurseQuery(e.target.value)
                          if (!e.target.value) handleChange('nurse', '')
                          setNurseOpen(true)
                        }}
                        onFocus={() => {
                          setNurseOpen(true)
                          if (!nurseQuery && formData.nurse) {
                            const label = nurseOptions.find(p => p.name === formData.nurse)?.label
                            if (label) setNurseQuery(label)
                          }
                        }}
                        placeholder="Search Healthcare Practitioner..."
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      {nurseOpen && nurseOptions.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                          {nurseOptions.map((p) => (
                            <button
                              key={p.name}
                              type="button"
                              onClick={() => {
                                handleChange('nurse', p.name)
                                setNurseQuery(p.label)
                                setNurseOpen(false)
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Doctor&apos;s Name</label>
                  <input
                    type="text"
                    value={formData.doctors_name}
                    onChange={(e) => handleChange('doctors_name', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ECT Doctor&apos;s Notes</label>
                  <textarea
                    value={formData.ect_doctors_notes}
                    onChange={(e) => handleChange('ect_doctors_notes', e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Optional"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date and Time (Doctor)</label>
                  <input
                    type="datetime-local"
                    value={formData.date_and_time ? (formData.date_and_time.replace(' ', 'T').slice(0, 16)) : ''}
                    onChange={(e) => handleChange('date_and_time', e.target.value || '')}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nurse Name</label>
                  <input
                    type="text"
                    value={formData.nurse_name}
                    onChange={(e) => handleChange('nurse_name', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ECT Nurse Notes</label>
                  <textarea
                    value={formData.ect_nurse_notes}
                    onChange={(e) => handleChange('ect_nurse_notes', e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Optional"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date and Time (Nurse)</label>
                  <input
                    type="datetime-local"
                    value={formData.n_date_and_time ? (formData.n_date_and_time.replace(' ', 'T').slice(0, 16)) : ''}
                    onChange={(e) => handleChange('n_date_and_time', e.target.value || '')}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}

            {/* Tab 3: Other */}
            {activeTab === 'other' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">BP 1</label>
                    <input
                      type="text"
                      value={formData.bp_1}
                      onChange={(e) => handleChange('bp_1', e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      placeholder="e.g. systolic"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">BP 2</label>
                    <input
                      type="text"
                      value={formData.bp_2}
                      onChange={(e) => handleChange('bp_2', e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      placeholder="e.g. diastolic"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Psychology Doctor</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={psychologyOpen ? psychologyQuery : (psychologyPractitioners.find(p => p.name === formData.psychology_doctor)?.label || formData.psychology_doctor || '')}
                      onChange={(e) => {
                        setPsychologyQuery(e.target.value)
                        if (!e.target.value) handleChange('psychology_doctor', '')
                        setPsychologyOpen(true)
                      }}
                      onFocus={() => {
                        setPsychologyOpen(true)
                        if (!psychologyQuery && formData.psychology_doctor) {
                          const label = psychologyPractitioners.find(p => p.name === formData.psychology_doctor)?.label
                          if (label) setPsychologyQuery(label)
                        }
                      }}
                      placeholder="Search Healthcare Practitioner..."
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {psychologyOpen && psychologyPractitioners.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {psychologyPractitioners.map((p) => (
                          <button
                            key={p.name}
                            type="button"
                            onClick={() => {
                              handleChange('psychology_doctor', p.name)
                              setPsychologyQuery(p.label)
                              setPsychologyOpen(false)
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Anaesthetic Doctor</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={anaestheticOpen ? anaestheticQuery : (anaestheticPractitioners.find(p => p.name === formData.anaesthetic_doctor)?.label || formData.anaesthetic_doctor || '')}
                      onChange={(e) => {
                        setAnaestheticQuery(e.target.value)
                        if (!e.target.value) handleChange('anaesthetic_doctor', '')
                        setAnaestheticOpen(true)
                      }}
                      onFocus={() => {
                        setAnaestheticOpen(true)
                        if (!anaestheticQuery && formData.anaesthetic_doctor) {
                          const label = anaestheticPractitioners.find(p => p.name === formData.anaesthetic_doctor)?.label
                          if (label) setAnaestheticQuery(label)
                        }
                      }}
                      placeholder="Search Healthcare Practitioner..."
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {anaestheticOpen && anaestheticPractitioners.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {anaestheticPractitioners.map((p) => (
                          <button
                            key={p.name}
                            type="button"
                            onClick={() => {
                              handleChange('anaesthetic_doctor', p.name)
                              setAnaestheticQuery(p.label)
                              setAnaestheticOpen(false)
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-200 flex justify-end gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
