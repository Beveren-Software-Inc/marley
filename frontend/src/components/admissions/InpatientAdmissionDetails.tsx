import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { fetchInpatientRecord, type InpatientRecord, type InpatientPackage } from '../../services/inpatientRecords'
import { StatusPill } from '../ui/StatusPill'
import { PackageSelectionModal } from './PackageSelectionModal'
import { AdmissionFormModal } from './AdmissionFormModal'
import { ScheduleDischargeModal } from './ScheduleDischargeModal'
import { navigateToDischarge } from '../../utils/dischargeNavigation'
import { getMedicalDiagnosisForContext, type MedicalDiagnosisEntryRow } from '../../services/medicalDiagnosisEntry'
import { fetchMedicineGiven, fetchMissedMedicine, type MedicineGivenRow, type MissedMedicineRow } from '../../services/medicineGiven'
// FIX 2: LabTestRow → LabTest (matches the actual export name in labTests service)
import { fetchLabTestsByInpatientRecord, type LabTest } from '../../services/labTests'
// The TS signature of fetchInpatientPrescriptions says InpatientPrescriptionRow[], but the actual
// API response is grouped InpatientPrescription[] with nested medications[]. We cast at the call
// site so the expand/collapse UI works correctly against the real runtime shape.
import { fetchInpatientPrescriptions, type InpatientPrescription, type InpatientPrescriptionRow } from '../../services/prescriptions'
import { InpatientDiagnosisModal } from './InpatientDiagnosisModal'
import { Stethoscope, FlaskConical, Pill, FileText, Info, Plus, ChevronDown } from 'lucide-react'

// Constants
const STATUS_COLORS: Record<string, string> = {
  'Admission Scheduled': 'warning',
  'Admitted': 'success',
  'Discharge Scheduled': 'info',
  'Discharged': 'default',
  'Cancelled': 'danger',
} as const

type TabType = 'details' | 'diagnosis' | 'lab_tests' | 'medicine_given' | 'prescriptions'

interface InpatientAdmissionDetailsProps {
  admissionName: string
  onUpdate?: () => void
}

// Helper Components
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

const SafeDate = ({ date, format = 'date' }: { date?: string | null; format?: 'date' | 'datetime' }) => {
  if (!date || date === 'null' || date === '') return null

  try {
    const parsedDate = new Date(date)
    if (isNaN(parsedDate.getTime())) return <>{date}</>

    const formatted = format === 'date'
      ? parsedDate.toLocaleDateString()
      : parsedDate.toLocaleString()

    return <>{formatted}</>
  } catch {
    return <>{date}</>
  }
}

