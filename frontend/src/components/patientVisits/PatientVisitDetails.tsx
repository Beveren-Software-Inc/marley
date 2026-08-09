import { useCallback, useEffect, useState, type ElementType } from 'react'
import {
  ChevronDown,
  ClipboardList,
  FileText,
  FlaskConical,
  Info,
  NotebookPen,
  Package,
  Pill,
  Plus,
  Stethoscope,
} from 'lucide-react'
import { fetchPatientVisit, type PatientVisit, cancelVisit } from '../../services/patientVisits'
import { CreateAdmissionModal } from '../admissions/CreateAdmissionModal'
import { CancelVisitModal } from './CancelVisitModal'
import { CreateVitalSignModal } from '../vitalSigns/CreateVitalSignModal'
import { CreateObservationModal } from '../observations/CreateObservationModal'
import { EditPatientVisitModal } from './EditPatientVisitModal'
import { PatientDiagnosisModal } from '../diagnosis/PatientDiagnosisModal'
import { CreatePrescriptionModal } from '../prescriptions/CreatePrescriptionModal'
import { CreateClinicalNoteModal } from '../clinicalNotes/CreateClinicalNoteModal'
import { CreateServiceRequestModal } from '../serviceRequests/CreateServiceRequestModal'
import { toast } from '../../hooks/useToast'
import { useCareContext } from '../../providers/CareContextProvider'
import { observationsAllowedForMode } from '../../config/costCenterCareScope'
import { fetchLabTestsByPatientVisit, type LabTest } from '../../services/labTests'
import { fetchServiceRequests, type ServiceRequest } from '../../services/serviceRequests'
import { fetchIPServices, type IPServiceRow } from '../../services/ipServices'
import { fetchPrescriptions, type Prescription } from '../../services/prescriptions'
import { fetchClinicalNotes, type ClinicalNote } from '../../services/clinicalNotes'
import {
  getMedicalDiagnosisForPatient,
  type MedicalDiagnosisEntryAggRow,
} from '../../services/medicalDiagnosisEntry'
import {
  displayMedicationDosage,
  displayMedicationDrugName,
  displayMedicationFrequency,
} from '../../utils/medicationOrderDisplayUtils'
import { PatientDocumentAttachmentPreview } from '../ui/PatientDocumentAttachmentPreview'
import { htmlToPlainText } from '../../utils/htmlToPlainText'

interface PatientVisitDetailsProps {
  visitNo: string
  onUpdate?: () => void
}

type TabType =
  | 'details'
  | 'diagnoses'
  | 'lab_tests'
  | 'services'
  | 'prescriptions'
  | 'notes'
  | 'documents'

const LoadingSpinner = ({ message = 'Loading...' }: { message?: string }) => (
  <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-primary" />
    {message}
  </div>
)

const EmptyState = ({ icon: Icon, message }: { icon: ElementType; message: string }) => (
  <div className="flex flex-col items-center justify-center py-10 text-slate-400">
    <Icon className="mb-2 h-8 w-8 opacity-40" />
    <p className="text-xs font-semibold uppercase tracking-wide">{message}</p>
  </div>
)

function formatDate(value?: string | null): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('en-GB')
  } catch {
    return String(value).slice(0, 10)
  }
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('en-GB')
  } catch {
    return String(value)
  }
}

function diagnosisIsForVisit(dx: MedicalDiagnosisEntryAggRow, visitNo: string): boolean {
  if (dx.visit_num === visitNo) return true
  return dx.parent === visitNo && dx.parent_type === 'Patient Visit'
}

function sortDiagnosesByDateDesc(rows: MedicalDiagnosisEntryAggRow[]): MedicalDiagnosisEntryAggRow[] {
  return [...rows].sort((a, b) => {
    const da = a.posting_date ? new Date(a.posting_date).getTime() : 0
    const db = b.posting_date ? new Date(b.posting_date).getTime() : 0
    return db - da
  })
}

