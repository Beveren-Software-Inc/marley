import { useState, useEffect } from 'react'
import {
  searchPatients,
  fetchPatients,
  type PatientListItem
} from '../../services/patients'
import {
  fetchHealthcarePractitioners,
  fetchServiceRequestTemplateTypes,
  fetchServiceRequestTemplates,
  fetchPatientVisits,
  fetchInpatientAdmissions,
  type LinkFieldOption
} from '../../services/common'
import {
  fetchServiceRequest,
  updateServiceRequest,
  type UpdateServiceRequestData
} from '../../services/serviceRequests'
import { toast } from '../../hooks/useToast'
import { X } from 'lucide-react'

type SRTab = 'patient_order' | 'service_details' | 'billing_refs'

interface EditServiceRequestModalProps {
  serviceRequestName: string
  onClose: () => void
  onSuccess: () => void
}

const defaultFormData = {
  template_dt: '',
  template_dn: '',
  practitioner: '',
  patient_visit: '',
  inpatient_record: '',
  order_date: '',
  order_time: '',
  department: '',
  status: '',
  priority: '',
  intent: '',
  quantity: 1,
  order_description: '',
  patient_instructions: '',
  expected_date: '',
  amount: '' as string | number,
  source: '',
  referring_practitioner: '',
  referred_to_practitioner: '',
  staff_role: '',
  patient_care_type: '',
  healthcare_service_unit_type: '',
  as_needed: false,
  occurrence_date: '',
  occurrence_time: '',
  dosage_form: '',
  dosage: '',
  period: '',
  order_group: '',
  order_reference_doctype: '',
  order_reference_name: '',
  reference_document_type: '',
  reference_document_name: ''
}

