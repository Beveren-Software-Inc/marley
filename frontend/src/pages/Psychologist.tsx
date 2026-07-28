import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCareContext } from '../providers/CareContextProvider'
import { isAdmin } from '../config/permissions'
import { PatientCareHeader } from '../components/patients/PatientCareHeader'
import { ClinicalNotesList } from '../components/clinicalNotes/ClinicalNotesList'
import { CreateClinicalNoteModal } from '../components/clinicalNotes/CreateClinicalNoteModal'
import { DiagnosisSymptomsScreen } from '../components/diagnosis/DiagnosisSymptomsScreen'
import { WarningMessagesList } from '../components/warnings/WarningMessagesList'
import { PatientHistoryList } from '../components/patientHistory/PatientHistoryList'
import { PhysicalExaminationList } from '../components/physicalExam/PhysicalExaminationList'
import { MedicalHistoryView } from '../components/medicalHistory/MedicalHistoryView'
import { CreatePatientMedicalHistoryModal } from '../components/medicalHistory/CreatePatientMedicalHistoryModal'
import { DashboardCard } from '../components/ui/DashboardCard'
import { TherapyNotesPanel } from '../components/therapy/TherapyNotesPanel'
import { TherapySessionPanel } from '../components/therapy/TherapySessionPanel'
import { DoctorOrderList } from '../components/doctorOrder/DoctorOrderList'
import { MainNursingNoteList } from '../components/nursing/MainNursingNoteList'
import { AdmissionList } from '../components/admissions/AdmissionList'
import { PatientVisitList } from '../components/patientVisits/PatientVisitList'
import type { ComponentType } from 'react'
import { ADHDAssessmentList } from '../components/adhd/AdhdAssessmentList'
import { CreateADHDAssessmentModal } from '../components/adhd/CreateADHDAssessmentModal'
import { CreateDepressionAssessmentModal } from '../components/depression/CreateDepressionAssessmentModal'
import { DepressionAssessmentList } from '../components/depression/DepressionAssessmentList'
import { CreateGAD7AssessmentModal } from '../components/gad7/CreateGAD7AssessmentModal'
import { GAD7AssessmentList } from '../components/gad7/GAD7AssessmentList'
import { CreateHomicideRiskAssessmentModal } from '../components/homicide/CreateHomicideRiskAssessmentModal'
import { HomicideRiskAssessmentList } from '../components/homicide/HomicideRiskAssessmentList'
import { CreateMoodDisorderAssessmentModal } from '../components/mood_disorder/CreateMoodDisorderAssessmentModal'
import { MoodDisorderAssessmentList } from '../components/mood_disorder/MoodDisorderAssessmentList'
import { CreatePANSSAssessmentModal } from '../components/panss/CreatePANSSAssessmentModal'
import { PANSSAssessmentList } from '../components/panss/PANSSAssessmentList'
import { CreatePHQ9AssessmentModal } from '../components/phq9/CreatePHQ9AssessmentModal'
import { PHQ9AssessmentList } from '../components/phq9/PHQ9AssessmentList'
import { CreateYBOCSAssessmentModal } from '../components/ybocs/CreateYBOCSAssessmentModal'
import { YBOCSAssessmentList } from '../components/ybocs/YBOCSAssessmentList'
import { CreateYMRSAssessmentModal } from '../components/ymrs/CreateYMRSAssessmentModal'
import { YMRSAssessmentList } from '../components/ymrs/YMRSAssessmentList'
import { SuicidalAssessmentList } from '../components/suicidal/SuicidalAssessmentList'
import { SuicidalPatientAssessmentModal } from '../components/admissions/SuicidalPatientAssessmentModal'
import { MorseFallScaleList } from '../components/morse/MorseFallScaleList'
import { CreateMorseFallScaleModal } from '../components/morse/CreateMorseFallScaleModal'

