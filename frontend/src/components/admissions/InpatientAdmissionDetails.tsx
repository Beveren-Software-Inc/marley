import { useState, useEffect } from 'react'
import { fetchInpatientRecord, type InpatientRecord, type InpatientPackage } from '../../services/inpatientRecords'
import { StatusPill } from '../ui/StatusPill'
import { PackageSelectionModal } from './PackageSelectionModal'
import { AdmissionFormModal } from './AdmissionFormModal'
import { ScheduleDischargeModal } from './ScheduleDischargeModal'
import { DischargeModal } from './DischargeModal'
import { getInpatientDiagnoses, type DiagnosisRow } from '../../services/diagnosis'
import { fetchMedicineGiven, type MedicineGivenRow } from '../../services/medicineGiven'
import { fetchLabTestsByInpatientRecord} from '../../services/labTests'
import { fetchInpatientPrescriptions } from '../../services/prescriptions'
import { InpatientDiagnosisModal } from './InpatientDiagnosisModal'
import { Stethoscope, FlaskConical, Pill, FileText, Info, Plus } from 'lucide-react'


const statusColors: Record<string, string> = {
  'Admission Scheduled': 'warning',
  'Admitted': 'success',
  'Discharge Scheduled': 'info',
  'Discharged': 'default',
  'Cancelled': 'danger',
}

interface InpatientAdmissionDetailsProps {
  admissionName: string
  onUpdate?: () => void
}

type TabType = 'details' | 'diagnosis' | 'lab_tests' | 'medicine_given' | 'prescriptions'

const SectionTitle = ({ title }: { title: string }) => (
  <h3 className="text-sm font-semibold text-slate-700 mb-2 pb-1 border-b border-slate-100">{title}</h3>
)

const Field = ({ label, value }: { label: string; value?: string | number | null }) => {
  if (value === undefined || value === null || value === '' || value === 0) return null
  return (
    <div>
      <span className="font-medium text-slate-700">{label}:</span>{' '}
      <span className="text-slate-600">{value}</span>
    </div>
  )
}

const BoolField = ({ label, value }: { label: string; value?: boolean | number | null }) => {
  if (!value) return null
  return (
    <div>
      <span className="font-medium text-slate-700">{label}:</span>{' '}
      <span className="text-green-600 font-medium">Yes</span>
    </div>
  )
}

