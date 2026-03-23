import { useState, useEffect, useRef } from 'react'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import {
  fetchCompanies,
  fetchHealthcarePractitioners,
  fetchPatientVisits,
  fetchInpatientAdmissions,
  fetchItems,
  fetchDosageForms,
  fetchPrescriptionFrequencies,
  fetchRouteOfAdministrationList,
  type LinkFieldOption,
} from '../../services/common'
import {
  createPrescription,
  type CreatePrescriptionData,
  type MedicationOrderRow,
  LONG_ACTING_FREQUENCY_OPTIONS,
} from '../../services/prescriptions'
import { bulkCreateNurseTasks, type CreateNurseTaskData } from '../../services/nurseTask'
import { toast } from '../../hooks/useToast'
import { X, Plus, Trash2, Pill, ChevronDown, ChevronUp } from 'lucide-react'
import { useCareContext } from '../../providers/CareContextProvider'

interface CreatePrescriptionModalProps {
  onClose: () => void
  onSuccess: () => void
  initialPatient?: string
}

type TabId = 'details' | 'medications'

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + Math.round(days))
  return d.toISOString().split('T')[0]
}

function daysBetween(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 0
  const start = new Date(startStr)
  const end = new Date(endStr)
  const diff = end.getTime() - start.getTime()
  return Math.round(diff / (24 * 60 * 60 * 1000))
}

const emptyMedicationRow = (startDate: string): MedicationOrderRow => ({
  drug: '',
  dosage: '',
  no_of_days: 1,
  dosage_form: '',
  instructions: '',
  date: startDate,
  end_date: addDays(startDate, 1),
  patient_frequency: '',
  is_pink: false,
  is_prn: false,
  is_long_acting: false,
  long_acting_frequency: 'Weekly',
  reference_no: '',
  route_of_administration: '',
})

// COMBOBOX WITH FIXED POSITIONING - DROPDOWNS ESCAPE MODAL
interface ComboboxProps {
  value: string
  displayValue: string
  placeholder: string
  options: LinkFieldOption[]
  loading?: boolean
  onQueryChange: (q: string) => void
  onSelect: (opt: LinkFieldOption) => void
  onOpen: () => void
  onClear?: () => void
  label?: string
  required?: boolean
  renderOption?: (opt: LinkFieldOption) => React.ReactNode
}

const Combobox = ({
  displayValue,
  placeholder,
  options,
  loading,
  onQueryChange,
  onSelect,
  onOpen,
  required,
  renderOption,
  onClear,
}: ComboboxProps) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <input
          type="text"
          value={displayValue}
          onChange={(e) => {
            onQueryChange(e.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            setOpen(true)
            onOpen()
          }}
          placeholder={placeholder}
          required={required}
          className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {displayValue && onClear && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onClear()
                setOpen(false)
              }}
              className="text-slate-400 hover:text-slate-600 transition-colors p-0.5"
              title="Clear"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <ChevronDown className="w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>
      
      {/* DROPDOWN - INLINE (z-50 to escape modal) */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-xl max-h-52 overflow-auto text-slate-900">
          {loading ? (
            <div className="px-3 py-2 text-xs text-slate-500">Loading...</div>
          ) : options.length ? (
            options.map((opt) => (
              <button
                key={opt.name}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                onClick={() => {
                  onSelect(opt)
                  setOpen(false)
                }}
              >
                {renderOption ? renderOption(opt) : (opt.label || opt.name)}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-slate-500">No results found</div>
          )}
        </div>
      )}
    </div>
  )
}

