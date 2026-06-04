import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCareContext } from '../providers/CareContextProvider'
import { PatientCareHeader } from '../components/patients/PatientCareHeader'
import { ClinicalNotesList } from '../components/clinicalNotes/ClinicalNotesList'
import { CreateClinicalNoteModal } from '../components/clinicalNotes/CreateClinicalNoteModal'
import { DiagnosisSymptomsScreen } from '../components/diagnosis/DiagnosisSymptomsScreen'
import { WarningMessagesList } from '../components/warnings/WarningMessagesList'
import { CreateWarningMessageModal } from '../components/warnings/CreateWarningMessageModal'
import { PatientHistoryList } from '../components/patientHistory/PatientHistoryList'
import { PatientHistoryModal } from '../components/patientHistory/PatientHistoryModal'
import { PhysicalExaminationList } from '../components/physicalExam/PhysicalExaminationList'
import { PhysicalExaminationModal } from '../components/physicalExam/PhysicalExaminationModal'
import { MedicalHistoryView } from '../components/medicalHistory/MedicalHistoryView'
import { PatientSummaryCard } from '../components/patients/PatientSummaryCard'
import { toast } from '../hooks/useToast'

export const PsychologistPage = () => {
  const { selectedPatient: globalPatient, setSelectedPatient: setGlobalPatient } = useCareContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const screen = searchParams.get('screen') || ''
  const patientFromUrl = searchParams.get('patient') || ''

  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(() => patientFromUrl || globalPatient || undefined)

  const [showPsychNoteModal, setShowPsychNoteModal] = useState(false)
  const [showPsychOrderModal, setShowPsychOrderModal] = useState(false)
  const [showWarningModal, setShowWarningModal] = useState(false)
  const [showPatientHistoryModal, setShowPatientHistoryModal] = useState(false)
  const [showPhysicalExamModal, setShowPhysicalExamModal] = useState(false)

  const [clinicalNotesRefreshKey, setClinicalNotesRefreshKey] = useState(0)
  const [warningRefreshKey, setWarningRefreshKey] = useState(0)
  const [patientHistoryRefreshKey, setPatientHistoryRefreshKey] = useState(0)
  const [physicalExamRefreshKey, setPhysicalExamRefreshKey] = useState(0)

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
    <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
  )

  // ── Psychologist Notes ────────────────────────────────────────────────────────
  if (screen === 'p-notes') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Psychologist Notes</span>
              <button
                onClick={() => setShowPsychNoteModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Psychologist Note"
              >+</button>
            </div>
            <ClinicalNotesList
              patient={selectedPatient}
              clinicalNoteType="Psychologist Note"
              key={clinicalNotesRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </section>
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
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Psychologist Orders</span>
              <button
                onClick={() => setShowPsychOrderModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Psychologist Order"
              >+</button>
            </div>
            <ClinicalNotesList
              patient={selectedPatient}
              clinicalNoteType="Psychologist Order"
              key={clinicalNotesRefreshKey}
              onPatientClick={handlePatientSelect}
            />
          </section>
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

  // ── Diagnoses ─────────────────────────────────────────────────────────────────
  if (screen === 'p-dx') {
    return (
      <div className="flex flex-col">
        <DiagnosisSymptomsScreen />
      </div>
    )
  }

  // ── Warning Messages ──────────────────────────────────────────────────────────
  if (screen === 'p-warn') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Warning Messages</span>
              <button
                onClick={() => {
                  if (!selectedPatient) { toast.error('Please select a patient first'); return }
                  setShowWarningModal(true)
                }}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Warning"
              >+</button>
            </div>
            <WarningMessagesList patient={selectedPatient} key={warningRefreshKey} onPatientClick={handlePatientSelect} />
          </section>
        </div>
        {showWarningModal && (
          <CreateWarningMessageModal
            onClose={() => setShowWarningModal(false)}
            onSuccess={() => { setWarningRefreshKey(p => p + 1); setShowWarningModal(false) }}
            initialPatient={selectedPatient}
          />
        )}
      </div>
    )
  }

  // ── Medical History / Allergies ───────────────────────────────────────────────
  if (screen === 'p-mh') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          {selectedPatient ? (
            <MedicalHistoryView patient={selectedPatient} />
          ) : (
            <div className="text-center text-slate-400 py-16">Select a patient to view medical history.</div>
          )}
        </div>
      </div>
    )
  }

  // ── Patient History ───────────────────────────────────────────────────────────
  if (screen === 'p-patient-history') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Patient History</span>
              <button
                onClick={() => setShowPatientHistoryModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Patient History"
              >+</button>
            </div>
            <PatientHistoryList patient={selectedPatient} refreshKey={patientHistoryRefreshKey} onPatientClick={handlePatientSelect} />
          </section>
        </div>
        {showPatientHistoryModal && (
          <PatientHistoryModal
            admissionNo=""
            patient={selectedPatient || ''}
            patientName=""
            onClose={() => setShowPatientHistoryModal(false)}
            onSuccess={() => { setPatientHistoryRefreshKey(p => p + 1); setShowPatientHistoryModal(false) }}
          />
        )}
      </div>
    )
  }

  // ── Physical Examination ──────────────────────────────────────────────────────
  if (screen === 'p-physical') {
    return (
      <div className="flex flex-col">
        {header}
        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Physical Examination</span>
              <button
                onClick={() => setShowPhysicalExamModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Physical Examination"
              >+</button>
            </div>
            <PhysicalExaminationList patient={selectedPatient} refreshKey={physicalExamRefreshKey} onPatientClick={handlePatientSelect} />
          </section>
        </div>
        {showPhysicalExamModal && (
          <PhysicalExaminationModal
            admissionNo=""
            patient={selectedPatient || ''}
            patientName=""
            onClose={() => setShowPhysicalExamModal(false)}
            onSuccess={() => { setPhysicalExamRefreshKey(p => p + 1); setShowPhysicalExamModal(false) }}
          />
        )}
      </div>
    )
  }

  // ── Default Dashboard ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col">
      {header}
      <div className="p-4 space-y-4">
        {selectedPatient && <PatientSummaryCard patient={selectedPatient} />}

        <div className="grid gap-4 md:grid-cols-2">
          {/* Psychologist Notes */}
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col min-h-[400px] max-h-[400px]">
            <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
              <span>Psychologist Notes</span>
              <button
                onClick={() => setShowPsychNoteModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Psychologist Note"
              >+</button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
              <ClinicalNotesList
                patient={selectedPatient}
                clinicalNoteType="Psychologist Note"
                key={clinicalNotesRefreshKey}
                onPatientClick={handlePatientSelect}
              />
            </div>
          </section>

          {/* Psychologist Orders */}
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col min-h-[400px] max-h-[400px]">
            <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
              <span>Psychologist Orders</span>
              <button
                onClick={() => setShowPsychOrderModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Psychologist Order"
              >+</button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
              <ClinicalNotesList
                patient={selectedPatient}
                clinicalNoteType="Psychologist Order"
                key={`order-${clinicalNotesRefreshKey}`}
                onPatientClick={handlePatientSelect}
              />
            </div>
          </section>

          {/* Warning Messages */}
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col min-h-[400px] max-h-[400px]">
            <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
              <span>Warning Messages</span>
              <button
                onClick={() => {
                  if (!selectedPatient) { toast.error('Please select a patient first'); return }
                  setShowWarningModal(true)
                }}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Warning"
              >+</button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
              <WarningMessagesList patient={selectedPatient} key={warningRefreshKey} onPatientClick={handlePatientSelect} />
            </div>
          </section>

          {/* Patient History */}
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col min-h-[400px] max-h-[400px]">
            <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
              <span>Patient History</span>
              <button
                onClick={() => setShowPatientHistoryModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Patient History"
              >+</button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
              <PatientHistoryList patient={selectedPatient} refreshKey={patientHistoryRefreshKey} onPatientClick={handlePatientSelect} />
            </div>
          </section>

          {/* Physical Examination */}
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col min-h-[400px] max-h-[400px]">
            <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
              <span>Physical Examination</span>
              <button
                onClick={() => setShowPhysicalExamModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Add Physical Examination"
              >+</button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
              <PhysicalExaminationList patient={selectedPatient} refreshKey={physicalExamRefreshKey} onPatientClick={handlePatientSelect} />
            </div>
          </section>

          {/* Medical History */}
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col min-h-[400px] max-h-[400px]">
            <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
              <span>Medical History / Allergies</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
              {selectedPatient
                ? <MedicalHistoryView patient={selectedPatient} />
                : <p className="text-sm text-slate-400 text-center py-4">Select a patient</p>
              }
            </div>
          </section>
        </div>
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
      {showWarningModal && (
        <CreateWarningMessageModal
          onClose={() => setShowWarningModal(false)}
          onSuccess={() => { setWarningRefreshKey(p => p + 1); setShowWarningModal(false) }}
          initialPatient={selectedPatient}
        />
      )}
      {showPatientHistoryModal && (
        <PatientHistoryModal
          admissionNo=""
          patient={selectedPatient || ''}
          patientName=""
          onClose={() => setShowPatientHistoryModal(false)}
          onSuccess={() => { setPatientHistoryRefreshKey(p => p + 1); setShowPatientHistoryModal(false) }}
        />
      )}
      {showPhysicalExamModal && (
        <PhysicalExaminationModal
          admissionNo=""
          patient={selectedPatient || ''}
          patientName=""
          onClose={() => setShowPhysicalExamModal(false)}
          onSuccess={() => { setPhysicalExamRefreshKey(p => p + 1); setShowPhysicalExamModal(false) }}
        />
      )}
    </div>
  )
}
