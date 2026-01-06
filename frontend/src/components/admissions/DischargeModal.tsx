import { useState, useEffect } from 'react'
import { createDischarge } from '../../services/inpatientRecords'
import { fetchHealthcarePractitioners, fetchUsers, fetchDischargeTemplates, type LinkFieldOption } from '../../services/common'
import { toast } from '../../hooks/useToast'
import { X } from 'lucide-react'

interface DischargeModalProps {
  admission: {
    name: string
    patient: string
    patient_name?: string
  }
  onClose: () => void
  onSuccess: () => void
}

export const DischargeModal = ({ admission, onClose, onSuccess }: DischargeModalProps) => {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Link field dropdowns
  const [dischargedByUsers, setDischargedByUsers] = useState<LinkFieldOption[]>([])
  const [finalDischargeUsers, setFinalDischargeUsers] = useState<LinkFieldOption[]>([])
  const [receivingDoctors, setReceivingDoctors] = useState<LinkFieldOption[]>([])
  const [dischargeTemplates, setDischargeTemplates] = useState<LinkFieldOption[]>([])
  
  const [dischargedByOpen, setDischargedByOpen] = useState(false)
  const [finalDischargeOpen, setFinalDischargeOpen] = useState(false)
  const [receivingDoctorsOpen, setReceivingDoctorsOpen] = useState(false)
  const [dischargeTemplateOpen, setDischargeTemplateOpen] = useState(false)
  
  const [dischargedByQuery, setDischargedByQuery] = useState('')
  const [finalDischargeQuery, setFinalDischargeQuery] = useState('')
  const [receivingDoctorsQuery, setReceivingDoctorsQuery] = useState('')
  const [dischargeTemplateQuery, setDischargeTemplateQuery] = useState('')
  
  const [selectedDischargedBy, setSelectedDischargedBy] = useState<LinkFieldOption | null>(null)
  const [selectedFinalDischarge, setSelectedFinalDischarge] = useState<LinkFieldOption | null>(null)
  const [selectedReceivingDoctor, setSelectedReceivingDoctor] = useState<LinkFieldOption | null>(null)
  const [selectedDischargeTemplate, setSelectedDischargeTemplate] = useState<LinkFieldOption | null>(null)

  const [formData, setFormData] = useState({
    discharge_type: '',
    discharge_date: new Date().toISOString().slice(0, 16),
    discharge_time: new Date().toISOString().slice(0, 10),
    final_discharge_date: new Date().toISOString().slice(0, 10),
    final_discharge_time: new Date().toTimeString().slice(0, 5),
    discharged_by_user: '',
    final_discharge_user_id: '',
    receiving_doctors: '',
    discharge_template: '',
    discharge_treatment_plan: '',
    discharge_reason: '',
    discharge_diagnosis: '',
    discharge_conditions: '',
    discharge_instructions: '',
    discharge_medic_stopped_reason: '',
    final_exam_mental_status_summary: '',
    management_in_hospital: '',
    prognosis: '',
    next_appointment_date: '',
    next_appointment_time: ''
  })

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [users, doctors, templates] = await Promise.all([
          fetchUsers(),
          fetchHealthcarePractitioners(),
          fetchDischargeTemplates()
        ])
        setDischargedByUsers(users)
        setFinalDischargeUsers(users)
        setReceivingDoctors(doctors)
        setDischargeTemplates(templates)
      } catch (err) {
        console.error('Failed to load data:', err)
      }
    }
    loadData()
  }, [])

  // Search handlers
  useEffect(() => {
    if (!dischargedByOpen) return
    const search = async () => {
      try {
        const results = await fetchUsers(dischargedByQuery)
        setDischargedByUsers(results)
      } catch (err) {
        setDischargedByUsers([])
      }
    }
    const timeoutId = setTimeout(() => search(), dischargedByQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(timeoutId)
  }, [dischargedByQuery, dischargedByOpen])

  useEffect(() => {
    if (!finalDischargeOpen) return
    const search = async () => {
      try {
        const results = await fetchUsers(finalDischargeQuery)
        setFinalDischargeUsers(results)
      } catch (err) {
        setFinalDischargeUsers([])
      }
    }
    const timeoutId = setTimeout(() => search(), finalDischargeQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(timeoutId)
  }, [finalDischargeQuery, finalDischargeOpen])

  useEffect(() => {
    if (!receivingDoctorsOpen) return
    const search = async () => {
      try {
        const results = await fetchHealthcarePractitioners(receivingDoctorsQuery)
        setReceivingDoctors(results)
      } catch (err) {
        setReceivingDoctors([])
      }
    }
    const timeoutId = setTimeout(() => search(), receivingDoctorsQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(timeoutId)
  }, [receivingDoctorsQuery, receivingDoctorsOpen])

  useEffect(() => {
    if (!dischargeTemplateOpen) return
    const search = async () => {
      try {
        const results = await fetchDischargeTemplates(dischargeTemplateQuery)
        setDischargeTemplates(results)
      } catch (err) {
        setDischargeTemplates([])
      }
    }
    const timeoutId = setTimeout(() => search(), dischargeTemplateQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(timeoutId)
  }, [dischargeTemplateQuery, dischargeTemplateOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    try {
      setSubmitting(true)
      
      await createDischarge(admission.name, formData)
      toast.success('Patient discharged successfully!', 3000)
      onSuccess()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to discharge patient'
      toast.error(errorMessage, 5000)
      setError(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-xl font-semibold text-slate-900">Discharge Patient</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6" onClick={(e) => {
          const target = e.target as HTMLElement
          if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && target.tagName !== 'SELECT' && !target.closest('.absolute')) {
            setDischargedByOpen(false)
            setFinalDischargeOpen(false)
            setReceivingDoctorsOpen(false)
            setDischargeTemplateOpen(false)
          }
        }}>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-6">
            {/* Basic Information */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Basic Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Admission
                  </label>
                  <input
                    type="text"
                    value={admission.name}
                    disabled
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-50 text-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Patient
                  </label>
                  <input
                    type="text"
                    value={admission.patient_name || admission.patient}
                    disabled
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-50 text-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Discharge Type
                  </label>
                  <select
                    value={formData.discharge_type}
                    onChange={(e) => setFormData({ ...formData, discharge_type: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select Discharge Type</option>
                    <option value="Home">Home</option>
                    <option value="Dama">Dama</option>
                    <option value="Hospital">Hospital</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Discharge Date
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.discharge_date}
                    onChange={(e) => setFormData({ ...formData, discharge_date: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            {/* Discharged By Section */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Discharged By</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="relative">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Discharged By User
                  </label>
                  <input
                    type="text"
                    value={selectedDischargedBy ? selectedDischargedBy.label : dischargedByQuery}
                    onChange={(e) => {
                      setDischargedByQuery(e.target.value)
                      setDischargedByOpen(true)
                    }}
                    onFocus={() => setDischargedByOpen(true)}
                    placeholder="Search user..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  {dischargedByOpen && dischargedByUsers.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                      {dischargedByUsers.map((user) => (
                        <button
                          key={user.name}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                          onClick={() => {
                            setSelectedDischargedBy(user)
                            setFormData({ ...formData, discharged_by_user: user.name })
                            setDischargedByQuery(user.label)
                            setDischargedByOpen(false)
                          }}
                        >
                          {user.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Final Discharge User ID
                  </label>
                  <input
                    type="text"
                    value={selectedFinalDischarge ? selectedFinalDischarge.label : finalDischargeQuery}
                    onChange={(e) => {
                      setFinalDischargeQuery(e.target.value)
                      setFinalDischargeOpen(true)
                    }}
                    onFocus={() => setFinalDischargeOpen(true)}
                    placeholder="Search user..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  {finalDischargeOpen && finalDischargeUsers.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                      {finalDischargeUsers.map((user) => (
                        <button
                          key={user.name}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                          onClick={() => {
                            setSelectedFinalDischarge(user)
                            setFormData({ ...formData, final_discharge_user_id: user.name })
                            setFinalDischargeQuery(user.label)
                            setFinalDischargeOpen(false)
                          }}
                        >
                          {user.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Receiving Doctors
                  </label>
                  <input
                    type="text"
                    value={selectedReceivingDoctor ? selectedReceivingDoctor.label : receivingDoctorsQuery}
                    onChange={(e) => {
                      setReceivingDoctorsQuery(e.target.value)
                      setReceivingDoctorsOpen(true)
                    }}
                    onFocus={() => setReceivingDoctorsOpen(true)}
                    placeholder="Search healthcare practitioner..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  {receivingDoctorsOpen && receivingDoctors.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                      {receivingDoctors.map((doctor) => (
                        <button
                          key={doctor.name}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                          onClick={() => {
                            setSelectedReceivingDoctor(doctor)
                            setFormData({ ...formData, receiving_doctors: doctor.name })
                            setReceivingDoctorsQuery(doctor.label)
                            setReceivingDoctorsOpen(false)
                          }}
                        >
                          <div className="font-medium">{doctor.label}</div>
                          {doctor.department && (
                            <div className="text-xs text-slate-500">{doctor.department}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Discharge Template
                  </label>
                  <input
                    type="text"
                    value={selectedDischargeTemplate ? selectedDischargeTemplate.label : dischargeTemplateQuery}
                    onChange={(e) => {
                      setDischargeTemplateQuery(e.target.value)
                      setDischargeTemplateOpen(true)
                    }}
                    onFocus={() => setDischargeTemplateOpen(true)}
                    placeholder="Search discharge template..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  {dischargeTemplateOpen && dischargeTemplates.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                      {dischargeTemplates.map((template) => (
                        <button
                          key={template.name}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                          onClick={() => {
                            setSelectedDischargeTemplate(template)
                            setFormData({ ...formData, discharge_template: template.name })
                            setDischargeTemplateQuery(template.label)
                            setDischargeTemplateOpen(false)
                          }}
                        >
                          {template.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Final Discharge Date/Time */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Final Discharge</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Final Discharge Date
                  </label>
                  <input
                    type="date"
                    value={formData.final_discharge_date}
                    onChange={(e) => setFormData({ ...formData, final_discharge_date: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Final Discharge Time
                  </label>
                  <input
                    type="time"
                    value={formData.final_discharge_time}
                    onChange={(e) => setFormData({ ...formData, final_discharge_time: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            {/* Medical Information */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Medical Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Discharge Treatment Plan
                  </label>
                  <textarea
                    value={formData.discharge_treatment_plan}
                    onChange={(e) => setFormData({ ...formData, discharge_treatment_plan: e.target.value })}
                    rows={3}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Discharge Reason
                  </label>
                  <textarea
                    value={formData.discharge_reason}
                    onChange={(e) => setFormData({ ...formData, discharge_reason: e.target.value })}
                    rows={3}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Discharge Diagnosis
                  </label>
                  <textarea
                    value={formData.discharge_diagnosis}
                    onChange={(e) => setFormData({ ...formData, discharge_diagnosis: e.target.value })}
                    rows={3}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Discharge Conditions
                  </label>
                  <textarea
                    value={formData.discharge_conditions}
                    onChange={(e) => setFormData({ ...formData, discharge_conditions: e.target.value })}
                    rows={3}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Discharge Instructions
                  </label>
                  <textarea
                    value={formData.discharge_instructions}
                    onChange={(e) => setFormData({ ...formData, discharge_instructions: e.target.value })}
                    rows={3}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Discharge Medic Stopped Reason
                  </label>
                  <textarea
                    value={formData.discharge_medic_stopped_reason}
                    onChange={(e) => setFormData({ ...formData, discharge_medic_stopped_reason: e.target.value })}
                    rows={3}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Final Exam Mental Status Summary
                  </label>
                  <textarea
                    value={formData.final_exam_mental_status_summary}
                    onChange={(e) => setFormData({ ...formData, final_exam_mental_status_summary: e.target.value })}
                    rows={3}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Management In Hospital
                  </label>
                  <textarea
                    value={formData.management_in_hospital}
                    onChange={(e) => setFormData({ ...formData, management_in_hospital: e.target.value })}
                    rows={3}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Prognosis
                  </label>
                  <textarea
                    value={formData.prognosis}
                    onChange={(e) => setFormData({ ...formData, prognosis: e.target.value })}
                    rows={3}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            {/* Appointment Section */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Next Appointment</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Next Appointment Date
                  </label>
                  <input
                    type="date"
                    value={formData.next_appointment_date}
                    onChange={(e) => setFormData({ ...formData, next_appointment_date: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Next Appointment Time
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.next_appointment_time}
                    onChange={(e) => setFormData({ ...formData, next_appointment_time: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Discharging...' : 'Discharge Patient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}





