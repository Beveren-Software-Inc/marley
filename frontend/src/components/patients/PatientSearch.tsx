import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CreatePatientModal } from './CreatePatientModal'
import { PatientAlertsBanner } from './PatientAlertsBanner'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { useCareContext } from '../../providers/CareContextProvider'
import { fetchPatientVisitsFull, type PatientVisitListRow } from '../../services/patientVisits'
import { fetchInpatientRecords, type InpatientRecord } from '../../services/inpatientRecords'

interface PatientSearchProps {
  selectedPatient: string
  onPatientSelect: (patient: string | undefined) => void
  patients?: string[]
  /** When true (default), shows warnings/allergies and medical history banner when a patient is selected. */
  showAlertsBanner?: boolean
}

// Module-level: track which patient's banner has already been shown so it
// only appears once per patient selection, surviving component remounts.
let _bannerShownForPatient: string | null = null

export const PatientSearch = ({
  selectedPatient,
  onPatientSelect,
  showAlertsBanner = true,
}: PatientSearchProps) => {
  const { mode, setMode, setActiveVisit, setActiveAdmission } = useCareContext()
  const [patientQuery, setPatientQuery] = useState('')
  const [patientOpen, setPatientOpen] = useState(false)
  const [showCreatePatient, setShowCreatePatient] = useState(false)
  const [patients, setPatients] = useState<PatientListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedPatientName, setSelectedPatientName] = useState<string>('')
  const [secondaryQuery, setSecondaryQuery] = useState('')
  const [secondaryOpen, setSecondaryOpen] = useState(false)
  const [secondaryLoading, setSecondaryLoading] = useState(false)
  const [secondaryResults, setSecondaryResults] = useState<
    { value: string; label: string; meta?: string; patient?: string; patient_name?: string }[]
  >([])

  // If banner was already shown for this patient (across remounts), start dismissed
  const [alertsBannerDismissed, setAlertsBannerDismissed] = useState(
    () => Boolean(selectedPatient && _bannerShownForPatient === selectedPatient)
  )

  // When patient changes to a NEW patient → reset so banner shows once for the new one
  useEffect(() => {
    if (selectedPatient && selectedPatient !== _bannerShownForPatient) {
      setAlertsBannerDismissed(false)
    } else if (selectedPatient && _bannerShownForPatient === selectedPatient) {
      // Already shown for this patient on a previous mount — keep hidden
      setAlertsBannerDismissed(true)
    }
  }, [selectedPatient])

  // As soon as the banner renders (not dismissed, patient set), mark it as shown
  useEffect(() => {
    if (selectedPatient && !alertsBannerDismissed) {
      _bannerShownForPatient = selectedPatient
    }
  }, [selectedPatient, alertsBannerDismissed])

  // Load patient name when selectedPatient changes (e.g., from URL)
  useEffect(() => {
    if (selectedPatient) {
      const loadPatientName = async () => {
        try {
          const response = await fetch(
            `/api/method/healthcare.api.patient.get_patients?name=${encodeURIComponent(selectedPatient)}`
          )
          const resData = await response.json()
          if (resData?.message?.patient_name) {
            setSelectedPatientName(resData.message.patient_name)
            setPatientQuery(resData.message.patient_name)
          } else {
            setSelectedPatientName(selectedPatient)
            setPatientQuery(selectedPatient)
          }
        } catch (error) {
          console.error('Failed to load patient name:', error)
          setSelectedPatientName(selectedPatient)
          setPatientQuery(selectedPatient)
        }
      }
      loadPatientName()
    } else {
      setSelectedPatientName('')
      setPatientQuery('')
    }
  }, [selectedPatient])

  // Fetch or search patients when dropdown is open
  useEffect(() => {
    if (!patientOpen) return

    const search = async () => {
      setLoading(true)
      try {
        let results: PatientListItem[] = []
        if (patientQuery.trim() === '') {
          // If empty, fetch initial list
          results = await fetchPatients(20, 0)
        } else {
          // Search with query
          results = await searchPatients(patientQuery, 20)
        }
        setPatients(results)
      } catch (error) {
        console.error('Failed to fetch/search patients:', error)
        setPatients([])
      } finally {
        setLoading(false)
      }
    }

    // Debounce search by 300ms
    const timeoutId = setTimeout(() => {
      search()
    }, patientQuery.trim() === '' ? 0 : 300) // No delay for initial load

    return () => clearTimeout(timeoutId)
  }, [patientQuery, patientOpen])

  const hasPatient = Boolean(selectedPatient)

  // OP/IP contextual dropdown search (visits/admissions)
  // Works even when no patient is selected — shows all records in that case.
  useEffect(() => {
    if (!secondaryOpen || (mode !== 'OP' && mode !== 'IP')) {
      setSecondaryResults([])
      return
    }

    const controller = new AbortController()
    // Shorter delay when opening fresh (no query); debounce typed queries
    const delay = secondaryQuery.trim() === '' ? 0 : 300
    const t = setTimeout(async () => {
      setSecondaryLoading(true)
      try {
        if (mode === 'OP') {
          const visits: PatientVisitListRow[] = await fetchPatientVisitsFull(
            selectedPatient || undefined,
            secondaryQuery || undefined
          )
          setSecondaryResults(
            visits.slice(0, 30).map((v) => ({
              value: v.value,
              label: v.label,
              patient: v.patient,
              patient_name: v.patient_name,
              meta: v.encounter_date ? `${v.encounter_date} • ${v.status}` : v.status
            }))
          )
        } else if (mode === 'IP') {
          const admissions: InpatientRecord[] = await fetchInpatientRecords(
            undefined,
            secondaryQuery || undefined,
            selectedPatient || undefined
          )
          setSecondaryResults(
            admissions.slice(0, 30).map((a) => ({
              value: a.name,
              label: `${a.name} - ${a.patient_name || a.patient || ''}`,
              patient: a.patient,
              patient_name: a.patient_name,
              meta: a.status
            }))
          )
        } else {
          setSecondaryResults([])
        }
      } catch (err) {
        console.error('Failed to load contextual records', err)
        setSecondaryResults([])
      } finally {
        setSecondaryLoading(false)
      }
    }, delay)

    return () => {
      clearTimeout(t)
      controller.abort()
    }
  }, [secondaryQuery, secondaryOpen, hasPatient, mode, selectedPatient])

  const alertsPortal =
    showAlertsBanner &&
    selectedPatient &&
    !alertsBannerDismissed &&
    typeof document !== 'undefined' &&
    document.getElementById('patient-alerts-portal')
      ? createPortal(
          <>
            {/* Blurred backdrop over main body so the banner stands out; click to close */}
            <button
              type="button"
              className="fixed inset-0 top-14 left-0 right-0 bottom-0 z-30 md:left-[240px] backdrop-blur-md bg-slate-900/10 cursor-default focus:outline-none"
              onClick={() => { _bannerShownForPatient = selectedPatient || null; setAlertsBannerDismissed(true) }}
              aria-label="Close patient alerts"
            />
            <div className="relative z-40">
              <PatientAlertsBanner
                patient={selectedPatient}
                patientName={selectedPatientName || undefined}
                dismissed={alertsBannerDismissed}
                onDismiss={() => { _bannerShownForPatient = selectedPatient || null; setAlertsBannerDismissed(true) }}
                visible={Boolean(selectedPatient)}
              />
            </div>
          </>,
          document.getElementById('patient-alerts-portal')!
        )
      : null

  return (
    <>
      {alertsPortal}
      <div className="w-full max-w-xs md:max-w-xl">
        <div className="relative flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              value={patientQuery}
              onChange={(e) => {
                const value = e.target.value
                setPatientQuery(value)
                setPatientOpen(true)
                // Clear selection when user clears the input or types something different
                if (selectedPatient && (value === '' || value !== selectedPatientName)) {
                  if (value === '') {
                    onPatientSelect(undefined)
                    setSelectedPatientName('')
                  } else if (value !== selectedPatientName) {
                    onPatientSelect(undefined)
                  }
                }
              }}
              onFocus={() => setPatientOpen(true)}
              placeholder={selectedPatientName || 'Search patient...'}
              className="w-full rounded-md border border-primary/40 pl-2 md:pl-3 pr-20 md:pr-24 py-1.5 md:py-2 text-xs md:text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-white focus:border-white"
            />
            <div className="absolute inset-y-0 right-2 flex items-center gap-1">
              {selectedPatient && patientQuery === selectedPatientName && (
                <button
                  type="button"
                  onClick={() => {
                    onPatientSelect(undefined)
                    setSelectedPatientName('')
                    setPatientQuery('')
                    setPatientOpen(false)
                  }}
                  className="text-slate-400 hover:text-slate-600"
                  title="Clear selection"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowCreatePatient(true)}
                className="w-7 h-7 md:w-8 md:h-8 rounded-md text-primary bg-white flex items-center justify-center hover:bg-primary/30 transition-colors flex-shrink-0"
                title="Create New Patient"
              >
                <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
            {patientOpen && (
              <div className="absolute z-40 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-56 overflow-auto text-slate-900">
                {loading ? (
                  <div className="px-3 py-2 text-xs text-slate-500">Loading patients...</div>
                ) : patients.length > 0 ? (
                  patients.map((patient) => (
                    <button
                      key={patient.name}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                      onClick={() => {
                        const patientName = patient.patient_name || patient.name
                        onPatientSelect(patient.name)
                        setSelectedPatientName(patientName)
                        setPatientQuery(patientName)
                        setPatientOpen(false)
                      }}
                    >
                      <div className="font-medium">{patient.patient_name || patient.name}</div>
                      <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        {patient.file_number && <span>File: {patient.file_number}</span>}
                        {patient.id_number && <span>ID: {patient.id_number}</span>}
                        {patient.mobile && <span>{patient.mobile}</span>}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-xs text-slate-500">
                    {patientQuery ? 'No patients match your search.' : 'No patients found.'}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMode('OP')}
              className={`px-2 md:px-3 py-1 rounded-full text-[10px] md:text-xs font-semibold border transition-colors ${
                mode === 'OP'
                  ? 'bg-white text-primary border-white shadow-sm'
                  : 'bg-white/10 text-white/90 border-white/40 hover:bg-white/20'
              }`}
            >
              OP
            </button>
            <button
              type="button"
              onClick={() => setMode('IP')}
              className={`px-2 md:px-3 py-1 rounded-full text-[10px] md:text-xs font-semibold border transition-colors ${
                mode === 'IP'
                  ? 'bg-white text-primary border-white shadow-sm'
                  : 'bg-white/10 text-white/90 border-white/40 hover:bg-white/20'
              }`}
            >
              IP
            </button>
            {(mode === 'OP' || mode === 'IP') && (
              <div className="relative ml-1 w-full max-w-xs">
                <input
                  type="text"
                  value={secondaryQuery}
                  onChange={(e) => {
                    setSecondaryQuery(e.target.value)
                    setSecondaryOpen(true)
                  }}
                  onFocus={() => setSecondaryOpen(true)}
                  placeholder={mode === 'OP' ? 'Search OP visits…' : 'Search IP admissions…'}
                  className="w-full rounded-md border border-white/60 bg-white/10 px-2 md:px-3 py-1.5 md:py-2 text-xs md:text-sm text-white placeholder:text-white/70 focus:outline-none focus:ring-2 focus:ring-white"
                />
                {secondaryOpen && (
                  <div className="absolute z-40 mt-1 w-full min-w-[280px] rounded-md border border-slate-200 bg-white shadow-lg max-h-64 overflow-auto text-slate-900">
                    {secondaryLoading ? (
                      <div className="px-3 py-2 text-xs text-slate-500">
                        {mode === 'OP' ? 'Loading visits…' : 'Loading admissions…'}
                      </div>
                    ) : secondaryResults.length > 0 ? (
                      secondaryResults.map((row) => (
                        <button
                          key={row.value}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                          onClick={() => {
                            setSecondaryQuery(row.label)
                            if (mode === 'OP') {
                              setActiveVisit(row.value)
                            } else if (mode === 'IP') {
                              setActiveAdmission(row.value)
                            }
                            // Auto-select patient when none is chosen yet
                            if (!hasPatient && row.patient) {
                              onPatientSelect(row.patient)
                              const displayName = row.patient_name || row.patient
                              setSelectedPatientName(displayName)
                              setPatientQuery(displayName)
                            }
                            setSecondaryOpen(false)
                          }}
                        >
                          <div className="font-medium">{row.label}</div>
                          {row.meta && (
                            <div className="text-xs text-slate-500 mt-0.5">{row.meta}</div>
                          )}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-xs text-slate-500">
                        {secondaryQuery
                          ? mode === 'OP'
                            ? 'No visits match your search.'
                            : 'No admissions match your search.'
                          : mode === 'OP'
                            ? 'Loading visits…'
                            : 'Loading admissions…'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showCreatePatient && (
        <CreatePatientModal
          onClose={() => setShowCreatePatient(false)}
          onSuccess={(patientName) => {
            onPatientSelect(patientName)
            setShowCreatePatient(false)
          }}
        />
      )}
    </>
  )
}

