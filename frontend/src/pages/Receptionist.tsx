import { useState, useEffect, useLayoutEffect } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useCareContext } from '../providers/CareContextProvider'
import { dummyPatients } from '../config/patients'
import { AdmissionList } from '../components/admissions/AdmissionList'
import { PatientList } from '../components/patients/PatientList'
import { toast } from '../hooks/useToast'
import { PatientCareHeader } from '../components/patients/PatientCareHeader'
import { AppointmentList } from '../components/appointments/AppointmentList'
import { CreateAppointmentModal } from '../components/appointments/CreateAppointmentModal'
import { PatientVisitList } from '../components/patientVisits/PatientVisitList'
import { CreatePatientVisitModal } from '../components/patientVisits/CreatePatientVisitModal'
import { CreateAdmissionModal } from '../components/admissions/CreateAdmissionModal'
import { CreatePatientModal } from '../components/patients/CreatePatientModal'
import { ServiceRequestList } from '../components/serviceRequests/ServiceRequestList'
import { CreateServiceRequestModal } from '../components/serviceRequests/CreateServiceRequestModal'
import { FollowUpList } from '../components/followUp/FollowUpList'
import { IOPDayListWithHeader } from '../components/iop/IOPDayList'
import { IOPEnrollmentListWithHeader } from '../components/iop/IOPEnrollmentList'
import { DischargeList } from '../components/discharges/DischargeList'
import { DischargeAdmissionView } from '../components/admissions/DischargeAdmissionView'
import { inpatientDischargeAllowed } from '../utils/inpatientDischargeRoute'
import { stripDischargeFlowParams } from '../utils/dischargeNavigation'
import { MedicalHistoryView } from '../components/medicalHistory/MedicalHistoryView'
import { ReceptionLongActingMedicineList } from '../components/medication/ReceptionLongActingMedicineList'
import { CreateLongActingMedicineModal } from '../components/medication/CreateLongActingMedicineModal'
import { InsurancePatientRegisterList } from '../components/insurance/InsurancePatientRegisterList'
import { CreateInsurancePatientRegisterModal } from '../components/insurance/CreateInsurancePatientRegisterModal'
import { PatientReferralList } from '../components/referrals/PatientReferralList'
import { CreatePatientReferralModal } from '../components/referrals/CreatePatientReferralModal'
import { ObservationList } from '../components/observations/ObservationList'
import { CreateObservationModal } from '../components/observations/CreateObservationModal'
import { InternalTransferList } from '../components/transfers/InternalTransferList'
import { CreateInternalTransferModal } from '../components/transfers/CreateInternalTransferModal'
import { BillingDashboard } from '../components/billing/BillingDashboard'
import { DailyAutoVisitView } from '../components/patientVisits/DailyAutoVisitView'
import { AdditionalCollectionBillingPage } from './billing/AdditionalCollectionBillingPage'
import { InternalEmployeeBillingPage } from './billing/InternalEmployeeBillingPage'
import { isReceptionScreenBlocked, observationsAllowedForMode } from '../config/costCenterCareScope'
import { isDataOfficer } from '../config/permissions'
import { DashboardCard } from '../components/ui/DashboardCard'
import { PractitionerUnavailabilityList } from '../components/practitionerUnavailability/PractitionerUnavailabilityList'

type View =
  | 'default'
  | 'patient'
  | 'admission'
  | 'visit'
  | 'patient-medical-history'
  | 'followup'
  | 'iop'
  | 'appointments-freeze'
  | 'service-requests'
  | 'receipt-voucher'
  | 'op-dashboard'
  | 'ip-dashboard'
  | 'discharge'
  | 'long-acting-medicine'
  | 'insurance'
  | 'referral'
  | 'observation'
  | 'internal-transfer'
  | 'patients'
  | 'billing'
  | 'billing-additional-collection'
  | 'billing-internal-employee'
  | 'daily-auto-visit'
  | 'practitioner-unavailability'

