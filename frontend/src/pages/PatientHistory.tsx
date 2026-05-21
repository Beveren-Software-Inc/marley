import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PatientCareHeader } from '../components/patients/PatientCareHeader'
import { useCareContext } from '../providers/CareContextProvider'
import { observationsAllowedForMode } from '../config/costCenterCareScope'
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
import { fetchPatientHistorySummary, type PatientHistorySummary } from '../services/patients'
import {
  CalendarCheck,
  Building2,
  FileText,
  Receipt,
  AlertCircle,
  DollarSign
} from 'lucide-react'
import { useFormatMoney } from '../hooks/useFormatMoney'

export const PatientHistoryPage = () => {
  const formatCurrency = useFormatMoney()
  const { selectedPatient: globalPatient, setSelectedPatient: setGlobalPatient, mode } = useCareContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const patientFromUrl = searchParams.get('patient')
  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(() => patientFromUrl || globalPatient || undefined)
  const [summary, setSummary] = useState<PatientHistorySummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

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

          {/* Content cards - show ALL history regardless of mode */}
          <div className="grid gap-4 md:grid-cols-2">
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[420px]">
              <div className="font-semibold mb-4 flex-shrink-0">Warnings & Allergies</div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <WarningMessagesList patient={selectedPatient} onPatientClick={handlePatientSelect} />
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[420px]">
              <div className="font-semibold mb-4 flex-shrink-0">Diagnosis Detail</div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <PatientDiagnosisList patient={selectedPatient} />
              </div>
            </section>
          </div>

          {/* Admissions and Patient Visits - always side by side */}
          <div className="grid gap-4 md:grid-cols-2">
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[420px]">
              <div className="font-semibold mb-4 flex-shrink-0">Admissions</div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <AdmissionList patient={selectedPatient} onPatientFromAdmission={handlePatientSelect} />
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[420px]">
              <div className="font-semibold mb-4 flex-shrink-0">Patient Visits</div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <PatientVisitList patient={selectedPatient} onPatientFromVisit={handlePatientSelect} />
              </div>
            </section>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[420px]">
              <div className="font-semibold mb-4 flex-shrink-0">Lab Test Reports</div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <LabTestList patient={selectedPatient} onPatientClick={handlePatientSelect} />
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[420px]">
              <div className="font-semibold mb-4 flex-shrink-0">Discharge Form</div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <DischargeList patient={selectedPatient} onPatientClick={handlePatientSelect} />
              </div>
            </section>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[420px]">
              <div className="font-semibold mb-4 flex-shrink-0">Service Requests</div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <ServiceRequestList patient={selectedPatient} onPatientClick={handlePatientSelect} />
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[420px]">
              <div className="font-semibold mb-4 flex-shrink-0">Appointments</div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <AppointmentList patient={selectedPatient} showAll={true} onPatientClick={handlePatientSelect} />
              </div>
            </section>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[420px]">
              <div className="font-semibold mb-4 flex-shrink-0">Vital Signs</div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <VitalSignsList patient={selectedPatient} onPatientClick={handlePatientSelect} />
              </div>
            </section>

            {observationsAllowedForMode(mode) && (
              <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[420px]">
                <div className="font-semibold mb-4 flex-shrink-0">Observation</div>
                <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                  <ObservationList patient={selectedPatient} onPatientClick={handlePatientSelect} />
                </div>
              </section>
            )}
          </div>

          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4">Medical History</div>
            <MedicalHistoryView patient={selectedPatient} />
          </section>

          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4">Package Details</div>
            <PackageDetailsList patient={selectedPatient} />
          </section>
        </div>
      )}
    </div>
  )
}