import { useState, useEffect } from 'react'
import { PatientSearch } from '../patients/PatientSearch'
import {
  fetchPatientVisits,
  fetchInpatientAdmissions,
  fetchDiagnosis,
  fetchComplaints,
  getEncounterDiagnosisSymptoms,
  updateEncounterDiagnosisSymptoms,
  createDiagnosis,
  createComplaint,
  type LinkFieldOption,
} from '../../services/common'
import { toast } from '../../hooks/useToast'
import { Plus, X } from 'lucide-react'
import { UserMenu } from '../user/UserMenu'
import { NotificationBell } from '../notifications/NotificationBell'

interface DiagnosisSymptomsScreenProps {
  selectedPatient: string
  onPatientSelect: (patient: string | undefined) => void
}

type ContextType = 'Patient Visit' | 'Inpatient Admission'

export function DiagnosisSymptomsScreen({
  selectedPatient,
  onPatientSelect,
}: DiagnosisSymptomsScreenProps) {
  const [contextType, setContextType] = useState<ContextType>('Patient Visit')
  const [contextName, setContextName] = useState('')
  const [visits, setVisits] = useState<LinkFieldOption[]>([])
  const [admissions, setAdmissions] = useState<LinkFieldOption[]>([])
  const [diagnosisList, setDiagnosisList] = useState<{ name: string; label?: string }[]>([])
  const [symptomsList, setSymptomsList] = useState<{ name: string; label?: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [diagnosisSearch, setDiagnosisSearch] = useState('')
  const [diagnosisOptions, setDiagnosisOptions] = useState<LinkFieldOption[]>([])
  const [diagnosisOpen, setDiagnosisOpen] = useState(false)
  const [symptomSearch, setSymptomSearch] = useState('')
  const [symptomOptions, setSymptomOptions] = useState<LinkFieldOption[]>([])
  const [symptomOpen, setSymptomOpen] = useState(false)
  const [showCreateDiagnosisModal, setShowCreateDiagnosisModal] = useState(false)
  const [showCreateSymptomModal, setShowCreateSymptomModal] = useState(false)
  const [createDiagnosisValue, setCreateDiagnosisValue] = useState('')
  const [createSymptomValue, setCreateSymptomValue] = useState('')
  const [creatingDiagnosis, setCreatingDiagnosis] = useState(false)
  const [creatingSymptom, setCreatingSymptom] = useState(false)

  useEffect(() => {
    if (!selectedPatient) {
      setVisits([])
      setAdmissions([])
      setContextName('')
      setDiagnosisList([])
      setSymptomsList([])
      return
    }
    fetchPatientVisits(selectedPatient).then(setVisits).catch(() => setVisits([]))
    fetchInpatientAdmissions(selectedPatient).then(setAdmissions).catch(() => setAdmissions([]))
  }, [selectedPatient])

  useEffect(() => {
    setContextName('')
    setDiagnosisList([])
    setSymptomsList([])
  }, [contextType])

  useEffect(() => {
    if (!contextName || !selectedPatient) return
    const doctype = contextType === 'Patient Visit' ? 'Patient Visit' : 'Inpatient Admission'
    setLoading(true)
    setError(null)
    getEncounterDiagnosisSymptoms(doctype, contextName)
      .then((data) => {
        setDiagnosisList(data.diagnosis || [])
        setSymptomsList(data.symptoms || [])
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load')
        setDiagnosisList([])
        setSymptomsList([])
      })
      .finally(() => setLoading(false))
  }, [contextType, contextName, selectedPatient])

  useEffect(() => {
    if (!diagnosisOpen) return
    const t = setTimeout(() => {
      fetchDiagnosis(diagnosisSearch || undefined).then(setDiagnosisOptions).catch(() => setDiagnosisOptions([]))
    }, diagnosisSearch.trim() ? 300 : 0)
    return () => clearTimeout(t)
  }, [diagnosisSearch, diagnosisOpen])

  useEffect(() => {
    if (!symptomOpen) return
    const t = setTimeout(() => {
      fetchComplaints(symptomSearch || undefined).then(setSymptomOptions).catch(() => setSymptomOptions([]))
    }, symptomSearch.trim() ? 300 : 0)
    return () => clearTimeout(t)
  }, [symptomSearch, symptomOpen])

  const contextOptions = contextType === 'Patient Visit' ? visits : admissions

  const handleAddDiagnosis = (item: LinkFieldOption) => {
    if (diagnosisList.some((d) => d.name === item.name)) return
    setDiagnosisList((prev) => [...prev, { name: item.name, label: item.label || item.name }])
    setDiagnosisSearch('')
    setDiagnosisOpen(false)
  }

  const handleRemoveDiagnosis = (name: string) => {
    setDiagnosisList((prev) => prev.filter((d) => d.name !== name))
  }

  const handleAddSymptom = (item: LinkFieldOption) => {
    if (symptomsList.some((s) => s.name === item.name)) return
    setSymptomsList((prev) => [...prev, { name: item.name, label: item.label || item.name }])
    setSymptomSearch('')
    setSymptomOpen(false)
  }

  const handleRemoveSymptom = (name: string) => {
    setSymptomsList((prev) => prev.filter((s) => s.name !== name))
  }

  const handleCreateDiagnosis = async () => {
    const val = createDiagnosisValue.trim()
    if (!val) { toast.error('Enter diagnosis text'); return }
    setCreatingDiagnosis(true)
    try {
      const name = await createDiagnosis(val)
      if (!diagnosisList.some((d) => d.name === name)) {
        setDiagnosisList((prev) => [...prev, { name, label: val }])
      }
      setShowCreateDiagnosisModal(false)
      setCreateDiagnosisValue('')
      toast.success('Diagnosis created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create diagnosis')
    } finally {
      setCreatingDiagnosis(false)
    }
  }

  const handleCreateSymptom = async () => {
    const val = createSymptomValue.trim()
    if (!val) { toast.error('Enter symptom/complaint text'); return }
    setCreatingSymptom(true)
    try {
      const name = await createComplaint(val)
      if (!symptomsList.some((s) => s.name === name)) {
        setSymptomsList((prev) => [...prev, { name, label: val }])
      }
      setShowCreateSymptomModal(false)
      setCreateSymptomValue('')
      toast.success('Symptom created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create symptom')
    } finally {
      setCreatingSymptom(false)
    }
  }

  const handleSubmit = async () => {
    if (!contextName) { toast.error('Please select a Patient Visit or Inpatient Admission'); return }
    const doctype = contextType === 'Patient Visit' ? 'Patient Visit' : 'Inpatient Admission'
    setSaving(true)
    setError(null)
    try {
      await updateEncounterDiagnosisSymptoms(doctype, contextName, diagnosisList, symptomsList)
      toast.success('Diagnosis and symptoms saved')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
        <div className="flex-1 min-w-0">
          <PatientSearch
            selectedPatient={selectedPatient || ''}
            onPatientSelect={onPatientSelect}
            patients={[]}
          />
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <UserMenu />
          <NotificationBell />
        </div>
      </header>

      <div className="p-4 space-y-4">
        {!selectedPatient && (
          <div className="bg-slate-100 rounded-lg p-4 text-center text-slate-600">
            Select a patient to add diagnosis and symptoms to a visit or admission.
          </div>
        )}

        {selectedPatient && (
          <>
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <div className="font-semibold mb-3">Link to</div>
              <div className="flex flex-wrap gap-4 items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase">Type</label>
                  <select
                    value={contextType}
                    onChange={(e) => setContextType(e.target.value as ContextType)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm min-w-[180px]"
                  >
                    <option value="Patient Visit">Patient Visit</option>
                    <option value="Inpatient Admission">Inpatient Admission</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 uppercase">
                    {contextType === 'Patient Visit' ? 'Patient Visit' : 'Inpatient Admission'}
                  </label>
                  <select
                    value={contextName}
                    onChange={(e) => setContextName(e.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm min-w-[220px]"
                  >
                    <option value="">Select...</option>
                    {contextOptions.map((o) => (
                      <option key={o.name} value={o.name}>{o.label || o.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {contextName && (
              <>
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                    {error}
                  </div>
                )}

                {loading ? (
                  <div className="text-slate-500 py-4">Loading...</div>
                ) : (
                  <>
                    {/* Diagnosis card */}
                    <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                      <div className="font-semibold mb-3">Diagnosis</div>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {diagnosisList.map((d) => (
                          <span
                            key={d.name}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 text-sm"
                          >
                            {d.label || d.name}
                            <button
                              type="button"
                              onClick={() => handleRemoveDiagnosis(d.name)}
                              className="text-slate-500 hover:text-red-600"
                              aria-label="Remove"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="relative max-w-xs">
                        <input
                          type="text"
                          value={diagnosisSearch}
                          onChange={(e) => { setDiagnosisSearch(e.target.value); setDiagnosisOpen(true) }}
                          onFocus={() => setDiagnosisOpen(true)}
                          onBlur={() => setTimeout(() => setDiagnosisOpen(false), 150)}
                          placeholder="Search and add diagnosis..."
                          className="w-full rounded-md border border-slate-300 px-3 py-2 pr-9 text-sm"
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setCreateDiagnosisValue(diagnosisSearch.trim())
                            setShowCreateDiagnosisModal(true)
                          }}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-blue-600 hover:text-blue-800 transition-colors"
                          title="Create new diagnosis"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        {diagnosisOpen && diagnosisOptions.length > 0 && (
                          <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                            {diagnosisOptions.map((o) => (
                              <button
                                key={o.name}
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleAddDiagnosis(o)}
                              >
                                {o.label || o.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </section>

                    {/* Symptoms card */}
                    <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                      <div className="font-semibold mb-3">Symptoms (Chief Complaint)</div>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {symptomsList.map((s) => (
                          <span
                            key={s.name}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 text-sm"
                          >
                            {s.label || s.name}
                            <button
                              type="button"
                              onClick={() => handleRemoveSymptom(s.name)}
                              className="text-slate-500 hover:text-red-600"
                              aria-label="Remove"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="relative max-w-xs">
                        <input
                          type="text"
                          value={symptomSearch}
                          onChange={(e) => { setSymptomSearch(e.target.value); setSymptomOpen(true) }}
                          onFocus={() => setSymptomOpen(true)}
                          onBlur={() => setTimeout(() => setSymptomOpen(false), 150)}
                          placeholder="Search and add symptoms..."
                          className="w-full rounded-md border border-slate-300 px-3 py-2 pr-9 text-sm"
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setCreateSymptomValue(symptomSearch.trim())
                            setShowCreateSymptomModal(true)
                          }}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-blue-600 hover:text-blue-800 transition-colors"
                          title="Create new symptom (complaint)"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        {symptomOpen && symptomOptions.length > 0 && (
                          <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                            {symptomOptions.map((o) => (
                              <button
                                key={o.name}
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleAddSymptom(o)}
                              >
                                {o.label || o.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </section>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={saving}
                        className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
                      >
                        {saving ? 'Saving...' : 'Save to ' + contextType}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Create new diagnosis modal */}
      {showCreateDiagnosisModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowCreateDiagnosisModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl p-4 w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-semibold mb-3">New Diagnosis</div>
            <input
              type="text"
              value={createDiagnosisValue}
              onChange={(e) => setCreateDiagnosisValue(e.target.value)}
              placeholder="Diagnosis name"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateDiagnosisModal(false)}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-md hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateDiagnosis}
                disabled={creatingDiagnosis}
                className="px-3 py-1.5 text-sm bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                {creatingDiagnosis ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create new symptom (complaint) modal */}
      {showCreateSymptomModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowCreateSymptomModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl p-4 w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-semibold mb-3">New Symptom (Complaint)</div>
            <input
              type="text"
              value={createSymptomValue}
              onChange={(e) => setCreateSymptomValue(e.target.value)}
              placeholder="Symptom / complaint name"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateSymptomModal(false)}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-md hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateSymptom}
                disabled={creatingSymptom}
                className="px-3 py-1.5 text-sm bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                {creatingSymptom ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}