// Standard assessments — psychologists run these (moved from the doctor sidebar).
const ASSESSMENT_SCREENS: Record<string, { title: string; List: ComponentType<any>; CreateModal: ComponentType<any> }> = {
  fall: { title: 'Morse Fall Scale', List: MorseFallScaleList, CreateModal: CreateMorseFallScaleModal },
  adhd: { title: 'ADHD Assessments', List: ADHDAssessmentList, CreateModal: CreateADHDAssessmentModal },
  depression: { title: 'Depression Assessments', List: DepressionAssessmentList, CreateModal: CreateDepressionAssessmentModal },
  mood: { title: 'Mood Disorder Assessments', List: MoodDisorderAssessmentList, CreateModal: CreateMoodDisorderAssessmentModal },
  gad7: { title: 'GAD7 Assessments', List: GAD7AssessmentList, CreateModal: CreateGAD7AssessmentModal },
  phq9: { title: 'PHQ9 Assessments', List: PHQ9AssessmentList, CreateModal: CreatePHQ9AssessmentModal },
  'homicide-risk': { title: 'Homicide Risk Assessments', List: HomicideRiskAssessmentList, CreateModal: CreateHomicideRiskAssessmentModal },
  ybocs: { title: 'YBOCS Assessments', List: YBOCSAssessmentList, CreateModal: CreateYBOCSAssessmentModal },
  ymrs: { title: 'YMRS Assessments', List: YMRSAssessmentList, CreateModal: CreateYMRSAssessmentModal },
  panss: { title: 'PANSS Assessments', List: PANSSAssessmentList, CreateModal: CreatePANSSAssessmentModal },
}

