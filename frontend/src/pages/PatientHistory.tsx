import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PatientCareHeader } from '../components/patients/PatientCareHeader'
import { useCareContext } from '../providers/CareContextProvider'
import { observationsAllowedForMode } from '../config/costCenterCareScope'
import { canViewClinicalPatientHistory } from '../config/permissions'
import { useAuth } from '../providers/AuthProvider'
import { PatientSummaryCard } from '../components/patients/PatientSummaryCard'
import { WarningMessagesList } from '../components/warnings/WarningMessagesList'
import { LabTestList } from '../components/labTests/LabTestList'
import { PatientDiagnosisList } from '../components/diagnosis/PatientDiagnosisList'
import { DischargeList } from '../components/discharges/DischargeList'
import { MedicalHistoryView } from '../components/medicalHistory/MedicalHistoryView'
import { PackageDetailsList } from '../components/packageDetails/PackageDetailsList'
import { VitalSignsList } from '../components/vitalSigns/VitalSignsList'
import { ObservationList } from '../components/observations/ObservationList'
import { ServiceRequestList } from '../components/serviceRequests/ServiceRequestList'
import { AppointmentList } from '../components/appointments/AppointmentList'
import { AdmissionList } from '../components/admissions/AdmissionList'
import { PatientVisitList } from '../components/patientVisits/PatientVisitList'
import { LastAdmissionClinicalTab } from '../components/patientHistory/LastAdmissionClinicalTab'
import { fetchPatientHistorySummary, type PatientHistorySummary } from '../services/patients'
import { DashboardCard } from '../components/ui/DashboardCard'
import {
  CalendarCheck,
  Building2,
  FileText,
  Receipt,
  AlertCircle,
  DollarSign
} from 'lucide-react'
import { useFormatMoney } from '../hooks/useFormatMoney'
import { usePatientHistoryListingOpener } from '../utils/patientHistoryListingNavigation'

