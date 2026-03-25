import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCareContext } from '../providers/CareContextProvider'
import { PatientSearch } from '../components/patients/PatientSearch'
import { NotificationBell } from '../components/notifications/NotificationBell'
import { UserMenu } from '../components/user/UserMenu'
import { ECTDashboard } from '../components/ect/ECTDashboard'

export const AnesthesiologistPage = () => {
  const { selectedPatient: globalPatient, setSelectedPatient: setGlobalPatient } = useCareContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const screen = searchParams.get('screen') || ''
  const patientFromUrl = searchParams.get('patient') || ''

  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(() => patientFromUrl || globalPatient || undefined)

  // Modal show states

  useEffect(() => {
    const patientParam = searchParams.get('patient') || ''
    if (patientParam && patientParam !== selectedPatient) {
      setSelectedPatient(patientParam)
    } else if (!patientParam && selectedPatient) {
      setSelectedPatient(undefined)
    }
  }, [searchParams])

  const handlePatientSelect = (patient: string | undefined) => {
    setSelectedPatient(patient)
    setGlobalPatient(patient)
    const next = new URLSearchParams(searchParams)
    if (patient) next.set('patient', patient)
    else next.delete('patient')
    setSearchParams(next, { replace: true })
  }

  const header = (
    <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
      <div className="flex-1 min-w-0">
        <PatientSearch selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <UserMenu />
        <NotificationBell />
      </div>
    </header>
  )

  const plusBtn = (onClick: () => void, title: string) => (
    <button
      onClick={onClick}
      className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
      title={title}
    >+</button>
  )

  // ── Single-card screens (sidebar subtopics) ──────────────────────────────────

  if (screen === 'a-anesthesia-consent') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>ECT Anesthesia Consent</span>
              {plusBtn(() => setShowECTAnesthesiaConsentModal(true), 'Add ECT Anesthesia Consent')}
            </div>
            <p className="text-sm text-slate-600 mb-3">Record anesthesia consent with signatures from the anesthesiologist, patient, guardian, and witness.</p>
            <ECTAnesthesiaConsentList patient={selectedPatient} refreshKey={ectConsentRefreshKey} />
          </section>
        </div>
        {showECTAnesthesiaConsentModal && (
          <ECTAnesthesiaConsentModal admissionNo="" patient={selectedPatient} patientName=""
            onClose={() => setShowECTAnesthesiaConsentModal(false)}
            onSuccess={() => { setEctConsentRefreshKey(p => p + 1); setShowECTAnesthesiaConsentModal(false) }} />
        )}
      </div>
    )
  }

  if (screen === 'a-pre-anesthesia') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Pre Anesthesia Assessment</span>
              {plusBtn(() => setShowPreAnesthesiaModal(true), 'Add Pre Anesthesia Assessment')}
            </div>
            <p className="text-sm text-slate-600 mb-3">Comprehensive pre-operative assessment covering all body systems with ASA classification.</p>
            <PreAnesthesiaAssessmentList patient={selectedPatient} refreshKey={preAnesthesiaRefreshKey} />
          </section>
        </div>
        {showPreAnesthesiaModal && (
          <PreAnesthesiaAssessmentModal admissionNo="" patient={selectedPatient} patientName=""
            onClose={() => setShowPreAnesthesiaModal(false)}
            onSuccess={() => { setPreAnesthesiaRefreshKey(p => p + 1); setShowPreAnesthesiaModal(false) }} />
        )}
      </div>
    )
  }

  if (screen === 'a-anesthesia-record') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Anesthesia Record</span>
              {plusBtn(() => setShowAnesthesiaRecordModal(true), 'Add Anesthesia Record')}
            </div>
            <p className="text-sm text-slate-600 mb-3">Record anesthesia administration details, patient monitoring, and intra-procedure events.</p>
            <AdmissionAssessmentList doctype="Anesthesia Record" doctypeLabel="Anesthesia Record" patient={selectedPatient} refreshKey={anesthesiaRecordRefreshKey} />
          </section>
        </div>
        {showAnesthesiaRecordModal && (
          <AnesthesiaRecordModal admissionNo="" patient={selectedPatient || ''} patientName=""
            onClose={() => setShowAnesthesiaRecordModal(false)}
            onSuccess={() => { setAnesthesiaRecordRefreshKey(p => p + 1); setShowAnesthesiaRecordModal(false) }} />
        )}
      </div>
    )
  }

  if (screen === 'a-recovery-room') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Recovery Room Record</span>
              {plusBtn(() => setShowRecoveryRoomModal(true), 'Add Recovery Room Record')}
            </div>
            <p className="text-sm text-slate-600 mb-3">Document post-procedure recovery room events, vitals, and nursing observations.</p>
            <AdmissionAssessmentList doctype="Recovery Room Record" doctypeLabel="Recovery Room Record" patient={selectedPatient} refreshKey={recoveryRoomRefreshKey} />
          </section>
        </div>
        {showRecoveryRoomModal && (
          <RecoveryRoomRecordModal admissionNo="" patient={selectedPatient || ''} patientName=""
            onClose={() => setShowRecoveryRoomModal(false)}
            onSuccess={() => { setRecoveryRoomRefreshKey(p => p + 1); setShowRecoveryRoomModal(false) }} />
        )}
      </div>
    )
  }

  if (screen === 'a-alderete') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Modified Alderete Score</span>
              {plusBtn(() => setShowAldereteModal(true), 'Add Modified Alderete Score')}
            </div>
            <p className="text-sm text-slate-600 mb-3">Score patient recovery readiness for discharge from the recovery room.</p>
            <AdmissionAssessmentList doctype="Modified Alderete Score" doctypeLabel="Modified Alderete Score" patient={selectedPatient} refreshKey={aldereteRefreshKey} />
          </section>
        </div>
        {showAldereteModal && (
          <ModifiedAldereteScoreModal admissionNo="" patient={selectedPatient || ''} patientName=""
            onClose={() => setShowAldereteModal(false)}
            onSuccess={() => { setAldereteRefreshKey(p => p + 1); setShowAldereteModal(false) }} />
        )}
      </div>
    )
  }

  if (screen === 'a-timeout') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Time Out Procedure</span>
              {plusBtn(() => setShowTimeOutModal(true), 'Add Time Out Procedure')}
            </div>
            <p className="text-sm text-slate-600 mb-3">Complete the pre-procedure time-out checklist to verify patient identity, procedure, and site.</p>
            <AdmissionAssessmentList doctype="Time Out Procedure" doctypeLabel="Time Out Procedure" patient={selectedPatient} refreshKey={timeOutRefreshKey} />
          </section>
        </div>
        {showTimeOutModal && (
          <TimeOutProcedureModal admissionNo="" patient={selectedPatient || ''} patientName=""
            onClose={() => setShowTimeOutModal(false)}
            onSuccess={() => { setTimeOutRefreshKey(p => p + 1); setShowTimeOutModal(false) }} />
        )}
      </div>
    )
  }

  if (screen === 'a-pre-ect') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Pre-ECT Checklist</span>
              {plusBtn(() => setShowPreEctModal(true), 'Add Pre-ECT Checklist')}
            </div>
            <p className="text-sm text-slate-600 mb-3">Verify all pre-ECT requirements are met before proceeding with the procedure.</p>
            <AdmissionAssessmentList doctype="Pre-ECT Checklist" doctypeLabel="Pre-ECT Checklist" patient={selectedPatient} refreshKey={preEctRefreshKey} />
          </section>
        </div>
        {showPreEctModal && (
          <PreEctChecklistModal admissionNo="" patient={selectedPatient || ''} patientName=""
            onClose={() => setShowPreEctModal(false)}
            onSuccess={() => { setPreEctRefreshKey(p => p + 1); setShowPreEctModal(false) }} />
        )}
      </div>
    )
  }

  if (screen === 'a-suicidal') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Suicidal Patient Assessment</span>
              {plusBtn(() => setShowSuicidalModal(true), 'Add Suicidal Patient Assessment')}
            </div>
            <p className="text-sm text-slate-600 mb-3">Assess patient suicide risk factors, history, and current ideation.</p>
            <AdmissionAssessmentList doctype="Suicidal Patient Assessment" doctypeLabel="Suicidal Patient Assessment" patient={selectedPatient} refreshKey={suicidalRefreshKey} />
          </section>
        </div>
        {showSuicidalModal && (
          <SuicidalPatientAssessmentModal admissionNo="" patient={selectedPatient || ''} patientName=""
            onClose={() => setShowSuicidalModal(false)}
            onSuccess={() => { setSuicidalRefreshKey(p => p + 1); setShowSuicidalModal(false) }} />
        )}
      </div>
    )
  }

  if (screen === 'a-ect-admission') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>ECT Admission</span>
              {plusBtn(() => setShowECTAdmissionModal(true), 'Add ECT Admission')}
            </div>
            <p className="text-sm text-slate-600 mb-3">Record admission details for patients undergoing ECT.</p>
            <ECTAdmissionList patient={selectedPatient} />
          </section>
        </div>
        {showECTAdmissionModal && (
          <CreateECTAdmissionModal onClose={() => setShowECTAdmissionModal(false)}
            onSuccess={() => { setShowECTAdmissionModal(false); window.location.reload() }}
            initialPatient={selectedPatient} />
        )}
      </div>
    )
  }

  if (screen === 'a-ect-procedure') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>ECT Procedure</span>
              {plusBtn(() => setShowECTProcedureModal(true), 'Add ECT Procedure')}
            </div>
            <p className="text-sm text-slate-600 mb-3">Capture procedure details for each ECT session including vitals and clinical notes.</p>
            <ECTProcedureList patient={selectedPatient} />
          </section>
        </div>
        {showECTProcedureModal && (
          <CreateECTProcedureModal onClose={() => setShowECTProcedureModal(false)}
            onSuccess={() => setShowECTProcedureModal(false)}
            initialPatient={selectedPatient} />
        )}
      </div>
    )
  }

  if (screen === 'a-ect-details') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>ECT Details</span>
              {plusBtn(() => setShowECTModal(true), 'Add ECT Detail')}
            </div>
            <ECTDetailsList patient={selectedPatient} refreshKey={ectRefreshKey} />
          </section>
        </div>
        {showECTModal && (
          <CreateECTDetailModal onClose={() => setShowECTModal(false)}
            onSuccess={() => { setEctRefreshKey(p => p + 1); setShowECTModal(false) }}
            initialPatient={selectedPatient} />
        )}
      </div>
    )
  }

  if (screen === 'a-physical') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Physical Examination</span>
              {plusBtn(() => setShowPhysicalExamModal(true), 'Add Physical Examination')}
            </div>
            <p className="text-sm text-slate-600 mb-3">Document systematic physical examination findings across all body systems.</p>
            <PhysicalExaminationList patient={selectedPatient} refreshKey={physicalExamRefreshKey} />
          </section>
        </div>
        {showPhysicalExamModal && (
          <PhysicalExaminationModal admissionNo="" patient={selectedPatient || ''} patientName=""
            onClose={() => setShowPhysicalExamModal(false)}
            onSuccess={() => { setPhysicalExamRefreshKey(p => p + 1); setShowPhysicalExamModal(false) }} />
        )}
      </div>
    )
  }

  if (screen === 'a-patient-history') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Patient History</span>
              {plusBtn(() => setShowPatientHistoryModal(true), 'Add Patient History')}
            </div>
            <p className="text-sm text-slate-600 mb-3">Record detailed patient history including presenting complaints and past history.</p>
            <PatientHistoryList patient={selectedPatient} refreshKey={patientHistoryRefreshKey} />
          </section>
        </div>
        {showPatientHistoryModal && (
          <PatientHistoryModal admissionNo="" patient={selectedPatient || ''} patientName=""
            onClose={() => setShowPatientHistoryModal(false)}
            onSuccess={() => { setPatientHistoryRefreshKey(p => p + 1); setShowPatientHistoryModal(false) }} />
        )}
      </div>
    )
  }

  // ── Default: ECT Dashboard ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {header}
      <div className="flex-1 overflow-y-auto p-4">
        <ECTDashboard selectedPatient={selectedPatient} />
      </div>
    </div>
  )
}