export const CreatePrescriptionModal = ({
  onClose,
  onSuccess,
  initialPatient,
}: CreatePrescriptionModalProps) => {
  const { mode, activeVisit, activeAdmission } = useCareContext()
  const [activeTab, setActiveTab] = useState<TabId>('details')
  const [expandedMedications, setExpandedMedications] = useState<Set<number>>(new Set([0]))

  const [patientQuery, setPatientQuery] = useState('')
  const [selectedPatient, setSelectedPatient] = useState<PatientListItem | null>(null)
  const [patients, setPatients] = useState<PatientListItem[]>([])
  const [loadingPatients, setLoadingPatients] = useState(false)

  const [companies, setCompanies] = useState<LinkFieldOption[]>([])
  const [visits, setVisits] = useState<LinkFieldOption[]>([])
  const [admissions, setAdmissions] = useState<LinkFieldOption[]>([])
  const [practitioners, setPractitioners] = useState<LinkFieldOption[]>([])
  const [practQuery, setPractQuery] = useState('')

  const [formData, setFormData] = useState({
    care_context: 'Patient Visit' as 'Patient Visit' | 'Inpatient Admission',
    patient_encounter: '',
    inpatient_record: '',
    company: '',
    start_date: new Date().toISOString().split('T')[0],
    practitioner: '',
  })

  const [medications, setMedications] = useState<MedicationOrderRow[]>(() => [
    emptyMedicationRow(new Date().toISOString().split('T')[0]),
  ])

  const [drugQueries, setDrugQueries] = useState<Record<number, string>>({})
  const [drugOptions, setDrugOptions] = useState<Record<number, LinkFieldOption[]>>({})
  const [drugLoading, setDrugLoading] = useState<Record<number, boolean>>({})

  const [dosageForms, setDosageForms] = useState<LinkFieldOption[]>([])
  const [frequencies, setFrequencies] = useState<LinkFieldOption[]>([])
  const [routeOfAdminOptions, setRouteOfAdminOptions] = useState<LinkFieldOption[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Nurse Task creation per medication
  const [createNurseTasks, setCreateNurseTasks] = useState(false)
  const [nurseTaskRows, setNurseTaskRows] = useState<Record<number, boolean>>({})

  useEffect(() => {
    setFormData((prev) => {
      const next = { ...prev }
      if (mode === 'IP') {
        next.care_context = 'Inpatient Admission'
      } else if (mode === 'OP') {
        next.care_context = 'Patient Visit'
      }
      return next
    })
  }, [mode])

  useEffect(() => {
    fetchCompanies().then(setCompanies).catch(() => setCompanies([]))
    fetchHealthcarePractitioners().then(setPractitioners).catch(() => setPractitioners([]))
    fetchDosageForms().then(setDosageForms).catch(() => setDosageForms([]))
    fetchPrescriptionFrequencies().then(setFrequencies).catch(() => setFrequencies([]))
    fetchRouteOfAdministrationList().then(setRouteOfAdminOptions).catch(() => setRouteOfAdminOptions([]))
  }, [])

  useEffect(() => {
    if (initialPatient && !selectedPatient) {
      setPatientQuery(initialPatient)
      fetchPatients(20, 0, initialPatient)
        .then((list) => {
          const match = list.find((p) => p.name === initialPatient)
          setSelectedPatient(match || { name: initialPatient, patient_name: initialPatient })
        })
        .catch(() => setSelectedPatient({ name: initialPatient, patient_name: initialPatient }))
    }
  }, [initialPatient])

  useEffect(() => {
    if (!selectedPatient) {
      setVisits([])
      setAdmissions([])
      setFormData((p) => ({ ...p, patient_encounter: '', inpatient_record: '' }))
      return
    }
    fetchPatientVisits(selectedPatient.name).then(setVisits).catch(() => setVisits([]))
    fetchInpatientAdmissions(selectedPatient.name).then(setAdmissions).catch(() => setAdmissions([]))
  }, [selectedPatient?.name])

  useEffect(() => {
    setFormData((prev) => {
      const next = { ...prev }
      if (mode === 'OP' && activeVisit) {
        next.care_context = 'Patient Visit'
        next.patient_encounter = activeVisit
      }
      if (mode === 'IP' && activeAdmission) {
        next.care_context = 'Inpatient Admission'
        next.inpatient_record = activeAdmission
      }
      return next
    })
  }, [mode, activeVisit, activeAdmission])

  useEffect(() => {
    if (companies.length === 1 && !formData.company) {
      setFormData((p) => ({ ...p, company: companies[0].name }))
    }
  }, [companies])

  const loadDrugOptions = (index: number, query: string) => {
    if (!query || query.length < 1) {
      setDrugOptions((prev) => ({ ...prev, [index]: [] }))
      return
    }
    setDrugLoading((prev) => ({ ...prev, [index]: true }))
    fetchItems(query)
      .then((opts) => setDrugOptions((prev) => ({ ...prev, [index]: opts })))
      .catch(() => setDrugOptions((prev) => ({ ...prev, [index]: [] })))
      .finally(() => setDrugLoading((prev) => ({ ...prev, [index]: false })))
  }

  const addMedicationRow = () => {
    const newIndex = medications.length
    setMedications((prev) => [...prev, emptyMedicationRow(formData.start_date)])
    if (medications.length >= 2) {
      setExpandedMedications(new Set([newIndex]))
    }
  }

  const removeMedicationRow = (index: number) => {
    setMedications((prev) => prev.filter((_, i) => i !== index))
    setDrugQueries((prev) => { const n = { ...prev }; delete n[index]; return n })
    setDrugOptions((prev) => { const n = { ...prev }; delete n[index]; return n })
    setExpandedMedications((prev) => {
      const next = new Set(prev)
      next.delete(index)
      return next
    })
  }

  const toggleMedicationExpanded = (index: number) => {
    setExpandedMedications((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  const updateMedicationRow = (index: number, field: keyof MedicationOrderRow, value: string | number | boolean) => {
    setMedications((prev) => {
      const next = [...prev]
      if (!next[index]) return next
      const row = { ...next[index], [field]: value }
      if (field === 'date' || field === 'end_date' || field === 'no_of_days') {
        const start = row.date || ''
        const end = (field === 'end_date' ? value : row.end_date) as string
        const days = (field === 'no_of_days' ? value : row.no_of_days) as number
        if (field === 'date' || field === 'end_date') {
          if (start && end) {
            row.no_of_days = daysBetween(start, end) || 1
          } else if (start && typeof days === 'number' && days > 0) {
            row.end_date = addDays(start, days)
          }
        } else if (field === 'no_of_days' && start && typeof days === 'number' && days > 0) {
          row.end_date = addDays(start, days)
        }
      }
      next[index] = row
      return next
    })
  }

  const validMedications = medications.filter((m) => m.drug && m.dosage && m.dosage_form && m.date)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!selectedPatient) { setError('Please select a patient'); setActiveTab('details'); return }
    if (!formData.company) { setError('Please select a company'); setActiveTab('details'); return }
    if (!formData.start_date) { setError('Please set start date'); setActiveTab('details'); return }
    if (validMedications.length === 0) {
      setError('Please add at least one medication with Drug, Dosage, Dosage Form, and Date')
      setActiveTab('medications'); return
    }

    try {
      setSubmitting(true)
      const payload: CreatePrescriptionData = {
        patient: selectedPatient.name,
        care_context: formData.care_context,
        company: formData.company,
        start_date: formData.start_date,
        practitioner: formData.practitioner || undefined,
        medication_orders: validMedications,
      }
      if (formData.care_context === 'Patient Visit' && formData.patient_encounter) {
        payload.patient_encounter = formData.patient_encounter
      }
      if (formData.care_context === 'Inpatient Admission' && formData.inpatient_record) {
        payload.inpatient_record = formData.inpatient_record
      }

      await createPrescription(payload)

      // Create a Nurse Task for each medication row that has the checkbox ticked
      if (createNurseTasks) {
        const tasksToCreate: CreateNurseTaskData[] = validMedications
          .map((med, idx) => {
            // Per-row checkbox defaults to true unless explicitly unticked
            const shouldCreate = nurseTaskRows[idx] !== false
            if (!shouldCreate) return null
            const scheduledDatetime = med.date
              ? `${med.date} ${med.time ?? '08:00:00'}`
              : `${formData.start_date} 08:00:00`
            return {
              patient: selectedPatient.name,
              task_type: 'Medication Administration',
              scheduled_time: scheduledDatetime,
              description: `${med.drug_name || med.drug} — ${med.dosage}${med.instructions ? `\n${med.instructions}` : ''}`,
              medication: med.drug,
              dosage: med.dosage,
              route: med.route_of_administration || undefined,
              is_prn: med.is_prn ?? false,
            } satisfies CreateNurseTaskData
          })
          .filter((t): t is CreateNurseTaskData => t !== null)

        if (tasksToCreate.length > 0) {
          try {
            const result = await bulkCreateNurseTasks(tasksToCreate)
            toast.success(`Prescription created · ${result.count} nurse task${result.count !== 1 ? 's' : ''} created`)
          } catch {
            toast.success('Prescription created')
            toast.error('Prescription saved but some nurse tasks could not be created.')
          }
        } else {
          toast.success('Prescription created')
        }
      } else {
        toast.success('Prescription created')
      }

      onSuccess()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create prescription'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const practitionerDisplay = formData.practitioner
    ? (practitioners.find((x) => x.name === formData.practitioner)?.label || formData.practitioner)
    : practQuery

  const isExpanded = (index: number) => expandedMedications.has(index)
  const shouldShowCollapse = medications.length >= 2

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] min-h-[500px] flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 rounded-t-xl">
          <h2 className="text-xl font-semibold text-slate-900">Create Prescription</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 shrink-0 bg-slate-50">
          {(['details', 'medications'] as TabId[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? 'border-primary text-primary bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              {tab === 'medications' ? `Medications (${validMedications.length})` : 'Details'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {error && (
            <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 shrink-0">
              {error}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-6">
            {/* ── DETAILS TAB ── */}
            {activeTab === 'details' && (
              <div className="space-y-5">
                {/* Row 1: Patient (full width) */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Patient <span className="text-red-500">*</span>
                  </label>
                  <Combobox
                    value={selectedPatient?.name || ''}
                    displayValue={selectedPatient ? (selectedPatient.patient_name || selectedPatient.name) : patientQuery}
                    placeholder="Search patient..."
                    options={patients.map((p) => ({ name: p.name, label: p.patient_name || p.name }))}
                    loading={loadingPatients}
                    onQueryChange={(q) => {
                      setPatientQuery(q)
                      setSelectedPatient(null)
                      if (q.length > 0) {
                        setLoadingPatients(true)
                        searchPatients(q, 20).then(setPatients).finally(() => setLoadingPatients(false))
                      }
                    }}
                    onOpen={() => {
                      if (patients.length === 0) {
                        setLoadingPatients(true)
                        fetchPatients(20, 0).then(setPatients).finally(() => setLoadingPatients(false))
                      }
                    }}
                    onSelect={(opt) => {
                      const p = patients.find((x) => x.name === opt.name)
                      if (p) {
                        setSelectedPatient(p)
                        setPatientQuery(p.patient_name || p.name)
                      }
                    }}
                    renderOption={(opt) => {
                      const p = patients.find((x) => x.name === opt.name)
                      return (
                        <div>
                          <div className="font-medium">{opt.label || opt.name}</div>
                          {p && (p.file_number || p.id_number) && (
                            <div className="text-xs text-slate-500 flex gap-x-3 mt-0.5">
                              {p.file_number && <span>File: {p.file_number}</span>}
                              {p.id_number && <span>ID: {p.id_number}</span>}
                            </div>
                          )}
                        </div>
                      )
                    }}
                  />
                </div>

                {/* Row 2: Care Context + Visit/Admission side by side */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Care Context
                    </label>
                    <select
                      value={formData.care_context}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          care_context: e.target.value as 'Patient Visit' | 'Inpatient Admission',
                          patient_encounter: '',
                          inpatient_record: '',
                        }))
                      }
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    >
                      <option value="Patient Visit">Patient Visit</option>
                      <option value="Inpatient Admission">Inpatient Admission</option>
                    </select>
                  </div>

                  {formData.care_context === 'Patient Visit' ? (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Patient Visit
                      </label>
                      <select
                        value={formData.patient_encounter}
                        onChange={(e) => setFormData((p) => ({ ...p, patient_encounter: e.target.value }))}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                      >
                        <option value="">Select visit...</option>
                        {visits.map((v) => <option key={v.name} value={v.name}>{v.label || v.name}</option>)}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Inpatient Admission
                      </label>
                      <select
                        value={formData.inpatient_record}
                        onChange={(e) => setFormData((p) => ({ ...p, inpatient_record: e.target.value }))}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                      >
                        <option value="">Select admission...</option>
                        {admissions.map((a) => <option key={a.name} value={a.name}>{a.label || a.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* Row 3: Company + Start Date side by side */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Company <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.company}
                      onChange={(e) => setFormData((p) => ({ ...p, company: e.target.value }))}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    >
                      <option value="">Select company...</option>
                      {companies.map((c) => <option key={c.name} value={c.name}>{c.label || c.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Start Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => setFormData((p) => ({ ...p, start_date: e.target.value }))}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    />
                  </div>
                </div>

                {/* Row 4: Practitioner (full width or half) */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Practitioner</label>
                    <Combobox
                      value={formData.practitioner}
                      displayValue={practitionerDisplay}
                      placeholder="Search practitioner..."
                      options={practitioners}
                      onQueryChange={(q) => {
                        setPractQuery(q)
                        setFormData((p) => ({ ...p, practitioner: '' }))
                        fetchHealthcarePractitioners(q || undefined).then(setPractitioners).catch(() => {})
                      }}
                      onOpen={() => {
                        fetchHealthcarePractitioners(practQuery || undefined).then(setPractitioners).catch(() => {})
                      }}
                      onSelect={(opt) => {
                        setFormData((p) => ({ ...p, practitioner: opt.name }))
                        setPractQuery(opt.label || opt.name)
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── MEDICATIONS TAB ── */}
            {activeTab === 'medications' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-slate-500">
                    Fill in Drug, Dosage, Dosage Form, and Date for each medication.
                  </p>
                  <button
                    type="button"
                    onClick={addMedicationRow}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-md hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Add Medication
                  </button>
                </div>

                {/* Nurse Task master toggle */}
                {formData.care_context === 'Inpatient Admission' && (
                  <div className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 flex items-center gap-2">
                    <input
                      id="create-nurse-tasks"
                      type="checkbox"
                      checked={createNurseTasks}
                      onChange={(e) => setCreateNurseTasks(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    <label htmlFor="create-nurse-tasks" className="text-xs font-medium text-teal-800 cursor-pointer select-none">
                      Create a Nurse Task (Medication Administration) for each medication
                    </label>
                  </div>
                )}

                <div className="space-y-3">
                  {medications.map((row, index) => (
                    <div
                      key={index}
                      className="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden transition-all"
                    >
                      {/* Card header - clickable to expand/collapse */}
                      <button
                        type="button"
                        onClick={() => toggleMedicationExpanded(index)}
                        disabled={!shouldShowCollapse}
                        className={`w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200 hover:bg-slate-100 transition-colors ${
                          !shouldShowCollapse ? 'cursor-default' : 'cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                          <Pill className="w-4 h-4 text-primary" />
                          <span>Medication {index + 1}</span>
                          {row.drug && drugQueries[index] && (
                            <span className="text-slate-400 font-normal">— {drugQueries[index]}</span>
                          )}
                          {row.is_prn && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                              PRN
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeMedicationRow(index)
                            }}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          {shouldShowCollapse && (
                            <div className="text-slate-400">
                              {isExpanded(index) ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </div>
                          )}
                        </div>
                      </button>

                      {/* Per-row Nurse Task opt-out (visible when master toggle is on) */}
                      {createNurseTasks && formData.care_context === 'Inpatient Admission' && (
                        <div className="px-4 py-1.5 bg-teal-50 border-b border-teal-100 flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`nt-row-${index}`}
                            checked={nurseTaskRows[index] !== false}
                            onChange={(e) =>
                              setNurseTaskRows((prev) => ({ ...prev, [index]: e.target.checked }))
                            }
                            className="w-3.5 h-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                          />
                          <label
                            htmlFor={`nt-row-${index}`}
                            className="text-[11px] text-teal-700 cursor-pointer select-none"
                          >
                            Create nurse task for this medication
                          </label>
                        </div>
                      )}

                      {/* Collapsible content */}
                      {(isExpanded(index) || !shouldShowCollapse) && (
                        <div className="p-4 space-y-3 animate-in fade-in duration-200">
                          {/* Row A: Drug, Dosage, Dosage Form */}
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Drug <span className="text-red-500">*</span>
                              </label>
                              <Combobox
                                value={row.drug}
                                displayValue={drugQueries[index] ?? (row.drug ? (row.drug_name || row.drug) : '')}
                                placeholder="Search drug..."
                                options={drugOptions[index] || []}
                                loading={drugLoading[index]}
                                onQueryChange={(q) => {
                                  setDrugQueries((prev) => ({ ...prev, [index]: q }))
                                  loadDrugOptions(index, q)
                                }}
                                onOpen={() => loadDrugOptions(index, drugQueries[index] || row.drug || '')}
                                onSelect={(opt) => {
                                  updateMedicationRow(index, 'drug', opt.name)
                                  setDrugQueries((prev) => ({ ...prev, [index]: opt.label || opt.name }))
                                  setDrugOptions((prev) => ({ ...prev, [index]: [] }))
                                }}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Dosage <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={row.dosage}
                                onChange={(e) => updateMedicationRow(index, 'dosage', e.target.value)}
                                placeholder="e.g. 1-0-1"
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Dosage Form <span className="text-red-500">*</span>
                              </label>
                              <select
                                value={row.dosage_form}
                                onChange={(e) => updateMedicationRow(index, 'dosage_form', e.target.value)}
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                              >
                                <option value="">Select...</option>
                                {dosageForms.map((df) => <option key={df.name} value={df.name}>{df.label || df.name}</option>)}
                              </select>
                            </div>
                          </div>

                          {/* Row B: Start Date, End Date, Days (uniform 3 fields) */}
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Start Date <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="date"
                                value={row.date ?? formData.start_date}
                                onChange={(e) => updateMedicationRow(index, 'date', e.target.value)}
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">End Date</label>
                              <input
                                type="date"
                                value={row.end_date ?? ''}
                                onChange={(e) => updateMedicationRow(index, 'end_date', e.target.value)}
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Days</label>
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={row.no_of_days ?? ''}
                                onChange={(e) => updateMedicationRow(index, 'no_of_days', e.target.value ? Number(e.target.value) : 1)}
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                              />
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-500">Start + End Date → Days; or Start Date + Days → End Date</p>

                          {/* Row C: Frequency, Route of Administration, Ref No */}
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Frequency</label>
                              <Combobox
                                value={row.patient_frequency ?? ''}
                                displayValue={row.patient_frequency ? (frequencies.find((f) => f.name === row.patient_frequency)?.label || row.patient_frequency) : ''}
                                placeholder="Select..."
                                options={frequencies}
                                onQueryChange={(q) => {
                                  if (!q) {
                                    updateMedicationRow(index, 'patient_frequency', '')
                                  }
                                }}
                                onOpen={() => {}}
                                onSelect={(opt) => updateMedicationRow(index, 'patient_frequency', opt.name)}
                                onClear={() => updateMedicationRow(index, 'patient_frequency', '')}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Route of Administration</label>
                              <Combobox
                                value={row.route_of_administration ?? ''}
                                displayValue={row.route_of_administration ? (routeOfAdminOptions.find((r) => r.name === row.route_of_administration)?.label || row.route_of_administration) : ''}
                                placeholder="Select..."
                                options={routeOfAdminOptions}
                                onQueryChange={(q) => {
                                  if (!q) {
                                    updateMedicationRow(index, 'route_of_administration', '')
                                  }
                                }}
                                onOpen={() => {}}
                                onSelect={(opt) => updateMedicationRow(index, 'route_of_administration', opt.name)}
                                onClear={() => updateMedicationRow(index, 'route_of_administration', '')}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Ref No</label>
                              <input
                                type="text"
                                value={row.reference_no ?? ''}
                                onChange={(e) => updateMedicationRow(index, 'reference_no', e.target.value)}
                                placeholder="Ref"
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                              />
                            </div>
                          </div>

                          {/* Row D: Checkboxes (3 cols) */}
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-2">Is Pink</label>
                              <div className="flex items-center">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={!!row.is_pink}
                                    onChange={(e) => updateMedicationRow(index, 'is_pink', e.target.checked)}
                                    className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                                  />
                                  <span className="text-sm text-slate-600">Yes</span>
                                </label>
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-2">
                                PRN <span className="text-slate-400 font-normal">(as needed)</span>
                              </label>
                              <div className="flex items-center">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={!!row.is_prn}
                                    onChange={(e) => updateMedicationRow(index, 'is_prn', e.target.checked)}
                                    className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                                  />
                                  <span className="text-sm text-slate-600">Yes</span>
                                </label>
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-2">Long Acting</label>
                              <div className="flex items-center">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={!!row.is_long_acting}
                                    onChange={(e) => updateMedicationRow(index, 'is_long_acting', e.target.checked)}
                                    className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                                  />
                                  <span className="text-sm text-slate-600">Yes</span>
                                </label>
                              </div>
                            </div>
                          </div>

                          {/* Row E: Time Frequency (only when Long Acting is ticked) */}
                          {row.is_long_acting && (
                            <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
                              <label className="block text-xs font-medium text-slate-700 mb-1">
                                Time Frequency (when will be next run)
                              </label>
                              <select
                                value={row.long_acting_frequency ?? 'Weekly'}
                                onChange={(e) => updateMedicationRow(index, 'long_acting_frequency', e.target.value)}
                                className="w-full max-w-xs rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                              >
                                {LONG_ACTING_FREQUENCY_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                              <p className="text-[11px] text-slate-500 mt-1">
                                A Long Acting Medicine record will be created for scheduling and reminders.
                              </p>
                            </div>
                          )}

                          {/* Row F: Instructions (full width - last row) */}
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Instructions</label>
                            <textarea
                              value={row.instructions ?? ''}
                              onChange={(e) => updateMedicationRow(index, 'instructions', e.target.value)}
                              placeholder="Add any special instructions or notes for this medication..."
                              rows={3}
                              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white resize-none"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {medications.length === 0 && (
                    <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
                      <Pill className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No medications added yet</p>
                      <button
                        type="button"
                        onClick={addMedicationRow}
                        className="mt-3 text-sm text-primary hover:underline"
                      >
                        Add first medication
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-3 px-6 py-4 border-t border-slate-200 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50 text-sm font-medium transition-colors"
            >
              {submitting ? 'Creating...' : 'Create Prescription'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}