export const ReceptionistPage = () => {

  const {
    selectedPatient: globalPatient,
    setSelectedPatient: setGlobalPatient,
    activeAdmission,
    activeVisit,
    mode,
    costCenterCareScope,
    userRole,
    guardClinicalCreate,
  } = useCareContext()

  const canBrowsePatientList = isDataOfficer(userRole)

  // const { selectedPatient: globalPatient, setSelectedPatient: setGlobalPatient } = useCareContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const patientFromUrl = searchParams.get('patient')
  const rawScreen = searchParams.get('screen')
  const dischargeAdmission = searchParams.get('discharge')
  const screen =
    rawScreen && !isReceptionScreenBlocked(rawScreen, costCenterCareScope, mode) ? rawScreen : null
  const [selectedPatient, setSelectedPatient] = useState<string>(() => patientFromUrl || globalPatient || '')
  const [currentView, setCurrentView] = useState<View>('default')
  const [showAppointmentModal, setShowAppointmentModal] = useState(false)
  const [appointmentRefreshKey, setAppointmentRefreshKey] = useState(0)
  const [showPatientVisitModal, setShowPatientVisitModal] = useState(false)
  const [patientVisitRefreshKey, setPatientVisitRefreshKey] = useState(0)
  const [showCreateServiceRequest, setShowCreateServiceRequest] = useState(false)
  const [serviceRequestRefreshKey, setServiceRequestRefreshKey] = useState(0)
  const [showAdmissionModal, setShowAdmissionModal] = useState(false)
  const [admissionRefreshKey, setAdmissionRefreshKey] = useState(0)
  const [showPatientModal, setShowPatientModal] = useState(false)
  const [patientRefreshKey, setPatientRefreshKey] = useState(0)
  const [showBulkScheduleModal, setShowBulkScheduleModal] = useState(false)
  const [showCreateLongActing, setShowCreateLongActing] = useState(false)
  const [longActingRefreshKey, setLongActingRefreshKey] = useState(0)
  const [showCreateInsuranceRegister, setShowCreateInsuranceRegister] = useState(false)
  const [insuranceRegisterRefreshKey, setInsuranceRegisterRefreshKey] = useState(0)
  const [showCreateReferral, setShowCreateReferral] = useState(false)
  const [referralRefreshKey, setReferralRefreshKey] = useState(0)
  const [showObservationModal, setShowObservationModal] = useState(false)
  const [observationRefreshKey, setObservationRefreshKey] = useState(0)
  const [showCreateInternalTransfer, setShowCreateInternalTransfer] = useState(false)
  const [internalTransferRefreshKey, setInternalTransferRefreshKey] = useState(0)
    const [showCreatePatientModal , setShowCreatePatientModal] = useState(false)


  const handlePatientSelect = (patient: string | undefined) => {
    setSelectedPatient(patient || '')
    setGlobalPatient(patient)
    const newSearchParams = new URLSearchParams(searchParams)
    if (patient) {
      newSearchParams.set('patient', patient)
    } else {
      newSearchParams.delete('patient')
    }
    setSearchParams(newSearchParams, { replace: true })
  }

  useEffect(() => {
    const patientParam = searchParams.get('patient')
    if (patientParam && patientParam !== selectedPatient) {
      setSelectedPatient(patientParam)
    }
  }, [searchParams, selectedPatient])

  // Keep local state in sync when the global patient is cleared (e.g. via the navbar X button)
  useEffect(() => {
    if (!globalPatient && selectedPatient) {
      setSelectedPatient('')
    }
  }, [globalPatient, selectedPatient])

  useLayoutEffect(() => {
    if (dischargeAdmission) return
    if (!rawScreen || !isReceptionScreenBlocked(rawScreen, costCenterCareScope, mode)) return
    const np = new URLSearchParams(searchParams)
    np.delete('screen')
    setSearchParams(np, { replace: true })
  }, [dischargeAdmission, rawScreen, costCenterCareScope, searchParams, setSearchParams])

  const closeDischarge = () => {
    const state = location.state as { returnTo?: string } | null
    if (state?.returnTo) {
      navigate(state.returnTo, { replace: true })
      return
    }
    const np = new URLSearchParams(searchParams)
    stripDischargeFlowParams(np)
    setSearchParams(np, { replace: true })
  }

  const handleDischargeSuccess = () => {
    toast.success('Discharge completed successfully')
    const state = location.state as { returnTo?: string } | null
    if (state?.returnTo) {
      navigate(state.returnTo, { replace: true, state: { dischargeCompleted: true } })
      return
    }
    const np = new URLSearchParams(searchParams)
    stripDischargeFlowParams(np)
    setSearchParams(np, { replace: true, state: { dischargeCompleted: true } })
  }

  useEffect(() => {
    if (costCenterCareScope === 'op_only') {
      if (currentView === 'admission' || currentView === 'discharge' || currentView === 'ip-dashboard') {
        setCurrentView('default')
      }
    }
    if (costCenterCareScope === 'ip_only') {
      if (
        currentView === 'visit' ||
        currentView === 'daily-auto-visit' ||
        currentView === 'op-dashboard'
      ) {
        setCurrentView('default')
      }
    }
  }, [costCenterCareScope, currentView])

  // Sync view with URL: when screen param is missing or unknown, show reception homepage
  useEffect(() => {
    if (dischargeAdmission) return
    if (screen && isReceptionScreenBlocked(screen, costCenterCareScope, mode)) {
      return
    }
    if (screen === 'r-reg') {
      setCurrentView('admission')
    } else if (screen === 'r-visit') {
      setCurrentView('visit')
    } else if (screen === 'r-appointment') {
      setCurrentView('appointments-freeze')
      setShowAppointmentModal(true)
      const newParams = new URLSearchParams(searchParams)
      newParams.set('screen', 'r-appointments-freeze')
      setSearchParams(newParams, { replace: true })
    } else if (screen === 'r-ip-adm') {
      setCurrentView('admission')
      setShowAdmissionModal(true)
      const newParams = new URLSearchParams(searchParams)
      newParams.set('screen', 'r-reg')
      setSearchParams(newParams, { replace: true })
    } else if (screen === 'r-new-op') {
      setShowPatientModal(true)
      const newParams = new URLSearchParams(searchParams)
      newParams.delete('screen')
      setSearchParams(newParams, { replace: true })
    } else if (screen === 'r-new-visit') {
      setCurrentView('visit')
      setShowPatientVisitModal(true)
      const newParams = new URLSearchParams(searchParams)
      newParams.set('screen', 'r-visit')
      setSearchParams(newParams, { replace: true })
    } else if (screen === 'r-daily-auto-visit') {
      setCurrentView('daily-auto-visit')
    } else if (screen === 'r-followup') {
      setCurrentView('followup')
    } else if (screen === 'r-medical-history') {
      setCurrentView('patient-medical-history')
    } else if (screen === 'r-iop') {
      setCurrentView('iop')
    } else if (screen === 'r-appointments-freeze') {
      setCurrentView('appointments-freeze')
    } else if (screen === 'r-practitioner-unavailability') {
      setCurrentView('practitioner-unavailability')
    } else if (screen === 'r-service-requests') {
      setCurrentView('service-requests')
    } else if (screen === 'r-receipt-voucher') {
      setCurrentView('receipt-voucher')
    } else if (screen === 'r-op-dashboard') {
      setCurrentView('op-dashboard')
    } else if (screen === 'r-ip-dashboard') {
      setCurrentView('ip-dashboard')
    } else if (screen === 'r-discharge') {
      setCurrentView('discharge')
    } else if (screen === 'r-long-acting-meds') {
      setCurrentView('long-acting-medicine')
    } else if (screen === 'r-insurance') {
      setCurrentView('insurance')
    } else if (screen === 'r-referral') {
      setCurrentView('referral')
    } else if (screen === 'r-observation') {
      setCurrentView('observation')
    } else if (screen === 'r-internal-transfer') {
      setCurrentView('internal-transfer')
      } else if (screen === 'billing') {
      setCurrentView('billing')
    } else if (screen === 'billing-additional-collection') {
      setCurrentView('billing-additional-collection')
    } else if (screen === 'billing-internal-employee') {
      setCurrentView('billing-internal-employee')
    } else if (screen === 'patients') {
      if (canBrowsePatientList) {
        setCurrentView('patients')
      } else {
        setCurrentView('default')
        const newParams = new URLSearchParams(searchParams)
        newParams.delete('screen')
        setSearchParams(newParams, { replace: true })
      }
      }
    
    else {
      // No screen param or unknown: show reception homepage (e.g. after "Back to Reception" or sidebar Home)
      setCurrentView('default')
    }
  }, [dischargeAdmission, screen, searchParams, setSearchParams, canBrowsePatientList])

  if (dischargeAdmission && !inpatientDischargeAllowed(costCenterCareScope)) {
    return (
      <div className="flex flex-col p-6">
        <p className="text-sm text-slate-700">
          Inpatient discharge is not available for OP-only branches. Switch to a site that supports IP care or
          use the desk Discharge form.
        </p>
        <button type="button" onClick={closeDischarge} className="mt-4 text-sm text-primary hover:underline w-fit">
          Back
        </button>
      </div>
    )
  }

  if (dischargeAdmission && inpatientDischargeAllowed(costCenterCareScope)) {
    const navState = location.state as { patient?: string; patient_name?: string } | null
    const patientForBar =
      selectedPatient || navState?.patient || searchParams.get('patient') || ''
    return (
      <div className="flex flex-col h-full max-h-[calc(100vh-2.25rem)] overflow-hidden">
        <PatientCareHeader
          selectedPatient={patientForBar}
          onPatientSelect={handlePatientSelect}
          patients={dummyPatients}
        />
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

  return (
    <div className="flex flex-col h-full">
      <PatientCareHeader selectedPatient={selectedPatient} onPatientSelect={handlePatientSelect} patients={dummyPatients} />

      <div className="flex-1 overflow-y-auto">
        {canBrowsePatientList && currentView === 'patient' && (
          <div className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Patient Management</h2>
                <p className="text-sm text-slate-600 mt-1">
                  View and manage patient records. Use the search box to find specific patients.
                </p>
              </div>
              <button
                onClick={() => setShowPatientModal(true)}
                className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Patient"
              >
                +
              </button>
            </div>
            <PatientList refreshKey={patientRefreshKey} />
          </div>
        )}

        {currentView === 'patient-medical-history' && (
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-slate-900">Patient Medical History</h2>
              <p className="text-sm text-slate-600 mt-1">
                View or update long-term medical history for the selected patient.
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg">
              <MedicalHistoryView patient={selectedPatient || undefined} />
            </div>
          </div>
        )}

        {costCenterCareScope !== 'op_only' && currentView === 'admission' && (
          <div className="p-4">
            <p className="text-sm text-slate-600 mb-4">
              Manage patient admissions. Click &quot;Admit&quot; on scheduled admissions to proceed.
            </p>
            <DashboardCard
              title="Admission Management"
              onAdd={() => setShowAdmissionModal(true)}
              addButtonTitle="Add Admission"
              allowCreateOnClosedEpisode
              noHeightLimit
            >
              <AdmissionList
                refreshKey={admissionRefreshKey}
                onAdmissionSelect={() => {}}
                onPatientFromAdmission={handlePatientSelect}
              />
            </DashboardCard>
          </div>
        )}

        {costCenterCareScope !== 'op_only' && currentView === 'discharge' && (
          <div className="p-4">
            <p className="text-sm text-slate-600 mb-4">
              View and manage inpatient discharges. Click a row to see full details.
            </p>
            <DashboardCard title="Discharge Management" noHeightLimit>
              <DischargeList
                patient={selectedPatient || undefined}
                admission={undefined}
                onPatientClick={handlePatientSelect}
              />
            </DashboardCard>
          </div>
        )}

        {costCenterCareScope !== 'ip_only' && currentView === 'visit' && (
          <div className="p-4">
            <p className="text-sm text-slate-600 mb-4">
              View and manage patient visits. Use the search box to find specific visits.
            </p>
            <DashboardCard
              title="Patient Visits"
              onAdd={() => setShowPatientVisitModal(true)}
              addButtonTitle="Add Patient Visit"
              allowCreateOnClosedEpisode
              noHeightLimit
            >
              <PatientVisitList
                patient={selectedPatient || undefined}
                refreshKey={patientVisitRefreshKey}
                onPatientFromVisit={handlePatientSelect}
                showAppointmentAmount
              />
            </DashboardCard>
          </div>
        )}

        {costCenterCareScope !== 'ip_only' && currentView === 'daily-auto-visit' && (
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-slate-900">Daily Auto Visit</h2>
              <p className="text-sm text-slate-600 mt-1">
                Manage Daily Patient Visit Setup and review all visits created with Daily Auto Visit type.
              </p>
            </div>
            <DailyAutoVisitView patient={selectedPatient || undefined} />
          </div>
        )}

         {canBrowsePatientList && currentView === 'patients' && (
             
                <div className="flex flex-col">
                 
           
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

        {currentView === 'followup' && (
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-slate-900">Follow-up Dashboard</h2>
              <p className="text-sm text-slate-600 mt-1">
                OP &amp; IP discharged follow-up list. Filter by status (default: Open) and branch. Send reminder per row or send all reminders.
              </p>
            </div>
            <FollowUpList refreshKey={patientVisitRefreshKey} onPatientClick={handlePatientSelect} />
          </div>
        )}

        {currentView === 'iop' && (
          <div className="p-4">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">IOP Dashboard</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Intensive Outpatient: schedule IOP days (slots) and enroll patients. Create a Patient Visit from an enrollment to link the visit.
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
              <IOPDayListWithHeader refreshKey={patientVisitRefreshKey} />
              <IOPEnrollmentListWithHeader
                refreshKey={patientVisitRefreshKey}
                patientFilter={selectedPatient || undefined}
              />
            </div>
          </div>
        )}

        {currentView === 'long-acting-medicine' && (
          <div className="p-4">
            <p className="text-sm text-slate-600 mb-4">
              View long acting medicines across patients. Filter by start date and frequency. Click a row for details.
            </p>
            <DashboardCard
              title="Long Acting Medicine"
              onAdd={() => setShowCreateLongActing(true)}
              addButtonTitle="Create Long Acting Medicine"
              noHeightLimit
            >
              <ReceptionLongActingMedicineList
                patient={selectedPatient || undefined}
                refreshKey={longActingRefreshKey}
                onPatientClick={handlePatientSelect}
              />
            </DashboardCard>

            {showCreateLongActing && (
              <CreateLongActingMedicineModal
                initialPatient={selectedPatient || undefined}
                onClose={() => setShowCreateLongActing(false)}
                onSuccess={() => {
                  setShowCreateLongActing(false)
                  setLongActingRefreshKey((k) => k + 1)
                }}
              />
            )}
          </div>
        )}

        {currentView === 'billing' && (
          <div className="flex flex-col">
            <div className="p-4">
              <div className="bg-white border border-slate-200 rounded-lg p-6">
                <BillingDashboard
                  patient={selectedPatient}
                  admission={activeAdmission}
                  visit={activeVisit}
                />
              </div>
            </div>
          </div>
        )}

        {currentView === 'billing-additional-collection' && (
          <AdditionalCollectionBillingPage patient={selectedPatient || undefined} />
        )}

        {currentView === 'billing-internal-employee' && (
          <InternalEmployeeBillingPage patient={selectedPatient || undefined} />
        )}

        {currentView === 'insurance' && (
          <div className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Insurance Patient Register</h2>
                <p className="text-sm text-slate-600 mt-1">
                  View and manage insurance patient registrations. Create patients directly from here.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateInsuranceRegister(true)}
                className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="New Insurance Patient Register"
              >
                +
              </button>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <InsurancePatientRegisterList refreshKey={insuranceRegisterRefreshKey} />
            </div>
          </div>
        )}


        {currentView === 'referral' && (
          <div className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Patient Referral</h2>
                <p className="text-sm text-slate-600 mt-1">
                  External referrals — create and track referrals to other hospitals or specialists.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateReferral(true)}
                className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="New Referral"
              >
                +
              </button>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <PatientReferralList
                patient={selectedPatient || undefined}
                refreshKey={referralRefreshKey}
                onPatientClick={handlePatientSelect}
              />
            </div>
            {showCreateReferral && (
              <CreatePatientReferralModal
                initialPatient={selectedPatient || undefined}
                onClose={() => setShowCreateReferral(false)}
                onSuccess={() => {
                  setShowCreateReferral(false)
                  setReferralRefreshKey(k => k + 1)
                }}
              />
            )}
          </div>
        )}

        {currentView === 'observation' && (
          <div className="p-4">
            <DashboardCard
              title="Observation"
              onAdd={() => guardClinicalCreate(() => setShowObservationModal(true))}
              addButtonTitle="Add Observation"
              listingScreen="r-observation"
            >
              <ObservationList
                patient={selectedPatient || undefined}
                key={observationRefreshKey}
                onPatientClick={handlePatientSelect}
              />
            </DashboardCard>
          </div>
        )}

        {currentView === 'internal-transfer' && (
          <div className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Branch Transfer</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Transfer admitted patients internally between branches.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateInternalTransfer(true)}
                className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="New Internal Transfer"
              >
                +
              </button>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <InternalTransferList
                patient={selectedPatient || undefined}
                refreshKey={internalTransferRefreshKey}
                onPatientClick={handlePatientSelect}
              />
            </div>
          </div>
        )}

        {currentView === 'appointments-freeze' && (
          <div className="p-4">
            <p className="text-sm text-slate-600 mb-4">
              When doctors are not available or on leave, freeze or cancel slots. Release when they return.
            </p>
            <DashboardCard
              title="Appointments"
              onAdd={() => guardClinicalCreate(() => setShowAppointmentModal(true))}
              addButtonTitle="New Appointment"
              noHeightLimit
            >
              <AppointmentList
                showAll={true}
                receptionWalkInActions
                patient={selectedPatient || undefined}
                refreshKey={appointmentRefreshKey}
                onPatientClick={handlePatientSelect}
              />
            </DashboardCard>
            {/* <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
              To freeze or release practitioner schedules, use the backend: Healthcare → Practitioner Schedule, or open Appointments in the backend.
              <a href="/app/Patient%20Appointment" target="_blank" rel="noopener noreferrer" className="ml-2 underline font-medium">Open Appointments</a>
            </div> */}
          </div>
        )}

        {currentView === 'practitioner-unavailability' && (
          <div className="p-4">
            <p className="text-sm text-slate-600 mb-4">
              Record when practitioners are unavailable or on leave. Reception can create holds and cancel them when the doctor returns.
            </p>
            <DashboardCard title="Practitioner Unavailability" noHeightLimit>
              <PractitionerUnavailabilityList />
            </DashboardCard>
          </div>
        )}

        {currentView === 'service-requests' && (
          <div className="p-4">
            <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Service Requests / Booked Lab</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Lab and procedure requests. Create with +, then Confirm Payment and Book Lab to forward to laboratory.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateServiceRequest(true)}
                className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 text-lg font-bold shrink-0"
                title="Create Service Request"
              >
                +
              </button>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[500px]">
              <ServiceRequestList
                patient={selectedPatient || undefined}
                refreshKey={serviceRequestRefreshKey}
                onPatientClick={handlePatientSelect}
              />
            </div>
            {showCreateServiceRequest && (
              <CreateServiceRequestModal
                onClose={() => setShowCreateServiceRequest(false)}
                onSuccess={() => {
                  setServiceRequestRefreshKey((k) => k + 1)
                  setShowCreateServiceRequest(false)
                }}
                initialPatient={selectedPatient || undefined}
              />
            )}
          </div>
        )}

        {currentView === 'receipt-voucher' && (
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-slate-900">Receipt Voucher</h2>
              <p className="text-sm text-slate-600 mt-1">
                For employee (pharmacy) and OP other branches.
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
              <p className="text-slate-600 mb-4">Receipt vouchers are managed in the backend (Accounts / Journal Entry).</p>
              <a
                href="/app/Journal%20Entry"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary/90"
              >
                Open Journal Entry
              </a>
            </div>
          </div>
        )}

        {((costCenterCareScope !== 'ip_only' && currentView === 'op-dashboard') ||
          (costCenterCareScope !== 'op_only' && currentView === 'ip-dashboard')) && (
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-slate-900">
                {currentView === 'op-dashboard' ? 'OP Dashboard' : 'IP Dashboard'}
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                {currentView === 'op-dashboard'
                  ? 'Outpatient: patients, appointments, visits. Change user for entry and receipt voucher as needed.'
                  : 'Inpatient: admissions, transfers, discharge. Branch per hospital.'}
              </p>
            </div>
            {currentView === 'op-dashboard' && (
              <div className={`grid gap-4 ${canBrowsePatientList ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>
                {canBrowsePatientList && (
                  <DashboardCard
                    fixedHeight
                    title="Patient List"
                    onAdd={() => setShowPatientModal(true)}
                    addButtonTitle="Add Patient"
                    listingScreen="patients"
                    filterable={false}
                    allowCreateOnClosedEpisode
                  >
                    <PatientList refreshKey={patientRefreshKey} />
                  </DashboardCard>
                )}
                <DashboardCard
                  fixedHeight
                  title="Appointments"
                  onAdd={() => guardClinicalCreate(() => setShowAppointmentModal(true))}
                  addButtonTitle="Add Appointment"
                  listingScreen="r-appointments-freeze"
                >
                  <AppointmentList
                    showAll
                    receptionWalkInActions
                    patient={selectedPatient || undefined}
                    refreshKey={appointmentRefreshKey}
                    onPatientClick={handlePatientSelect}
                  />
                </DashboardCard>
              </div>
            )}
            {currentView === 'ip-dashboard' && (
              <DashboardCard
                fixedHeight
                title="IP Admission List"
                onAdd={() => setShowAdmissionModal(true)}
                addButtonTitle="Add Admission"
                listingScreen="r-reg"
                allowCreateOnClosedEpisode
              >
                <AdmissionList patient={selectedPatient || undefined} refreshKey={admissionRefreshKey} onAdmissionSelect={() => {}} onPatientFromAdmission={handlePatientSelect} />
              </DashboardCard>
            )}
          </div>
        )}

        {currentView === 'default' && (
          <>
            <div className={`grid gap-4 p-4 ${canBrowsePatientList ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>
              {canBrowsePatientList && (
                <DashboardCard
                  fixedHeight
                  title="Patient List"
                  onAdd={() => setShowPatientModal(true)}
                  addButtonTitle="Add Patient"
                  listingScreen="patients"
                  filterable={false}
                  allowCreateOnClosedEpisode
                >
                  <PatientList refreshKey={patientRefreshKey} />
                </DashboardCard>
              )}

              <DashboardCard
                fixedHeight
                title="Appointments"
                onAdd={() => guardClinicalCreate(() => setShowAppointmentModal(true))}
                addButtonTitle="Add Appointment"
                listingScreen="r-appointments-freeze"
              >
                <AppointmentList
                  showAll
                  receptionWalkInActions
                  patient={selectedPatient || undefined}
                  refreshKey={appointmentRefreshKey}
                  onPatientClick={handlePatientSelect}
                />
              </DashboardCard>
            </div>

            <div className="grid gap-4 md:grid-cols-2 px-4 pb-4">
              {costCenterCareScope !== 'ip_only' && (
                <DashboardCard
                  fixedHeight
                  title="Patient Visits"
                  onAdd={() => setShowPatientVisitModal(true)}
                  addButtonTitle="Add Patient Visit"
                  listingScreen="r-visit"
                  allowCreateOnClosedEpisode
                >
                  <PatientVisitList
                    patient={selectedPatient || undefined}
                    refreshKey={patientVisitRefreshKey}
                    onPatientFromVisit={handlePatientSelect}
                    showAppointmentAmount
                  />
                </DashboardCard>
              )}

              {costCenterCareScope !== 'op_only' && (
                <DashboardCard
                  fixedHeight
                  title="IP Admission List"
                  onAdd={() => setShowAdmissionModal(true)}
                  addButtonTitle="Add Admission"
                  listingScreen="r-reg"
                  allowCreateOnClosedEpisode
                >
                  <AdmissionList
                    patient={selectedPatient || undefined}
                    refreshKey={admissionRefreshKey}
                    onAdmissionSelect={() => {}}
                    onPatientFromAdmission={handlePatientSelect}
                  />
                </DashboardCard>
              )}

              <DashboardCard
                fixedHeight
                title="Insurance Patient Register"
                onAdd={() => guardClinicalCreate(() => setShowCreateInsuranceRegister(true))}
                addButtonTitle="New Insurance Patient Register"
                listingScreen="r-insurance"
              >
                <InsurancePatientRegisterList refreshKey={insuranceRegisterRefreshKey} />
              </DashboardCard>

              {costCenterCareScope !== 'op_only' && (
                <DashboardCard
                  fixedHeight
                  title="Discharge List"
                  onAdd={() => window.open('/app/discharge/new-discharge', '_blank')}
                  addButtonTitle="Add Discharge"
                  listingScreen="r-discharge"
                >
                  <DischargeList
                    patient={selectedPatient || undefined}
                    admission={undefined}
                    onPatientClick={handlePatientSelect}
                  />
                </DashboardCard>
              )}

              <DashboardCard
                fixedHeight
                title="Patient Referral"
                onAdd={() => guardClinicalCreate(() => setShowCreateReferral(true))}
                addButtonTitle="New Referral"
                listingScreen="r-referral"
              >
                <PatientReferralList
                  patient={selectedPatient || undefined}
                  refreshKey={referralRefreshKey}
                  onPatientClick={handlePatientSelect}
                />
              </DashboardCard>

              {observationsAllowedForMode(mode) && (
                <DashboardCard
                  fixedHeight
                  title="Observation"
                  onAdd={() => guardClinicalCreate(() => setShowObservationModal(true))}
                  addButtonTitle="Add Observation"
                  listingScreen="r-observation"
                >
                  <ObservationList
                    patient={selectedPatient || undefined}
                    key={observationRefreshKey}
                    onPatientClick={handlePatientSelect}
                  />
                </DashboardCard>
              )}

              <DashboardCard
                fixedHeight
                title="Internal Transfer"
                onAdd={() => guardClinicalCreate(() => setShowCreateInternalTransfer(true))}
                addButtonTitle="New Internal Transfer"
                listingScreen="r-internal-transfer"
              >
                <InternalTransferList
                  patient={selectedPatient || undefined}
                  refreshKey={internalTransferRefreshKey}
                  onPatientClick={handlePatientSelect}
                />
              </DashboardCard>
            </div>
          </>
        )}
      </div>

      {showAppointmentModal && (
        <CreateAppointmentModal
          onClose={() => setShowAppointmentModal(false)}
          onSuccess={() => {
            setAppointmentRefreshKey(prev => prev + 1)
            setShowAppointmentModal(false)
          }}
          initialPatient={selectedPatient || undefined}
        />
      )}

      {showPatientVisitModal && (
        <CreatePatientVisitModal
          onClose={() => setShowPatientVisitModal(false)}
          onSuccess={(_visitName) => {
            setPatientVisitRefreshKey(prev => prev + 1)
            setShowPatientVisitModal(false)
          }}
        />
      )}

      {showAdmissionModal && (
        <CreateAdmissionModal
          onClose={() => setShowAdmissionModal(false)}
          onSuccess={(_admissionName) => {
            setAdmissionRefreshKey(prev => prev + 1)
            setShowAdmissionModal(false)
          }}
          patientName={selectedPatient || undefined}
        />
      )}

      {showPatientModal && (
        <CreatePatientModal
          onClose={() => setShowPatientModal(false)}
          onSuccess={(patientName) => {
            setPatientRefreshKey(prev => prev + 1)
            setShowPatientModal(false)
            if (patientName) {
              setSelectedPatient(patientName)
              setGlobalPatient(patientName)
            }
          }}
        />
      )}

      {showCreateInsuranceRegister && (
        <CreateInsurancePatientRegisterModal
          onClose={() => setShowCreateInsuranceRegister(false)}
          onSuccess={() => {
            setShowCreateInsuranceRegister(false)
            setInsuranceRegisterRefreshKey(k => k + 1)
          }}
        />
      )}

      {showCreateReferral && (
        <CreatePatientReferralModal
          initialPatient={selectedPatient || undefined}
          onClose={() => setShowCreateReferral(false)}
          onSuccess={() => {
            setShowCreateReferral(false)
            setReferralRefreshKey(k => k + 1)
          }}
        />
      )}

      {showObservationModal && (
        <CreateObservationModal
          initialPatient={selectedPatient || undefined}
          onClose={() => setShowObservationModal(false)}
          onSuccess={() => {
            setShowObservationModal(false)
            setObservationRefreshKey((k) => k + 1)
          }}
        />
      )}

      {showCreateInternalTransfer && (
        <CreateInternalTransferModal
          initialPatient={selectedPatient || undefined}
          onClose={() => setShowCreateInternalTransfer(false)}
          onSuccess={() => {
            setShowCreateInternalTransfer(false)
            setInternalTransferRefreshKey(k => k + 1)
          }}
        />
      )}

      {/* TODO: replace with your BulkScheduleModal component */}
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