export const PatientHistoryPage = () => {
  const formatCurrency = useFormatMoney()
  const { user } = useAuth()
  const { selectedPatient: globalPatient, setSelectedPatient: setGlobalPatient, mode } = useCareContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const patientFromUrl = searchParams.get('patient')
  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(() => patientFromUrl || globalPatient || undefined)
  const [summary, setSummary] = useState<PatientHistorySummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'general' | 'admission'>('general')

  const canViewClinical = useMemo(() => {
    const roles = user?.roles?.length
      ? user.roles
      : ([user?.role, user?.role_profile_name].filter(Boolean) as string[])
    return canViewClinicalPatientHistory(roles)
  }, [user])

  useEffect(() => {
    if (!canViewClinical && activeTab === 'admission') {
      setActiveTab('general')
    }
  }, [canViewClinical, activeTab])

  useEffect(() => {
    const patientParam = searchParams.get('patient')
    if (patientParam && patientParam !== selectedPatient) {
      setSelectedPatient(patientParam)
    }
  }, [searchParams])

  useEffect(() => {
    if (!selectedPatient) {
      setSummary(null)
      return
    }
    let cancelled = false
    setSummaryLoading(true)
    fetchPatientHistorySummary(selectedPatient)
      .then((data) => {
        if (!cancelled) setSummary(data)
      })
      .catch(() => {
        if (!cancelled) setSummary(null)
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedPatient])

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

  /** Backend omits invoice figures unless user has billing roles; missing flag = legacy API (show billing). */
  const showBillingSummary =
    !summaryLoading &&
    summary != null &&
    summary.billing_summary_allowed !== false

  const { listingProps } = usePatientHistoryListingOpener(selectedPatient)

  return (
    <div className="flex flex-col min-h-full">
      <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />

      {!selectedPatient ? (
        <div className="flex-1 p-4 flex items-center justify-center">
          <div className="text-center text-slate-500 max-w-sm">
            <p className="font-medium text-slate-700 mb-1">Patient History</p>
            <p className="text-sm">Search and select a patient above to view demographics, visit and admission summary, and full history cards.</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 p-4 space-y-6">
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-100/80 p-1 w-fit">
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                activeTab === 'general'
                  ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              General
            </button>
            {canViewClinical && (
              <button
                type="button"
                onClick={() => setActiveTab('admission')}
                className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                  activeTab === 'admission'
                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Clinical summary
              </button>
            )}
          </div>

          {canViewClinical && activeTab === 'admission' ? (
            <LastAdmissionClinicalTab patient={selectedPatient} />
          ) : (
            <>
          {/* Demographics */}
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <h2 className="font-semibold text-slate-900 mb-3">Patient Demographics</h2>
            <PatientSummaryCard patient={selectedPatient} />
          </section>

          {/* Summary cards - show both visits AND admissions always */}
          <section>
            <h2 className="font-semibold text-slate-900 mb-3">Summary</h2>
            <div
              className={`grid gap-3 ${
                showBillingSummary
                  ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'
                  : 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-2 max-w-md'
              }`}
            >
              <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex items-center gap-3">
                <div className="p-2 rounded-lg bg-sky-100 text-sky-600">
                  <CalendarCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Visits</div>
                  <div className="text-lg font-semibold text-slate-900">
                    {summaryLoading ? '…' : (summary?.visit_count ?? 0)}
                  </div>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-600">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Admissions</div>
                  <div className="text-lg font-semibold text-slate-900">
                    {summaryLoading ? '…' : (summary?.admission_count ?? 0)}
                  </div>
                </div>
              </div>
              {showBillingSummary && (
                <>
                  <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-violet-100 text-violet-600">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500">Paid Invoices</div>
                      <div className="text-lg font-semibold text-slate-900">
                        {summaryLoading ? '…' : (summary?.paid_invoice_count ?? 0)}
                      </div>
                    </div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-100 text-amber-600">
                      <Receipt className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500">Paid Total</div>
                      <div className="text-lg font-semibold text-slate-900">
                        {summaryLoading ? '…' : formatCurrency(summary?.paid_invoice_total ?? 0)}
                      </div>
                    </div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-100 text-orange-600">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500">Unbilled</div>
                      <div className="text-lg font-semibold text-slate-900">
                        {summaryLoading ? '…' : (summary?.unbilled_count ?? 0)}
                      </div>
                    </div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-rose-100 text-rose-600">
                      <DollarSign className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500">To Pay</div>
                      <div className="text-lg font-semibold text-slate-900">
                        {summaryLoading ? '…' : formatCurrency(summary?.amount_to_pay ?? 0)}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Content cards — single 2-col grid so visible cards flow side by side when clinical cards are hidden */}
          <div className="grid gap-4 md:grid-cols-2 auto-rows-fr md:[&>*:last-child:nth-child(odd)]:col-span-2">
            <DashboardCard fixedHeight title="Warnings & Messages" {...listingProps('warnings')}>
              <WarningMessagesList patient={selectedPatient} onPatientClick={handlePatientSelect} />
            </DashboardCard>

            {canViewClinical && (
              <DashboardCard fixedHeight title="Diagnosis Detail" {...listingProps('diagnosis')}>
                <PatientDiagnosisList patient={selectedPatient} />
              </DashboardCard>
            )}

            <DashboardCard fixedHeight title="Admissions" {...listingProps('admissions')}>
              <AdmissionList patient={selectedPatient} onPatientFromAdmission={handlePatientSelect} />
            </DashboardCard>

            <DashboardCard fixedHeight title="Patient Visits" {...listingProps('patient-visits')}>
              <PatientVisitList patient={selectedPatient} onPatientFromVisit={handlePatientSelect} />
            </DashboardCard>

            {canViewClinical && (
              <DashboardCard fixedHeight title="Lab Test Reports" {...listingProps('lab')}>
                <LabTestList patient={selectedPatient} onPatientClick={handlePatientSelect} />
              </DashboardCard>
            )}

            <DashboardCard fixedHeight title="Discharge Form" {...listingProps('discharge')}>
              <DischargeList patient={selectedPatient} onPatientClick={handlePatientSelect} />
            </DashboardCard>

            <DashboardCard fixedHeight title="Service Requests" {...listingProps('service-requests')}>
              <ServiceRequestList patient={selectedPatient} onPatientClick={handlePatientSelect} />
            </DashboardCard>

            <DashboardCard fixedHeight title="Appointments" {...listingProps('appointments')}>
              <AppointmentList patient={selectedPatient} showAll={true} onPatientClick={handlePatientSelect} />
            </DashboardCard>

            {canViewClinical && (
              <DashboardCard fixedHeight title="Vital Signs" {...listingProps('vital-signs')}>
                <VitalSignsList patient={selectedPatient} onPatientClick={handlePatientSelect} />
              </DashboardCard>
            )}

            {observationsAllowedForMode(mode) && (
              <DashboardCard fixedHeight title="Observation" {...listingProps('observation')}>
                <ObservationList patient={selectedPatient} onPatientClick={handlePatientSelect} />
              </DashboardCard>
            )}
          </div>

          {canViewClinical && (
            <DashboardCard noHeightLimit title="Medical History" {...listingProps('medical-history')}>
              <MedicalHistoryView patient={selectedPatient} />
            </DashboardCard>
          )}

          <DashboardCard noHeightLimit title="Package Details" {...listingProps('package-details')}>
            <PackageDetailsList patient={selectedPatient} />
          </DashboardCard>
            </>
          )}
        </div>
      )}
    </div>
  )
}