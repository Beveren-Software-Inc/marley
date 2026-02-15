import { useState, useEffect } from 'react'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import {
  fetchHealthcarePractitioners,
  fetchServiceRequestTemplateTypes,
  fetchServiceRequestTemplates,
  type LinkFieldOption
} from '../../services/common'
import { createServiceRequest, type CreateServiceRequestData } from '../../services/serviceRequests'
import { toast } from '../../hooks/useToast'
import { X } from 'lucide-react'

interface CreateServiceRequestModalProps {
  onClose: () => void
  onSuccess: () => void
  initialPatient?: string
}

export const CreateServiceRequestModal = ({ onClose, onSuccess, initialPatient }: CreateServiceRequestModalProps) => {
  const [patientQuery, setPatientQuery] = useState(initialPatient || '')
  const [selectedPatient, setSelectedPatient] = useState<PatientListItem | null>(null)
  const [patients, setPatients] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [templateTypes, setTemplateTypes] = useState<LinkFieldOption[]>([])
  const [templates, setTemplates] = useState<LinkFieldOption[]>([])
  const [practitioners, setPractitioners] = useState<LinkFieldOption[]>([])
  const [practOpen, setPractOpen] = useState(false)
  const [practQuery, setPractQuery] = useState('')

  const [formData, setFormData] = useState({
    template_dt: '',
    template_dn: '',
    practitioner: '',
    order_date: new Date().toISOString().split('T')[0],
    order_time: new Date().toTimeString().slice(0, 5),
    department: ''
  })

  useEffect(() => {
    fetchServiceRequestTemplateTypes().then(setTemplateTypes).catch(() => setTemplateTypes([]))
    fetchHealthcarePractitioners().then(setPractitioners).catch(() => setPractitioners([]))
  }, [])

  useEffect(() => {
    if (!formData.template_dt) {
      setTemplates([])
      setFormData((prev) => ({ ...prev, template_dn: '' }))
      return
    }
    fetchServiceRequestTemplates(formData.template_dt).then(setTemplates).catch(() => setTemplates([]))
    setFormData((prev) => ({ ...prev, template_dn: '' }))
  }, [formData.template_dt])

  useEffect(() => {
    if (!initialPatient) return
    fetchPatients(1, 0, initialPatient).then((list) => {
      if (list.length > 0) {
        const p = list[0]
        setSelectedPatient(p)
        setPatientQuery((p as { patient_name?: string }).patient_name || p.name)
      } else {
        setPatientQuery(initialPatient)
      }
    }).catch(() => setPatientQuery(initialPatient))
  }, [initialPatient])

  useEffect(() => {
    if (!patientOpen) return
    const search = async () => {
      setLoading(true)
      try {
        const results = patientQuery.trim() === ''
          ? await fetchPatients(20, 0)
          : await searchPatients(patientQuery, 20)
        setPatients(results)
      } catch {
        setPatients([])
      } finally {
        setLoading(false)
      }
    }
    const t = setTimeout(search, patientQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [patientQuery, patientOpen])

  useEffect(() => {
    if (practOpen || practQuery) {
      const search = async () => {
        try {
          const results = await fetchHealthcarePractitioners(practQuery || undefined)
          setPractitioners(results)
        } catch {
          setPractitioners([])
        }
      }
      const t = setTimeout(search, 300)
      return () => clearTimeout(t)
    }
  }, [practQuery, practOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!selectedPatient) {
      setError('Please select a patient')
      return
    }
    if (!formData.template_dt || !formData.template_dn) {
      setError('Please select template type and template')
      return
    }
    try {
      setSubmitting(true)
      const payload: CreateServiceRequestData = {
        patient: selectedPatient.name,
        template_dt: formData.template_dt,
        template_dn: formData.template_dn,
        practitioner: formData.practitioner || undefined,
        order_date: formData.order_date,
        order_time: formData.order_time,
        department: formData.department || undefined
      }
      await createServiceRequest(payload)
      toast.success('Service request created')
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create service request')
      toast.error(err instanceof Error ? err.message : 'Failed to create service request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Create Service Request</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Patient <span className="text-red-500">*</span></label>
            <div className="relative">
              <input
                type="text"
                value={selectedPatient ? (selectedPatient.patient_name || selectedPatient.name) : patientQuery}
                onChange={(e) => {
                  setPatientQuery(e.target.value)
                  setPatientOpen(true)
                  setSelectedPatient(null)
                }}
                onFocus={() => setPatientOpen(true)}
                placeholder="Search patient..."
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {patientOpen && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                  {loading ? (
                    <div className="px-3 py-2 text-xs text-slate-500">Loading...</div>
                  ) : patients.length > 0 ? (
                    patients.map((patient) => (
                      <button
                        key={patient.name}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                        onClick={() => {
                          setSelectedPatient(patient)
                          setPatientQuery(patient.patient_name || patient.name)
                          setPatientOpen(false)
                        }}
                      >
                        {patient.patient_name || patient.name}
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Template Type <span className="text-red-500">*</span></label>
              <select
                value={formData.template_dt}
                onChange={(e) => setFormData({ ...formData, template_dt: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                required
              >
                <option value="">Select type</option>
                {templateTypes.map((t) => (
                  <option key={t.name} value={t.name}>{t.label || t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Template <span className="text-red-500">*</span></label>
              <select
                value={formData.template_dn}
                onChange={(e) => setFormData({ ...formData, template_dn: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                required
                disabled={!formData.template_dt}
              >
                <option value="">Select template</option>
                {templates.map((t) => (
                  <option key={t.name} value={t.name}>{t.label || t.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Practitioner</label>
            <div className="relative">
              <input
                type="text"
                value={formData.practitioner ? (practitioners.find(p => p.name === formData.practitioner)?.label || formData.practitioner) : practQuery}
                onChange={(e) => {
                  setPractQuery(e.target.value)
                  setPractOpen(true)
                  setFormData((prev) => ({ ...prev, practitioner: '' }))
                }}
                onFocus={() => setPractOpen(true)}
                placeholder="Search practitioner..."
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {practOpen && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                  {practitioners.length > 0 ? (
                    practitioners.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                        onClick={() => {
                          setFormData((prev) => ({ ...prev, practitioner: p.name }))
                          setPractQuery(p.label || p.name)
                          setPractOpen(false)
                        }}
                      >
                        {p.label || p.name}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-xs text-slate-500">No practitioners found</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Order Date</label>
              <input
                type="date"
                value={formData.order_date}
                onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Order Time</label>
              <input
                type="time"
                value={formData.order_time}
                onChange={(e) => setFormData({ ...formData, order_time: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50">
              {submitting ? 'Creating…' : 'Create Service Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