export const PsychologistPage = () => {
  const {
    selectedPatient: globalPatient,
    setSelectedPatient: setGlobalPatient,
    guardClinicalCreate,
    activeAdmission,
    activeVisit,
    userRole,
  } = useCareContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const screen = searchParams.get('screen') || ''
  // F044: Physical Examination, Patient History and Session Schedule are not readable
  // by the Psychologist role (backend DocPerms → 403). Only expose them to admins.
  const showRestricted = isAdmin(userRole ?? [])
  const patientFromUrl = searchParams.get('patient') || ''

  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(() => patientFromUrl || globalPatient || undefined)

  const [showPsychNoteModal, setShowPsychNoteModal] = useState(false)
  const [showPsychOrderModal, setShowPsychOrderModal] = useState(false)
  const [showNutritionNoteModal, setShowNutritionNoteModal] = useState(false)
  const [showCreateMedicalHistoryModal, setShowCreateMedicalHistoryModal] = useState(false)
  const [medicalHistoryRefreshKey, setMedicalHistoryRefreshKey] = useState(0)

  const [clinicalNotesRefreshKey, setClinicalNotesRefreshKey] = useState(0)
  const [showAssessmentCreate, setShowAssessmentCreate] = useState(false)
  const [assessmentRefreshKey, setAssessmentRefreshKey] = useState(0)
  const [therapyNotesRefreshKey, setTherapyNotesRefreshKey] = useState(0)
  const [sessionRefreshKey, setSessionRefreshKey] = useState(0)

  useEffect(() => {
    const patientParam = searchParams.get('patient')
    if (patientParam && patientParam !== selectedPatient) {
      setSelectedPatient(patientParam)
    }
  }, [searchParams, selectedPatient])

  // Restore patient in URL when sidebar navigation drops the query param
  useEffect(() => {
    const patient = selectedPatient || globalPatient
    if (!patient) return
    if (searchParams.get('patient')) return
    const next = new URLSearchParams(searchParams)
    next.set('patient', patient)
    setSearchParams(next, { replace: true })
  }, [screen, selectedPatient, globalPatient, searchParams, setSearchParams])

  const handlePatientSelect = (patient: string | undefined) => {
    setSelectedPatient(patient)
    setGlobalPatient(patient)
    const next = new URLSearchParams(searchParams)
    if (patient) next.set('patient', patient)
    else next.delete('patient')
    setSearchParams(next, { replace: true })
  }

  const headerPatient = selectedPatient || globalPatient || ''

  const header = (
    <PatientCareHeader selectedPatient={headerPatient} onPatientSelect={handlePatientSelect} patients={[]} />
  )

  // ── Scales & Assessments ──────────────────────────────────────────────────────
  const assessment = ASSESSMENT_SCREENS[screen]
  if (assessment) {
    const { title, List, CreateModal } = assessment
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <DashboardCard
            title={title}
            noHeightLimit
            onAdd={() => guardClinicalCreate(() => setShowAssessmentCreate(true))}
            addButtonTitle={`Create ${title}`}
          >
            <List patient={selectedPatient} refreshKey={assessmentRefreshKey} onPatientClick={handlePatientSelect} />
          </DashboardCard>
        </div>
        {showAssessmentCreate && (
          <CreateModal
            patient={selectedPatient}
            defaultAdmission={activeAdmission || undefined}
            defaultVisit={activeVisit || undefined}
            onClose={() => setShowAssessmentCreate(false)}
            onSuccess={() => {
              setShowAssessmentCreate(false)
              setAssessmentRefreshKey((k) => k + 1)
            }}
          />
        )}
      </div>
    )
  }

  if (screen === 'suicide') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <DashboardCard
            title="Suicidal Assessments"
            noHeightLimit
            onAdd={() => guardClinicalCreate(() => setShowAssessmentCreate(true))}
            addButtonTitle="Add Suicidal Assessment"
          >
            <SuicidalAssessmentList
              patient={selectedPatient}
              admission={activeAdmission}
              refreshKey={assessmentRefreshKey}
            />
          </DashboardCard>
        </div>
        {showAssessmentCreate && (
          <SuicidalPatientAssessmentModal
            admissionNo={activeAdmission || ''}
            patient={selectedPatient || ''}
            patientName=""
            onClose={() => setShowAssessmentCreate(false)}
            onSuccess={() => {
              setShowAssessmentCreate(false)
              setAssessmentRefreshKey((k) => k + 1)
            }}
          />
        )}
      </div>
    )
  }

  // ── Psychologist Notes ────────────────────────────────────────────────────────
  if (screen === 'p-notes') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <DashboardCard
            title="Psychologist Notes"
            onAdd={() => guardClinicalCreate(() => setShowPsychNoteModal(true))}
            addButtonTitle="Add Psychologist Note"
            noHeightLimit
          >
            <ClinicalNotesList
              patient={selectedPatient}
              clinicalNoteType="Psychologist Note"
              key={clinicalNotesRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showPsychNoteModal && (
          <CreateClinicalNoteModal
            onClose={() => setShowPsychNoteModal(false)}
            onSuccess={() => { setClinicalNotesRefreshKey(p => p + 1); setShowPsychNoteModal(false) }}
            initialPatient={selectedPatient}
            defaultClinicalNoteType="Psychologist Note"
            title="Add Psychologist Note"
          />
        )}
      </div>
    )
  }

  // ── Psychologist Orders ───────────────────────────────────────────────────────
  if (screen === 'p-orders') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <DashboardCard
            title="Psychologist Orders"
            onAdd={() => guardClinicalCreate(() => setShowPsychOrderModal(true))}
            addButtonTitle="Add Psychologist Order"
            noHeightLimit
          >
            <ClinicalNotesList
              patient={selectedPatient}
              clinicalNoteType="Psychologist Order"
              key={clinicalNotesRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </DashboardCard>
        </div>
        {showPsychOrderModal && (
          <CreateClinicalNoteModal
            onClose={() => setShowPsychOrderModal(false)}
            onSuccess={() => { setClinicalNotesRefreshKey(p => p + 1); setShowPsychOrderModal(false) }}
            initialPatient={selectedPatient}
            defaultClinicalNoteType="Psychologist Order"
            title="Add Psychologist Order"
          />
        )}
      </div>
    )
  }

  // ── Doctors Orders (read-only, mirrors nurse Documentation) ─────────────────
  if (screen === 'p-doctor-order') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <DoctorOrderList
              patient={selectedPatient}
              admission={activeAdmission || undefined}
              key={clinicalNotesRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </section>
        </div>
      </div>
    )
  }

  // ── Nutrition Notes (mirrors nurse Documentation) ───────────────────────────
  if (screen === 'p-nut') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <DashboardCard title="Nutrition Notes" noHeightLimit>
            <ClinicalNotesList
              patient={selectedPatient}
              clinicalNoteType="Nutritionist Note"
              key={clinicalNotesRefreshKey}
              onPatientClick={handlePatientSelect}
              onAdd={() => guardClinicalCreate(() => setShowNutritionNoteModal(true))}
            />
          </DashboardCard>
        </div>
        {showNutritionNoteModal && (
          <CreateClinicalNoteModal
            onClose={() => setShowNutritionNoteModal(false)}
            onSuccess={() => { setClinicalNotesRefreshKey(p => p + 1); setShowNutritionNoteModal(false) }}
            initialPatient={selectedPatient}
            defaultClinicalNoteType="Nutritionist Note"
            title="Add Nutritionist Note"
          />
        )}
      </div>
    )
  }

  // ── Nursing Notes (read-only, mirrors nurse Documentation) ──────────────────
  if (screen === 'p-nurse-notes') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <MainNursingNoteList
              patient={selectedPatient}
              admission={activeAdmission || undefined}
              key={clinicalNotesRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </section>
        </div>
      </div>
    )
  }

  // ── Diagnoses (read-only for psychologist) ──────────────────────────────────
  if (screen === 'p-dx') {
    return (
      <div className="flex flex-col h-[calc(100dvh-2.25rem)] max-h-[calc(100dvh-2.25rem)] overflow-hidden">
        {header}
        <div className="flex-1 min-h-0 overflow-hidden">
          <DiagnosisSymptomsScreen allowCreate={false} />
        </div>
      </div>
    )
  }

  // ── Warning Messages (read-only) ──────────────────────────────────────────────
  if (screen === 'p-warn') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <DashboardCard title="Warnings & Messages" noHeightLimit>
              <WarningMessagesList patient={selectedPatient} onPatientClick={handlePatientSelect} />
            </DashboardCard>
            <DashboardCard title="Sticky Notes" noHeightLimit>
              <WarningMessagesList
                patient={selectedPatient}
                specialPhoneScope="special_only"
                title="Sticky Notes"
                onPatientClick={handlePatientSelect}
              />
            </DashboardCard>
          </div>
        </div>
      </div>
    )
  }

  // ── Past Medical History (mirrors the doctor's screen) ───────────────────────
  if (screen === 'p-mh') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <DashboardCard
            title="Past Medical History"
            onAdd={() => guardClinicalCreate(() => setShowCreateMedicalHistoryModal(true))}
            addButtonTitle="Add Past Medical History"
            noHeightLimit
            filterable={false}
          >
            {selectedPatient ? (
              <MedicalHistoryView patient={selectedPatient} refreshKey={medicalHistoryRefreshKey} />
            ) : (
              <div className="py-16 text-center text-slate-400">Select a patient to view medical history.</div>
            )}
          </DashboardCard>
        </div>
        {showCreateMedicalHistoryModal && selectedPatient && (
          <CreatePatientMedicalHistoryModal
            patient={selectedPatient}
            defaultAdmission={activeAdmission || undefined}
            onClose={() => setShowCreateMedicalHistoryModal(false)}
            onCreated={() => {
              setMedicalHistoryRefreshKey((prev) => prev + 1)
              setShowCreateMedicalHistoryModal(false)
            }}
          />
        )}
      </div>
    )
  }

  // ── Patient History (read-only) ───────────────────────────────────────────────
  if (screen === 'p-patient-history' && showRestricted) {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <DashboardCard title="Patient History" noHeightLimit>
            <PatientHistoryList patient={selectedPatient} onPatientClick={handlePatientSelect} />
          </DashboardCard>
        </div>
      </div>
    )
  }

  // ── Therapy Notes (under Psychologist → Therapy) ─────────────────────────────
  if (screen === 't-notes') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <TherapyNotesPanel
            patient={selectedPatient}
            refreshKey={therapyNotesRefreshKey}
            onRefresh={() => setTherapyNotesRefreshKey((k) => k + 1)}
            onPatientClick={handlePatientSelect}
          />
        </div>
      </div>
    )
  }

  // ── Session Scheduler (under Psychologist → Therapy) ───────────────────────
  if (screen === 't-session' && showRestricted) {
    return (
      <div className="flex flex-col h-full min-w-0">
        {header}
        <div className="flex-1 min-w-0 overflow-y-auto p-4">
          <TherapySessionPanel
            patient={selectedPatient}
            admissionNumber={activeAdmission || undefined}
            refreshKey={sessionRefreshKey}
            onRefresh={() => setSessionRefreshKey((k) => k + 1)}
            onPatientClick={handlePatientSelect}
          />
        </div>
      </div>
    )
  }

  // ── Physical Examination (read-only) ──────────────────────────────────────────
  if (screen === 'p-physical' && showRestricted) {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <DashboardCard title="Physical Examination" noHeightLimit filterable={false}>
            <PhysicalExaminationList patient={selectedPatient} onPatientClick={handlePatientSelect} />
          </DashboardCard>
        </div>
      </div>
    )
  }

  // ── Default Dashboard ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col">
      {header}
      <div className="p-4 space-y-4">
        <DashboardCard
          title="Psychologist Notes"
          listingScreen="p-notes"
          onAdd={() => guardClinicalCreate(() => setShowPsychNoteModal(true))}
          addButtonTitle="Add Psychologist Note"
          fixedHeight
        >
          <ClinicalNotesList
            patient={selectedPatient}
            clinicalNoteType="Psychologist Note"
            key={clinicalNotesRefreshKey}
            onPatientClick={handlePatientSelect}
          />
        </DashboardCard>

        <DashboardCard
          title="Psychologist Orders"
          listingScreen="p-orders"
          onAdd={() => guardClinicalCreate(() => setShowPsychOrderModal(true))}
          addButtonTitle="Add Psychologist Order"
          fixedHeight
        >
          <ClinicalNotesList
            patient={selectedPatient}
            clinicalNoteType="Psychologist Order"
            key={`order-${clinicalNotesRefreshKey}`}
            onPatientClick={handlePatientSelect}
          />
        </DashboardCard>

        <DashboardCard title="Patient Visits" fixedHeight>
          <PatientVisitList patient={selectedPatient} onPatientFromVisit={handlePatientSelect} />
        </DashboardCard>

        <DashboardCard title="Inpatient" fixedHeight>
          <AdmissionList patient={selectedPatient} onPatientFromAdmission={handlePatientSelect} />
        </DashboardCard>

        <DashboardCard title="Warnings & Messages" listingScreen="p-warn" fixedHeight>
          <WarningMessagesList patient={selectedPatient} onPatientClick={handlePatientSelect} />
        </DashboardCard>

        {showRestricted && (
          <DashboardCard title="Patient History" listingScreen="p-patient-history" fixedHeight>
            <PatientHistoryList patient={selectedPatient} onPatientClick={handlePatientSelect} />
          </DashboardCard>
        )}

        {showRestricted && (
          <DashboardCard title="Physical Examination" listingScreen="p-physical" fixedHeight filterable={false}>
            <PhysicalExaminationList patient={selectedPatient} onPatientClick={handlePatientSelect} />
          </DashboardCard>
        )}

        <DashboardCard title="Medical History / Allergies" listingScreen="p-mh" fixedHeight filterable={false}>
          {selectedPatient ? (
            <MedicalHistoryView patient={selectedPatient} />
          ) : (
            <p className="py-4 text-center text-sm text-slate-400">Select a patient</p>
          )}
        </DashboardCard>
      </div>

      {showPsychNoteModal && (
        <CreateClinicalNoteModal
          onClose={() => setShowPsychNoteModal(false)}
          onSuccess={() => { setClinicalNotesRefreshKey(p => p + 1); setShowPsychNoteModal(false) }}
          initialPatient={selectedPatient}
          defaultClinicalNoteType="Psychologist Note"
          title="Add Psychologist Note"
        />
      )}
      {showPsychOrderModal && (
        <CreateClinicalNoteModal
          onClose={() => setShowPsychOrderModal(false)}
          onSuccess={() => { setClinicalNotesRefreshKey(p => p + 1); setShowPsychOrderModal(false) }}
          initialPatient={selectedPatient}
          defaultClinicalNoteType="Psychologist Order"
          title="Add Psychologist Order"
        />
      )}
    </div>
  )
}
