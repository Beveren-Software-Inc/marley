import { useState } from 'react'
import { useAuth } from '../../providers/AuthProvider'
import { useCareContext } from '../../providers/CareContextProvider'
import { isAdmin } from '../../config/permissions'
import { ECTDetailsList } from './ECTDetailsList'
import { ConsolidatedECTDetailsList } from './ConsolidatedECTDetailsList'
import { ECTChart } from './ECTChart'  // ADDED: Import ECTChart
import { ECTAdmissionList } from './ECTAdmissionList'
import { ECTProcedureList } from './ECTProcedureList'
import { CreateECTAdmissionModal } from './CreateECTAdmissionModal'
import { CreateECTProcedureModal } from './CreateECTProcedureModal'
import { CreateECTDetailModal } from './CreateECTDetailModal'
import { ECTAnesthesiaConsentList } from './ECTAnesthesiaConsentList'
import { ECTAnesthesiaConsentModal } from './ECTAnesthesiaConsentModal'
import { PreAnesthesiaAssessmentList } from './PreAnesthesiaAssessmentList'
import { PreAnesthesiaAssessmentModal } from './PreAnesthesiaAssessmentModal'
import { AdmissionAssessmentList } from '../admissions/AdmissionAssessmentList'
import { RecoveryRoomRecordModal } from '../admissions/RecoveryRoomRecordModal'
import { AnesthesiaRecordModal } from '../admissions/AnesthesiaRecordModal'
import { TimeOutProcedureModal } from '../admissions/TimeOutProcedureModal'
import { PreEctChecklistModal } from '../admissions/PreEctChecklistModal'
import { ModifiedAldereteScoreModal } from '../admissions/ModifiedAldereteScoreModal'
import { PhysicalExaminationList } from '../physicalExam/PhysicalExaminationList'
import { PhysicalExaminationModal } from '../physicalExam/PhysicalExaminationModal'
import { PatientHistoryList } from '../patientHistory/PatientHistoryList'
import { PatientHistoryModal } from '../patientHistory/PatientHistoryModal'
import { ECTProcedureConsentModal } from './ECTProcedureConsentModal'
import { ECTPatientHealthHistoryModal } from './ECTPatientHealthHistoryModal'

type EctTab =
  | 'anesthesia-consent' | 'pre-anesthesia' | 'anesthesia-record'
  | 'recovery-room' | 'alderete' | 'timeout' | 'pre-ect' | 'suicidal'
  | 'ect-admission' | 'ect-procedure' | 'ect-procedure-consent' | 'ect-patient-health-history' | 'ect-details' | 'consolidated-ect-details' | 'ect-chart' | 'physical' | 'patient-history'

interface CardDef {
  id: EctTab
  title: string
  desc: string
  color: string
  dot: string
  onAdd?: () => void
}

interface ECTDashboardProps {
  selectedPatient?: string
}

