import { useState, useEffect, useLayoutEffect } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useCareContext } from '../providers/CareContextProvider'
import { isNurseScreenBlocked } from '../config/costCenterCareScope'
import { DashboardCard } from '../components/ui/DashboardCard'
import { PatientCareHeader } from '../components/patients/PatientCareHeader'
import { WarningMessagesList } from '../components/warnings/WarningMessagesList'
import { LabTestList } from '../components/labTests/LabTestList'
import { ECTDashboard } from '../components/ect/ECTDashboard'
import { ClinicalNotesList } from '../components/clinicalNotes/ClinicalNotesList'
import { ObservationList } from '../components/observations/ObservationList'
import { VitalSignsList } from '../components/vitalSigns/VitalSignsList'
import { CreateObservationModal } from '../components/observations/CreateObservationModal'
import { CreateVitalSignModal } from '../components/vitalSigns/CreateVitalSignModal'
import { DischargeList } from '../components/discharges/DischargeList'
import { DischargeAdmissionView } from '../components/admissions/DischargeAdmissionView'
import { PackageDetailView } from '../components/packageDetails/PackageDetailView'
import { NursingTaskList } from '../components/nursing/NursingTaskList'
import { NurseTaskList } from '../components/nurseTask/NurseTaskList'
import { CreateNurseTaskModal } from '../components/nurseTask/CreateNurseTaskModal'
import { PatientSummaryCard } from '../components/patients/PatientSummaryCard'
import { CreateClinicalNoteModal } from '../components/clinicalNotes/CreateClinicalNoteModal'
import { MainNursingNoteList } from '../components/nursing/MainNursingNoteList'
import { CreateMainNursingNoteModal } from '../components/nursing/CreateMainNursingNoteModal'
import { DoctorOrderList } from '../components/doctorOrder/DoctorOrderList'
import { getPatientActiveAdmission } from '../services/inpatientRecords'
import { hasAnyDischargeDraft } from '../services/dischargeDraft'
import { navigateToDischarge } from '../utils/dischargeNavigation'
import {
  inpatientDischargeAllowed,
  isInpatientDischargeRoute,
  modeForInpatientDischargeScreens,
  NURSE_DISCHARGE_SCREEN_ID,
} from '../utils/inpatientDischargeRoute'
import { toast } from '../hooks/useToast'
import { CreateWarningMessageModal } from '../components/warnings/CreateWarningMessageModal'
import { CreateLabTestModal } from '../components/labTests/CreateLabTestModal'
import { CreateDoctorServiceModal } from '../components/services/CreateDoctorServiceModal'
import { AdmissionPage } from './Admission'
import { ServiceRequestList } from '../components/serviceRequests/ServiceRequestList'
import { CreateServiceRequestModal } from '../components/serviceRequests/CreateServiceRequestModal'
import { IPServiceList } from '../components/ipServices/IPServiceList'
import { CreateIPServiceModal } from '../components/ipServices/CreateIPServiceModal'
import { PrescriptionList } from '../components/prescriptions/PrescriptionList'
import { CreateMedicineGivenModal } from '../components/medication/CreateMedicineGivenModal'
import { MedicineGivenList } from '../components/medication/MedicineGivenList'
import { DailyMedicationChart } from '../components/medication/DailyMedicationChart'
import { MedicationSheet } from '../components/medication/MedicationSheet'
import { LongActingMedicineList } from '../components/medication/LongActingMedicineList'
import { ReceptionLongActingMedicineList } from '../components/medication/ReceptionLongActingMedicineList'
import { reconcileDischargeMedicines } from '../services/medicineGiven'
import { Loader2, PackageSearch, Plus } from 'lucide-react'
import { AppointmentList } from '../components/appointments/AppointmentList'
import { EnvironmentalChecklistList } from '../components/environmental/EnvironmentalChecklistList'
import { MorseFallScaleList } from '../components/morse/MorseFallScaleList'
import { SleepingPatternList } from '../components/sleeping/SleepingPatternList'
import { CreateSleepingPatternModal } from '../components/sleeping/CreateSleepingPatternModal'
import { PatientHistoryList } from '../components/patientHistory/PatientHistoryList'
import { PatientHistoryModal } from '../components/patientHistory/PatientHistoryModal'
import { IOPDayListWithHeader } from '../components/iop/IOPDayList'
import { IOPEnrollmentListWithHeader } from '../components/iop/IOPEnrollmentList'
import { PatientVisitList } from '../components/patientVisits/PatientVisitList'
import { type PatientVisitListRow } from '../services/patientVisits'
import { useIpDoctorRequirements } from '../hooks/useIpDoctorRequirements'
import { AdmissionList } from '../components/admissions/AdmissionList'
import { CreatePatientModal } from '../components/patients/CreatePatientModal'

import { PatientVisitPage } from './PatientVisit'
import { GroomingChartList } from '../components/nursing/GroomingChartList'
import { CreateGroomingChartModal } from '../components/nursing/CreateGroomingChartModal'
import { PatientAssessmentList } from '../components/patientAssessment/PatientAssessmentList'
import { CreatePatientAssessmentModal } from '../components/patientAssessment/CreatePatientAssessmentModal'
import { MentalStateList } from '../components/nursing/MentalStateList'
import { CreateMentalStateModal } from '../components/nursing/CreateMentalStateModal'
import { SickLeaveList } from '../components/nursing/SickLeaveList'
import { CreateSickLeaveModal } from '../components/nursing/CreateSickLeaveModal'
import { SessionScheduleList } from '../components/sessionSchedule/SessionScheduleList'
import { CreateSessionScheduleModal } from '../components/sessionSchedule/CreateSessionScheduleModal'
import { PatientList } from '../components/patients/PatientList'
import { RxPage } from '../components/prescriptions/SinglePrescription'
import { NursingInventoryDashboard } from '../components/nursingInventory/NursingInventoryDashboard'
import { PortalTopBar } from '../components/layout/PortalTopBar'

/** Icon-only toolbar buttons for Given Medicines (native `title` = hover tooltip) */
const gmIconBtn =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
const gmIconBtnPrimary =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-primary text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'

