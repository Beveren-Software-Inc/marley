import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PatientSearch } from '../components/patients/PatientSearch'
import { useCareContext } from '../providers/CareContextProvider'
import { PatientSummaryCard } from '../components/patients/PatientSummaryCard'
import { WarningMessagesList } from '../components/warnings/WarningMessagesList'
import { LabTestList } from '../components/labTests/LabTestList'
import { ClinicalNotesList } from '../components/clinicalNotes/ClinicalNotesList'
import { DischargeList } from '../components/discharges/DischargeList'
import { MedicalHistoryView } from '../components/medicalHistory/MedicalHistoryView'
import { PackageDetailsList } from '../components/packageDetails/PackageDetailsList'
import { VitalSignsList } from '../components/vitalSigns/VitalSignsList'
import { ObservationList } from '../components/observations/ObservationList'
import { ServiceRequestList } from '../components/serviceRequests/ServiceRequestList'
import { AppointmentList } from '../components/appointments/AppointmentList'
import { AdmissionList } from '../components/admissions/AdmissionList'
import { PatientVisitList } from '../components/patientVisits/PatientVisitList'
import { NotificationBell } from '../components/notifications/NotificationBell'
import { UserMenu } from '../components/user/UserMenu'
import { fetchPatientHistorySummary, type PatientHistorySummary } from '../services/patients'
import {
  CalendarCheck,
  Building2,
  FileText,
  Receipt,
  AlertCircle,
  DollarSign
} from 'lucide-react'

export const PatientHistoryPage = () => {
  const { mode, selectedPatient: globalPatient, setSelectedPatient: setGlobalPatient } = useCareContext()
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

  const formatCurrency = (value: number) => {
    if (value == null || Number.isNaN(value)) return '0.00'
    return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }


  return (
    <div className="flex flex-col min-h-full">
      <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
        <div className="flex-1 min-w-0">
          <PatientSearch
            selectedPatient={selectedPatient || ''}
            onPatientSelect={handlePatientSelect}
            patients={[]}
          />
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <UserMenu />
          <NotificationBell />
        </div>
      </header>

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

          {/* Summary cards */}
          <section>
            <h2 className="font-semibold text-slate-900 mb-3">Summary</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {mode !== 'IP' && (
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
              )}
              {mode !== 'OP' && (
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
              )}
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
            </div>
          </section>

          {/* Content cards: same as Doctor page */}
          <div className="grid gap-4 md:grid-cols-2">
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[420px]">
              <div className="font-semibold mb-4 flex-shrink-0">Warnings & Allergies</div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <WarningMessagesList patient={selectedPatient} />
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[420px]">
              <div className="font-semibold mb-4 flex-shrink-0">Diagnosis Detail</div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <ClinicalNotesList
                  patient={selectedPatient}
                  clinicalNoteType="Diagnosis Note"
                  hideTypes={true}
                />
              </div>
            </section>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {mode !== 'OP' && (
              <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[420px]">
                <div className="font-semibold mb-4 flex-shrink-0">Admissions</div>
                <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                  <AdmissionList patient={selectedPatient} />
                </div>
              </section>
            )}

            {mode !== 'IP' && (
              <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[420px]">
                <div className="font-semibold mb-4 flex-shrink-0">Patient Visits</div>
                <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                  <PatientVisitList patient={selectedPatient} />
                </div>
              </section>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[420px]">
              <div className="font-semibold mb-4 flex-shrink-0">Lab Test Reports</div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <LabTestList patient={selectedPatient} />
              </div>
            </section>

            {mode !== 'OP' && (
              <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[420px]">
                <div className="font-semibold mb-4 flex-shrink-0">Discharge Form</div>
                <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                  <DischargeList patient={selectedPatient} />
                </div>
              </section>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[420px]">
              <div className="font-semibold mb-4 flex-shrink-0">Service Requests</div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <ServiceRequestList patient={selectedPatient} />
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[420px]">
              <div className="font-semibold mb-4 flex-shrink-0">Appointments</div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <AppointmentList patient={selectedPatient} />
              </div>
            </section>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[420px]">
              <div className="font-semibold mb-4 flex-shrink-0">Vital Signs</div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <VitalSignsList patient={selectedPatient} />
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[420px]">
              <div className="font-semibold mb-4 flex-shrink-0">Observation</div>
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                <ObservationList patient={selectedPatient} />
              </div>
            </section>
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