function useVisitTabData(visitNo: string, patient?: string) {
  const [diagnoses, setDiagnoses] = useState<MedicalDiagnosisEntryAggRow[]>([])
  const [labTests, setLabTests] = useState<LabTest[]>([])
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([])
  const [ipServices, setIpServices] = useState<IPServiceRow[]>([])
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [notes, setNotes] = useState<ClinicalNote[]>([])
  const [loadingDiagnoses, setLoadingDiagnoses] = useState(false)
  const [loadingLabTests, setLoadingLabTests] = useState(false)
  const [loadingServices, setLoadingServices] = useState(false)
  const [loadingPrescriptions, setLoadingPrescriptions] = useState(false)
  const [loadingNotes, setLoadingNotes] = useState(false)

  const loadDiagnoses = useCallback(async () => {
    if (!patient) {
      setDiagnoses([])
      return
    }
    setLoadingDiagnoses(true)
    try {
      const all = await getMedicalDiagnosisForPatient(patient)
      const visitOnes: MedicalDiagnosisEntryAggRow[] = []
      const others: MedicalDiagnosisEntryAggRow[] = []
      const seen = new Set<string>()
      for (const dx of all) {
        const key = dx.name || `${dx.diagnosis}-${dx.posting_date}-${dx.parent || ''}`
        if (seen.has(key)) continue
        seen.add(key)
        if (diagnosisIsForVisit(dx, visitNo)) visitOnes.push(dx)
        else others.push(dx)
      }
      // This visit's diagnoses first (unique / highlighted), then older history.
      setDiagnoses([...sortDiagnosesByDateDesc(visitOnes), ...sortDiagnosesByDateDesc(others)])
    } catch {
      setDiagnoses([])
    } finally {
      setLoadingDiagnoses(false)
    }
  }, [visitNo, patient])

  const loadLabTests = useCallback(async () => {
    setLoadingLabTests(true)
    try {
      setLabTests(await fetchLabTestsByPatientVisit(visitNo))
    } catch {
      setLabTests([])
    } finally {
      setLoadingLabTests(false)
    }
  }, [visitNo])

  const loadServices = useCallback(async () => {
    setLoadingServices(true)
    try {
      const [sr, ips] = await Promise.all([
        fetchServiceRequests(100, 0, undefined, undefined, undefined, undefined, undefined, undefined, visitNo),
        fetchIPServices(100, 0, undefined, undefined, visitNo),
      ])
      setServiceRequests(sr.data || [])
      setIpServices(ips || [])
    } catch {
      setServiceRequests([])
      setIpServices([])
    } finally {
      setLoadingServices(false)
    }
  }, [visitNo])

  const loadPrescriptions = useCallback(async () => {
    setLoadingPrescriptions(true)
    try {
      const rows = await fetchPrescriptions(100, 0, {
        careContext: 'Patient Visit',
        patientEncounter: visitNo,
      })
      setPrescriptions(rows || [])
    } catch {
      setPrescriptions([])
    } finally {
      setLoadingPrescriptions(false)
    }
  }, [visitNo])

  const loadNotes = useCallback(async () => {
    setLoadingNotes(true)
    try {
      setNotes(
        (
          await fetchClinicalNotes(
            100,
            0,
            undefined,
            undefined,
            undefined,
            undefined,
            'Patient Visit',
            visitNo,
          )
        ).data,
      )
    } catch {
      setNotes([])
    } finally {
      setLoadingNotes(false)
    }
  }, [visitNo])

  useEffect(() => {
    void loadLabTests()
    void loadServices()
    void loadPrescriptions()
    void loadNotes()
  }, [visitNo, loadLabTests, loadServices, loadPrescriptions, loadNotes])

  useEffect(() => {
    void loadDiagnoses()
  }, [loadDiagnoses])

  return {
    diagnoses,
    labTests,
    serviceRequests,
    ipServices,
    prescriptions,
    notes,
    loadingDiagnoses,
    loadingLabTests,
    loadingServices,
    loadingPrescriptions,
    loadingNotes,
    reloadDiagnoses: loadDiagnoses,
    reloadPrescriptions: loadPrescriptions,
    reloadNotes: loadNotes,
    reloadLabTests: loadLabTests,
    reloadServices: loadServices,
  }
}