export function ECTDashboard({ selectedPatient }: ECTDashboardProps) {
  const [ectTab, setEctTab] = useState<EctTab>('anesthesia-consent')

  // F046: only anesthesiologists/admins may see the anesthesia sub-workflow cards
  // (Recovery Room / Alderete / Pre-ECT); their doctypes 403 for other roles.
  const { user } = useAuth()
  const { activeAdmission } = useCareContext()
  const roles = user?.roles ?? []
  const canSeeAnesthesia =
    isAdmin(roles) ||
    roles.some((r) => {
      const rl = r.trim().toLowerCase()
      return rl.includes('anesthesiologist') || rl.includes('anaesthesiologist')
    })

  // Modal show states
  const [showECTModal, setShowECTModal] = useState(false)
  const [ectRefreshKey, setEctRefreshKey] = useState(0)
  const [showECTAdmissionModal, setShowECTAdmissionModal] = useState(false)
  const [showECTProcedureModal, setShowECTProcedureModal] = useState(false)
  const [showECTProcedureConsentModal, setShowECTProcedureConsentModal] = useState(false)
  const [ectProcedureConsentRefreshKey, setEctProcedureConsentRefreshKey] = useState(0)
  const [showECTPatientHealthHistoryModal, setShowECTPatientHealthHistoryModal] = useState(false)
  const [ectPatientHealthHistoryRefreshKey, setEctPatientHealthHistoryRefreshKey] = useState(0)
  const [showECTAnesthesiaConsentModal, setShowECTAnesthesiaConsentModal] = useState(false)
  const [ectConsentRefreshKey, setEctConsentRefreshKey] = useState(0)
  const [showPreAnesthesiaModal, setShowPreAnesthesiaModal] = useState(false)
  const [preAnesthesiaRefreshKey, setPreAnesthesiaRefreshKey] = useState(0)
  const [showAnesthesiaRecordModal, setShowAnesthesiaRecordModal] = useState(false)
  const [anesthesiaRecordRefreshKey, setAnesthesiaRecordRefreshKey] = useState(0)
  const [showRecoveryRoomModal, setShowRecoveryRoomModal] = useState(false)
  const [recoveryRoomRefreshKey, setRecoveryRoomRefreshKey] = useState(0)
  const [showAldereteModal, setShowAldereteModal] = useState(false)
  const [aldereteRefreshKey, setAldereteRefreshKey] = useState(0)
  const [showTimeOutModal, setShowTimeOutModal] = useState(false)
  const [timeOutRefreshKey, setTimeOutRefreshKey] = useState(0)
  const [showPreEctModal, setShowPreEctModal] = useState(false)
  const [preEctRefreshKey, setPreEctRefreshKey] = useState(0)
  // const [showSuicidalModal, setShowSuicidalModal] = useState(false)
  // const [suicidalRefreshKey, setSuicidalRefreshKey] = useState(0)
  const [showPhysicalExamModal, setShowPhysicalExamModal] = useState(false)
  const [physicalExamRefreshKey, setPhysicalExamRefreshKey] = useState(0)
  const [showPatientHistoryModal, setShowPatientHistoryModal] = useState(false)
  const [patientHistoryRefreshKey, setPatientHistoryRefreshKey] = useState(0)

  const ALL_CARDS: CardDef[] = [
    { id: 'anesthesia-consent', title: 'Anesthesia Consent',  desc: 'Consent with signatures',        color: 'bg-indigo-50 text-indigo-700 border-indigo-200',    dot: 'bg-indigo-500',   onAdd: () => setShowECTAnesthesiaConsentModal(true) },
    { id: 'pre-anesthesia',     title: 'Pre-Anesthesia',      desc: 'Pre-op body system assessment',  color: 'bg-purple-50 text-purple-700 border-purple-200',    dot: 'bg-purple-500',   onAdd: () => setShowPreAnesthesiaModal(true) },
    { id: 'anesthesia-record',  title: 'Anesthesia Record',   desc: 'Administration & monitoring',    color: 'bg-violet-50 text-violet-700 border-violet-200',    dot: 'bg-violet-500',   onAdd: () => setShowAnesthesiaRecordModal(true) },
    { id: 'recovery-room',      title: 'Recovery Room',       desc: 'Post-procedure events & vitals', color: 'bg-teal-50 text-teal-700 border-teal-200',          dot: 'bg-teal-500',     onAdd: () => setShowRecoveryRoomModal(true) },
    { id: 'alderete',           title: 'Alderete Score',      desc: 'Recovery discharge readiness',   color: 'bg-green-50 text-green-700 border-green-200',       dot: 'bg-green-500',    onAdd: () => setShowAldereteModal(true) },
    { id: 'timeout',            title: 'Time Out',            desc: 'Pre-procedure checklist',        color: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-500',    onAdd: () => setShowTimeOutModal(true) },
    { id: 'pre-ect',            title: 'Pre-ECT Checklist',   desc: 'Requirements before ECT',        color: 'bg-orange-50 text-orange-700 border-orange-200',    dot: 'bg-orange-500',   onAdd: () => setShowPreEctModal(true) },
    // { id: 'suicidal',           title: 'Suicidal Assessment', desc: 'Risk factors & ideation',        color: 'bg-rose-50 text-rose-700 border-rose-200',          dot: 'bg-rose-500',     onAdd: () => setShowSuicidalModal(true) },
    { id: 'ect-admission',      title: 'ECT Admission',       desc: 'Admission for ECT patients',     color: 'bg-cyan-50 text-cyan-700 border-cyan-200',          dot: 'bg-cyan-500',     onAdd: () => setShowECTAdmissionModal(true) },
    { id: 'ect-procedure-consent', title: 'ECT Procedure Consent', desc: 'ECT consent with terms',   color: 'bg-indigo-50 text-indigo-700 border-indigo-200',     dot: 'bg-indigo-500',   onAdd: () => setShowECTProcedureConsentModal(true) },
    { id: 'ect-patient-health-history', title: 'Patient Health History', desc: 'Health history items', color: 'bg-rose-50 text-rose-700 border-rose-200',           dot: 'bg-rose-500',     onAdd: () => setShowECTPatientHealthHistoryModal(true) },
    { id: 'ect-procedure',      title: 'ECT Procedure',       desc: 'Session details & vitals',       color: 'bg-sky-50 text-sky-700 border-sky-200',             dot: 'bg-sky-500',      onAdd: () => setShowECTProcedureModal(true) },
    { id: 'ect-details',        title: 'ECT Details',         desc: 'ECT detail records',             color: 'bg-blue-50 text-blue-700 border-blue-200',          dot: 'bg-blue-500',     onAdd: () => setShowECTModal(true) },
    { id: 'consolidated-ect-details', title: 'Consolidated ECT Details', desc: 'Patient ECT session counts', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', dot: 'bg-indigo-500' },
    { id: 'ect-chart',          title: 'ECT Chart',           desc: 'Patient ECT session summary',    color: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200', dot: 'bg-fuchsia-500' },  // ADDED: New ECT Chart card
    { id: 'physical',           title: 'Physical Exam',       desc: 'All body systems examination',   color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500',  onAdd: () => setShowPhysicalExamModal(true) },
    { id: 'patient-history',    title: 'Patient History',     desc: 'Complaints & past history',      color: 'bg-slate-50 text-slate-700 border-slate-200',       dot: 'bg-slate-500',    onAdd: () => setShowPatientHistoryModal(true) },
  ]

  const ANESTHESIA_ONLY: EctTab[] = ['recovery-room', 'alderete', 'pre-ect']
  const CARDS: CardDef[] = ALL_CARDS.filter(
    (c) => canSeeAnesthesia || !ANESTHESIA_ONLY.includes(c.id),
  )

  const activeCard = CARDS.find(c => c.id === ectTab) ?? CARDS[0]

  const sectionContent = (id: EctTab) => {
    switch (id) {
      case 'anesthesia-consent': return <ECTAnesthesiaConsentList patient={selectedPatient} refreshKey={ectConsentRefreshKey} />
      case 'pre-anesthesia':     return <PreAnesthesiaAssessmentList patient={selectedPatient} refreshKey={preAnesthesiaRefreshKey} />
      case 'anesthesia-record':  return <AdmissionAssessmentList doctype="Anesthesia Record" doctypeLabel="Anesthesia Record" patient={selectedPatient} refreshKey={anesthesiaRecordRefreshKey} />
      case 'recovery-room':      return <AdmissionAssessmentList doctype="Recovery Room Record" doctypeLabel="Recovery Room Record" patient={selectedPatient} refreshKey={recoveryRoomRefreshKey} />
      case 'alderete':           return <AdmissionAssessmentList doctype="Modified Alderete Score" doctypeLabel="Modified Alderete Score" patient={selectedPatient} refreshKey={aldereteRefreshKey} />
      case 'timeout':            return <AdmissionAssessmentList doctype="Time Out Procedure" doctypeLabel="Time Out Procedure" patient={selectedPatient} refreshKey={timeOutRefreshKey} />
      case 'pre-ect':            return <AdmissionAssessmentList doctype="Pre-ECT Checklist" doctypeLabel="Pre-ECT Checklist" patient={selectedPatient} refreshKey={preEctRefreshKey} />
      case 'suicidal':           return <AdmissionAssessmentList doctype="Suicidal Patient Assessment" doctypeLabel="Suicidal Patient Assessment" patient={selectedPatient} refreshKey={0} />
      case 'ect-admission':      return <ECTAdmissionList patient={selectedPatient} />
      case 'ect-procedure-consent': return <AdmissionAssessmentList doctype="ECT Procedure Consent" doctypeLabel="ECT Procedure Consent" patient={selectedPatient} refreshKey={ectProcedureConsentRefreshKey} />
      case 'ect-patient-health-history': return <AdmissionAssessmentList doctype="Patient Health History" doctypeLabel="Patient Health History" patient={selectedPatient} refreshKey={ectPatientHealthHistoryRefreshKey} />
      case 'ect-procedure':      return <ECTProcedureList patient={selectedPatient} />
      case 'ect-details':        return <ECTDetailsList patient={selectedPatient} refreshKey={ectRefreshKey} />
      case 'consolidated-ect-details':
        return <ConsolidatedECTDetailsList patient={selectedPatient} refreshKey={ectRefreshKey} />
      case 'ect-chart':          return <ECTChart patient={selectedPatient} />  // ADDED: Case for ECT Chart
      case 'physical':           return <PhysicalExaminationList patient={selectedPatient} refreshKey={physicalExamRefreshKey} />
      case 'patient-history':    return <PatientHistoryList patient={selectedPatient} refreshKey={patientHistoryRefreshKey} />
      default:                   return null
    }
  }

  return (
    <div className="space-y-4">

      {/* ── Nav cards ── */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-2">
        {CARDS.map(card => {
          const isActive = ectTab === card.id
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => setEctTab(card.id)}
              className={`flex flex-col items-start gap-1 rounded-xl border-2 px-3 py-2.5 text-left transition-all hover:shadow-md ${
                isActive ? `${card.color} shadow-sm` : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isActive ? card.dot : 'bg-slate-300'}`} />
              <span className="text-xs font-semibold leading-tight">{card.title}</span>
            </button>
          )
        })}
      </div>

      {/* ── Content panel ── */}
      <section className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className={`flex items-center justify-between px-4 py-3 border-b border-slate-100 ${activeCard.color} border-0`}>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${activeCard.dot}`} />
            <div>
              <p className="text-sm font-semibold">{activeCard.title}</p>
              <p className="text-xs opacity-75 mt-0.5">{activeCard.desc}</p>
            </div>
          </div>
          {activeCard.onAdd && (
            <button
              onClick={activeCard.onAdd}
              className="w-7 h-7 rounded-full bg-white/70 hover:bg-white text-slate-700 flex items-center justify-center text-sm font-bold transition-colors"
              title={`Add ${activeCard.title}`}
            >+</button>
          )}
        </div>
        <div className="p-4 overflow-y-auto" style={{ maxHeight: '65vh', scrollbarWidth: 'thin' }}>
          {sectionContent(ectTab)}
        </div>
      </section>

      {/* ── Modals ── */}
      {showECTAdmissionModal && (
        <CreateECTAdmissionModal
          onClose={() => setShowECTAdmissionModal(false)}
          onSuccess={() => { setShowECTAdmissionModal(false); window.location.reload() }}
          initialPatient={selectedPatient}
        />
      )}
      {showECTProcedureModal && (
        <CreateECTProcedureModal
          onClose={() => setShowECTProcedureModal(false)}
          onSuccess={() => setShowECTProcedureModal(false)}
          initialPatient={selectedPatient}
        />
      )}
      {showECTProcedureConsentModal && (
        <ECTProcedureConsentModal
          admissionNo={activeAdmission || ''}
          patient={selectedPatient || ''}
          patientName=""
          onClose={() => setShowECTProcedureConsentModal(false)}
          onSuccess={() => { setEctProcedureConsentRefreshKey(p => p + 1); setShowECTProcedureConsentModal(false) }}
        />
      )}
      {showECTPatientHealthHistoryModal && (
        <ECTPatientHealthHistoryModal
          admissionNo={activeAdmission || ''}
          patient={selectedPatient || ''}
          patientName=""
          onClose={() => setShowECTPatientHealthHistoryModal(false)}
          onSuccess={() => { setEctPatientHealthHistoryRefreshKey(p => p + 1); setShowECTPatientHealthHistoryModal(false) }}
        />
      )}
      {showECTModal && (
        <CreateECTDetailModal
          onClose={() => setShowECTModal(false)}
          onSuccess={() => { setEctRefreshKey(p => p + 1); setShowECTModal(false) }}
          initialPatient={selectedPatient}
        />
      )}
      {showECTAnesthesiaConsentModal && (
        <ECTAnesthesiaConsentModal admissionNo="" patient={selectedPatient} patientName=""
          onClose={() => setShowECTAnesthesiaConsentModal(false)}
          onSuccess={() => { setEctConsentRefreshKey(p => p + 1); setShowECTAnesthesiaConsentModal(false) }}
        />
      )}
      {showPreAnesthesiaModal && (
        <PreAnesthesiaAssessmentModal admissionNo="" patient={selectedPatient} patientName=""
          onClose={() => setShowPreAnesthesiaModal(false)}
          onSuccess={() => { setPreAnesthesiaRefreshKey(p => p + 1); setShowPreAnesthesiaModal(false) }}
        />
      )}
      {showAnesthesiaRecordModal && (
        <AnesthesiaRecordModal admissionNo="" patient={selectedPatient || ''} patientName=""
          onClose={() => setShowAnesthesiaRecordModal(false)}
          onSuccess={() => { setAnesthesiaRecordRefreshKey(p => p + 1); setShowAnesthesiaRecordModal(false) }}
        />
      )}
      {showRecoveryRoomModal && (
        <RecoveryRoomRecordModal admissionNo="" patient={selectedPatient || ''} patientName=""
          onClose={() => setShowRecoveryRoomModal(false)}
          onSuccess={() => { setRecoveryRoomRefreshKey(p => p + 1); setShowRecoveryRoomModal(false) }}
        />
      )}
      {showAldereteModal && (
        <ModifiedAldereteScoreModal admissionNo="" patient={selectedPatient || ''} patientName=""
          onClose={() => setShowAldereteModal(false)}
          onSuccess={() => { setAldereteRefreshKey(p => p + 1); setShowAldereteModal(false) }}
        />
      )}
      {showTimeOutModal && (
        <TimeOutProcedureModal admissionNo="" patient={selectedPatient || ''} patientName=""
          onClose={() => setShowTimeOutModal(false)}
          onSuccess={() => { setTimeOutRefreshKey(p => p + 1); setShowTimeOutModal(false) }}
        />
      )}
      {showPreEctModal && (
        <PreEctChecklistModal admissionNo={activeAdmission || ''} patient={selectedPatient || ''} patientName=""
          onClose={() => setShowPreEctModal(false)}
          onSuccess={() => { setPreEctRefreshKey(p => p + 1); setShowPreEctModal(false) }}
        />
      )}
      {/* {showSuicidalModal && (
        <SuicidalPatientAssessmentModal admissionNo="" patient={selectedPatient || ''} patientName=""
          onClose={() => setShowSuicidalModal(false)}
          onSuccess={() => { setSuicidalRefreshKey(p => p + 1); setShowSuicidalModal(false) }}
        />
      )} */}
      {showPhysicalExamModal && (
        <PhysicalExaminationModal admissionNo="" patient={selectedPatient || ''} patientName=""
          onClose={() => setShowPhysicalExamModal(false)}
          onSuccess={() => { setPhysicalExamRefreshKey(p => p + 1); setShowPhysicalExamModal(false) }}
        />
      )}
      {showPatientHistoryModal && (
        <PatientHistoryModal admissionNo="" patient={selectedPatient || ''} patientName=""
          onClose={() => setShowPatientHistoryModal(false)}
          onSuccess={() => { setPatientHistoryRefreshKey(p => p + 1); setShowPatientHistoryModal(false) }}
        />
      )}
    </div>
  )
}