export const EditServiceRequestModal = ({
  serviceRequestName,
  onClose,
  onSuccess
}: EditServiceRequestModalProps) => {
  const [activeTab, setActiveTab] = useState<SRTab>('patient_order')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [patientQuery, setPatientQuery] = useState('')
  const [selectedPatient, setSelectedPatient] = useState<PatientListItem | null>(null)
  const [patients, setPatients] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [loadingPatients, setLoadingPatients] = useState(false)

  const [templateTypes, setTemplateTypes] = useState<LinkFieldOption[]>([])
  const [templates, setTemplates] = useState<LinkFieldOption[]>([])
  const [practitioners, setPractitioners] = useState<LinkFieldOption[]>([])
  const [patientVisits, setPatientVisits] = useState<LinkFieldOption[]>([])
  const [admissions, setAdmissions] = useState<LinkFieldOption[]>([])
  const [practOpen, setPractOpen] = useState(false)
  const [practQuery, setPractQuery] = useState('')
  const [referringOpen, setReferringOpen] = useState(false)
  const [referringQuery, setReferringQuery] = useState('')
  const [referredToOpen, setReferredToOpen] = useState(false)
  const [referredToQuery, setReferredToQuery] = useState('')

  const [formData, setFormData] = useState(defaultFormData)
  const [readOnly, setReadOnly] = useState<Record<string, unknown>>({})

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [doc, types, practs] = await Promise.all([
          fetchServiceRequest(serviceRequestName),
          fetchServiceRequestTemplateTypes(),
          fetchHealthcarePractitioners()
        ])
        setTemplateTypes(types)
        setPractitioners(practs)

        const patient = (doc.patient as string) || ''
        const patientName = (doc.patient_name as string) || patient
        setPatientQuery(patientName)
        setSelectedPatient(patient ? { name: patient, patient_name: patientName } as PatientListItem : null)

        setFormData({
          template_dt: (doc.template_dt as string) || '',
          template_dn: (doc.template_dn as string) || '',
          practitioner: (doc.practitioner as string) || '',
          patient_visit: (doc.patient_visit as string) || '',
          inpatient_record: (doc.inpatient_record as string) || '',
          order_date: (doc.order_date as string) ? String(doc.order_date).slice(0, 10) : new Date().toISOString().split('T')[0],
          order_time: (doc.order_time as string) ? String(doc.order_time).slice(0, 5) : new Date().toTimeString().slice(0, 5),
          department: (doc.medical_department as string) || '',
          status: (doc.status as string) || '',
          priority: (doc.priority as string) || '',
          intent: (doc.intent as string) || '',
          quantity: typeof doc.quantity === 'number' ? doc.quantity : 1,
          order_description: (doc.order_description as string) || '',
          patient_instructions: (doc.patient_instructions as string) || '',
          expected_date: (doc.expected_date as string) ? String(doc.expected_date).slice(0, 10) : '',
          amount: (doc.amount as number) ?? '',
          source: (doc.source as string) || '',
          referring_practitioner: (doc.referring_practitioner as string) || '',
          referred_to_practitioner: (doc.referred_to_practitioner as string) || '',
          staff_role: (doc.staff_role as string) || '',
          patient_care_type: (doc.patient_care_type as string) || '',
          healthcare_service_unit_type: (doc.healthcare_service_unit_type as string) || '',
          as_needed: !!doc.as_needed,
          occurrence_date: (doc.occurrence_date as string) ? String(doc.occurrence_date).slice(0, 10) : '',
          occurrence_time: (doc.occurrence_time as string) ? String(doc.occurrence_time).slice(0, 5) : '',
          dosage_form: (doc.dosage_form as string) || '',
          dosage: (doc.dosage as string) || '',
          period: (doc.period as string) || '',
          order_group: (doc.order_group as string) || '',
          order_reference_doctype: (doc.order_reference_doctype as string) || '',
          order_reference_name: (doc.order_reference_name as string) || '',
          reference_document_type: (doc.reference_document_type as string) || '',
          reference_document_name: (doc.reference_document_name as string) || ''
        })
        setPractQuery((doc.practitioner_name as string) || (doc.practitioner as string) || '')
        setReferringQuery((doc.referring_practitioner as string) || '')
        setReferredToQuery((doc.referred_to_practitioner as string) || '')
        setReadOnly({
          patient_accepted_cost: doc.patient_accepted_cost,
          booked: doc.booked,
          sample_collection_required: doc.sample_collection_required,
          qty_invoiced: doc.qty_invoiced,
          billing_status: doc.billing_status
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load service request')
        toast.error(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [serviceRequestName])

  useEffect(() => {
    if (!formData.template_dt) {
      setTemplates([])
      return
    }
    fetchServiceRequestTemplates(formData.template_dt)
      .then(setTemplates)
      .catch(() => setTemplates([]))
  }, [formData.template_dt])

  useEffect(() => {
    if (!selectedPatient) return
    fetchPatientVisits(selectedPatient.name).then(setPatientVisits).catch(() => setPatientVisits([]))
    fetchInpatientAdmissions(selectedPatient.name).then(setAdmissions).catch(() => setAdmissions([]))
  }, [selectedPatient])

  useEffect(() => {
    if (!patientOpen) return
    const search = async () => {
      setLoadingPatients(true)
      try {
        const results = patientQuery.trim() === ''
          ? await fetchPatients(20, 0)
          : await searchPatients(patientQuery, 20)
        setPatients(results)
      } finally {
        setLoadingPatients(false)
      }
    }
    const t = setTimeout(search, 300)
    return () => clearTimeout(t)
  }, [patientQuery, patientOpen])

  useEffect(() => {
    if (!practOpen) return
    const t = setTimeout(() => {
      fetchHealthcarePractitioners(practQuery || undefined).then(setPractitioners)
    }, 300)
    return () => clearTimeout(t)
  }, [practQuery, practOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!selectedPatient) {
      setError('Please select a patient')
      setActiveTab('patient_order')
      return
    }
    if (!formData.template_dt || !formData.template_dn) {
      setError('Please select template type and template')
      setActiveTab('service_details')
      return
    }
    try {
      setSubmitting(true)
      const payload: UpdateServiceRequestData = {
        patient: selectedPatient.name,
        template_dt: formData.template_dt,
        template_dn: formData.template_dn,
        practitioner: formData.practitioner || undefined,
        patient_visit: formData.patient_visit || undefined,
        inpatient_record: formData.inpatient_record || undefined,
        order_date: formData.order_date,
        order_time: formData.order_time,
        department: formData.department || undefined,
        status: formData.status || undefined,
        priority: formData.priority || undefined,
        intent: formData.intent || undefined,
        quantity: formData.quantity,
        order_description: formData.order_description || undefined,
        patient_instructions: formData.patient_instructions || undefined,
        expected_date: formData.expected_date || undefined,
        amount: formData.amount === '' ? undefined : Number(formData.amount),
        source: formData.source || undefined,
        referring_practitioner: formData.referring_practitioner || undefined,
        referred_to_practitioner: formData.referred_to_practitioner || undefined,
        staff_role: formData.staff_role || undefined,
        patient_care_type: formData.patient_care_type || undefined,
        healthcare_service_unit_type: formData.healthcare_service_unit_type || undefined,
        as_needed: formData.as_needed,
        occurrence_date: formData.occurrence_date || undefined,
        occurrence_time: formData.occurrence_time || undefined,
        dosage_form: formData.dosage_form || undefined,
        dosage: formData.dosage || undefined,
        period: formData.period || undefined,
        order_group: formData.order_group || undefined
      }
      await updateServiceRequest(serviceRequestName, payload)
      toast.success('Service request updated')
      onSuccess()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update service request'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const set = (field: keyof typeof formData, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const displayReferring = referringOpen ? referringQuery : (practitioners.find(p => p.name === formData.referring_practitioner)?.label || formData.referring_practitioner || '')
  const displayReferredTo = referredToOpen ? referredToQuery : (practitioners.find(p => p.name === formData.referred_to_practitioner)?.label || formData.referred_to_practitioner || '')

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-8 text-center text-slate-600">
          Loading service request…
        </div>
      </div>
    )
  }

  const tabs: { id: SRTab; label: string }[] = [
    { id: 'patient_order', label: 'Patient & Order' },
    { id: 'service_details', label: 'Service & Details' },
    { id: 'billing_refs', label: 'Billing & References' }
  ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex-shrink-0 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            Edit Service Request — {serviceRequestName}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

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
            <div className="mx-4 mt-3 flex-shrink-0 bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="p-4 overflow-y-auto flex-1 min-h-0 space-y-4">
            {/* Tab 1: Patient & Order */}
            {activeTab === 'patient_order' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Patient <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input
                      type="text"
                      value={selectedPatient ? (selectedPatient.patient_name || selectedPatient.name) : patientQuery}
                      onChange={(e) => {
                        setPatientQuery(e.target.value)
                        setSelectedPatient(null)
                        setPatientOpen(true)
                      }}
                      onFocus={() => setPatientOpen(true)}
                      placeholder="Search patient..."
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {patientOpen && (
                      <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                        {loadingPatients ? (
                          <div className="px-3 py-2 text-xs text-slate-500">Loading...</div>
                        ) : patients.length ? (
                          patients.map((p) => (
                            <button
                              key={p.name}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                              onClick={() => {
                                setSelectedPatient(p)
                                setPatientQuery(p.patient_name || p.name)
                                setPatientOpen(false)
                              }}
                            >
                              <div className="font-medium">{p.patient_name || p.name}</div>
                              {p.file_number && <div className="text-xs text-slate-500">File: {p.file_number}</div>}
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-xs text-slate-500">No patients found</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Patient Visit</label>
                    <select
                      value={formData.patient_visit}
                      onChange={(e) => set('patient_visit', e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary bg-white"
                    >
                      <option value="">Select visit</option>
                      {patientVisits.map((v) => (
                        <option key={v.name} value={v.name}>{v.label || v.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Inpatient Admission</label>
                    <select
                      value={formData.inpatient_record}
                      onChange={(e) => set('inpatient_record', e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary bg-white"
                    >
                      <option value="">Select admission</option>
                      {admissions.map((a) => (
                        <option key={a.name} value={a.name}>{a.label || a.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Order Date <span className="text-red-500">*</span></label>
                    <input
                      type="date"
                      value={formData.order_date}
                      onChange={(e) => set('order_date', e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Order Time</label>
                    <input
                      type="time"
                      value={formData.order_time}
                      onChange={(e) => set('order_time', e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Ordered by Practitioner</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={practQuery}
                      onChange={(e) => {
                        setPractQuery(e.target.value)
                        set('practitioner', '')
                        setPractOpen(true)
                      }}
                      onFocus={() => setPractOpen(true)}
                      placeholder="Search practitioner..."
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {practOpen && (
                      <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                        {practitioners.map((p) => (
                          <button
                            key={p.name}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                            onClick={() => {
                              set('practitioner', p.name)
                              setPractQuery(p.label || p.name)
                              setPractOpen(false)
                            }}
                          >
                            {p.label || p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Medical Department</label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => set('department', e.target.value)}
                    placeholder="Medical department"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Source</label>
                  <select
                    value={formData.source}
                    onChange={(e) => set('source', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary bg-white"
                  >
                    <option value="">—</option>
                    <option value="Direct">Direct</option>
                    <option value="Referral">Referral</option>
                    <option value="External Referral">External Referral</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Referring Practitioner</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={displayReferring}
                      onChange={(e) => {
                        setReferringQuery(e.target.value)
                        set('referring_practitioner', '')
                        setReferringOpen(true)
                      }}
                      onFocus={() => setReferringOpen(true)}
                      placeholder="Search..."
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                    {referringOpen && (
                      <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                        {practitioners.filter(p => !referringQuery || (p.label || p.name).toLowerCase().includes(referringQuery.toLowerCase())).map((p) => (
                          <button key={p.name} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50" onClick={() => { set('referring_practitioner', p.name); setReferringQuery(p.label || p.name); setReferringOpen(false) }}>
                            {p.label || p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Referred to Practitioner</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={displayReferredTo}
                      onChange={(e) => {
                        setReferredToQuery(e.target.value)
                        set('referred_to_practitioner', '')
                        setReferredToOpen(true)
                      }}
                      onFocus={() => setReferredToOpen(true)}
                      placeholder="Search..."
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                    {referredToOpen && (
                      <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                        {practitioners.filter(p => !referredToQuery || (p.label || p.name).toLowerCase().includes(referredToQuery.toLowerCase())).map((p) => (
                          <button key={p.name} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50" onClick={() => { set('referred_to_practitioner', p.name); setReferredToQuery(p.label || p.name); setReferredToOpen(false) }}>
                            {p.label || p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Expected Date</label>
                    <input type="date" value={formData.expected_date} onChange={(e) => set('expected_date', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Order Group</label>
                    <input type="text" value={formData.order_group} onChange={(e) => set('order_group', e.target.value)} placeholder="Optional" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary" />
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Service & Details */}
            {activeTab === 'service_details' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Template Type <span className="text-red-500">*</span></label>
                    <select value={formData.template_dt} onChange={(e) => set('template_dt', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary bg-white">
                      <option value="">Select type</option>
                      {templateTypes.map((t) => <option key={t.name} value={t.name}>{t.label || t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Template <span className="text-red-500">*</span></label>
                    <select value={formData.template_dn} disabled={!formData.template_dt} onChange={(e) => set('template_dn', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary bg-white">
                      <option value="">Select template</option>
                      {templates.map((t) => <option key={t.name} value={t.name}>{t.label || t.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                    <input type="text" value={formData.status} onChange={(e) => set('status', e.target.value)} placeholder="e.g. draft" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                    <input type="text" value={formData.priority} onChange={(e) => set('priority', e.target.value)} placeholder="Optional" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Intent</label>
                    <input type="text" value={formData.intent} onChange={(e) => set('intent', e.target.value)} placeholder="Optional" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
                    <input type="number" min={1} value={formData.quantity} onChange={(e) => set('quantity', parseInt(e.target.value, 10) || 1)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Approved Amount</label>
                    <input type="number" step="any" value={formData.amount} onChange={(e) => set('amount', e.target.value === '' ? '' : e.target.value)} placeholder="0" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Order Description</label>
                  <textarea value={formData.order_description} onChange={(e) => set('order_description', e.target.value)} rows={2} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary" placeholder="Optional" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Patient Instructions</label>
                  <textarea value={formData.patient_instructions} onChange={(e) => set('patient_instructions', e.target.value)} rows={2} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary" placeholder="Optional" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Staff Role</label>
                    <input type="text" value={formData.staff_role} onChange={(e) => set('staff_role', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Patient Care Type</label>
                    <input type="text" value={formData.patient_care_type} onChange={(e) => set('patient_care_type', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Healthcare Service Unit Type</label>
                  <input type="text" value={formData.healthcare_service_unit_type} onChange={(e) => set('healthcare_service_unit_type', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary" />
                </div>

                <div className="flex items-center gap-2">
                  <input type="checkbox" id="as_needed" checked={formData.as_needed} onChange={(e) => set('as_needed', e.target.checked)} className="rounded border-slate-300 text-primary focus:ring-primary" />
                  <label htmlFor="as_needed" className="text-sm text-slate-700">Occurrence As Needed</label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Occurrence Date</label>
                    <input type="date" value={formData.occurrence_date} onChange={(e) => set('occurrence_date', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Occurrence Time</label>
                    <input type="time" value={formData.occurrence_time} onChange={(e) => set('occurrence_time', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Dosage Form</label>
                    <input type="text" value={formData.dosage_form} onChange={(e) => set('dosage_form', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Dosage</label>
                    <input type="text" value={formData.dosage} onChange={(e) => set('dosage', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Period</label>
                    <input type="text" value={formData.period} onChange={(e) => set('period', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary" />
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Billing & References */}
            {activeTab === 'billing_refs' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Reference Document Type</label>
                    <input type="text" value={formData.reference_document_type} readOnly className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Reference Document Name</label>
                    <input type="text" value={formData.reference_document_name} readOnly className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600" />
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Patient Accepted Cost</span>
                    <span className="font-medium">{readOnly.patient_accepted_cost ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Forwarded to Lab</span>
                    <span className="font-medium">{readOnly.booked ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Sample Collection Required</span>
                    <span className="font-medium">{readOnly.sample_collection_required ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Qty Invoiced</span>
                    <span className="font-medium">{String(readOnly.qty_invoiced ?? '—')}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Billing Status</span>
                    <span className="font-medium">{String(readOnly.billing_status ?? '—')}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Order Reference DocType</label>
                    <input type="text" value={formData.order_reference_doctype} readOnly className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Order Reference Name</label>
                    <input type="text" value={formData.order_reference_name} readOnly className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600" />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex-shrink-0 flex justify-end gap-3 p-4 border-t border-slate-200 bg-white">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50">
              {submitting ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
