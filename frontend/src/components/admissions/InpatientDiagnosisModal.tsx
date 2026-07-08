// components/diagnosis/InpatientDiagnosisModal.tsx
import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Stethoscope, Calendar, FileText, Clock, Save } from 'lucide-react'
import { toast } from '../../hooks/useToast'
import {
  fetchHealthcarePractitioners,
  fetchDiagnosis,
  fetchCostCenters,
  type LinkFieldOption,
} from '../../services/common'
import { getMedicalDiagnosisContextDefaults } from '../../services/medicalDiagnosisEntry'
import { useCareContext } from '../../providers/CareContextProvider'
import { getInpatientDiagnoses, updateInpatientDiagnoses, type DiagnosisData } from '../../services/diagnosis'

interface InpatientDiagnosisModalProps {
  parentDoctype: string
  parentName: string
  patient: string
  patientName: string
  onClose: () => void
  onSuccess: () => void
}

const formatDateTime = (date: Date) => {
  return date.toISOString().slice(0, 19)
}

export const InpatientDiagnosisModal = ({
  parentDoctype,
  parentName,
  patient,
  patientName,
  onClose,
  onSuccess
}: InpatientDiagnosisModalProps) => {
  const [diagnoses, setDiagnoses] = useState<DiagnosisData[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)

  // Practitioner options
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerOpen, setPractitionerOpen] = useState<{ [key: string]: boolean }>({})
  const [practitionerQuery, setPractitionerQuery] = useState<{ [key: string]: string }>({})

  // Diagnosis options
  const [diagnosisOptions, setDiagnosisOptions] = useState<LinkFieldOption[]>([])
  const [diagnosisOpen, setDiagnosisOpen] = useState<{ [key: string]: boolean }>({})
  const [diagnosisQuery, setDiagnosisQuery] = useState<{ [key: string]: string }>({})
  const [costCenterOptions, setCostCenterOptions] = useState<LinkFieldOption[]>([])
  const { userCostCenter, costCenterCompany } = useCareContext()
  const [defaultCostCenter, setDefaultCostCenter] = useState('')

  useEffect(() => {
    fetchCostCenters(costCenterCompany, undefined)
      .then(setCostCenterOptions)
      .catch(() => setCostCenterOptions([]))
  }, [costCenterCompany])

  useEffect(() => {
    getMedicalDiagnosisContextDefaults('Inpatient Admission', parentName)
      .then((d) => setDefaultCostCenter(d.cost_center || userCostCenter || ''))
      .catch(() => setDefaultCostCenter(userCostCenter || ''))
  }, [parentName, userCostCenter])

  // Load existing diagnoses
  useEffect(() => {
    loadExistingDiagnoses()
  }, [parentName, defaultCostCenter])

  const loadExistingDiagnoses = async () => {
    try {
      setLoading(true)
      const diagnosesList = await getInpatientDiagnoses(parentName)
      if (diagnosesList.length > 0) {
        setDiagnoses(diagnosesList.map(d => ({
          name: d.name,
          diagnosis: d.diagnosis,
          diagnosis_label: d.diagnosis_label || d.diagnosis_name || d.diagnosis,
          diagnosis_group_name: d.diagnosis_group_name,
          details: d.details || '',
          posting_date: d.posting_date || formatDateTime(new Date()),
          diagnoses_time: d.diagnoses_time || d.posting_date || formatDateTime(new Date()),
          practitioner: d.practitioner || '',
          practitioner_name: d.practitioner_name || '',
          diagnoses_flag: Boolean(d.diagnoses_flag),
          trans_num: d.trans_num || '',
          cost_center: d.cost_center || defaultCostCenter,
        })))
      } else {
        // Add one empty row if no existing diagnoses
        setDiagnoses([{
          diagnosis: '',
          details: '',
          posting_date: formatDateTime(new Date()),
          diagnoses_time: formatDateTime(new Date()),
          practitioner: '',
          practitioner_name: '',
          diagnoses_flag: false,
          trans_num: '',
          cost_center: defaultCostCenter,
        }])
      }
    } catch (error) {
      console.error('Failed to load existing diagnoses:', error)
      toast.error('Failed to load diagnoses')
    } finally {
      setLoading(false)
    }
  }

  const searchDiagnoses = async (query: string) => {
    try {
      const options = await fetchDiagnosis(query?.trim() || undefined)
      setDiagnosisOptions(options)
    } catch (error) {
      console.error('Failed to search diagnoses:', error)
    }
  }

  // Search practitioners
  const searchPractitioners = async (query: string) => {
    try {
      const options = await fetchHealthcarePractitioners(query || undefined)
      setPractitionerOptions(options)
    } catch (error) {
      console.error('Failed to load practitioners:', error)
    }
  }

  // Debounced search for diagnosis (disease no or name)
  useEffect(() => {
    const timeout = setTimeout(() => {
      const activeQuery = Object.values(diagnosisQuery).find((q) => q && String(q).trim().length >= 1)
      void searchDiagnoses(activeQuery ? String(activeQuery).trim() : '')
    }, 300)
    return () => clearTimeout(timeout)
  }, [diagnosisQuery])

  // Debounced search for practitioner
  useEffect(() => {
    const timeout = setTimeout(() => {
      const activeQuery = Object.values(practitionerQuery)[0]
      searchPractitioners(activeQuery)
    }, 300)
    return () => clearTimeout(timeout)
  }, [practitionerQuery])

  const addDiagnosis = () => {
    setDiagnoses([
      ...diagnoses,
      {
        diagnosis: '',
        details: '',
        posting_date: formatDateTime(new Date()),
        diagnoses_time: formatDateTime(new Date()),
        practitioner: '',
        practitioner_name: '',
        diagnoses_flag: false,
        trans_num: ''
      }
    ])
  }

  const removeDiagnosis = (index: number) => {
    if (diagnoses.length === 1) {
      toast.error('At least one diagnosis is required')
      return
    }
    const newDiagnoses = [...diagnoses]
    newDiagnoses.splice(index, 1)
    setDiagnoses(newDiagnoses)
  }

  const updateDiagnosis = (index: number, field: keyof DiagnosisData, value: any) => {
    const newDiagnoses = [...diagnoses]
    newDiagnoses[index] = { ...newDiagnoses[index], [field]: value }
    
    if (field === 'practitioner' && value) {
      const practitioner = practitionerOptions.find(p => p.name === value)
      if (practitioner) {
        newDiagnoses[index].practitioner_name = practitioner.label
      }
    }
    
    setDiagnoses(newDiagnoses)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate all diagnoses
    for (let i = 0; i < diagnoses.length; i++) {
      const diag = diagnoses[i]
      if (!diag.diagnosis) {
        toast.error(`Row ${i + 1}: Please select a diagnosis`)
        return
      }
      if (!diag.details) {
        toast.error(`Row ${i + 1}: Please enter diagnosis remarks`)
        return
      }
      if (!diag.posting_date) {
        toast.error(`Row ${i + 1}: Please enter posting date`)
        return
      }
      if (!diag.diagnoses_time) {
        toast.error(`Row ${i + 1}: Please enter diagnosis time`)
        return
      }
      if (!diag.practitioner) {
        toast.error(`Row ${i + 1}: Please select a practitioner`)
        return
      }
    }
    
    try {
      setSubmitting(true)
      
      // FIX: removed unused `idx` parameter from map callback
      const diagnosesWithTransNum = diagnoses.map((diag) => ({
        ...diag,
        trans_num: diag.trans_num || `DIA-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      }))
      
      const result = await updateInpatientDiagnoses(parentName, diagnosesWithTransNum)
      
      if (result.success) {
        toast.success(result.message)
        onSuccess()
        onClose()
      } else {
        toast.error('Failed to save diagnoses')
      }
    } catch (error) {
      console.error('Error saving diagnoses:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save diagnoses')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-5xl w-full p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-slate-600">Loading diagnoses...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} />
        
        <div className="relative bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <Stethoscope className="w-6 h-6 text-primary" />
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Manage Patient Diagnoses</h2>
                <p className="text-sm text-slate-500 mt-1">
                  {patientName} ({patient}) · {parentDoctype} · {parentName}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Info message */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                <p>💡 You can add, edit, or remove diagnoses below. All changes will be saved when you click "Save All Diagnoses".</p>
              </div>

              {diagnoses.map((diagnosis, index) => (
                <div key={index} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-md font-semibold text-slate-800">
                      Diagnosis #{index + 1}
                      {diagnosis.name && <span className="text-xs text-slate-500 ml-2">(Existing)</span>}
                    </h3>
                    <div className="flex gap-2">
                      {diagnoses.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeDiagnosis(index)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Remove diagnosis"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Diagnosis Selection */}
                    <div className="relative">
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Diagnosis <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={diagnosis.diagnosis ? (diagnosisOptions.find(d => d.name === diagnosis.diagnosis)?.label || diagnosis.diagnosis_label || diagnosis.diagnosis) : (diagnosisQuery[index] || '')}
                          onChange={(e) => {
                            setDiagnosisQuery(prev => ({ ...prev, [index]: e.target.value }))
                            setDiagnosisOpen(prev => ({ ...prev, [index]: true }))
                            updateDiagnosis(index, 'diagnosis', '')
                          }}
                          onFocus={() => {
                            setDiagnosisOpen((prev) => ({ ...prev, [index]: true }))
                            void fetchDiagnosis(undefined).then(setDiagnosisOptions)
                          }}
                          placeholder="Search by disease no or diagnosis name…"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                        />
                        {diagnosisOpen[index] && (
                          <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                            {diagnosisOptions.length > 0 ? (
                              diagnosisOptions.map((diag) => (
                                <button
                                  key={diag.name}
                                  type="button"
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                                  onClick={() => {
                                    setDiagnoses((prev) => {
                                      const next = [...prev]
                                      next[index] = {
                                        ...next[index],
                                        diagnosis: diag.name,
                                        diagnosis_label: diag.label,
                                        diagnosis_group_name: diag.diagnosis_group_name?.trim() || '',
                                      }
                                      return next
                                    })
                                    setDiagnosisQuery((prev) => ({ ...prev, [index]: diag.label }))
                                    setDiagnosisOpen((prev) => ({ ...prev, [index]: false }))
                                  }}
                                >
                                  <div className="font-medium text-slate-800">{diag.label}</div>
                                  {diag.diagnosis_group_name ? (
                                    <div className="text-xs text-slate-500 mt-0.5">{diag.diagnosis_group_name}</div>
                                  ) : null}
                                </button>
                              ))
                            ) : (
                              <div className="px-3 py-2 text-xs text-slate-500">No diagnoses found</div>
                            )}
                          </div>
                        )}
                      </div>
                      {diagnosis.diagnosis && diagnosis.diagnosis_group_name && !diagnosisOpen[index] ? (
                        <p className="text-xs text-slate-500 mt-1">{diagnosis.diagnosis_group_name}</p>
                      ) : null}
                    </div>

                    {/* Practitioner Selection */}
                    <div className="relative">
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Doctor <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={diagnosis.practitioner ? (practitionerOptions.find(p => p.name === diagnosis.practitioner)?.label || diagnosis.practitioner) : (practitionerQuery[index] || '')}
                          onChange={(e) => {
                            setPractitionerQuery(prev => ({ ...prev, [index]: e.target.value }))
                            setPractitionerOpen(prev => ({ ...prev, [index]: true }))
                            updateDiagnosis(index, 'practitioner', '')
                          }}
                          onFocus={() => setPractitionerOpen(prev => ({ ...prev, [index]: true }))}
                          placeholder="Search doctor..."
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                        />
                        {practitionerOpen[index] && (
                          <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                            {practitionerOptions.length > 0 ? (
                              practitionerOptions.map((pract) => (
                                <button
                                  key={pract.name}
                                  type="button"
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                                  onClick={() => {
                                    updateDiagnosis(index, 'practitioner', pract.name)
                                    updateDiagnosis(index, 'practitioner_name', pract.label || pract.name)
                                    setPractitionerQuery(prev => ({ ...prev, [index]: pract.label }))
                                    setPractitionerOpen(prev => ({ ...prev, [index]: false }))
                                  }}
                                >
                                  <div>
                                    <div className="font-medium">{pract.label}</div>
                                    <div className="text-xs text-slate-500">{pract.name}</div>
                                  </div>
                                </button>
                              ))
                            ) : (
                              <div className="px-3 py-2 text-xs text-slate-500">No practitioners found</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Branch */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Branch</label>
                      <select
                        value={diagnosis.cost_center || ''}
                        onChange={(e) => updateDiagnosis(index, 'cost_center', e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">Select…</option>
                        {diagnosis.cost_center &&
                        !costCenterOptions.some((o) => o.name === diagnosis.cost_center) ? (
                          <option value={diagnosis.cost_center}>{diagnosis.cost_center}</option>
                        ) : null}
                        {costCenterOptions.map((o) => (
                          <option key={o.name} value={o.name}>
                            {o.label || o.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Posting Date */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Posting Date <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="datetime-local"
                          value={diagnosis.posting_date}
                          onChange={(e) => updateDiagnosis(index, 'posting_date', e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                        />
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      </div>
                    </div>

                    {/* Diagnosis Time */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Diagnosis Time <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="datetime-local"
                          value={diagnosis.diagnoses_time}
                          onChange={(e) => updateDiagnosis(index, 'diagnoses_time', e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                        />
                        <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      </div>
                    </div>

                    {/* Remarks - Full Width */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Remarks <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <textarea
                          value={diagnosis.details}
                          onChange={(e) => updateDiagnosis(index, 'details', e.target.value)}
                          rows={3}
                          placeholder="Enter diagnosis remarks, notes, and observations..."
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                        />
                        <FileText className="absolute right-3 top-3 w-4 h-4 text-slate-400" />
                      </div>
                    </div>

                    {/* Diagnosis Flag */}
                    <div className="md:col-span-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={diagnosis.diagnoses_flag}
                          onChange={(e) => updateDiagnosis(index, 'diagnoses_flag', e.target.checked)}
                          className="rounded border-slate-300 text-primary focus:ring-primary"
                        />
                        <span className="text-sm text-slate-700">Mark as Primary Diagnosis</span>
                      </label>
                    </div>
                  </div>
                </div>
              ))}

              {/* Add More Button */}
              <button
                type="button"
                onClick={addDiagnosis}
                className="flex items-center gap-2 px-4 py-2 text-sm text-primary border border-primary rounded-lg hover:bg-primary/5 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Another Diagnosis
              </button>

              {/* Form Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
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
                  className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save All Diagnoses
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}