export const PatientVisitDetails = ({ visitNo, onUpdate }: PatientVisitDetailsProps) => {
  const { mode } = useCareContext()
  const [visit, setVisit] = useState<PatientVisit | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [showAdmissionModal, setShowAdmissionModal] = useState(false)
  const [showVitalSignModal, setShowVitalSignModal] = useState(false)
  const [showObservationModal, setShowObservationModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDiagnosisModal, setShowDiagnosisModal] = useState(false)
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false)
  const [showProgressNoteModal, setShowProgressNoteModal] = useState(false)
  const [showLabRequestModal, setShowLabRequestModal] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>('details')
  const [expandedLabRequests, setExpandedLabRequests] = useState<Record<string, boolean>>({})
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)

  const {
    diagnoses,
    labTests,
    serviceRequests,
    ipServices,
    prescriptions,
    notes,
    loadingDiagnoses,
    loadingLabTests,
    loadingServices,
    loadingPrescriptions,
    loadingNotes,
    reloadDiagnoses,
    reloadPrescriptions,
    reloadNotes,
    reloadLabTests,
    reloadServices,
  } = useVisitTabData(visitNo, visit?.patient)

  const canEdit = !!(visit && visit.status !== 'Cancelled')
  const visitDiagnosesCount = diagnoses.filter((dx) => diagnosisIsForVisit(dx, visitNo)).length
  const diagnosesTabCount = diagnoses.length

  const loadVisit = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchPatientVisit(visitNo)
      setVisit(data)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch visit details'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadVisit()
    setActiveTab('details')
  }, [visitNo])

  const handleCancelVisitConfirm = async (reason: string) => {
    if (!visit) return
    setCancelLoading(true)
    try {
      await cancelVisit(visit.name, reason)
      toast.success('Visit cancelled successfully')
      loadVisit()
      onUpdate?.()
      setShowCancelModal(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel visit')
    } finally {
      setCancelLoading(false)
    }
  }

  if (loading) return <LoadingSpinner message="Loading visit details..." />
  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error.message}</div>
  }
  if (!visit) return <div className="p-8 text-center text-slate-500">Visit not found</div>

  const hasDocuments = !!visit.documents && visit.documents.length > 0
  const servicesCount = serviceRequests.length + ipServices.length

  const tabs: Array<{ id: TabType; label: string; icon: ElementType; count: number }> = [
    { id: 'details', label: 'Details', icon: Info, count: 0 },
    { id: 'diagnoses', label: 'Diagnoses', icon: Stethoscope, count: diagnosesTabCount },
    { id: 'lab_tests', label: 'Lab Tests', icon: FlaskConical, count: labTests.length },
    { id: 'services', label: 'Services', icon: Package, count: servicesCount },
    { id: 'prescriptions', label: 'Prescriptions', icon: Pill, count: prescriptions.length },
    { id: 'notes', label: 'Notes', icon: NotebookPen, count: notes.length },
    {
      id: 'documents',
      label: 'Documents',
      icon: FileText,
      count: hasDocuments ? visit.documents!.length : 0,
    },
  ]

  return (
    <div className="space-y-4 text-sm">
      <div className="border-b border-slate-200">
        <div className="flex space-x-3 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {tab.count > 0 ? (
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                  {tab.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'details' && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Patient Information</h3>
              <div className="space-y-1 text-sm">
                <div>
                  <span className="font-medium">Patient:</span> {visit.patient_name || visit.patient}
                </div>
                <div>
                  <span className="font-medium">Visit No:</span> {visit.name}
                </div>
                {visit.file_number ? (
                  <div>
                    <span className="font-medium">File Number:</span> {visit.file_number}
                  </div>
                ) : null}
                <div>
                  <span className="font-medium">Status:</span> {visit.status}
                </div>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Visit Details</h3>
              <div className="space-y-1 text-sm">
                {visit.encounter_date ? (
                  <div>
                    <span className="font-medium">Encounter Date:</span>{' '}
                    {formatDate(visit.encounter_date)} {visit.encounter_time || ''}
                  </div>
                ) : null}
                {visit.practitioner_name || visit.practitioner ? (
                  <div>
                    <span className="font-medium">Doctor:</span>{' '}
                    {visit.practitioner_name || visit.practitioner}
                  </div>
                ) : null}
                {visit.medical_department ? (
                  <div>
                    <span className="font-medium">Department:</span> {visit.medical_department}
                  </div>
                ) : null}
                {visit.visit_type ? (
                  <div>
                    <span className="font-medium">Visit Type:</span> {visit.visit_type}
                  </div>
                ) : null}
                {visit.inpatient_record ? (
                  <div>
                    <span className="font-medium">Inpatient Admission:</span> {visit.inpatient_record}{' '}
                    {visit.inpatient_status ? `(${visit.inpatient_status})` : ''}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Actions</h3>
            <div className="flex flex-wrap gap-2">
              {visit.status !== 'Cancelled' ? (
                <button
                  type="button"
                  onClick={() => setShowEditModal(true)}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Edit Visit
                </button>
              ) : null}

              {visit.status !== 'Cancelled' ? (
                <button
                  type="button"
                  onClick={() => setShowVitalSignModal(true)}
                  className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
                >
                  Create Vital Sign
                </button>
              ) : null}

              {visit.status !== 'Cancelled' && observationsAllowedForMode(mode) ? (
                <button
                  type="button"
                  onClick={() => setShowObservationModal(true)}
                  className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
                >
                  Create Observation
                </button>
              ) : null}

              {!visit.inpatient_record && visit.status === 'Completed' ? (
                <button
                  type="button"
                  onClick={() => setShowAdmissionModal(true)}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
                >
                  Schedule Admission
                </button>
              ) : null}

              {visit.status !== 'Cancelled' ? (
                <button
                  type="button"
                  onClick={() => setShowCancelModal(true)}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Cancel Visit
                </button>
              ) : null}
            </div>
          </div>
        </>
      )}

      {activeTab === 'diagnoses' && (
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-md font-semibold text-slate-800">Patient Diagnoses</h3>
              <p className="text-xs text-slate-500">
                This visit first
                {visitDiagnosesCount ? ` (${visitDiagnosesCount})` : ''}
                {diagnoses.length > visitDiagnosesCount
                  ? ` · then prior history (${diagnoses.length - visitDiagnosesCount})`
                  : ''}
              </p>
            </div>
            {canEdit ? (
              <button
                type="button"
                onClick={() => setShowDiagnosisModal(true)}
                className="flex items-center gap-1 rounded-md border border-primary px-3 py-1.5 text-sm text-primary transition-colors hover:bg-primary/5"
              >
                <Plus className="h-4 w-4" />
                Manage Diagnoses
              </button>
            ) : null}
          </div>
          {loadingDiagnoses ? (
            <LoadingSpinner message="Loading diagnoses..." />
          ) : diagnoses.length === 0 ? (
            <EmptyState icon={Stethoscope} message="No diagnoses for this patient" />
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
              {diagnoses.map((dx) => {
                const onThisVisit = diagnosisIsForVisit(dx, visitNo)
                return (
                  <li
                    key={dx.name || `${dx.diagnosis}-${dx.posting_date}-${dx.parent || ''}`}
                    className={`px-4 py-3 ${onThisVisit ? 'bg-sky-50/70' : ''}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-semibold text-slate-900">
                        {dx.diagnosis_name || dx.diagnosis || 'Diagnosis'}
                      </p>
                      {onThisVisit ? (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                          This visit
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          {dx.parent_type === 'Inpatient Admission'
                            ? `Admission ${dx.parent || ''}`.trim()
                            : dx.parent
                              ? `Visit ${dx.parent}`
                              : 'Prior'}
                        </span>
                      )}
                    </div>
                    {dx.details ? (
                      <p className="mt-1 whitespace-pre-wrap text-slate-600">
                        {htmlToPlainText(dx.details)}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-400">
                      {[
                        dx.posting_date ? formatDate(dx.posting_date) : null,
                        dx.practitioner_name || dx.practitioner,
                        dx.diagnosis_group_name,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {activeTab === 'lab_tests' && (
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-md font-semibold text-slate-800">Lab Tests</h3>
            {canEdit ? (
              <button
                type="button"
                onClick={() => setShowLabRequestModal(true)}
                className="flex items-center gap-1 rounded-md border border-primary px-3 py-1.5 text-sm text-primary transition-colors hover:bg-primary/5"
              >
                <Plus className="h-4 w-4" />
                Create Lab Request
              </button>
            ) : null}
          </div>
          {loadingLabTests ? (
            <LoadingSpinner message="Loading lab tests..." />
          ) : labTests.length === 0 ? (
            <EmptyState icon={FlaskConical} message="No lab tests for this visit" />
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
              {labTests.map((lab) => (
                <li key={lab.name} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {lab.lab_test_name || lab.template || lab.name}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-slate-400">{lab.name}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {lab.status || '—'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {[lab.date ? formatDate(lab.date) : null, lab.practitioner_name || lab.practitioner]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === 'services' && (
        <div className="space-y-4">
          {loadingServices ? (
            <LoadingSpinner message="Loading services..." />
          ) : servicesCount === 0 ? (
            <EmptyState icon={Package} message="No services for this visit" />
          ) : (
            <>
              {serviceRequests.length > 0 ? (
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                    <ClipboardList className="h-4 w-4" />
                    Service Requests
                  </h3>
                  <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
                    {serviceRequests.map((sr) => {
                      const labGroups =
                        sr.template_dt === 'Lab Test Template' ? sr.lab_request_groups || [] : []
                      const canExpand = labGroups.length > 0
                      const expanded = !!expandedLabRequests[sr.name]
                      const childCount = labGroups.reduce(
                        (total, group) => total + group.children.length,
                        0
                      )
                      return (
                        <li key={sr.name} className="px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-slate-900">
                                {sr.template_name || sr.template_dn || sr.name}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {[sr.template_dt, sr.name].filter(Boolean).join(' · ')}
                              </p>
                            </div>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                              {sr.status || '—'}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-slate-500">
                              {[
                                sr.order_date ? formatDate(sr.order_date) : null,
                                sr.practitioner_name || sr.practitioner,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                            {canExpand ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedLabRequests((prev) => ({
                                    ...prev,
                                    [sr.name]: !prev[sr.name],
                                  }))
                                }
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                                aria-expanded={expanded}
                              >
                                {expanded ? 'Hide' : 'Show'} {childCount} tests
                                <ChevronDown
                                  className={`h-3.5 w-3.5 transition-transform ${
                                    expanded ? 'rotate-180' : ''
                                  }`}
                                />
                              </button>
                            ) : null}
                          </div>

                          {canExpand && expanded ? (
                            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                              {labGroups.map((group) => (
                                <div
                                  key={group.template}
                                  className="overflow-hidden rounded-lg border border-emerald-100 bg-emerald-50/40"
                                >
                                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                                    <span className="text-xs font-semibold text-emerald-900">
                                      {group.label}
                                    </span>
                                    <span className="text-[11px] font-medium text-emerald-700">
                                      {group.children.length} tests
                                    </span>
                                  </div>
                                  <ul className="divide-y divide-emerald-100 border-t border-emerald-100 bg-white">
                                    {group.children.map((child) => (
                                      <li
                                        key={child.template}
                                        className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                                      >
                                        <span className="font-medium text-slate-800">
                                          {child.label}
                                        </span>
                                        <span className="shrink-0 text-slate-400">
                                          {child.template}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : null}

              {ipServices.length > 0 ? (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">Other Services</h3>
                  <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
                    {ipServices.map((svc) => (
                      <li key={svc.name} className="px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-900">{svc.name}</p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {[svc.category, svc.patient_full_name].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          {svc.total_amount != null ? (
                            <span className="text-sm font-medium text-slate-700">{svc.total_amount}</span>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

      {activeTab === 'prescriptions' && (
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-md font-semibold text-slate-800">Prescriptions</h3>
            {canEdit ? (
              <button
                type="button"
                onClick={() => setShowPrescriptionModal(true)}
                className="flex items-center gap-1 rounded-md border border-primary px-3 py-1.5 text-sm text-primary transition-colors hover:bg-primary/5"
              >
                <Plus className="h-4 w-4" />
                Create Prescription
              </button>
            ) : null}
          </div>
          {loadingPrescriptions ? (
            <LoadingSpinner message="Loading prescriptions..." />
          ) : prescriptions.length === 0 ? (
            <EmptyState icon={Pill} message="No prescriptions for this visit" />
          ) : (
            <div className="space-y-3">
              {prescriptions.map((order) => (
                <div key={order.name} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-primary">{order.name}</p>
                      <p className="text-xs text-slate-500">
                        {[
                          order.posting_date ? formatDate(order.posting_date) : null,
                          order.healthcare_practitioner_name || order.practitioner,
                          order.status,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <span className="text-xs text-slate-500">
                      {(order.medication_orders || []).length} medication(s)
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {(order.medication_orders || []).map((med, idx) => (
                      <li
                        key={`${order.name}-${med.name || idx}`}
                        className="rounded-md border border-slate-200 bg-white px-3 py-2"
                      >
                        <p className="font-medium text-slate-900">
                          {displayMedicationDrugName(med) || med.drug_name || 'Medication'}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-600">
                          {[
                            displayMedicationDosage(med),
                            displayMedicationFrequency(med),
                          ]
                            .filter((v) => v && v !== '-')
                            .join(' · ')}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'notes' && (
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-md font-semibold text-slate-800">Clinical Notes</h3>
            {canEdit ? (
              <button
                type="button"
                onClick={() => setShowProgressNoteModal(true)}
                className="flex items-center gap-1 rounded-md border border-primary px-3 py-1.5 text-sm text-primary transition-colors hover:bg-primary/5"
              >
                <Plus className="h-4 w-4" />
                Add Progress Note
              </button>
            ) : null}
          </div>
          {loadingNotes ? (
            <LoadingSpinner message="Loading notes..." />
          ) : notes.length === 0 ? (
            <EmptyState icon={NotebookPen} message="No clinical notes for this visit" />
          ) : (
            <ul className="space-y-3">
              {notes.map((note) => (
                <li key={note.name} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {note.clinical_note_type_name ||
                        (note.clinical_note_type === 'Doctor Progress Note'
                          ? 'Patient Progress Note'
                          : note.clinical_note_type) ||
                        'Clinical Note'}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatDateTime(note.posting_date)}
                    </p>
                  </div>
                  <p className="whitespace-pre-wrap text-slate-800">
                    {note.note ? htmlToPlainText(note.note) : '—'}
                  </p>
                  {(note.practitioner_name || note.practitioner) && (
                    <p className="mt-2 text-xs text-slate-500">
                      Dr: {note.practitioner_name || note.practitioner}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="space-y-3">
          {!hasDocuments ? (
            <EmptyState icon={FileText} message="No documents for this visit" />
          ) : (
            visit.documents!.map((doc) => (
              <div
                key={doc.name || `${doc.document}-${doc.file_name}`}
                className="rounded-md border border-slate-200 bg-white px-3 py-3"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-800">
                      {doc.file_name ||
                        (doc as { document_name?: string }).document_name ||
                        doc.document ||
                        'Document'}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                      {doc.document_type ? <span>Type: {doc.document_type}</span> : null}
                      {doc.transaction_no ? <span>Txn: {doc.transaction_no}</span> : null}
                    </div>
                    {doc.upload_remarks ? (
                      <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                        {doc.upload_remarks}
                      </div>
                    ) : null}
                  </div>
                </div>
                {doc.document ? (
                  <PatientDocumentAttachmentPreview url={doc.document} fileName={doc.file_name} compact />
                ) : null}
              </div>
            ))
          )}
        </div>
      )}

      {showCancelModal && visit ? (
        <CancelVisitModal
          visitName={visit.name}
          onClose={() => setShowCancelModal(false)}
          onConfirm={handleCancelVisitConfirm}
          loading={cancelLoading}
        />
      ) : null}

      {showAdmissionModal && visit ? (
        <CreateAdmissionModal
          patientName={visit.patient}
          encounterName={visit.name}
          onClose={() => setShowAdmissionModal(false)}
          onSuccess={() => {
            setShowAdmissionModal(false)
            loadVisit()
            onUpdate?.()
          }}
        />
      ) : null}

      {showVitalSignModal && visit ? (
        <CreateVitalSignModal
          initialPatient={visit.patient}
          onClose={() => setShowVitalSignModal(false)}
          onSuccess={() => setShowVitalSignModal(false)}
        />
      ) : null}

      {showObservationModal && visit ? (
        <CreateObservationModal
          initialPatient={visit.patient}
          onClose={() => setShowObservationModal(false)}
          onSuccess={() => setShowObservationModal(false)}
        />
      ) : null}

      {showEditModal && visit ? (
        <EditPatientVisitModal
          visitName={visit.name}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false)
            loadVisit()
            onUpdate?.()
          }}
        />
      ) : null}

      {showDiagnosisModal && visit ? (
        <PatientDiagnosisModal
          parentDoctype="Patient Visit"
          parentName={visit.name}
          patient={visit.patient}
          patientName={visit.patient_name}
          mode="manage"
          onClose={() => setShowDiagnosisModal(false)}
          onSuccess={() => {
            setShowDiagnosisModal(false)
            void reloadDiagnoses()
            onUpdate?.()
          }}
        />
      ) : null}

      {showPrescriptionModal && visit ? (
        <CreatePrescriptionModal
          initialPatient={visit.patient}
          initialCareContext="Patient Visit"
          initialPatientEncounter={visit.name}
          initialPractitioner={visit.practitioner}
          onClose={() => setShowPrescriptionModal(false)}
          onSuccess={() => {
            setShowPrescriptionModal(false)
            void reloadPrescriptions()
            onUpdate?.()
          }}
        />
      ) : null}

      {showProgressNoteModal && visit ? (
        <CreateClinicalNoteModal
          initialPatient={visit.patient}
          defaultVisit={visit.name}
          forcedMode="OP"
          defaultClinicalNoteType="Doctor Progress Note"
          title="Add Patient Progress Note"
          onClose={() => setShowProgressNoteModal(false)}
          onSuccess={() => {
            setShowProgressNoteModal(false)
            void reloadNotes()
            onUpdate?.()
          }}
        />
      ) : null}

      {showLabRequestModal && visit ? (
        <CreateServiceRequestModal
          initialPatient={visit.patient}
          labTestTemplateOnly
          forcedMode="OP"
          initialPatientVisit={visit.name}
          onClose={() => setShowLabRequestModal(false)}
          onSuccess={() => {
            setShowLabRequestModal(false)
            void reloadLabTests()
            void reloadServices()
            onUpdate?.()
          }}
        />
      ) : null}
    </div>
  )
}