export const NursePage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const {
    mode,
    selectedPatient: globalPatient,
    setSelectedPatient: setGlobalPatient,
    activeAdmission,
    activeVisit,
    costCenterCareScope,
    guardClinicalCreate,
    setMode,
    setActiveVisit,
    setActiveAdmission,
  } = useCareContext()
  const patientFromUrl = searchParams.get('patient')
  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(() => patientFromUrl || globalPatient || undefined)
  const [showWarningModal, setShowWarningModal] = useState(false)
  const [showLabTestModal, setShowLabTestModal] = useState(false)
  const [showObservationModal, setShowObservationModal] = useState(false)
    const [showNursingNoteModal, setShowNursingNoteModal] = useState(false)
  const [showServiceModal, setShowServiceModal] = useState(false)
  const [warningRefreshKey, setWarningRefreshKey] = useState(0)
  const [labTestRefreshKey, setLabTestRefreshKey] = useState(0)
  const [observationRefreshKey, setObservationRefreshKey] = useState(0)
  const [dischargeRefreshKey, setDischargeRefreshKey] = useState(0)
  const [dischargeHasDraft, setDischargeHasDraft] = useState(false)
  const [draftAdmissionNo, setDraftAdmissionNo] = useState<string | null>(null)
  const [clinicalNotesRefreshKey, setClinicalNotesRefreshKey] = useState(0)
  const [vitalSignsRefreshKey, setVitalSignsRefreshKey] = useState(0)
  const [showServiceRequestModal, setShowServiceRequestModal] = useState(false)
  const [serviceRequestRefreshKey, setServiceRequestRefreshKey] = useState(0)
  const [ipServiceRefreshKey, setIpServiceRefreshKey] = useState(0)
  const [showCreateIPServiceModal, setShowCreateIPServiceModal] = useState(false)
  const [createIPServicePreFill, setCreateIPServicePreFill] = useState<{ serviceRequest?: string; patient?: string } | null>(null)
  const [prescriptionRefreshKey] = useState(0)
  const [showPsychNoteModal, setShowPsychNoteModal] = useState(false)
  const [showPsychOrderModal, setShowPsychOrderModal] = useState(false)
  // Doctor notes are read-only on the nurse screen — no create modal state needed
  const [showNutritionNoteModal, setShowNutritionNoteModal] = useState(false)
  const [showTherapistNoteModal, setShowTherapistNoteModal] = useState(false)
  const [showVitalSignModal, setShowVitalSignModal] = useState(false)
  const [showSleepingPatternModal, setShowSleepingPatternModal] = useState(false)
  const [sleepingPatternRefreshKey, setSleepingPatternRefreshKey] = useState(0)
  const [showGivenMedicineModal, setShowGivenMedicineModal] = useState(false)
    const [showCreatePatientModal , setShowCreatePatientModal] = useState(false)
  const [givenRefreshKey, setGivenRefreshKey] = useState(0)
  const [reconcileLoading, setReconcileLoading] = useState(false)
  const [showBulkScheduleModal, setShowBulkScheduleModal] = useState(false)
  const [iopRefreshKey] = useState(0)
  const [showGroomingModal, setShowGroomingModal] = useState(false)
  const [groomingRefreshKey, setGroomingRefreshKey] = useState(0)
  const [showPatientAssessmentModal, setShowPatientAssessmentModal] = useState(false)
  const [patientAssessmentRefreshKey, setPatientAssessmentRefreshKey] = useState(0)
  const [showMentalStateModal, setShowMentalStateModal] = useState(false)
  const [mentalStateRefreshKey, setMentalStateRefreshKey] = useState(0)
  const [showSickLeaveModal, setShowSickLeaveModal] = useState(false)
  const [sickLeaveRefreshKey, setSickLeaveRefreshKey] = useState(0)
  const [showSessionScheduleModal, setShowSessionScheduleModal] = useState(false)
  const [sessionScheduleRefreshKey, setSessionScheduleRefreshKey] = useState(0)
    const [patientRefreshKey, setPatientRefreshKey] = useState(0)
  const [morseFallRefreshKey, setMorseFallRefreshKey] = useState(0)

  // ECT dashboard state
  const [showCreateNurseTaskModal, setShowCreateNurseTaskModal] = useState(false)
  const [nurseTaskRefreshKey, setNurseTaskRefreshKey] = useState(0)
  const [showPatientHistoryModal, setShowPatientHistoryModal] = useState(false)
  const [patientHistoryRefreshKey, setPatientHistoryRefreshKey] = useState(0)

  const showIpRequiredDocs = Boolean(selectedPatient && mode === 'IP' && activeAdmission)
  const { status: ipDocStatus } = useIpDoctorRequirements(
    selectedPatient,
    activeAdmission,
    showIpRequiredDocs,
    `${morseFallRefreshKey}-${patientHistoryRefreshKey}`
  )

  const rawScreen = searchParams.get('screen')
  const dischargeAdmission = searchParams.get('discharge')
  const inDischargeRoute = isInpatientDischargeRoute(searchParams, [NURSE_DISCHARGE_SCREEN_ID])
  const modeForScreens = modeForInpatientDischargeScreens(mode, costCenterCareScope, inDischargeRoute)
  const screen =
    rawScreen && !isNurseScreenBlocked(rawScreen, costCenterCareScope, modeForScreens) ? rawScreen : null

  useLayoutEffect(() => {
    if (!inDischargeRoute || mode === 'IP' || costCenterCareScope === 'op_only') return
    setMode('IP')
  }, [inDischargeRoute, mode, costCenterCareScope, setMode])

  // Sync selectedPatient with URL on mount and when URL changes
  useEffect(() => {
    const patientParam = searchParams.get('patient')
    if (patientParam && patientParam !== selectedPatient) {
      setSelectedPatient(patientParam)
    } else if (!patientParam && selectedPatient) {
      // Only clear if URL doesn't have patient param
      // Don't clear if we're just initializing
    }
  }, [searchParams])

  useLayoutEffect(() => {
    if (dischargeAdmission) return
    if (!rawScreen || !isNurseScreenBlocked(rawScreen, costCenterCareScope, modeForScreens)) return
    const np = new URLSearchParams(searchParams)
    np.delete('screen')
    setSearchParams(np, { replace: true })
  }, [dischargeAdmission, rawScreen, costCenterCareScope, modeForScreens, searchParams, setSearchParams])

  const handlePatientSelect = (patient: string | undefined) => {
    setSelectedPatient(patient)
    setGlobalPatient(patient)
    const newSearchParams = new URLSearchParams(searchParams)
    if (patient) {
      newSearchParams.set('patient', patient)
    } else {
      newSearchParams.delete('patient')
    }
    setSearchParams(newSearchParams, { replace: true })
  }

  const handleVisitActivate = (visit: PatientVisitListRow) => {
    if (visit.patient) {
      handlePatientSelect(visit.patient)
    }
    setMode('OP')
    setActiveAdmission(undefined)
    setActiveVisit(visit.value)
    try {
      localStorage.setItem('patientSearch_activeMode', 'OP')
      localStorage.setItem('patientSearch_activeVisit', visit.value)
      localStorage.setItem(
        'patientSearch_activeVisitLabel',
        visit.label || `${visit.value} — ${visit.patient_name || visit.patient || ''}`
      )
      localStorage.removeItem('patientSearch_activeAdmission')
      localStorage.removeItem('patientSearch_activeAdmissionLabel')
    } catch {
      /* ignore storage errors */
    }
    const np = new URLSearchParams(searchParams)
    if (visit.patient) np.set('patient', visit.patient)
    np.delete('screen')
    setSearchParams(np, { replace: true })
  }

  useEffect(() => {
    const state = location.state as { dischargeCompleted?: boolean } | null
    if (!state?.dischargeCompleted) return
    setDischargeRefreshKey((k) => k + 1)
    navigate(`${location.pathname}?${searchParams.toString()}`, { replace: true, state: {} })
  }, [location.state, location.pathname, navigate, searchParams])

  const closeDischarge = () => {
    const state = location.state as { returnTo?: string } | null
    if (state?.returnTo) {
      navigate(state.returnTo, { replace: true })
      return
    }
    const np = new URLSearchParams(searchParams)
    np.delete('discharge')
    setSearchParams(np, { replace: true })
  }

  useEffect(() => {
    if (screen !== NURSE_DISCHARGE_SCREEN_ID || !selectedPatient) {
      setDischargeHasDraft(false)
      setDraftAdmissionNo(null)
      return
    }
    getPatientActiveAdmission(selectedPatient)
      .then(async (admission) => {
        if (admission && (await hasAnyDischargeDraft(admission.name))) {
          setDischargeHasDraft(true)
          setDraftAdmissionNo(admission.name)
        } else {
          setDischargeHasDraft(false)
          setDraftAdmissionNo(null)
        }
      })
      .catch(() => {
        setDischargeHasDraft(false)
        setDraftAdmissionNo(null)
      })
  }, [screen, selectedPatient, dischargeRefreshKey])

  const handleDischargeSuccess = () => {
    toast.success('Discharge completed successfully')
    const state = location.state as { returnTo?: string } | null
    if (state?.returnTo) {
      navigate(state.returnTo, { replace: true, state: { dischargeCompleted: true } })
      return
    }
    const np = new URLSearchParams(searchParams)
    np.delete('discharge')
    setSearchParams(np, { replace: true, state: { dischargeCompleted: true } })
  }

  if (dischargeAdmission && !inpatientDischargeAllowed(costCenterCareScope)) {
    return (
      <div className="flex flex-col p-6">
        <p className="text-sm text-slate-700">
          Inpatient discharge is not available for OP-only cost centers. Switch to a site that supports IP care or
          use the desk Discharge form.
        </p>
      </div>
    )
  }

  if (dischargeAdmission && inpatientDischargeAllowed(costCenterCareScope)) {
    const navState = location.state as { patient?: string; patient_name?: string } | null
    const patientForBar =
      selectedPatient || navState?.patient || searchParams.get('patient') || undefined
    return (
      <div className="flex flex-col h-[calc(100vh-2.25rem)] max-h-[calc(100vh-2.25rem)] overflow-hidden">
        <PortalTopBar selectedPatient={patientForBar || ''} onPatientSelect={handlePatientSelect} />
        <div className="flex-1 min-h-0 overflow-hidden bg-white">
          <DischargeAdmissionView
            admissionName={dischargeAdmission}
            patientHint={navState?.patient}
            patientNameHint={navState?.patient_name}
            onClose={closeDischarge}
            onSuccess={handleDischargeSuccess}
          />
        </div>
      </div>
    )
  }

  const handleReconcileGiven = async () => {
    if (!selectedPatient) {
      toast.error('Please select a patient first')
      return
    }
    try {
      setReconcileLoading(true)
      const admission = await getPatientActiveAdmission(selectedPatient)
      if (!admission) {
        toast.error('No active admission found for this patient')
        return
      }
      const res = await reconcileDischargeMedicines(admission.name)
      if (res.stock_entry) {
        toast.success(`Stock Entry ${res.stock_entry} created`)
        window.open(`/app/stock-entry/${encodeURIComponent(res.stock_entry)}`, '_blank')
      } else {
        toast.info('No remaining medicines to return')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reconcile medicines'
      toast.error(msg)
    } finally {
      setReconcileLoading(false)
    }
  }

  // Show Admission page when screen=n-reg or screen=admission — hidden in OP mode
  if (
    !dischargeAdmission &&
    (screen === 'n-reg' || screen === 'admission') &&
    modeForScreens !== 'OP'
  ) {
    return <AdmissionPage />
  }


    if (screen === 'n-inventory') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4">Inventory Dashboard</div>
            <NursingInventoryDashboard />
          </section>
        </div>
      </div>
    )
  }

  if (screen === 'single-prescription') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
  
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <RxPage readOnly />
          </section>
        </div>
      </div>
    )
  }


  // IP Warnings / Meds / Allergy – mirror Doctor warnings card
  if (screen === 'n-first') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
            <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
              <WarningMessagesList
                patient={selectedPatient}
                key={warningRefreshKey}
                onPatientClick={handlePatientSelect}
                onAdd={() => setShowWarningModal(true)}
              />
            </div>
          </section>
        </div>
        {showWarningModal && (
          <CreateWarningMessageModal
            onClose={() => setShowWarningModal(false)}
            onSuccess={() => {
              setWarningRefreshKey(prev => prev + 1)
              setShowWarningModal(false)
            }}
            initialPatient={selectedPatient}
          />
        )}
      </div>
    )
  }

  // Show ECT Details
  if (screen === 'n-ect') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <ECTDashboard selectedPatient={selectedPatient} />
        </div>
      </div>
    )
  }

  // IOP Dashboard – same as Reception and Doctor: IOP days and enrollments
  if (screen === 'n-iop') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">IOP Dashboard</h2>
              <p className="text-sm text-slate-600 mt-1">
                Intensive Outpatient: schedule IOP days (slots) and enroll patients. Create a Patient Visit from an
                enrollment to link the visit.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowBulkScheduleModal(true)}
              className="flex-shrink-0 px-4 py-2 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors whitespace-nowrap"
            >
              Bulk Schedule
            </button>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <IOPDayListWithHeader refreshKey={iopRefreshKey} />
            <IOPEnrollmentListWithHeader refreshKey={iopRefreshKey} patientFilter={selectedPatient} />
          </div>
        </div>
        {showBulkScheduleModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Bulk Schedule</h2>
                <button
                  onClick={() => setShowBulkScheduleModal(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-sm text-slate-500">Bulk Schedule modal coming soon.</p>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setShowBulkScheduleModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // My Nursing Tasks – tasks assigned to the logged-in nurse
  if (screen === 'n-my-tasks') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">My Nursing Tasks</h2>
                <p className="text-xs text-slate-600 mt-1">
                  Tasks assigned to you, ordered by requested time and status.
                </p>
              </div>
            </div>
            <NursingTaskList myTasks />
          </section>
        </div>
      </div>
    )
  }

  // Nurse Tasks (custom Nurse Task doctype) — role-aware: nurses see only their own tasks,
  // admins see all tasks for the selected patient (or all if no patient selected).
  if (screen === 'n-nurse-tasks') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <NurseTaskList
              patient={selectedPatient}
              refreshKey={nurseTaskRefreshKey}
              allowStatusChange
              onAdd={() => setShowCreateNurseTaskModal(true)}
              onRefresh={() => setNurseTaskRefreshKey((k) => k + 1)}
            />
          </section>
        </div>
        {showCreateNurseTaskModal && (
          <CreateNurseTaskModal
            patient={selectedPatient || undefined}
            onClose={() => setShowCreateNurseTaskModal(false)}
            onSuccess={() => {
              setShowCreateNurseTaskModal(false)
              setNurseTaskRefreshKey((k) => k + 1)
            }}
          />
        )}
      </div>
    )
  }

  // Lab Reports Status – show lab listings (Pending Review by default)
  if (screen === 'n-labs') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard title="Lab Reports Status">
            <LabTestList
              patient={selectedPatient}
              defaultStatus="Requested"
              byNurse={true}
              key={labTestRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
      </div>
    )
  }

  if (screen === 'rx') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4">All Prescriptions</div>
            <PrescriptionList
              patient={selectedPatient}
              refreshKey={prescriptionRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </section>
        </div>
      </div>
    )
  }

   if (screen === 'patients') {
      return (
        <div className="flex flex-col">
          <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
   
          <div className="p-4">
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <div className="font-semibold mb-4 flex items-center justify-between">
                <span>Patients</span>
                <button
                  onClick={() => setShowCreatePatientModal(true)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-white text-xs font-medium bg-primary hover:bg-primary/90 transition-colors"
                  title="Create new patient"
                >
                  + New Patient
                </button>
              </div>
   
              {/* <PatientList refreshKey={patientRefreshKey} /> */}
                          <PatientList refreshKey={patientRefreshKey} />
  
            </section>
          </div>
   
          {showCreatePatientModal && (
            <CreatePatientModal
              onClose={() => setShowCreatePatientModal(false)}
              onSuccess={(patientName) => {
                setShowCreatePatientModal(false)
                setPatientRefreshKey((prev) => prev + 1)
                toast.success(`Patient ${patientName} created successfully`)
              }}
            />
          )}
        </div>
      )
    }

  // Laboratory – same listing as doctor Laboratory
  if (screen === 'n-lab') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard title="Laboratory">
            <LabTestList
              patient={selectedPatient}
              defaultStatus="Requested"
              byNurse={true}
              key={labTestRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
      </div>
    )
  }

  // Show Doctors Notes (Clinical Note with Medical Role = Doctor, Clinical Note Type = Doctors Note)
  if (screen === 'n-doc-notes') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-1 flex items-center justify-between">
              <span>Doctors Notes</span>
              <span className="text-xs font-normal text-slate-400 italic">Read-only — only doctors can add notes</span>
            </div>
            <ClinicalNotesList 
              patient={selectedPatient} 
              clinicalNoteType="Doctors Note"
              key={clinicalNotesRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </section>
        </div>
      </div>
    )
  }

  // Show Doctors Order (Doctor Order doctype — nurse documents remarks / finished)
  if (screen === 'dos' || screen === 'n-doctor-order') {
    const orderAdmission = mode === 'IP' ? activeAdmission : undefined
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <DoctorOrderList
              patient={selectedPatient}
              admission={orderAdmission}
              nurseMode
              key={clinicalNotesRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </section>
        </div>
      </div>
    )
  }

  // Show Nursing Notes (Main Nursing Note doctype)
  if (screen === 'nurse' || screen === 'n-nurse-notes') {
    const noteAdmission = mode === 'IP' ? activeAdmission : undefined
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <MainNursingNoteList
              patient={selectedPatient}
              admission={noteAdmission}
              key={clinicalNotesRefreshKey}
              onPatientClick={handlePatientSelect}
              onAdd={() => guardClinicalCreate(() => setShowNursingNoteModal(true))}
            />
          </section>
        </div>
        {showNursingNoteModal && (
          <CreateMainNursingNoteModal
            onClose={() => setShowNursingNoteModal(false)}
            onSuccess={() => {
              setClinicalNotesRefreshKey((prev) => prev + 1)
              setShowNursingNoteModal(false)
            }}
            patient={selectedPatient}
          />
        )}
      </div>
    )
  }

  // Show Psychologist Notes (Clinical Note with Medical Role = Psychologists)
  if (screen === 'n-psy-notes') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <ClinicalNotesList
              patient={selectedPatient}
              clinicalNoteType="Psychologist Note"
              onPatientClick={handlePatientSelect}
              onAdd={() => setShowPsychNoteModal(true)}
              addButtonTitle="Add Psychologist Note"
            />
          </section>
        </div>
        {showPsychNoteModal && (
          <CreateClinicalNoteModal
            onClose={() => setShowPsychNoteModal(false)}
            onSuccess={() => {
              setShowPsychNoteModal(false)
            }}
            initialPatient={selectedPatient}
            defaultClinicalNoteType="Psychologist Note"
            title="Add Psychologist Note"
          />
        )}
      </div>
    )
  }

  // Show Nutritionist Notes (mirror Doctor Nutritionist Notes)
  if (screen === 'n-nut') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <ClinicalNotesList
              patient={selectedPatient}
              clinicalNoteType="Nutritionist Note"
              key={clinicalNotesRefreshKey}
              onPatientClick={handlePatientSelect}
              onAdd={() => setShowNutritionNoteModal(true)}
            />
          </section>
        </div>
        {showNutritionNoteModal && (
          <CreateClinicalNoteModal
            onClose={() => setShowNutritionNoteModal(false)}
            onSuccess={() => {
              setClinicalNotesRefreshKey(prev => prev + 1)
              setShowNutritionNoteModal(false)
            }}
            initialPatient={selectedPatient}
            defaultClinicalNoteType="Nutritionist Note"
            title="Add Nutritionist Note"
          />
        )}
      </div>
    )
  }

  // Show Psychologist Orders (Clinical Note with Medical Role = Psychologists, Note Type = Order)
  if (screen === 'n-psy-order') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <ClinicalNotesList
              patient={selectedPatient}
              clinicalNoteType="Psychologist Order"
              onPatientClick={handlePatientSelect}
              onAdd={() => setShowPsychOrderModal(true)}
            />
          </section>
        </div>
        {showPsychOrderModal && (
          <CreateClinicalNoteModal
            onClose={() => setShowPsychOrderModal(false)}
            onSuccess={() => {
              setShowPsychOrderModal(false)
            }}
            initialPatient={selectedPatient}
            defaultClinicalNoteType="Order"
            title="Add Psychologist Order"
          />
        )}
      </div>
    )
  }

  // Show Observation
  if (screen === 'n-ob') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Observation</span>
              <button
                onClick={() => setShowObservationModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Observation"
              >
                +
              </button>
            </div>
            <ObservationList patient={selectedPatient} key={observationRefreshKey} onPatientClick={handlePatientSelect} />
          </section>
        </div>
        {showObservationModal && (
          <CreateObservationModal
            onClose={() => setShowObservationModal(false)}
            onSuccess={() => {
              setObservationRefreshKey(prev => prev + 1)
              setShowObservationModal(false)
            }}
            initialPatient={selectedPatient}
          />
        )}
      </div>
    )
  }

  // Show Vital Signs
  if (screen === 'n-tpr') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <VitalSignsList
              patient={selectedPatient}
              refreshKey={vitalSignsRefreshKey}
              onPatientClick={handlePatientSelect}
              onAdd={() => setShowVitalSignModal(true)}
            />
          </section>
        </div>
        {showVitalSignModal && (
          <CreateVitalSignModal
            onClose={() => setShowVitalSignModal(false)}
            onSuccess={() => {
              setVitalSignsRefreshKey(prev => prev + 1)
              setShowVitalSignModal(false)
            }}
            initialPatient={selectedPatient}
          />
        )}
      </div>
    )
  }

  // Environmental Checklist
  if (screen === 'n-env') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <EnvironmentalChecklistList
              patient={selectedPatient}
              defaultAdmission={activeAdmission || undefined}
              defaultVisit={activeVisit || undefined}
            />
          </section>
        </div>
      </div>
    )
  }

  // Therapist Notes – mirror Doctor Therapist Notes
  if (screen === 'n-ther') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <ClinicalNotesList
              patient={selectedPatient}
              clinicalNoteType="Therapist Note"
              title="Therapist Note"
              key={clinicalNotesRefreshKey}
              onPatientClick={handlePatientSelect}
              onAdd={() => setShowTherapistNoteModal(true)}
            />
          </section>
        </div>
        {showTherapistNoteModal && (
          <CreateClinicalNoteModal
            onClose={() => setShowTherapistNoteModal(false)}
            onSuccess={() => {
              setClinicalNotesRefreshKey(prev => prev + 1)
              setShowTherapistNoteModal(false)
            }}
            initialPatient={selectedPatient}
            defaultClinicalNoteType="Therapist Note"
            title="Add Therapist Note"
          />
        )}
      </div>
    )
  }

  // Medication (Prescriptions)
  if (screen === 'n-med') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4">Medication (Prescriptions)</div>
            <PrescriptionList
              patient={selectedPatient}
              refreshKey={prescriptionRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </section>
        </div>
      </div>
    )
  }

  // Given Medicines – list administrations, not prescriptions — hidden in OP mode
  if (screen === 'n-given' && mode !== 'OP') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between gap-2">
              <span>Given Medicines</span>
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/90 p-1">
                <button
                  type="button"
                  onClick={handleReconcileGiven}
                  disabled={reconcileLoading}
                  className={`${gmIconBtn} text-emerald-800 border-emerald-200/80 hover:bg-emerald-50`}
                  title="Reconcile for discharge — create stock entry for remaining medicines to return"
                >
                  {reconcileLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <PackageSearch className="h-4 w-4" aria-hidden />
                  )}
                  <span className="sr-only">Reconcile for discharge</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowGivenMedicineModal(true)}
                  className={gmIconBtnPrimary}
                  title="Record given medicine"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                  <span className="sr-only">Add given medicine</span>
                </button>
              </div>
            </div>
            <MedicineGivenList patient={selectedPatient} refreshKey={givenRefreshKey} />
          </section>
        </div>
        {showGivenMedicineModal && (
          <CreateMedicineGivenModal
            initialPatient={selectedPatient}
            inpatientRecord={activeAdmission}
            onClose={() => setShowGivenMedicineModal(false)}
            onSuccess={() => {
              setGivenRefreshKey(prev => prev + 1)
              setShowGivenMedicineModal(false)
            }}
          />
        )}
      </div>
    )
  }

  // Daily Medication Chart – schedule by session for the day
  if (screen === 'n-daily-med') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <DailyMedicationChart patient={selectedPatient} admission={activeAdmission} />
          </section>
        </div>
      </div>
    )
  }

  // Medication Sheet – list administrations with date range filters
  if (screen === 'n-med-sheet') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <MedicationSheet patient={selectedPatient} admission={activeAdmission} />
          </section>
        </div>
      </div>
    )
  }

  // Long Acting Med Reminder – same listing as doctor (filters, color coding, detail panel)
  if (screen === 'n-reminder') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <p className="text-sm text-slate-600 mb-4">
            View long acting medicines for the selected patient. Filter by start date and frequency. Click a row for details.
          </p>
          <DashboardCard title="Long Acting Med Reminder" noHeightLimit>
            <ReceptionLongActingMedicineList
              patient={selectedPatient || undefined}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
      </div>
    )
  }

  // Other Services / Referral Services - Service Requests list
  // IP Services page: two cards – Service Request (left), IP Service (right)
  if (screen === 'n-ip-services') {
    return (
      <div className="flex min-h-full flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4 flex-1 min-h-0 flex flex-col">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0 flex-1">
            {/* Left card: Service Request – request a service (e.g. Transport) */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[420px] overflow-hidden min-w-0">
              <ServiceRequestList
                patient={selectedPatient}
                refreshKey={serviceRequestRefreshKey}
                template_dt="Healthcare Service Template"
                isNurseContext={true}
                onPatientClick={handlePatientSelect}
                title="Service Request"
                subtitle="Request a hospital service (e.g. transport with nurse, transport only). Turn a request into an IP Service from the right card."
                onAdd={() => setShowServiceRequestModal(true)}
                addButtonTitle="New service request (Healthcare Service Template)"
                onCreateIPService={(sr) => {
                  setCreateIPServicePreFill({ serviceRequest: sr.name, patient: sr.patient })
                  setShowCreateIPServiceModal(true)
                }}
              />
            </section>
            {/* Right card: IP Service – fulfill / create service (with or without a request) */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[420px] overflow-hidden min-w-0">
              <div className="font-semibold mb-2 flex items-center justify-between flex-shrink-0">
                <span>IP Service</span>
                <button
                  onClick={() => setShowCreateIPServiceModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                  title="New IP Service (with or without a request)"
                >
                  +
                </button>
              </div>
              <p className="text-sm text-slate-600 mb-3 flex-shrink-0">
                Fulfill a service request or create an IP Service directly (admission, services, totals). Link to a Service Request optional.
              </p>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <IPServiceList
                  patient={selectedPatient}
                  refreshKey={ipServiceRefreshKey}
                />
              </div>
            </section>
          </div>
        </div>
        {showServiceRequestModal && (
          <CreateServiceRequestModal
            onClose={() => setShowServiceRequestModal(false)}
            onSuccess={() => {
              setServiceRequestRefreshKey((prev) => prev + 1)
              setShowServiceRequestModal(false)
            }}
            initialPatient={selectedPatient}
            initialTemplate='Healthcare Service Template'
          />
        )}
        {showCreateIPServiceModal && (
          <CreateIPServiceModal
            onClose={() => {
              setShowCreateIPServiceModal(false)
              setCreateIPServicePreFill(null)
            }}
            onSuccess={() => {
              setIpServiceRefreshKey((prev) => prev + 1)
              setShowCreateIPServiceModal(false)
              setCreateIPServicePreFill(null)
            }}
            initialPatient={createIPServicePreFill?.patient ?? selectedPatient}
            initialServiceRequest={createIPServicePreFill?.serviceRequest}
            prefillFromServiceRequest={!!createIPServicePreFill?.serviceRequest}
            openInNewTab={false}
          />
        )}
      </div>
    )
  }

  if (screen === 'n-other' || screen === 'n-ref') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard title={screen === 'n-ref' ? 'Referral Services' : 'Other Services'} onAdd={() => guardClinicalCreate(() => setShowServiceRequestModal(true))} addButtonTitle="Add Service Request">
            <ServiceRequestList patient={selectedPatient} refreshKey={serviceRequestRefreshKey} onPatientClick={handlePatientSelect} />
          </DashboardCard>
        </div>
        {showServiceRequestModal && (
          <CreateServiceRequestModal
            onClose={() => setShowServiceRequestModal(false)}
            onSuccess={() => {
              setServiceRequestRefreshKey(prev => prev + 1)
              setShowServiceRequestModal(false)
            }}
            initialPatient={selectedPatient}
             initialTemplate="Healthcare Service Template" 
          />
        )}
      </div>
    )
  }

  // Sessions / Scheduler - Appointments & Session Schedules
  if (screen === 'n-session') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4 space-y-4">
          {/* Appointments Section */}
          <DashboardCard fixedHeight title="Appointments" listingScreen="n-session">
            <AppointmentList patient={selectedPatient} onPatientClick={handlePatientSelect} />
          </DashboardCard>

          {/* Session Schedules Section */}
          <DashboardCard title="Session Schedules" onAdd={() => guardClinicalCreate(() => setShowSessionScheduleModal(true))} addButtonTitle="Add Session Schedule">
            <SessionScheduleList 
              patient={selectedPatient}
              admissionNumber={activeAdmission}
              refreshKey={sessionScheduleRefreshKey}
            />
          </DashboardCard>
        </div>

        {showSessionScheduleModal && (
          <CreateSessionScheduleModal
            onClose={() => setShowSessionScheduleModal(false)}
            onSuccess={() => {
              setSessionScheduleRefreshKey(prev => prev + 1)
              setShowSessionScheduleModal(false)
            }}
            // initialPatient={selectedPatient}
            initialAdmission={activeAdmission}
          />
        )}
      </div>
    )
  }

  // Morse Fall Scale
  if (screen === 'n-fall') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard
            title="Morse Fall Scale"
            listingScreen="n-fall"
            requiresAttention={showIpRequiredDocs && ipDocStatus !== null && !ipDocStatus.morse_fall_scale}
            attentionLabel="Required for this IP admission — complete Morse Fall Scale"
          >
            <MorseFallScaleList
              patient={selectedPatient}
              refreshKey={morseFallRefreshKey}
              onPatientClick={handlePatientSelect}
              defaultAdmission={activeAdmission || undefined}
              onRecordCreated={() => setMorseFallRefreshKey((k) => k + 1)}
            />
          </DashboardCard>
        </div>
      </div>
    )
  }

  // Sleeping Pattern
  if (screen === 'n-sleep') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <SleepingPatternList
              patient={selectedPatient}
              refreshKey={sleepingPatternRefreshKey}
              onAdd={() => setShowSleepingPatternModal(true)}
            />
          </section>
        </div>
        {showSleepingPatternModal && (
          <CreateSleepingPatternModal
            onClose={() => setShowSleepingPatternModal(false)}
            onSuccess={() => {
              setSleepingPatternRefreshKey(prev => prev + 1)
              setShowSleepingPatternModal(false)
            }}
            initialPatient={selectedPatient}
          />
        )}
      </div>
    )
  }

  if (screen === 'n-patient-history') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Patient History</span>
              <button
                onClick={() => setShowPatientHistoryModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="New Patient History"
              >
                +
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-3">
              Structured patient history records with template-driven attribute items and detailed descriptions.
            </p>
            <PatientHistoryList
              patient={selectedPatient}
              refreshKey={patientHistoryRefreshKey}
            />
          </section>
        </div>
        {showPatientHistoryModal && (
          <PatientHistoryModal
            admissionNo=""
            patient={selectedPatient}
            patientName=""
            onClose={() => setShowPatientHistoryModal(false)}
            onSuccess={() => {
              setPatientHistoryRefreshKey(prev => prev + 1)
              setShowPatientHistoryModal(false)
            }}
          />
        )}
      </div>
    )
  }

  // Show Discharge Form (list of discharges with + button) — hidden in OP mode
  if (screen === NURSE_DISCHARGE_SCREEN_ID && modeForScreens !== 'OP') {
    const handleOpenDischarge = async () => {
      if (!selectedPatient) {
        toast.error('Please select a patient first')
        return
      }

      try {
        const admission = await getPatientActiveAdmission(selectedPatient)
        if (!admission) {
          toast.error('No active admission found for this patient')
          return
        }

        const hasDraft = await hasAnyDischargeDraft(admission.name)
        setDischargeHasDraft(hasDraft)
        setDraftAdmissionNo(admission.name)

        navigateToDischarge(
          {
            name: admission.name,
            patient: admission.patient,
            patient_name: admission.patient_name,
          },
          navigate,
          `/nurse?${searchParams.toString()}`
        )
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch admission'
        toast.error(errorMessage)
      }
    }

    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard
            title="Discharge Form / Procedure"
            onAdd={handleOpenDischarge}
            addButtonTitle={dischargeHasDraft ? 'Continue discharge' : 'Start discharge'}
          >
            {dischargeHasDraft && draftAdmissionNo && (
              <div className="mb-2 text-xs text-amber-700">
                Draft on server — open from the list ⋮ menu or use + to continue
              </div>
            )}
            <DischargeList patient={selectedPatient} key={dischargeRefreshKey} onPatientClick={handlePatientSelect} />
          </DashboardCard>
        </div>
      </div>
    )
  }

  // Show Package Details – dashboard: available packages, active admission, assigned package (from Quotation) — hidden in OP mode
  if (screen === 'n-package' && mode !== 'OP') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4">Package Detail</div>
            <PackageDetailView patient={selectedPatient} />
          </section>
        </div>
      </div>
    )
  }

  // Sick Leave
  if (screen === 'n-sick') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <SickLeaveList
              patient={selectedPatient}
              refreshKey={sickLeaveRefreshKey}
              onAdd={() => setShowSickLeaveModal(true)}
            />
          </section>
        </div>
        {showSickLeaveModal && (
          <CreateSickLeaveModal
            patient={selectedPatient}
            onClose={() => setShowSickLeaveModal(false)}
            onSuccess={() => {
              setShowSickLeaveModal(false)
              setSickLeaveRefreshKey((prev) => prev + 1)
              toast.success('Sick leave saved')
            }}
          />
        )}
      </div>
    )
  }

  // Mental Status
  if (screen === 'n-mental') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <MentalStateList
              patient={selectedPatient}
              refreshKey={mentalStateRefreshKey}
              onAdd={() => setShowMentalStateModal(true)}
            />
          </section>
        </div>
        {showMentalStateModal && (
          <CreateMentalStateModal
            patient={selectedPatient}
            onClose={() => setShowMentalStateModal(false)}
            onSuccess={() => {
              setShowMentalStateModal(false)
              setMentalStateRefreshKey((prev) => prev + 1)
              toast.success('Mental state record saved')
            }}
          />
        )}
      </div>
    )
  }

  // Grooming Chart
  if (screen === 'n-grooming' || screen === 'n-groom') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <GroomingChartList
              patient={selectedPatient}
              refreshKey={groomingRefreshKey}
              onAdd={() => setShowGroomingModal(true)}
            />
          </section>
        </div>
        {showGroomingModal && (
          <CreateGroomingChartModal
            patient={selectedPatient}
            onClose={() => setShowGroomingModal(false)}
            onSuccess={() => {
              setShowGroomingModal(false)
              setGroomingRefreshKey((prev) => prev + 1)
              toast.success('Grooming chart saved')
            }}
          />
        )}
      </div>
    )
  }

  // Patient Assessment
  if (screen === 'n-assess') {
    return (
      <div className="flex flex-col">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <PatientAssessmentList
              patient={selectedPatient}
              refreshKey={patientAssessmentRefreshKey}
              onAdd={() => setShowPatientAssessmentModal(true)}
            />
          </section>
        </div>
        {showPatientAssessmentModal && (
          <CreatePatientAssessmentModal
            patient={selectedPatient}
            onClose={() => setShowPatientAssessmentModal(false)}
            onSuccess={() => {
              setShowPatientAssessmentModal(false)
              setPatientAssessmentRefreshKey((prev) => prev + 1)
            }}
          />
        )}
      </div>
    )
  }

  // OP Visit Note – reuse Patient Visit page
  if (screen === 'n-op') {
    return <PatientVisitPage />
  }

  return (
    <div className="flex min-h-full flex-col">
      <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />

      {/* OP / IP mode: list at top — hides once a patient is selected */}
      {((mode === 'OP') || (costCenterCareScope !== 'op_only' && mode === 'IP')) &&
      !selectedPatient ? (
        <div className={`px-4 pt-4 pb-0 ${mode === 'IP' ? 'grid gap-4 md:grid-cols-2 auto-rows-fr' : ''}`}>
          {mode === 'OP' ? (
            <DashboardCard
              title="Patient Visits (OP)"
              fixedHeight
              listingScreen="n-op"
            >
              <PatientVisitList
                patient={selectedPatient || undefined}
                onPatientFromVisit={(p) => {
                  setSelectedPatient(p)
                  const sp = new URLSearchParams(searchParams)
                  sp.set('patient', p)
                  setSearchParams(sp, { replace: true })
                }}
                onVisitActivate={handleVisitActivate}
              />
            </DashboardCard>
          ) : (
            <>
              <DashboardCard
                title="Inpatient Admissions (IP)"
                fixedHeight
                listingScreen="n-reg"
              >
                <AdmissionList
                  patient={selectedPatient || undefined}
                  onPatientFromAdmission={(p) => {
                    setSelectedPatient(p)
                    const sp = new URLSearchParams(searchParams)
                    sp.set('patient', p)
                    setSearchParams(sp, { replace: true })
                  }}
                />
              </DashboardCard>
              <DashboardCard fixedHeight title="Patient Visits" listingScreen="n-op">
                <PatientVisitList
                  onPatientFromVisit={(p) => {
                    setSelectedPatient(p)
                    const sp = new URLSearchParams(searchParams)
                    sp.set('patient', p)
                    setSearchParams(sp, { replace: true })
                  }}
                  onVisitActivate={handleVisitActivate}
                />
              </DashboardCard>
            </>
          )}
        </div>
      ) : null}

      {selectedPatient ? (
        <>
          {/* Row 1: Given Medicines + Long Acting Med Reminder — hidden when OP mode or OP-only cost center */}
          <div
            className={`grid gap-4 p-4 auto-rows-fr ${(costCenterCareScope === 'op_only' || mode === 'OP') ? 'md:grid-cols-1' : 'md:grid-cols-2'}`}
          >
            {costCenterCareScope !== 'op_only' && mode !== 'OP' && (
              <DashboardCard
                fixedHeight
                title="Given Medicines"
                listingScreen="n-given"
                openListingTitle="Open full Given Medicines list"
                filterable={false}
                headerExtra={
                  <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/90 p-1">
                    <button
                      type="button"
                      onClick={handleReconcileGiven}
                      disabled={reconcileLoading}
                      className={`${gmIconBtn} text-emerald-800 border-emerald-200/80 hover:bg-emerald-50`}
                      title="Reconcile for discharge — create stock entry for remaining medicines to return"
                    >
                      {reconcileLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <PackageSearch className="h-4 w-4" aria-hidden />
                      )}
                      <span className="sr-only">Reconcile for discharge</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowGivenMedicineModal(true)}
                      className={gmIconBtnPrimary}
                      title="Record given medicine"
                    >
                      <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                      <span className="sr-only">Add given medicine</span>
                    </button>
                  </div>
                }
              >
                <MedicineGivenList patient={selectedPatient} refreshKey={givenRefreshKey} />
              </DashboardCard>
            )}

            <DashboardCard
              fixedHeight
              title="Long Acting Med Reminder"
              listingScreen="n-reminder"
              openListingTitle="Open full Long Acting Med Reminder list"
            >
              <LongActingMedicineList
                patient={selectedPatient}
                onPatientClick={handlePatientSelect}
              />
            </DashboardCard>
          </div>

          {/* Row 2: Lab Test Reports + Service Requests */}
          <div className="grid gap-4 md:grid-cols-2 auto-rows-fr px-4 pb-4">
            {/* Lab Test Reports */}
            <DashboardCard title="Lab Test" fixedHeight listingScreen="n-lab">
              <LabTestList patient={selectedPatient} byNurse={true} key={labTestRefreshKey} onPatientClick={handlePatientSelect} />
            </DashboardCard>

            {/* Service Requests */}
            <DashboardCard
              title="Service Requests"
              fixedHeight
              onAdd={() => guardClinicalCreate(() => setShowServiceRequestModal(true))}
              addButtonTitle="Add Service Request"
              listingScreen="n-ip-services"
            >
              <ServiceRequestList
                patient={selectedPatient}
                refreshKey={serviceRequestRefreshKey}
                isNurseContext={true}
                onPatientClick={handlePatientSelect}
              />
            </DashboardCard>
          </div>

          {/* Row 3: Prescription + Doctors Notes — OP-only sites omit inpatient-style prescription grid */}
          <div
            className={`grid gap-4 auto-rows-fr px-4 pb-4 ${costCenterCareScope === 'op_only' ? 'md:grid-cols-1' : 'md:grid-cols-2'}`}
          >
            {costCenterCareScope !== 'op_only' && (
              <DashboardCard
                fixedHeight
                title="Prescription"
                listingScreen="rx"
                openListingTitle="Open full Prescription list"
              >
                <PrescriptionList
                  patient={selectedPatient}
                  refreshKey={prescriptionRefreshKey}
                  onPatientClick={handlePatientSelect}
                />
              </DashboardCard>
            )}

            <DashboardCard
              fixedHeight
              title="Doctors Notes"
              titleAddon={
                <span className="text-xs font-normal text-slate-400 italic shrink-0">Read-only</span>
              }
              listingScreen="n-doc-notes"
              openListingTitle="Open full Doctors Notes list"
            >
              <ClinicalNotesList
                patient={selectedPatient}
                clinicalNoteType="Doctors Note"
                key={clinicalNotesRefreshKey}
                onPatientClick={handlePatientSelect}
              />
            </DashboardCard>
          </div>

          {/* Row 4: Patient Summary + Warnings & Allergies */}
          <div className="grid gap-4 md:grid-cols-2 auto-rows-fr px-4 pb-4">
            <DashboardCard fixedHeight title="Patient Information" filterable={false}>
              <PatientSummaryCard patient={selectedPatient} />
            </DashboardCard>

            <DashboardCard
              fixedHeight
              title="Warnings & Allergies"
              onAdd={() => guardClinicalCreate(() => setShowWarningModal(true))}
              addButtonTitle="Add Warning Message"
              listingScreen="n-first"
              openListingTitle="Open full Warnings & Allergies list"
            >
              <WarningMessagesList patient={selectedPatient} key={warningRefreshKey} onPatientClick={handlePatientSelect} />
            </DashboardCard>
          </div>

          {/* IP: patient visits + Morse Fall Scale */}
          {costCenterCareScope !== 'op_only' && mode === 'IP' && (
            <div className="grid gap-4 md:grid-cols-2 auto-rows-fr px-4 pb-4">
              <DashboardCard fixedHeight title="Patient Visits" listingScreen="n-op">
                <PatientVisitList
                  patient={selectedPatient}
                  onPatientFromVisit={handlePatientSelect}
                  onVisitActivate={handleVisitActivate}
                />
              </DashboardCard>

              <DashboardCard
                fixedHeight
                title="Morse Fall Scale"
                listingScreen="n-fall"
                requiresAttention={showIpRequiredDocs && ipDocStatus !== null && !ipDocStatus.morse_fall_scale}
                attentionLabel="Required for this IP admission — complete Morse Fall Scale"
              >
                <MorseFallScaleList
                  patient={selectedPatient}
                  refreshKey={morseFallRefreshKey}
                  onPatientClick={handlePatientSelect}
                  defaultAdmission={activeAdmission || undefined}
                  onRecordCreated={() => setMorseFallRefreshKey((k) => k + 1)}
                />
              </DashboardCard>
            </div>
          )}

          {/* Discharges — IP mode only */}
          {costCenterCareScope !== 'op_only' && mode === 'IP' && (
            <div className="px-4 pb-4">
              <DashboardCard
                fixedHeight
                title="Discharges"
                listingScreen="n-discharge"
                openListingTitle="Open full Discharge list"
              >
                <DischargeList patient={selectedPatient} key={dischargeRefreshKey} onPatientClick={handlePatientSelect} />
              </DashboardCard>
            </div>
          )}

          {/* <div className="px-4 pb-4">
            <DoctorServiceDetailsTable 
              patient={selectedPatient} 
              onAddService={() => setShowServiceModal(true)}
            />
          </div> */}
        </>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 auto-rows-fr p-4">
          <DashboardCard
            fixedHeight
            title="IP Warning Messages / Medications / Allergy"
            onAdd={() => guardClinicalCreate(() => setShowWarningModal(true))}
            addButtonTitle="Add Warning Message"
            listingScreen="n-first"
          >
            <WarningMessagesList patient={undefined} key={warningRefreshKey} onPatientClick={handlePatientSelect} />
          </DashboardCard>

          <DashboardCard
            fixedHeight
            title="Lab Reports List & Status"
            onAdd={() => guardClinicalCreate(() => setShowLabTestModal(true))}
            addButtonTitle="Add Lab Test Report"
            listingScreen="n-labs"
          >
            <LabTestList defaultStatus="Pending Review" byNurse={true} key={labTestRefreshKey} onPatientClick={handlePatientSelect} />
          </DashboardCard>

          <DashboardCard
            fixedHeight
            title="Prescription"
            listingScreen="rx"
            openListingTitle="Open full Prescription list"
          >
            <PrescriptionList refreshKey={prescriptionRefreshKey} onPatientClick={handlePatientSelect} />
          </DashboardCard>
        </div>
      )}

      {showWarningModal && (
        <CreateWarningMessageModal
          onClose={() => setShowWarningModal(false)}
          onSuccess={() => {
            setWarningRefreshKey(prev => prev + 1)
            setShowWarningModal(false)
          }}
          initialPatient={selectedPatient}
        />
      )}

      {showLabTestModal && (
        <CreateLabTestModal
          onClose={() => setShowLabTestModal(false)}
          onSuccess={() => {
            setLabTestRefreshKey(prev => prev + 1)
            setShowLabTestModal(false)
          }}
          initialPatient={selectedPatient}
          templatesNurseOnly
        />
      )}

      {showServiceModal && (
        <CreateDoctorServiceModal
          onClose={() => setShowServiceModal(false)}
          onSuccess={() => {
            setShowServiceModal(false)
            // TODO: Refresh service details table when backend is wired
          }}
          patient={selectedPatient}
        />
      )}

      {showServiceRequestModal && (
        <CreateServiceRequestModal
          onClose={() => setShowServiceRequestModal(false)}
          onSuccess={() => {
            setServiceRequestRefreshKey(prev => prev + 1)
            setShowServiceRequestModal(false)
            toast.success('Service request created successfully')
          }}
          initialPatient={selectedPatient}
          initialTemplate='Healthcare Service Template'
        />
      )}

      {showGivenMedicineModal && (
        <CreateMedicineGivenModal
          initialPatient={selectedPatient}
          inpatientRecord={mode === 'IP' ? activeAdmission : null}
          patientEncounter={mode === 'OP' ? activeVisit : null}
          onClose={() => setShowGivenMedicineModal(false)}
          onSuccess={() => {
            setGivenRefreshKey((prev) => prev + 1)
            setShowGivenMedicineModal(false)
          }}
        />
      )}
    </div>
  )
}