const StatusBadge = ({ status }: { status?: string }) => {
  if (!status) return null
  const colorMap: Record<string, string> = {
    'Active': 'bg-green-100 text-green-800',
    'Draft': 'bg-gray-100 text-gray-800',
    'Completed': 'bg-blue-100 text-blue-800',
    'Cancelled': 'bg-red-100 text-red-800',
    'Approved': 'bg-blue-100 text-blue-800',
    'Awaiting sample collection': 'bg-yellow-100 text-yellow-800',
    'Result Submitted': 'bg-purple-100 text-purple-800',
  }

  return (
    <span className={`text-xs px-2 py-0.5 rounded ${colorMap[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  )
}

const LoadingSpinner = ({ message = 'Loading...' }: { message?: string }) => (
  <div className="flex items-center justify-center p-8">
    <div className="text-slate-600">{message}</div>
  </div>
)

const EmptyState = ({ icon: Icon, message }: { icon: React.ElementType; message: string }) => (
  <div className="text-center py-8 text-slate-400">
    <Icon className="w-12 h-12 mx-auto mb-2 opacity-30" />
    <p>{message}</p>
  </div>
)

const ErrorState = ({ error, onRetry }: { error: Error; onRetry: () => void }) => (
  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
    <h3 className="text-red-800 font-semibold mb-2">Error Loading Data</h3>
    <p className="text-red-700 text-sm mb-3">{error.message}</p>
    <button
      onClick={onRetry}
      className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 transition-colors"
    >
      Retry
    </button>
  </div>
)

// Custom hook for date formatting
const useDateFormatter = () => {
  const formatDate = useCallback((date?: string) => {
    if (!date) return undefined
    try {
      return new Date(date).toLocaleDateString()
    } catch {
      return date
    }
  }, [])

  const formatDateTime = useCallback((date?: string) => {
    if (!date) return undefined
    try {
      return new Date(date).toLocaleString()
    } catch {
      return date
    }
  }, [])

  return { formatDate, formatDateTime }
}

// Custom hook for tab data management
const useTabData = (admissionName: string, activeTab: TabType) => {
  const [diagnoses, setDiagnoses] = useState<MedicalDiagnosisEntryRow[]>([])
  const [medicineGiven, setMedicineGiven] = useState<MedicineGivenRow[]>([])
  const [missedMedicine, setMissedMedicine] = useState<MissedMedicineRow[]>([])
  const [labTests, setLabTests] = useState<LabTest[]>([])
  // State uses InpatientPrescription[] (grouped, with medications[]) — the shape the API actually
  // returns at runtime, even though the TS return type of fetchInpatientPrescriptions says otherwise.
  const [prescriptions, setPrescriptions] = useState<InpatientPrescription[]>([])

  const [loadingDiagnoses, setLoadingDiagnoses] = useState(false)
  const [loadingMedicine, setLoadingMedicine] = useState(false)
  const [loadingLabTests, setLoadingLabTests] = useState(false)
  const [loadingPrescriptions, setLoadingPrescriptions] = useState(false)

  const abortControllerRef = useRef<AbortController | null>(null)

  const loadDiagnoses = useCallback(async () => {
    try {
      setLoadingDiagnoses(true)
      const data = await getMedicalDiagnosisForContext('Inpatient Admission', admissionName)
      setDiagnoses(data)
    } catch (err) {
      console.error('Failed to load diagnoses:', err)
    } finally {
      setLoadingDiagnoses(false)
    }
  }, [admissionName])

  const loadMedicineGiven = useCallback(async () => {
    try {
      setLoadingMedicine(true)
      const [givenRows, missedRows] = await Promise.all([
        fetchMedicineGiven(admissionName),
        fetchMissedMedicine(admissionName),
      ])
      setMedicineGiven(givenRows)
      setMissedMedicine(missedRows)
    } catch (err) {
      console.error('Failed to load medicine given:', err)
    } finally {
      setLoadingMedicine(false)
    }
  }, [admissionName])

  const loadLabTests = useCallback(async () => {
    try {
      setLoadingLabTests(true)
      const data = await fetchLabTestsByInpatientRecord(admissionName)
      setLabTests(data)
    } catch (err) {
      console.error('Failed to load lab tests:', err)
    } finally {
      setLoadingLabTests(false)
    }
  }, [admissionName])

  const loadPrescriptions = useCallback(async () => {
    try {
      setLoadingPrescriptions(true)
      // Cast: the TS signature says InpatientPrescriptionRow[] but the API actually returns
      // grouped InpatientPrescription[] with nested medications[].
      const data = await fetchInpatientPrescriptions(admissionName) as unknown as InpatientPrescription[]
      setPrescriptions(data)
    } catch (err) {
      console.error('Failed to load prescriptions:', err)
    } finally {
      setLoadingPrescriptions(false)
    }
  }, [admissionName])

  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    const loadData = async () => {
      if (activeTab === 'diagnosis') {
        await loadDiagnoses()
      } else if (activeTab === 'medicine_given') {
        await loadMedicineGiven()
      } else if (activeTab === 'lab_tests') {
        await loadLabTests()
      } else if (activeTab === 'prescriptions') {
        await loadPrescriptions()
      }
    }

    loadData()

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [activeTab, admissionName, loadDiagnoses, loadMedicineGiven, loadLabTests, loadPrescriptions])

  return {
    diagnoses,
    medicineGiven,
    missedMedicine,
    labTests,
    prescriptions,
    loadingDiagnoses,
    loadingMedicine,
    loadingLabTests,
    loadingPrescriptions,
    refetchDiagnoses: loadDiagnoses,
  }
}

// Sub-components
const PatientInformation = ({ record }: { record: InpatientRecord }) => {
  const { formatDate } = useDateFormatter()

  return (
    <div>
      <SectionTitle title="Patient Information" />
      <div className="space-y-1">
        <Field label="Patient" value={record.patient_name || record.patient} />
        <Field label="Patient ID" value={record.patient} />
        <Field label="Gender" value={record.gender} />
        <Field label="Blood Group" value={record.blood_group} />
        <Field label="Date of Birth" value={formatDate(record.dob)} />
        <Field label="Mobile" value={record.mobile} />
        <Field label="Email" value={record.email} />
        <Field label="Phone" value={record.phone} />
      </div>
    </div>
  )
}

const AdmissionDetailsSection = ({ record }: { record: InpatientRecord }) => {
  const { formatDate, formatDateTime } = useDateFormatter()

  return (
    <div>
      <SectionTitle title="Admission Details" />
      <div className="space-y-1">
        <Field label="Scheduled Date" value={formatDate(record.scheduled_date)} />
        <Field label="Admitted" value={formatDateTime(record.admitted_datetime)} />
        <Field label="Expected Discharge" value={formatDate(record.expected_discharge)} />
        <Field label="Expected Length of Stay" value={record.expected_length_of_stay ? `${record.expected_length_of_stay} days` : undefined} />
        <Field label="Admission Ordered For" value={formatDate(record.admission_ordered_for)} />
        <Field label="Company" value={record.company} />
        <Field label="Cost Center" value={record.cost_center} />
        <Field
          label="Service Units"
          value={record.service_unit_selections?.length
            ? record.service_unit_selections.map((r) => r.service_unit).filter(Boolean).join(', ')
            : undefined}
        />
        <Field label="Bed No" value={record.bed_no} />
        <Field label="Admission By CPR" value={record.admission_by_cpr} />
        <Field label="Reference By" value={record.reference_by} />
      </div>
    </div>
  )
}

const MedicalTeamSection = ({ record }: { record: InpatientRecord }) => (
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
)

const PhysicalExaminationSection = ({ record }: { record: InpatientRecord }) => {
  if (!record.weight && !record.height && !record.blood_pressure && !record.pulse && !record.temp && !record.resp_rate) {
    return null
  }

  return (
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
  )
}

// FIX 4: Accept `occupancies` as `any[] | undefined` so passing
// `record.inpatient_occupancies` (which may be undefined) is valid.
const OccupancyHistory = ({ occupancies }: { occupancies: any[] | undefined }) => {
  if (!occupancies || occupancies.length === 0) return null

  return (
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
            {occupancies.map((occ, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-3 py-2 text-slate-800">{occ.service_unit_name || occ.service_unit}</td>
                <td className="px-3 py-2 text-slate-600">
                  <SafeDate date={occ.check_in} format="datetime" />
                </td>
                <td className="px-3 py-2 text-slate-600">
                  <SafeDate date={occ.check_out} format="datetime" />
                </td>
                <td className="px-3 py-2">
                  {occ.invoiced ? (
                    <span className="inline-flex px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700">Yes</span>
                  ) : (
                    <span className="inline-flex px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-600">No</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Tab Components
const DetailsTab = ({ record }: { record: InpatientRecord }) => {
  const { formatDate, formatDateTime } = useDateFormatter()

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <PatientInformation record={record} />
        <AdmissionDetailsSection record={record} />
        <MedicalTeamSection record={record} />

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

      <PhysicalExaminationSection record={record} />

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
            <Field label="Discharge Ordered" value={formatDate(record.discharge_ordered_date)} />
            <Field label="Discharge Date" value={formatDateTime(record.discharge_datetime)} />
            <Field label="Follow Up Date" value={formatDate(record.followup_date)} />
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
              {/* FIX 1: Removed dompurify dependency. discharge_note is rendered as plain
                  text to avoid the missing module error. If rich HTML is needed, install
                  dompurify + @types/dompurify and restore dangerouslySetInnerHTML. */}
              <p className="text-slate-700 bg-slate-50 rounded p-2 text-xs whitespace-pre-wrap">
                {record.discharge_note}
              </p>
            </div>
          )}
        </div>
      )}

      <OccupancyHistory occupancies={record.inpatient_occupancies} />
    </div>
  )
}

const DiagnosesTab = ({
  diagnoses,
  loading,
  canEdit,
  onManage,
}: {
  diagnoses: MedicalDiagnosisEntryRow[]
  loading: boolean
  // FIX 6: Accept boolean so callers can safely pass `!!canEdit`
  canEdit: boolean
  onManage: () => void
}) => {
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-md font-semibold text-slate-800">Patient Diagnoses</h3>
        {canEdit && (
          <button
            onClick={onManage}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-primary border border-primary rounded-md hover:bg-primary/5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Manage Diagnoses
          </button>
        )}
      </div>

      {loading ? (
        <LoadingSpinner message="Loading diagnoses..." />
      ) : diagnoses.length === 0 ? (
        <EmptyState icon={Stethoscope} message="No diagnoses recorded yet" />
      ) : (
        <div className="space-y-3">
          {diagnoses.map((diag) => (
            <div key={diag.name} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <div className="flex justify-between items-start mb-2">
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm">
                      <span className="text-slate-500 font-normal mr-1">Diagnosis no.</span>
                      <span className="font-mono font-semibold text-primary">{diag.disease_no || diag.diagnosis || '—'}</span>
                    </span>
                    <span className="text-sm text-slate-800">
                      <span className="text-slate-500 font-normal mr-1">Name</span>
                      {diag.diagnosis_name?.trim() || '—'}
                    </span>
                    {diag.diagnoses_flag && (
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Primary</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-600">
                    <span className="text-slate-500">Group</span>{' '}
                    {diag.diagnosis_group_name?.trim() || '—'}
                  </div>
                </div>
                <span className="text-xs text-slate-400">
                  <SafeDate date={diag.posting_date} format="datetime" />
                </span>
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
  )
}

// FIX 2: Parameter type updated from LabTestRow to LabTest
const LabTestsTab = ({ labTests, loading }: { labTests: LabTest[]; loading: boolean }) => {
  return (
    <div>
      <h3 className="text-md font-semibold text-slate-800 mb-4">Lab Tests</h3>
      {loading ? (
        <LoadingSpinner message="Loading lab tests..." />
      ) : labTests.length === 0 ? (
        <EmptyState icon={FlaskConical} message="No lab tests recorded yet" />
      ) : (
        <div className="space-y-3">
          {labTests.map((test, index) => (
            <div key={test.name || index} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="text-sm font-semibold text-primary">{test.lab_test_name || test.template}</span>
                  <div className="text-xs text-slate-500 mt-0.5">{test.name}</div>
                </div>
                <div className="text-right">
                  <SafeDate date={test.date} format="date" />
                  {test.invoiced === 1 && (
                    <div className="text-xs text-green-600 mt-1">Invoiced</div>
                  )}
                </div>
              </div>

              {test.status && (
                <div className="mb-2">
                  <StatusBadge status={test.status} />
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

              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-2 border-t border-slate-100">
                <div className="text-xs text-slate-400">
                  <span className="font-medium">Order Date:</span> <SafeDate date={test.date} format="date" />
                </div>
                {test.result_date && test.result_date !== 'null' && (
                  <div className="text-xs text-slate-400">
                    <span className="font-medium">Result Date:</span> <SafeDate date={test.result_date} format="date" />
                  </div>
                )}
                {test.approved_date && test.approved_date !== 'null' && (
                  <div className="text-xs text-slate-400">
                    <span className="font-medium">Approved:</span> <SafeDate date={test.approved_date} format="date" />
                  </div>
                )}
                {test.submitted_date && test.submitted_date !== 'null' && (
                  <div className="text-xs text-slate-400">
                    <span className="font-medium">Submitted:</span> <SafeDate date={test.submitted_date} format="date" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const MedicineGivenTab = ({
  medicineGiven,
  missedMedicine,
  loading,
}: {
  medicineGiven: MedicineGivenRow[]
  missedMedicine: MissedMedicineRow[]
  loading: boolean
}) => {
  const hasLegacyFallback = (row: MedicineGivenRow) => !row.medicine_code && Boolean(row.old_medicine_code)
  return (
    <div>
      <h3 className="text-md font-semibold text-slate-800 mb-4">Medicine Given</h3>
      {loading ? (
        <LoadingSpinner message="Loading medicine records..." />
      ) : medicineGiven.length === 0 && missedMedicine.length === 0 ? (
        <EmptyState icon={Pill} message="No medicine given/missed records yet" />
      ) : (
        <div className="space-y-4">
          {medicineGiven.length > 0 && (
            <>
              <h4 className="text-sm font-semibold text-slate-700">Given Medicine</h4>
          {medicineGiven.map((med, index) => (
            <div key={med.name || index} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <div className="flex justify-between items-start mb-2">
                <span className="text-sm font-semibold text-primary">
                  {med.medicine_name || med.old_medicine_name || med.medicine_code || med.old_medicine_code}
                </span>
                <span className="text-xs text-slate-400">
                  <SafeDate date={`${med.date || ''} ${med.time || ''}`.trim() || med.date} format="datetime" />
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="font-medium">Qty:</span> {med.qty} {med.unit}</div>
                <div><span className="font-medium">Frequency:</span> {med.frequency}</div>
              </div>
              {med.dose_notes && <p className="text-xs text-slate-500 mt-2">Notes: {med.dose_notes}</p>}
              <div className="text-xs text-slate-400 mt-2">Given by: {med.user}</div>
              {(med.old_medicine_code || med.old_medicine_name || med.ip_admission_medicine || med.ip_admission_medicine_sheet || med.patient_medication_order) && (
                <div className="text-xs text-slate-500 mt-2 space-y-0.5">
                  {med.old_medicine_code && <div>Legacy code: {med.old_medicine_code}</div>}
                  {med.old_medicine_name && <div>Legacy name: {med.old_medicine_name}</div>}
                  {med.ip_admission_medicine && <div>IP Admission Medicine: {med.ip_admission_medicine}</div>}
                  {med.ip_admission_medicine_sheet && <div>Medicine Sheet: {med.ip_admission_medicine_sheet}</div>}
                  {med.patient_medication_order && <div>Patient Medication Order: {med.patient_medication_order}</div>}
                </div>
              )}
              {hasLegacyFallback(med) && (
                <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  Legacy fallback row (no current Item code).
                </div>
              )}
            </div>
          ))}
            </>
          )}

          {missedMedicine.length > 0 && (
            <>
              <h4 className="text-sm font-semibold text-slate-700">Missed Medicine</h4>
              {missedMedicine.map((med, index) => (
                <div key={med.name || index} className="bg-rose-50 rounded-lg p-4 border border-rose-200">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-sm font-semibold text-rose-700">
                      {med.medicine_name || med.old_medicine_name || med.medicine_code || med.old_medicine_code}
                    </span>
                    <span className="text-xs text-slate-400">
                      <SafeDate date={`${med.date || ''} ${med.time || ''}`.trim() || med.date} format="datetime" />
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="font-medium">Qty:</span> {med.qty} {med.unit}</div>
                    <div><span className="font-medium">Timing:</span> {med.medicine_given_timing || '-'}</div>
                  </div>
                  {med.dose_notes && <p className="text-xs text-slate-500 mt-2">Notes: {med.dose_notes}</p>}
                  <div className="text-xs text-slate-500 mt-2 space-y-0.5">
                    {med.old_medicine_code && <div>Legacy code: {med.old_medicine_code}</div>}
                    {med.old_medicine_name && <div>Legacy name: {med.old_medicine_name}</div>}
                    {med.ip_admission_medicine && <div>IP Admission Medicine: {med.ip_admission_medicine}</div>}
                    {med.ip_admission_medicine_sheet && <div>Medicine Sheet: {med.ip_admission_medicine_sheet}</div>}
                    {med.patient_medication_order && <div>Patient Medication Order: {med.patient_medication_order}</div>}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// PrescriptionsTab: each card is one InpatientPrescription (with from_date, to_date, practitioner_name).
// Clicking expands to reveal the nested medications[] list — same UX as the original design.
const PrescriptionsTab = ({
  prescriptions,
  loading,
}: {
  prescriptions: InpatientPrescription[]
  loading: boolean
}) => {
  const [expandedPrescriptions, setExpandedPrescriptions] = useState<Record<string, boolean>>({})

  const togglePrescriptionExpansion = (prescriptionName: string) =>
    setExpandedPrescriptions((prev) => ({ ...prev, [prescriptionName]: !prev[prescriptionName] }))

  return (
    <div>
      <h3 className="text-md font-semibold text-slate-800 mb-4">Active Prescriptions</h3>
      {loading ? (
        <LoadingSpinner message="Loading prescriptions..." />
      ) : prescriptions.length === 0 ? (
        <EmptyState icon={FileText} message="No prescriptions available" />
      ) : (
        <div className="space-y-4">
          {prescriptions.map((prescription) => {
            const isExpanded = expandedPrescriptions[prescription.name] || false

            return (
              <div key={prescription.name} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                {/* ── Collapsed header ── */}
                <div
                  className="flex justify-between items-start cursor-pointer hover:bg-slate-100 -m-2 p-2 rounded-lg transition-colors"
                  onClick={() => togglePrescriptionExpansion(prescription.name)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      togglePrescriptionExpansion(prescription.name)
                    }
                  }}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-primary">{prescription.name}</span>
                      <StatusBadge status={prescription.status} />
                    </div>
                    {(prescription.practitioner_name || prescription.practitioner) && (
                      <div className="text-xs text-slate-500 mt-1">
                        Prescribed by: {prescription.practitioner_name || prescription.practitioner}
                      </div>
                    )}
                    {prescription.from_date && (
                      <div className="text-xs text-slate-400 mt-1">
                        From: <SafeDate date={prescription.from_date} format="date" />
                        {prescription.to_date && (
                          <> · To: <SafeDate date={prescription.to_date} format="date" /></>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <div className="text-xs text-slate-500">
                      {prescription.medications?.length ?? 0} medication(s)
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 mt-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </div>
                </div>

                {/* ── Expanded medications list ── */}
                {isExpanded && (
                  <div className="mt-4 space-y-2 pl-2 border-l-2 border-primary/20">
                    <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                      Medications
                    </h4>
                    {prescription.medications && prescription.medications.length > 0 ? (
                      prescription.medications.map((med: InpatientPrescriptionRow, idx: number) => (
                        <div
                          key={`${med.drug_name ?? med.drug}-${idx}`}
                          className="bg-white rounded-md p-3 border border-slate-100"
                        >
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className="text-sm font-medium text-slate-800">
                              {med.drug_name || med.drug}
                            </span>
                            <span className="text-xs text-slate-500">{med.dosage}</span>
                            {med.dosage_form && (
                              <span className="text-xs text-slate-400">({med.dosage_form})</span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
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
                              <div className="col-span-2">
                                <span className="font-medium text-slate-500">Status:</span>{' '}
                                <StatusBadge status={med.status} />
                              </div>
                            )}
                          </div>
                          {med.instructions && (
                            <p className="text-xs text-slate-500 mt-2 pt-1 border-t border-slate-100">
                              <span className="font-medium">Instructions:</span> {med.instructions}
                            </p>
                          )}
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
  )
}

// Main Component
export const InpatientAdmissionDetails = ({ admissionName, onUpdate }: InpatientAdmissionDetailsProps) => {
  const navigate = useNavigate()
  const location = useLocation()
  const [record, setRecord] = useState<InpatientRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('details')
  const [showDiagnosisModal, setShowDiagnosisModal] = useState(false)

  // Action modal state
  const [showPackages, setShowPackages] = useState(false)
  const [showAdmissionForm, setShowAdmissionForm] = useState(false)
  const [selectedPackage, setSelectedPackage] = useState<InpatientPackage | null>(null)
  const [showScheduleDischarge, setShowScheduleDischarge] = useState(false)

  const {
    diagnoses,
    medicineGiven,
    missedMedicine,
    labTests,
    prescriptions,
    loadingDiagnoses,
    loadingMedicine,
    loadingLabTests,
    loadingPrescriptions,
    refetchDiagnoses,
  } = useTabData(admissionName, activeTab)

  const loadRecord = useCallback(async () => {
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
  }, [admissionName])

  useEffect(() => {
    loadRecord()
  }, [loadRecord])

  // FIX 6: Coerce to boolean with !! so it is never `boolean | null`
  const canEdit = !!(record && ['Admission Scheduled', 'Admitted', 'Discharge Scheduled'].includes(record.status))

  const handleAdmissionComplete = () => {
    setShowAdmissionForm(false)
    setSelectedPackage(null)
    loadRecord()
    onUpdate?.()
  }

  const handleDischargeScheduled = () => {
    setShowScheduleDischarge(false)
    loadRecord()
    onUpdate?.()
  }

  const handleOpenDischarge = () => {
    if (!record) return
    navigateToDischarge(
      {
        name: record.name,
        patient: record.patient,
        patient_name: record.patient_name,
      },
      navigate,
      `${location.pathname}${location.search}`
    )
  }

  const handleDiagnosisSuccess = () => {
    refetchDiagnoses()
    onUpdate?.()
  }

  const tabs = [
    { id: 'details' as TabType, label: 'Admission Details', icon: Info, count: 0 },
    { id: 'diagnosis' as TabType, label: 'Diagnoses', icon: Stethoscope, count: diagnoses.length },
    { id: 'lab_tests' as TabType, label: 'Lab Tests', icon: FlaskConical, count: labTests.length },
    { id: 'medicine_given' as TabType, label: 'Medicine Given', icon: Pill, count: medicineGiven.length + missedMedicine.length },
    { id: 'prescriptions' as TabType, label: 'Prescriptions', icon: FileText, count: prescriptions.length },
  ]

  if (loading) {
    return <LoadingSpinner message="Loading admission details..." />
  }

  if (error) {
    return <ErrorState error={error} onRetry={loadRecord} />
  }

  if (!record) {
    return <div className="text-slate-500 text-center p-8">Admission not found</div>
  }

  return (
    <>
      <div className="space-y-5 text-sm">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Inpatient Admission</p>
            <h2 className="text-lg font-bold text-slate-900">{record.name}</h2>
          </div>
          {record.status && (
            <StatusPill status={record.status} color={STATUS_COLORS[record.status] || 'default'} />
          )}
        </div>

        {/* Actions */}
        {(record.status === 'Admission Scheduled' || record.status === 'Admitted' || record.status === 'Discharge Scheduled') && (
          <div className="flex flex-wrap gap-2 pb-1">
            {record.status === 'Admission Scheduled' && (
              <button
                onClick={() => setShowPackages(true)}
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
              >
                Admit Patient
              </button>
            )}
            {record.status === 'Admitted' && (
              <button
                onClick={() => setShowScheduleDischarge(true)}
                className="px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-md hover:bg-orange-700 transition-colors"
              >
                Schedule Discharge
              </button>
            )}
            {record.status === 'Discharge Scheduled' && (
              <button
                onClick={handleOpenDischarge}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors"
              >
                Discharge Patient
              </button>
            )}
          </div>
        )}

        {/* Tabs */}
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
                aria-label={`View ${tab.label}`}
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

        {/* Tab Content */}
        <div className="py-4">
          {activeTab === 'details' && <DetailsTab record={record} />}
          {activeTab === 'diagnosis' && (
            <DiagnosesTab
              diagnoses={diagnoses}
              loading={loadingDiagnoses}
              canEdit={canEdit}
              onManage={() => setShowDiagnosisModal(true)}
            />
          )}
          {activeTab === 'lab_tests' && <LabTestsTab labTests={labTests} loading={loadingLabTests} />}
          {activeTab === 'medicine_given' && (
            <MedicineGivenTab medicineGiven={medicineGiven} missedMedicine={missedMedicine} loading={loadingMedicine} />
          )}
          {activeTab === 'prescriptions' && <PrescriptionsTab prescriptions={prescriptions} loading={loadingPrescriptions} />}
        </div>
      </div>

      {/* Modals */}
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