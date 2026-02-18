import { useState, useEffect } from 'react'
import { createDischarge } from '../../services/inpatientRecords'
import { fetchHealthcarePractitioners, fetchUsers, fetchDischargeTemplates, fetchDischargeChecklist, fetchDepartments, type LinkFieldOption } from '../../services/common'
import { toast } from '../../hooks/useToast'
import { X, CheckCircle2, Circle, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'

interface ChecklistItem {
  name: string
  action_required: string
  department: string
  department_label?: string
  user: string
  name1: string
  date_time: string
  click: boolean
  description?: string
}

interface DischargeModalProps {
  admission: {
    name: string
    patient: string
    patient_name?: string
  }
  onClose: () => void
  onSuccess: () => void
}

// Group checklist items by department
const groupByDepartment = (items: ChecklistItem[]) => {
  return items.reduce((acc, item) => {
    const dept = item.department_label || item.department || 'General'
    if (!acc[dept]) acc[dept] = []
    acc[dept].push(item)
    return acc
  }, {} as Record<string, ChecklistItem[]>)
}

export const DischargeModal = ({ admission, onClose, onSuccess }: DischargeModalProps) => {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'details' | 'checklist'>('details')

  // Checklist state
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([])
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [expandedDepts, setExpandedDepts] = useState<Record<string, boolean>>({})
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})

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

  // Department dropdown for checklist (ERPNext Department)
  const [departmentOptions, setDepartmentOptions] = useState<LinkFieldOption[]>([])
  const [departmentQuery, setDepartmentQuery] = useState('')
  const [departmentOpenForItem, setDepartmentOpenForItem] = useState<string | null>(null)

  // Normalize any datetime string to Frappe/MySQL-friendly format: YYYY-MM-DD HH:MM:SS
  const toFrappeDateTime = (value?: string) => {
    if (!value) return ''
    let s = value.trim()
    if (s.includes('T')) {
      if (s.endsWith('Z')) {
        s = s.slice(0, -1)
      }
      s = s.replace('T', ' ')
    }
    if (s.length > 19) {
      s = s.slice(0, 19)
    }
    if (s.length === 16) {
      s += ':00'
    }
    return s
  }

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

  // Load initial data and default template checklist
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

        // Load default "Inpatient Discharge" template checklist
        await loadChecklist('Inpatient Discharge')
        const defaultTemplate = templates.find(t => t.label === 'Inpatient Discharge' || t.name === 'Inpatient Discharge')
        if (defaultTemplate) {
          setSelectedDischargeTemplate(defaultTemplate)
          setFormData(prev => ({ ...prev, discharge_template: defaultTemplate.name }))
          setDischargeTemplateQuery(defaultTemplate.label)
        }
      } catch (err) {
        console.error('Failed to load data:', err)
      }
    }
    loadData()
  }, [])

  const loadChecklist = async (templateName: string) => {
    if (!templateName) return
    setChecklistLoading(true)
    try {
      const items = await fetchDischargeChecklist(templateName)
      setChecklistItems(items)
      // Expand all departments by default
      const deptMap: Record<string, boolean> = {}
      items.forEach((item: ChecklistItem) => {
        const dept = item.department_label || item.department || 'General'
        deptMap[dept] = true
      })
      setExpandedDepts(deptMap)
    } catch (err) {
      console.error('Failed to load checklist:', err)
      setChecklistItems([])
    } finally {
      setChecklistLoading(false)
    }
  }

  // Search handlers
  useEffect(() => {
    if (!dischargedByOpen) return
    const search = async () => {
      try {
        const results = await fetchUsers(dischargedByQuery)
        setDischargedByUsers(results)
      } catch { setDischargedByUsers([]) }
    }
    const id = setTimeout(search, dischargedByQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(id)
  }, [dischargedByQuery, dischargedByOpen])

  useEffect(() => {
    if (!finalDischargeOpen) return
    const search = async () => {
      try {
        const results = await fetchUsers(finalDischargeQuery)
        setFinalDischargeUsers(results)
      } catch { setFinalDischargeUsers([]) }
    }
    const id = setTimeout(search, finalDischargeQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(id)
  }, [finalDischargeQuery, finalDischargeOpen])

  useEffect(() => {
    if (!receivingDoctorsOpen) return
    const search = async () => {
      try {
        const results = await fetchHealthcarePractitioners(receivingDoctorsQuery)
        setReceivingDoctors(results)
      } catch { setReceivingDoctors([]) }
    }
    const id = setTimeout(search, receivingDoctorsQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(id)
  }, [receivingDoctorsQuery, receivingDoctorsOpen])

  useEffect(() => {
    if (!dischargeTemplateOpen) return
    const search = async () => {
      try {
        const results = await fetchDischargeTemplates(dischargeTemplateQuery)
        setDischargeTemplates(results)
      } catch { setDischargeTemplates([]) }
    }
    const id = setTimeout(search, dischargeTemplateQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(id)
  }, [dischargeTemplateQuery, dischargeTemplateOpen])

  // Load ERPNext Departments for checklist Department dropdown
  useEffect(() => {
    if (!departmentOpenForItem) return
    const search = async () => {
      try {
        const results = await fetchDepartments(departmentQuery || undefined)
        setDepartmentOptions(results)
      } catch {
        setDepartmentOptions([])
      }
    }
    const id = setTimeout(search, departmentQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(id)
  }, [departmentQuery, departmentOpenForItem])

  // Checklist helpers
  const toggleDept = (dept: string) => setExpandedDepts(prev => ({ ...prev, [dept]: !prev[dept] }))
  const toggleItem = (itemName: string) => setExpandedItems(prev => ({ ...prev, [itemName]: !prev[itemName] }))

  const toggleCheck = (itemName: string) => {
    setChecklistItems(prev =>
      prev.map(item =>
        item.name === itemName
          ? {
              ...item,
              click: !item.click,
              // Store MySQL/Frappe-friendly datetime (YYYY-MM-DD HH:MM:SS), not ISO with Z
              date_time: !item.click ? toFrappeDateTime(new Date().toISOString()) : ''
            }
          : item
      )
    )
  }

  const updateChecklistItem = (itemName: string, field: keyof ChecklistItem, value: string) => {
    setChecklistItems(prev =>
      prev.map(item => item.name === itemName ? { ...item, [field]: value } : item)
    )
  }

  const groupedChecklist = groupByDepartment(checklistItems)
  const totalItems = checklistItems.length
  const completedItems = checklistItems.filter(i => i.click).length
  const allCompleted = totalItems > 0 && completedItems === totalItems

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (checklistItems.length > 0 && !allCompleted) {
      const incomplete = totalItems - completedItems
      setError(`Please complete all discharge checklist items. ${incomplete} item${incomplete > 1 ? 's' : ''} remaining.`)
      setActiveTab('checklist')
      return
    }

    try {
      setSubmitting(true)
      await createDischarge(admission.name, {
        ...formData,
        discharge_checklist: checklistItems.map(item => ({
          action_required: item.action_required,
          department: item.department,
          user: item.user,
          name1: item.name1,
          date_time: item.date_time ? toFrappeDateTime(item.date_time) : '',
          click: item.click ? 1 : 0,
          description: item.description || ''
        }))
      })
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

  const closeAllDropdowns = () => {
    setDischargedByOpen(false)
    setFinalDischargeOpen(false)
    setReceivingDoctorsOpen(false)
    setDischargeTemplateOpen(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Discharge Patient</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {admission.patient_name || admission.patient} &mdash; {admission.name}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'details'
                ? 'border-green-600 text-green-700 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Discharge Details
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('checklist')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
              activeTab === 'checklist'
                ? 'border-green-600 text-green-700 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Discharge Checklist
            {totalItems > 0 && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                allCompleted ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {completedItems}/{totalItems}
              </span>
            )}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto" onClick={(e) => {
          const target = e.target as HTMLElement
          if (!target.closest('.dropdown-container')) closeAllDropdowns()
        }}>
          {error && (
            <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* ── TAB: DETAILS ── */}
          {activeTab === 'details' && (
            <div className="p-6 space-y-6">
              {/* Basic Information */}
              <section>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Basic Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Admission</label>
                    <input type="text" value={admission.name} disabled
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-50 text-slate-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Patient</label>
                    <input type="text" value={admission.patient_name || admission.patient} disabled
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-50 text-slate-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Discharge Type</label>
                    <select value={formData.discharge_type}
                      onChange={(e) => setFormData({ ...formData, discharge_type: e.target.value })}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                      <option value="">Select Discharge Type</option>
                      <option value="Home">Home</option>
                      <option value="Dama">Dama</option>
                      <option value="Hospital">Hospital</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Discharge Date</label>
                    <input type="datetime-local" value={formData.discharge_date}
                      onChange={(e) => setFormData({ ...formData, discharge_date: e.target.value })}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                </div>
              </section>

              {/* Discharged By */}
              <section>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Discharged By</h3>
                <div className="grid grid-cols-2 gap-4">
                  {/* Discharged By User */}
                  <div className="relative dropdown-container">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Discharged By User</label>
                    <input type="text"
                      value={selectedDischargedBy ? selectedDischargedBy.label : dischargedByQuery}
                      onChange={(e) => { setDischargedByQuery(e.target.value); setDischargedByOpen(true) }}
                      onFocus={() => setDischargedByOpen(true)}
                      placeholder="Search user..."
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    {dischargedByOpen && dischargedByUsers.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                        {dischargedByUsers.map(user => (
                          <button key={user.name} type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                            onClick={() => { setSelectedDischargedBy(user); setFormData({ ...formData, discharged_by_user: user.name }); setDischargedByQuery(user.label); setDischargedByOpen(false) }}>
                            {user.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Final Discharge User */}
                  <div className="relative dropdown-container">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Final Discharge User</label>
                    <input type="text"
                      value={selectedFinalDischarge ? selectedFinalDischarge.label : finalDischargeQuery}
                      onChange={(e) => { setFinalDischargeQuery(e.target.value); setFinalDischargeOpen(true) }}
                      onFocus={() => setFinalDischargeOpen(true)}
                      placeholder="Search user..."
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    {finalDischargeOpen && finalDischargeUsers.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                        {finalDischargeUsers.map(user => (
                          <button key={user.name} type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                            onClick={() => { setSelectedFinalDischarge(user); setFormData({ ...formData, final_discharge_user_id: user.name }); setFinalDischargeQuery(user.label); setFinalDischargeOpen(false) }}>
                            {user.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Receiving Doctors */}
                  <div className="relative dropdown-container">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Receiving Doctors</label>
                    <input type="text"
                      value={selectedReceivingDoctor ? selectedReceivingDoctor.label : receivingDoctorsQuery}
                      onChange={(e) => { setReceivingDoctorsQuery(e.target.value); setReceivingDoctorsOpen(true) }}
                      onFocus={() => setReceivingDoctorsOpen(true)}
                      placeholder="Search healthcare practitioner..."
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    {receivingDoctorsOpen && receivingDoctors.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                        {receivingDoctors.map(doctor => (
                          <button key={doctor.name} type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                            onClick={() => { setSelectedReceivingDoctor(doctor); setFormData({ ...formData, receiving_doctors: doctor.name }); setReceivingDoctorsQuery(doctor.label); setReceivingDoctorsOpen(false) }}>
                            <div className="font-medium">{doctor.label}</div>
                            {doctor.department && <div className="text-xs text-slate-500">{doctor.department}</div>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Discharge Template */}
                  <div className="relative dropdown-container">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Discharge Template</label>
                    <input type="text"
                      value={selectedDischargeTemplate ? selectedDischargeTemplate.label : dischargeTemplateQuery}
                      onChange={(e) => { setDischargeTemplateQuery(e.target.value); setDischargeTemplateOpen(true) }}
                      onFocus={() => setDischargeTemplateOpen(true)}
                      placeholder="Search discharge template..."
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    {dischargeTemplateOpen && dischargeTemplates.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                        {dischargeTemplates.map(template => (
                          <button key={template.name} type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                            onClick={() => {
                              setSelectedDischargeTemplate(template)
                              setFormData({ ...formData, discharge_template: template.name })
                              setDischargeTemplateQuery(template.label)
                              setDischargeTemplateOpen(false)
                              loadChecklist(template.name)
                            }}>
                            {template.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Final Discharge */}
              <section>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Final Discharge</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Final Discharge Date</label>
                    <input type="date" value={formData.final_discharge_date}
                      onChange={(e) => setFormData({ ...formData, final_discharge_date: e.target.value })}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Final Discharge Time</label>
                    <input type="time" value={formData.final_discharge_time}
                      onChange={(e) => setFormData({ ...formData, final_discharge_time: e.target.value })}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                </div>
              </section>

              {/* Medical Information */}
              <section>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Medical Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { key: 'discharge_treatment_plan', label: 'Discharge Treatment Plan' },
                    { key: 'discharge_reason', label: 'Discharge Reason' },
                    { key: 'discharge_diagnosis', label: 'Discharge Diagnosis' },
                    { key: 'discharge_conditions', label: 'Discharge Conditions' },
                    { key: 'discharge_instructions', label: 'Discharge Instructions' },
                    { key: 'discharge_medic_stopped_reason', label: 'Discharge Medic Stopped Reason' },
                    { key: 'final_exam_mental_status_summary', label: 'Final Exam Mental Status Summary' },
                    { key: 'management_in_hospital', label: 'Management In Hospital' },
                    { key: 'prognosis', label: 'Prognosis' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
                      <textarea rows={3}
                        value={formData[key as keyof typeof formData]}
                        onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                  ))}
                </div>
              </section>

              {/* Next Appointment */}
              <section>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Next Appointment</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Next Appointment Date</label>
                    <input type="date" value={formData.next_appointment_date}
                      onChange={(e) => setFormData({ ...formData, next_appointment_date: e.target.value })}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Next Appointment Time</label>
                    <input type="datetime-local" value={formData.next_appointment_time}
                      onChange={(e) => setFormData({ ...formData, next_appointment_time: e.target.value })}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* ── TAB: CHECKLIST ── */}
          {activeTab === 'checklist' && (
            <div className="p-6">
              {/* Progress bar */}
              {totalItems > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-700">
                      Checklist Progress
                    </span>
                    <span className={`text-sm font-semibold ${allCompleted ? 'text-green-600' : 'text-amber-600'}`}>
                      {completedItems} of {totalItems} completed
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${allCompleted ? 'bg-green-500' : 'bg-amber-500'}`}
                      style={{ width: `${totalItems ? (completedItems / totalItems) * 100 : 0}%` }}
                    />
                  </div>
                  {allCompleted && (
                    <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      All items completed — patient is ready for discharge
                    </p>
                  )}
                </div>
              )}

              {checklistLoading ? (
                <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
                  Loading checklist...
                </div>
              ) : checklistItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Circle className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm">No checklist items found for the selected template.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(groupedChecklist).map(([dept, items]) => {
                    const deptCompleted = items.filter(i => i.click).length
                    const deptTotal = items.length
                    const isDeptDone = deptCompleted === deptTotal
                    const isOpen = expandedDepts[dept] !== false

                    return (
                      <div key={dept} className="border border-slate-200 rounded-lg overflow-hidden">
                        {/* Department header */}
                        <button
                          type="button"
                          onClick={() => toggleDept(dept)}
                          className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                            isDeptDone ? 'bg-green-50' : 'bg-slate-50'
                          } hover:bg-slate-100`}
                        >
                          <div className="flex items-center gap-3">
                            {isDeptDone
                              ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                              : <Circle className="w-5 h-5 text-slate-400 shrink-0" />
                            }
                            <div>
                              <span className="text-sm font-semibold text-slate-800">{dept}</span>
                              <span className="ml-2 text-xs text-slate-500">
                                ({deptCompleted}/{deptTotal})
                              </span>
                            </div>
                          </div>
                          {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </button>

                        {/* Department items */}
                        {isOpen && (
                          <div className="divide-y divide-slate-100">
                            {items.map((item) => {
                              const isItemExpanded = expandedItems[item.name]
                              return (
                                <div key={item.name}
                                  className={`transition-colors ${item.click ? 'bg-green-50/40' : 'bg-white'}`}>
                                  <div className="px-4 py-3">
                                    <div className="flex items-start gap-3">
                                      {/* Checkbox */}
                                      <button
                                        type="button"
                                        onClick={() => toggleCheck(item.name)}
                                        className="mt-0.5 shrink-0 focus:outline-none"
                                        aria-label={item.click ? 'Mark incomplete' : 'Mark complete'}
                                      >
                                        {item.click
                                          ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                                          : <Circle className="w-5 h-5 text-slate-300 hover:text-slate-400" />
                                        }
                                      </button>

                                      <div className="flex-1 min-w-0">
                                        {/* Action Required */}
                                        <p className={`text-sm font-medium ${item.click ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                          {item.action_required}
                                        </p>

                                        {/* Meta row */}
                                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                                          {item.name1 && (
                                            <span className="text-xs text-slate-500">
                                              <span className="font-medium">Contact:</span> {item.name1}
                                            </span>
                                          )}
                                          {item.click && item.date_time && (
                                            <span className="text-xs text-green-600">
                                              ✓ Completed {new Date(item.date_time).toLocaleString()}
                                            </span>
                                          )}
                                        </div>

                                        {/* Inline fields (shown when checked) */}
                                        {item.click && (
                                          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3">
                                            <div>
                                              <label className="block text-xs font-medium text-slate-600 mb-1">User</label>
                                              <input
                                                type="text"
                                                value={item.user || ''}
                                                onChange={(e) => updateChecklistItem(item.name, 'user', e.target.value)}
                                                placeholder="User who completed"
                                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-xs font-medium text-slate-600 mb-1">Date &amp; Time</label>
                                              <input
                                                type="datetime-local"
                                                value={item.date_time ? item.date_time.slice(0, 16) : ''}
                                                onChange={(e) => {
                                                  const dbValue = toFrappeDateTime(e.target.value)
                                                  updateChecklistItem(item.name, 'date_time', dbValue)
                                                }}
                                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400"
                                              />
                                            </div>
                                            <div className="relative">
                                              <label className="block text-xs font-medium text-slate-600 mb-1">Department</label>
                                              <input
                                                type="text"
                                                value={
                                                  item.department
                                                    ? departmentOptions.find(d => d.name === item.department)?.label || item.department
                                                    : (departmentOpenForItem === item.name ? departmentQuery : '')
                                                }
                                                onChange={(e) => {
                                                  setDepartmentQuery(e.target.value)
                                                  setDepartmentOpenForItem(item.name)
                                                }}
                                                onFocus={() => {
                                                  setDepartmentOpenForItem(item.name)
                                                  setDepartmentQuery(item.department || '')
                                                }}
                                                placeholder="Select Department..."
                                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400"
                                              />
                                              {departmentOpenForItem === item.name && departmentOptions.length > 0 && (
                                                <div className="absolute z-20 mt-1 w-full rounded border border-slate-200 bg-white shadow-lg max-h-40 overflow-auto">
                                                  {departmentOptions.map((dept) => (
                                                    <button
                                                      key={dept.name}
                                                      type="button"
                                                      className="w-full text-left px-2 py-1.5 text-xs hover:bg-green-50"
                                                      onClick={() => {
                                                        updateChecklistItem(item.name, 'department', dept.name)
                                                        setDepartmentQuery(dept.label)
                                                        setDepartmentOpenForItem(null)
                                                      }}
                                                    >
                                                      {dept.label}
                                                    </button>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>

                                      {/* Expand description toggle */}
                                      {item.description && (
                                        <button
                                          type="button"
                                          onClick={() => toggleItem(item.name)}
                                          className="shrink-0 text-xs text-slate-400 hover:text-slate-600 mt-0.5"
                                          title="View description"
                                        >
                                          {isItemExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                        </button>
                                      )}
                                    </div>

                                    {/* Description */}
                                    {isItemExpanded && item.description && (
                                      <div
                                        className="mt-3 ml-8 p-3 bg-slate-50 rounded text-xs text-slate-600 border border-slate-100 prose-sm max-w-none"
                                        dangerouslySetInnerHTML={{ __html: item.description }}
                                      />
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="text-xs text-slate-500">
              {totalItems > 0 && !allCompleted && (
                <span className="flex items-center gap-1 text-amber-600">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {totalItems - completedItems} checklist item{totalItems - completedItems !== 1 ? 's' : ''} remaining
                </span>
              )}
              {allCompleted && totalItems > 0 && (
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Checklist complete
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {submitting ? 'Discharging...' : 'Discharge Patient'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}