export const InpatientAdmissionDetails = ({ admissionName, onUpdate }: InpatientAdmissionDetailsProps) => {
  const [record, setRecord] = useState<InpatientRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('details')
  const [showDiagnosisModal, setShowDiagnosisModal] = useState(false)
  
  // Data states for tabs
  const [diagnoses, setDiagnoses] = useState<DiagnosisRow[]>([])
  const [medicineGiven, setMedicineGiven] = useState<MedicineGivenRow[]>([])
  const [labTests, setLabTests] = useState<LabTestRow[]>([])
  const [prescriptions, setPrescriptions] = useState<PrescriptionRow[]>([])
  
  // Loading states for tabs
  const [loadingDiagnoses, setLoadingDiagnoses] = useState(false)
  const [loadingMedicine, setLoadingMedicine] = useState(false)
  const [loadingLabTests, setLoadingLabTests] = useState(false)
  const [loadingPrescriptions, setLoadingPrescriptions] = useState(false)
const [expandedPrescriptions, setExpandedPrescriptions] = useState<Record<string, boolean>>({})

  // Action modal state
  const [showPackages, setShowPackages] = useState(false)
  const [showAdmissionForm, setShowAdmissionForm] = useState(false)
  const [selectedPackage, setSelectedPackage] = useState<InpatientPackage | null>(null)
  const [showScheduleDischarge, setShowScheduleDischarge] = useState(false)
  const [showDischargeModal, setShowDischargeModal] = useState(false)

  const togglePrescriptionExpansion = (prescriptionName: string) => {
  setExpandedPrescriptions(prev => ({
    ...prev,
    [prescriptionName]: !prev[prescriptionName]
  }))
}

  const load = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchInpatientRecord(admissionName)
      setRecord(data)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch admission details'))
    } finally {
      setLoading(false)
    }
  }

  // Load tab data
  const loadDiagnoses = async () => {
    try {
      setLoadingDiagnoses(true)
      const data = await getInpatientDiagnoses(admissionName)
      setDiagnoses(data)
    } catch (err) {
      console.error('Failed to load diagnoses:', err)
    } finally {
      setLoadingDiagnoses(false)
    }
  }

  const loadMedicineGiven = async () => {
    try {
      setLoadingMedicine(true)
      const data = await fetchMedicineGiven(admissionName)
      setMedicineGiven(data)
    } catch (err) {
      console.error('Failed to load medicine given:', err)
    } finally {
      setLoadingMedicine(false)
    }
  }

  const loadLabTests = async () => {
    try {
      setLoadingLabTests(true)
      const data = await fetchLabTestsByInpatientRecord(admissionName)
      setLabTests(data)
    } catch (err) {
      console.error('Failed to load lab tests:', err)
    } finally {
      setLoadingLabTests(false)
    }
  }

  const loadPrescriptions = async () => {
    try {
      setLoadingPrescriptions(true)
      const data = await fetchInpatientPrescriptions(admissionName)
      setPrescriptions(data)
    } catch (err) {
      console.error('Failed to load prescriptions:', err)
    } finally {
      setLoadingPrescriptions(false)
    }
  }

  useEffect(() => { 
    load()
  }, [admissionName])

  // Load data when tab changes
  useEffect(() => {
    if (!admissionName) return
    
    if (activeTab === 'diagnosis') {
      loadDiagnoses()
    } else if (activeTab === 'medicine_given') {
      loadMedicineGiven()
    } else if (activeTab === 'lab_tests') {
      loadLabTests()
    } else if (activeTab === 'prescriptions') {
      loadPrescriptions()
    }
  }, [activeTab, admissionName])

  const fmt = (d?: string) => d ? new Date(d).toLocaleDateString() : undefined
  const fmtDt = (d?: string) => d ? new Date(d).toLocaleString() : undefined

  const handleAdmissionComplete = () => {
    setShowAdmissionForm(false)
    setSelectedPackage(null)
    load()
    onUpdate?.()
  }

  const handleDischargeScheduled = () => {
    setShowScheduleDischarge(false)
    load()
    onUpdate?.()
  }

  const handleDischargeComplete = () => {
    setShowDischargeModal(false)
    load()
    onUpdate?.()
  }

  const handleDiagnosisSuccess = () => {
    loadDiagnoses()
    onUpdate?.()
  }

  const tabs = [
    { id: 'details' as TabType, label: 'Admission Details', icon: Info, count: 0 },
    { id: 'diagnosis' as TabType, label: 'Diagnoses', icon: Stethoscope, count: diagnoses.length },
    { id: 'lab_tests' as TabType, label: 'Lab Tests', icon: FlaskConical, count: labTests.length },
    { id: 'medicine_given' as TabType, label: 'Medicine Given', icon: Pill, count: medicineGiven.length },
    { id: 'prescriptions' as TabType, label: 'Prescriptions', icon: FileText, count: prescriptions.length },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading admission details...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-semibold mb-2">Error Loading Admission</h3>
        <p className="text-red-700 text-sm mb-3">{error.message}</p>
        <button onClick={load} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700">
          Retry
        </button>
      </div>
    )
  }

  if (!record) {
    return <div className="text-slate-500 text-center p-8">Admission not found</div>
  }

  return (
    <>
      <div className="space-y-5 text-sm">

        {/* ── Header ── */}
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Inpatient Admission</p>
            <h2 className="text-lg font-bold text-slate-900">{record.name}</h2>
          </div>
          {record.status && (
            <StatusPill status={record.status} color={statusColors[record.status] || 'default'} />
          )}
        </div>

        {/* ── Actions ── */}
        {(record.status === 'Admission Scheduled' || record.status === 'Admitted' || record.status === 'Discharge Scheduled') && (
          <div className="flex flex-wrap gap-2 pb-1">
            {record.status === 'Admission Scheduled' && (
              <button
                onClick={() => setShowPackages(true)}
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-md hover:bg-primary/90"
              >
                Admit Patient
              </button>
            )}
            {record.status === 'Admitted' && (
              <button
                onClick={() => setShowScheduleDischarge(true)}
                className="px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-md hover:bg-orange-700"
              >
                Schedule Discharge
              </button>
            )}
            {record.status === 'Discharge Scheduled' && (
              <button
                onClick={() => setShowDischargeModal(true)}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700"
              >
                Discharge Patient
              </button>
            )}
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="border-b border-slate-200">
          <div className="flex space-x-4 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'text-primary border-b-2 border-primary'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.count > 0 && (
                  <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full text-xs">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab Content ── */}
        <div className="py-4">
          {/* Details Tab - Original Admission Details */}
          {activeTab === 'details' && (
            <div className="space-y-5">
              {/* Patient Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <SectionTitle title="Patient Information" />
                  <div className="space-y-1">
                    <Field label="Patient" value={record.patient_name || record.patient} />
                    <Field label="Patient ID" value={record.patient} />
                    <Field label="Gender" value={record.gender} />
                    <Field label="Blood Group" value={record.blood_group} />
                    <Field label="Date of Birth" value={fmt(record.dob)} />
                    <Field label="Mobile" value={record.mobile} />
                    <Field label="Email" value={record.email} />
                    <Field label="Phone" value={record.phone} />
                  </div>
                </div>

                {/* Admission Details */}
                <div>
                  <SectionTitle title="Admission Details" />
                  <div className="space-y-1">
                    <Field label="Scheduled Date" value={fmt(record.scheduled_date)} />
                    <Field label="Admitted" value={fmtDt(record.admitted_datetime)} />
                    <Field label="Expected Discharge" value={fmt(record.expected_discharge)} />
                    <Field label="Expected Length of Stay" value={record.expected_length_of_stay ? `${record.expected_length_of_stay} days` : undefined} />
                    <Field label="Admission Ordered For" value={fmt(record.admission_ordered_for)} />
                    <Field label="Company" value={record.company} />
                    <Field label="Cost Center" value={record.cost_center} />
                    <Field label="Admission By CPR" value={record.admission_by_cpr} />
                    <Field label="Reference By" value={record.reference_by} />
                  </div>
                </div>

                {/* Medical Team */}
                <div>
                  <SectionTitle title="Medical Team" />
                  <div className="space-y-1">
                    <Field label="Department" value={record.medical_department} />
                    <Field label="Primary Practitioner" value={record.primary_practitioner} />
                    <Field label="Secondary Practitioner" value={record.secondary_practitioner} />
                    <Field label="Admission By Doctor" value={record.admission_doctor_name || record.admission_by_doctor} />
                    <Field label="Admission By NM" value={record.admission_by_nm} />
                    <Field label="Psychologist" value={record.psychologist_doctor_name || record.psychologist_doctor} />
                    <Field label="Resident Doctor" value={record.resident_doctor_name || record.residents_doctor_no} />
                    <BoolField label="Escort Required" value={record.escort} />
                  </div>
                </div>

                {/* Emergency Contact */}
                <div>
                  <SectionTitle title="Emergency Contact" />
                  <div className="space-y-1">
                    <Field label="Guardian Name" value={record.guardian_name} />
                    <Field label="Relationship" value={record.contact_relationship} />
                    <Field label="Contact No" value={record.contact_mobile} />
                    <Field label="Emergency Phone" value={record.contact_phone} />
                    <Field label="Email" value={record.contact_email} />
                  </div>
                </div>

                {/* Costs */}
                {(record.admission_cost || record.case_management_fee || record.room_charges) && (
                  <div>
                    <SectionTitle title="Costs" />
                    <div className="space-y-1">
                      <Field label="Admission Cost" value={record.admission_cost} />
                      <Field label="Case Management Fee" value={record.case_management_fee} />
                      <Field label="Room Charges" value={record.room_charges} />
                    </div>
                  </div>
                )}

                {/* References */}
                <div>
                  <SectionTitle title="References" />
                  <div className="space-y-1">
                    <Field label="Admission Encounter" value={record.admission_encounter} />
                    <Field label="Admission Practitioner" value={record.admission_practitioner} />
                    <Field label="Service Unit Type" value={record.admission_service_unit_type} />
                  </div>
                </div>
              </div>

              {/* Admission Instructions */}
              {record.admission_instruction && (
                <div>
                  <SectionTitle title="Admission Instructions" />
                  <p className="text-slate-700 bg-slate-50 rounded-md p-3 whitespace-pre-wrap">
                    {record.admission_instruction}
                  </p>
                </div>
              )}

              {/* Physical Examination */}
              {(record.weight || record.height || record.blood_pressure || record.pulse || record.temp || record.resp_rate) && (
                <div>
                  <SectionTitle title="Physical Examination" />
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {record.weight && (
                      <div className="bg-slate-50 rounded-md p-2 text-center">
                        <p className="text-xs text-slate-500">Weight</p>
                        <p className="font-semibold text-slate-800">{record.weight} kg</p>
                      </div>
                    )}
                    {record.height && (
                      <div className="bg-slate-50 rounded-md p-2 text-center">
                        <p className="text-xs text-slate-500">Height</p>
                        <p className="font-semibold text-slate-800">{record.height} cm</p>
                      </div>
                    )}
                    {record.blood_pressure && (
                      <div className="bg-slate-50 rounded-md p-2 text-center">
                        <p className="text-xs text-slate-500">Blood Pressure</p>
                        <p className="font-semibold text-slate-800">{record.blood_pressure}</p>
                      </div>
                    )}
                    {record.pulse && (
                      <div className="bg-slate-50 rounded-md p-2 text-center">
                        <p className="text-xs text-slate-500">Pulse</p>
                        <p className="font-semibold text-slate-800">{record.pulse} bpm</p>
                      </div>
                    )}
                    {record.temp && (
                      <div className="bg-slate-50 rounded-md p-2 text-center">
                        <p className="text-xs text-slate-500">Temperature</p>
                        <p className="font-semibold text-slate-800">{record.temp} °C</p>
                      </div>
                    )}
                    {record.resp_rate && (
                      <div className="bg-slate-50 rounded-md p-2 text-center">
                        <p className="text-xs text-slate-500">Resp Rate</p>
                        <p className="font-semibold text-slate-800">{record.resp_rate}/min</p>
                      </div>
                    )}
                  </div>
                  {(record.general_condition || record.cns || record.cvs_resp || record.git || record.others) && (
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                      {record.general_condition && (
                        <div>
                          <p className="text-xs font-medium text-slate-500 mb-0.5">General Condition</p>
                          <p className="text-slate-700 bg-slate-50 rounded p-2 text-xs">{record.general_condition}</p>
                        </div>
                      )}
                      {record.cns && (
                        <div>
                          <p className="text-xs font-medium text-slate-500 mb-0.5">CNS</p>
                          <p className="text-slate-700 bg-slate-50 rounded p-2 text-xs">{record.cns}</p>
                        </div>
                      )}
                      {record.cvs_resp && (
                        <div>
                          <p className="text-xs font-medium text-slate-500 mb-0.5">CVS / RESP</p>
                          <p className="text-slate-700 bg-slate-50 rounded p-2 text-xs">{record.cvs_resp}</p>
                        </div>
                      )}
                      {record.git && (
                        <div>
                          <p className="text-xs font-medium text-slate-500 mb-0.5">GIT</p>
                          <p className="text-slate-700 bg-slate-50 rounded p-2 text-xs">{record.git}</p>
                        </div>
                      )}
                      {record.others && (
                        <div>
                          <p className="text-xs font-medium text-slate-500 mb-0.5">Others</p>
                          <p className="text-slate-700 bg-slate-50 rounded p-2 text-xs">{record.others}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Medical History */}
              {(record.allergies || record.medication_history || record.medical_history || record.surgical_history) && (
                <div>
                  <SectionTitle title="Medical History" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {record.allergies && (
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-0.5">Allergies</p>
                        <p className="text-slate-700 bg-red-50 border border-red-100 rounded p-2 text-xs">{record.allergies}</p>
                      </div>
                    )}
                    {record.medication_history && (
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-0.5">Medication History</p>
                        <p className="text-slate-700 bg-slate-50 rounded p-2 text-xs">{record.medication_history}</p>
                      </div>
                    )}
                    {record.medical_history && (
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-0.5">Medical History</p>
                        <p className="text-slate-700 bg-slate-50 rounded p-2 text-xs">{record.medical_history}</p>
                      </div>
                    )}
                    {record.surgical_history && (
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-0.5">Surgical History</p>
                        <p className="text-slate-700 bg-slate-50 rounded p-2 text-xs">{record.surgical_history}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Discharge Details */}
              {(record.discharge_ordered_date || record.discharge_datetime || record.discharge_instructions || record.discharge_note || record.followup_date) && (
                <div>
                  <SectionTitle title="Discharge Details" />
                  <div className="space-y-1 mb-3">
                    <Field label="Discharge Ordered" value={fmt(record.discharge_ordered_date)} />
                    <Field label="Discharge Date" value={fmtDt(record.discharge_datetime)} />
                    <Field label="Follow Up Date" value={fmt(record.followup_date)} />
                    <Field label="Discharge Practitioner" value={record.discharge_practitioner} />
                  </div>
                  {record.discharge_instructions && (
                    <div className="mb-2">
                      <p className="text-xs font-medium text-slate-500 mb-0.5">Discharge Instructions</p>
                      <p className="text-slate-700 bg-slate-50 rounded p-2 text-xs">{record.discharge_instructions}</p>
                    </div>
                  )}
                  {record.discharge_note && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-0.5">Discharge Notes</p>
                      <div
                        className="text-slate-700 bg-slate-50 rounded p-2 text-xs prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: record.discharge_note }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Inpatient Occupancy */}
              {record.inpatient_occupancies && record.inpatient_occupancies.length > 0 && (
                <div>
                  <SectionTitle title="Room / Occupancy History" />
                  <div className="overflow-x-auto rounded-md border border-slate-200">
                    <table className="min-w-full text-xs divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-slate-600">Service Unit</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600">Check In</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600">Check Out</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600">Invoiced</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {record.inpatient_occupancies.map((occ: any, i: number) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-800">{occ.service_unit}</td>
                            <td className="px-3 py-2 text-slate-600">{occ.check_in ? new Date(occ.check_in).toLocaleString() : '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{occ.check_out ? new Date(occ.check_out).toLocaleString() : '—'}</td>
                            <td className="px-3 py-2">
                              {occ.invoiced
                                ? <span className="inline-flex px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700">Yes</span>
                                : <span className="inline-flex px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-600">No</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Diagnoses Tab */}
          {activeTab === 'diagnosis' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-md font-semibold text-slate-800">Patient Diagnoses</h3>
                {(record.status === 'Admission Scheduled' || record.status === 'Admitted' || record.status === 'Discharge Scheduled') && (
                  <button
                    onClick={() => setShowDiagnosisModal(true)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-primary border border-primary rounded-md hover:bg-primary/5 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Manage Diagnoses
                  </button>
                )}
              </div>

              {loadingDiagnoses ? (
                <div className="text-center py-8 text-slate-500">Loading diagnoses...</div>
              ) : diagnoses.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Stethoscope className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>No diagnoses recorded yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {diagnoses.map((diag) => (
                    <div key={diag.name} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-primary">{diag.diagnosis_label || diag.diagnosis}</span>
                          {diag.diagnoses_flag && (
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Primary</span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400">{new Date(diag.posting_date).toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-slate-600 mb-2">{diag.details}</p>
                      <div className="text-xs text-slate-500">
                        <span className="font-medium">Practitioner:</span> {diag.practitioner_name || diag.practitioner}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Lab Tests Tab */}
          {/* Lab Tests Tab */}
{activeTab === 'lab_tests' && (
  <div>
    <h3 className="text-md font-semibold text-slate-800 mb-4">Lab Tests</h3>
    {loadingLabTests ? (
      <div className="text-center py-8 text-slate-500">Loading lab tests...</div>
    ) : labTests.length === 0 ? (
      <div className="text-center py-8 text-slate-400">
        <FlaskConical className="w-12 h-12 mx-auto mb-2 opacity-30" />
        <p>No lab tests recorded yet</p>
      </div>
    ) : (
      <div className="space-y-3">
        {labTests.map((test) => (
          <div key={test.name} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className="text-sm font-semibold text-primary">{test.lab_test_name || test.template}</span>
                <div className="text-xs text-slate-500 mt-0.5">
                  {test.name}
                </div>
              </div>
              <div className="text-right">
                {/* Fix date handling */}
                {test.date && test.date !== 'null' ? (
                  <span className="text-xs text-slate-400">
                    {(() => {
                      try {
                        const date = new Date(test.date);
                        return !isNaN(date.getTime()) ? date.toLocaleDateString() : test.date;
                      } catch {
                        return test.date;
                      }
                    })()}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">No date</span>
                )}
                {test.invoiced === 1 && (
                  <div className="text-xs text-green-600 mt-1">Invoiced</div>
                )}
              </div>
            </div>
            
            {/* Status Badge */}
            {test.status && (
              <div className="mb-2">
                <span className={`text-xs px-2 py-0.5 rounded ${
                  test.status === 'Completed' ? 'bg-green-100 text-green-800' :
                  test.status === 'Approved' ? 'bg-blue-100 text-blue-800' :
                  test.status === 'Awaiting sample collection' ? 'bg-yellow-100 text-yellow-800' :
                  test.status === 'Result Submitted' ? 'bg-purple-100 text-purple-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {test.status}
                </span>
              </div>
            )}
            
            {test.practitioner_name && (
              <div className="text-xs text-slate-500 mb-2">
                <span className="font-medium">Practitioner:</span> {test.practitioner_name}
              </div>
            )}
            
            {test.department && (
              <div className="text-xs text-slate-500 mb-2">
                <span className="font-medium">Department:</span> {test.department}
              </div>
            )}
            
            {test.results && test.results !== 'null' && (
              <div className="mt-2 bg-white rounded p-2 text-sm border border-slate-100">
                <span className="font-medium">Results:</span>
                <p className="text-slate-600 mt-1 whitespace-pre-wrap">{test.results}</p>
              </div>
            )}
            
            {test.descriptive_result && test.descriptive_result !== 'null' && (
              <div className="mt-2">
                <p className="text-sm text-slate-600">{test.descriptive_result}</p>
              </div>
            )}
            
            {test.lab_test_comment && test.lab_test_comment !== 'null' && (
              <div className="mt-2 text-xs text-slate-400">
                Comment: {test.lab_test_comment}
              </div>
            )}
            
            {/* Dates Section */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-2 border-t border-slate-100">
              {test.date && test.date !== 'null' && (
                <div className="text-xs text-slate-400">
                  <span className="font-medium">Order Date:</span>{' '}
                  {(() => {
                    try {
                      const date = new Date(test.date);
                      return !isNaN(date.getTime()) ? date.toLocaleDateString() : test.date;
                    } catch {
                      return test.date;
                    }
                  })()}
                </div>
              )}
              {test.result_date && test.result_date !== 'null' && (
                <div className="text-xs text-slate-400">
                  <span className="font-medium">Result Date:</span>{' '}
                  {(() => {
                    try {
                      const date = new Date(test.result_date);
                      return !isNaN(date.getTime()) ? date.toLocaleDateString() : test.result_date;
                    } catch {
                      return test.result_date;
                    }
                  })()}
                </div>
              )}
              {test.approved_date && test.approved_date !== 'null' && (
                <div className="text-xs text-slate-400">
                  <span className="font-medium">Approved:</span>{' '}
                  {(() => {
                    try {
                      const date = new Date(test.approved_date);
                      return !isNaN(date.getTime()) ? date.toLocaleDateString() : test.approved_date;
                    } catch {
                      return test.approved_date;
                    }
                  })()}
                </div>
              )}
              {test.submitted_date && test.submitted_date !== 'null' && (
                <div className="text-xs text-slate-400">
                  <span className="font-medium">Submitted:</span>{' '}
                  {(() => {
                    try {
                      const date = new Date(test.submitted_date);
                      return !isNaN(date.getTime()) ? date.toLocaleDateString() : test.submitted_date;
                    } catch {
                      return test.submitted_date;
                    }
                  })()}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)}

          {/* Medicine Given Tab */}
          {activeTab === 'medicine_given' && (
            <div>
              <h3 className="text-md font-semibold text-slate-800 mb-4">Medicine Given</h3>
              {loadingMedicine ? (
                <div className="text-center py-8 text-slate-500">Loading medicine records...</div>
              ) : medicineGiven.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Pill className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>No medicines administered yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {medicineGiven.map((med) => (
                    <div key={med.name} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-sm font-semibold text-primary">{med.medicine_name || med.medicine_code}</span>
                        <span className="text-xs text-slate-400">{new Date(med.date).toLocaleString()}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><span className="font-medium">Qty:</span> {med.qty} {med.unit}</div>
                        <div><span className="font-medium">Frequency:</span> {med.frequency}</div>
                      </div>
                      {med.dose_notes && <p className="text-xs text-slate-500 mt-2">Notes: {med.dose_notes}</p>}
                      <div className="text-xs text-slate-400 mt-2">Given by: {med.user}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}


          {/* Prescriptions Tab */}
          {/* Prescriptions Tab */}
{/* Prescriptions Tab */}
{activeTab === 'prescriptions' && (
  <div>
    <h3 className="text-md font-semibold text-slate-800 mb-4">Active Prescriptions</h3>
    {loadingPrescriptions ? (
      <div className="text-center py-8 text-slate-500">Loading prescriptions...</div>
    ) : prescriptions.length === 0 ? (
      <div className="text-center py-8 text-slate-400">
        <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
        <p>No prescriptions available</p>
      </div>
    ) : (
      <div className="space-y-4">
        {prescriptions.map((prescription) => {
          const isExpanded = expandedPrescriptions[prescription.name] || false
          
          return (
            <div key={prescription.name} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              {/* Prescription Header - Click to expand */}
              <div 
                className="flex justify-between items-start cursor-pointer hover:bg-slate-100 -m-2 p-2 rounded-lg transition-colors"
                onClick={() => togglePrescriptionExpansion(prescription.name)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-primary">{prescription.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      prescription.status === 'Active' ? 'bg-green-100 text-green-800' :
                      prescription.status === 'Draft' ? 'bg-gray-100 text-gray-800' :
                      prescription.status === 'Completed' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {prescription.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {prescription.practitioner_name && (
                      <span>Prescribed by: {prescription.practitioner_name}</span>
                    )}
                  </div>
                  {prescription.from_date && (
                    <div className="text-xs text-slate-400 mt-1">
                      From: {new Date(prescription.from_date).toLocaleDateString()}
                      {prescription.to_date && ` To: ${new Date(prescription.to_date).toLocaleDateString()}`}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">
                    {prescription.medications?.length || 0} medication(s)
                  </div>
                  <svg 
                    className={`w-4 h-4 text-slate-400 mt-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Expanded Medications List */}
              {isExpanded && (
                <div className="mt-4 space-y-2 pl-2 border-l-2 border-primary/20">
                  <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Medications</h4>
                  {prescription.medications && prescription.medications.length > 0 ? (
                    prescription.medications.map((med, idx) => (
                      <div key={med.name || idx} className="bg-white rounded-md p-3 border border-slate-100">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-slate-800">{med.drug_name || med.drug}</span>
                              <span className="text-xs text-slate-500">{med.dosage}</span>
                              {med.dosage_form && (
                                <span className="text-xs text-slate-400">({med.dosage_form})</span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
                              <div>
                                <span className="font-medium text-slate-500">Frequency:</span>{' '}
                                <span className="text-slate-600">{med.frequency}</span>
                              </div>
                              {med.period && (
                                <div>
                                  <span className="font-medium text-slate-500">Duration:</span>{' '}
                                  <span className="text-slate-600">{med.period} days</span>
                                </div>
                              )}
                              {med.status && (
                                <div>
                                  <span className="font-medium text-slate-500">Status:</span>{' '}
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                                    med.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                                  }`}>
                                    {med.status}
                                  </span>
                                </div>
                              )}
                            </div>
                            {med.instructions && (
                              <p className="text-xs text-slate-500 mt-2 pt-1 border-t border-slate-100">
                                <span className="font-medium">Instructions:</span> {med.instructions}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-slate-400 text-sm">
                      No medications in this prescription
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )}
  </div>
)}
        </div>
      </div>

      {/* ── Action Modals ── */}
      {showPackages && (
        <PackageSelectionModal
          admissionNo={record.name}
          onSelect={(pkg) => {
            setSelectedPackage(pkg)
            setShowPackages(false)
            setShowAdmissionForm(true)
          }}
          onClose={() => setShowPackages(false)}
        />
      )}

      {showAdmissionForm && selectedPackage && (
        <AdmissionFormModal
          admissionNo={record.name}
          selectedPackage={selectedPackage}
          onComplete={handleAdmissionComplete}
          onClose={() => { setShowAdmissionForm(false); setSelectedPackage(null) }}
        />
      )}

      {showScheduleDischarge && (
        <ScheduleDischargeModal
          admission={{ name: record.name, patient: record.patient, patient_name: record.patient_name }}
          onClose={() => setShowScheduleDischarge(false)}
          onSuccess={handleDischargeScheduled}
        />
      )}

      {showDischargeModal && (
        <DischargeModal
          admission={{ name: record.name, patient: record.patient, patient_name: record.patient_name }}
          onClose={() => setShowDischargeModal(false)}
          onSuccess={handleDischargeComplete}
        />
      )}

      {/* Diagnosis Modal */}
      {showDiagnosisModal && (
        <InpatientDiagnosisModal
          parentDoctype="Inpatient Admission"
          parentName={record.name}
          patient={record.patient}
          patientName={record.patient_name}
          onClose={() => setShowDiagnosisModal(false)}
          onSuccess={handleDiagnosisSuccess}
        />
      )}
    </>
  )
}