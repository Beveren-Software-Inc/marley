import { useState, useEffect, useRef } from 'react'
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
  showAlertsBanner?: boolean
  alertsAutoDismissMs?: number
}

const STORAGE_KEYS = {
  SELECTED_PATIENT: 'patientSearch_selectedPatient',
  SELECTED_PATIENT_NAME: 'patientSearch_selectedPatientName',
  ACTIVE_MODE: 'patientSearch_activeMode',
  ACTIVE_VISIT: 'patientSearch_activeVisit',
  ACTIVE_ADMISSION: 'patientSearch_activeAdmission',
  ACTIVE_VISIT_LABEL: 'patientSearch_activeVisitLabel',
  ACTIVE_ADMISSION_LABEL: 'patientSearch_activeAdmissionLabel',
} as const

const getStoredValue = (key: string, defaultValue: string = ''): string => {
  if (typeof window === 'undefined') return defaultValue
  try {
    return localStorage.getItem(key) || defaultValue
  } catch {
    return defaultValue
  }
}

const setStoredValue = (key: string, value: string): void => {
  if (typeof window === 'undefined') return
  try {
    if (value) {
      localStorage.setItem(key, value)
    } else {
      localStorage.removeItem(key)
    }
  } catch {
    // Silently fail if localStorage is unavailable
  }
}

const clearPatientData = (): void => {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEYS.SELECTED_PATIENT)
    localStorage.removeItem(STORAGE_KEYS.SELECTED_PATIENT_NAME)
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_VISIT)
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_ADMISSION)
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_VISIT_LABEL)
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_ADMISSION_LABEL)
  } catch {
    // Silently fail if localStorage is unavailable
  }
}

export const PatientSearch = ({
  selectedPatient,
  onPatientSelect,
  showAlertsBanner = true,
  alertsAutoDismissMs = 10000,
}: PatientSearchProps) => {
  const {
    mode,
    setMode,
    setActiveVisit,
    setActiveAdmission,
    setSelectedPatient: setGlobalPatient,
    costCenterCareScope,
  } = useCareContext()
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
  const [isHydrated, setIsHydrated] = useState(false)

  // Refs for click outside handling
  const patientContainerRef = useRef<HTMLDivElement>(null)
  const secondaryContainerRef = useRef<HTMLDivElement>(null)

  /** Hidden until the user explicitly picks a patient (not when restoring from localStorage on refresh). */
  const [alertsBannerDismissed, setAlertsBannerDismissed] = useState(true)

  const showPatientAlertsFromUserAction = () => {
    if (!showAlertsBanner) return
    setAlertsBannerDismissed(false)
  }

  // Click outside handler for patient dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (patientContainerRef.current && !patientContainerRef.current.contains(event.target as Node)) {
        setPatientOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Click outside handler for secondary dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (secondaryContainerRef.current && !secondaryContainerRef.current.contains(event.target as Node)) {
        setSecondaryOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const storedPatient = getStoredValue(STORAGE_KEYS.SELECTED_PATIENT)
    const storedPatientName = getStoredValue(STORAGE_KEYS.SELECTED_PATIENT_NAME)
    const storedMode = getStoredValue(STORAGE_KEYS.ACTIVE_MODE, 'OP') as 'OP' | 'IP'
    const storedVisit = getStoredValue(STORAGE_KEYS.ACTIVE_VISIT)
    const storedAdmission = getStoredValue(STORAGE_KEYS.ACTIVE_ADMISSION)
    const storedVisitLabel = getStoredValue(STORAGE_KEYS.ACTIVE_VISIT_LABEL)
    const storedAdmissionLabel = getStoredValue(STORAGE_KEYS.ACTIVE_ADMISSION_LABEL)

    if (!selectedPatient && storedPatient) {
      onPatientSelect(storedPatient)
      setSelectedPatientName(storedPatientName)
      setPatientQuery(storedPatientName)
    }

    if (storedMode) {
      setMode(storedMode)
    }

    if (storedMode === 'OP' && storedVisit) {
      setActiveVisit(storedVisit)
      setSecondaryQuery(storedVisitLabel)
    } else if (storedMode === 'IP' && storedAdmission) {
      setActiveAdmission(storedAdmission)
      setSecondaryQuery(storedAdmissionLabel)
    }

    setIsHydrated(true)
  }, [])

  /** Align with Cost Center care type after server load — also clears secondary OP/IP picker state. */
  useEffect(() => {
    if (costCenterCareScope === 'op_only') {
      setMode('OP')
      setActiveAdmission(undefined)
      setSecondaryQuery('')
      try {
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_ADMISSION)
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_ADMISSION_LABEL)
      } catch {
        /* ignore */
      }
    } else if (costCenterCareScope === 'ip_only') {
      setMode('IP')
      setActiveVisit(undefined)
      setSecondaryQuery('')
      try {
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_VISIT)
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_VISIT_LABEL)
      } catch {
        /* ignore */
      }
    }
  }, [costCenterCareScope, setMode, setActiveAdmission, setActiveVisit])

  useEffect(() => {
    if (!selectedPatient) {
      setAlertsBannerDismissed(true)
    }
  }, [selectedPatient])

  useEffect(() => {
    setStoredValue(STORAGE_KEYS.ACTIVE_MODE, mode)
  }, [mode])

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
            setStoredValue(STORAGE_KEYS.SELECTED_PATIENT_NAME, resData.message.patient_name)
          } else {
            setSelectedPatientName(selectedPatient)
            setPatientQuery(selectedPatient)
            setStoredValue(STORAGE_KEYS.SELECTED_PATIENT_NAME, selectedPatient)
          }
        } catch (error) {
          console.error('Failed to load patient name:', error)
          setSelectedPatientName(selectedPatient)
          setPatientQuery(selectedPatient)
          setStoredValue(STORAGE_KEYS.SELECTED_PATIENT_NAME, selectedPatient)
        }
      }
      loadPatientName()
      setStoredValue(STORAGE_KEYS.SELECTED_PATIENT, selectedPatient)
    } else {
      setSelectedPatientName('')
      setPatientQuery('')
      clearPatientData()
    }
  }, [selectedPatient])

  useEffect(() => {
    if (!patientOpen) return

    const search = async () => {
      setLoading(true)
      try {
        let results: PatientListItem[] = []
        if (patientQuery.trim() === '') {
          results = await fetchPatients(20, 0)
        } else {
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

    const timeoutId = setTimeout(() => {
      search()
    }, patientQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [patientQuery, patientOpen])

  const hasPatient = Boolean(selectedPatient)

  useEffect(() => {
    if (!secondaryOpen || (mode !== 'OP' && mode !== 'IP')) {
      setSecondaryResults([])
      return
    }

    const controller = new AbortController()
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
            <button
              type="button"
              className="fixed inset-0 top-14 left-0 right-0 bottom-0 z-30 md:left-[240px] backdrop-blur-md bg-slate-900/10 cursor-default focus:outline-none"
              onClick={() => {
                setAlertsBannerDismissed(true)
              }}
              aria-label="Close patient alerts"
            />
            <div className="relative z-40">
              <PatientAlertsBanner
                patient={selectedPatient}
                patientName={selectedPatientName || undefined}
                dismissed={alertsBannerDismissed}
                onDismiss={() => {
                  setAlertsBannerDismissed(true)
                }}
                visible={Boolean(selectedPatient)}
                autoDismissMs={alertsAutoDismissMs}
              />
            </div>
          </>,
          document.getElementById('patient-alerts-portal')!
        )
      : null

  if (!isHydrated) {
    return <div className="w-full max-w-xs md:max-w-xl" />
  }

  // ✅ Full clear: resets local state, context (patient + visit + admission), and localStorage
  const handleClearPatient = () => {
    setAlertsBannerDismissed(true)
    onPatientSelect(undefined)
    setGlobalPatient(undefined)
    setSelectedPatientName('')
    setPatientQuery('')
    setSecondaryQuery('')
    setPatientOpen(false)
    setSecondaryOpen(false)
    setActiveVisit(undefined)
    setActiveAdmission(undefined)
    clearPatientData()
  }

  return (
    <>
      {alertsPortal}
      <div className="w-full max-w-xs md:max-w-xl">
        <div className="relative flex items-center gap-2">
          {/* Patient Search Container */}
          <div className="flex-1 relative" ref={patientContainerRef}>
            <input
              value={patientQuery}
              onChange={(e) => {
                const value = e.target.value
                setPatientQuery(value)
                if (value === '') {
                  setPatientOpen(false)
                  if (selectedPatient) {
                    onPatientSelect(undefined)
                    setGlobalPatient(undefined)
                    setSelectedPatientName('')
                    // ✅ Also reset visit/admission context and localStorage when typing clears the input
                    setActiveVisit(undefined)
                    setActiveAdmission(undefined)
                    setSecondaryQuery('')
                    clearPatientData()
                  }
                } else {
                  setPatientOpen(true)
                  if (selectedPatient && value !== selectedPatientName) {
                    onPatientSelect(undefined)
                    setGlobalPatient(undefined)
                  }
                }
              }}
              onFocus={() => setPatientOpen(true)}
              placeholder={selectedPatientName || 'Search patient...'}
              className="w-full rounded-md border border-primary/40 pl-2 md:pl-3 pr-20 md:pr-24 py-1.5 md:py-2 text-xs md:text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-white focus:border-white"
            />
            <div className="absolute inset-y-0 right-2 flex items-center gap-1">
              {selectedPatient && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleClearPatient()
                  }}
                  className="text-slate-400 hover:text-slate-600 transition-colors p-0.5"
                  title="Clear patient"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowCreatePatient(true)}
                className="w-7 h-7 md:w-8 md:h-8 rounded-md text-primary bg-white flex items-center justify-center hover:bg-primary/30 transition-colors flex-shrink-0"
                title="Create New Patient"
              >
                <svg
                  className="w-4 h-4 md:w-5 md:h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
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
                        setGlobalPatient(patient.name)
                        setSelectedPatientName(patientName)
                        setPatientQuery(patientName)
                        setPatientOpen(false)
                        showPatientAlertsFromUserAction()
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

          {/* OP/IP Buttons and Secondary Search — hidden single toggle when Cost Center restricts to one flow */}
          <div className="flex items-center gap-1">
            {costCenterCareScope !== 'ip_only' && (
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
            )}
            {costCenterCareScope !== 'op_only' && (
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
            )}
            {(mode === 'OP' || mode === 'IP') && (
              <div className="relative ml-1 w-full max-w-xs" ref={secondaryContainerRef}>
                <input
                  type="text"
                  value={secondaryQuery}
                  onChange={(e) => {
                    const newValue = e.target.value
                    setSecondaryQuery(newValue)
                    if (newValue === '') {
                      setSecondaryOpen(false)
                    } else {
                      setSecondaryOpen(true)
                    }
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
                              setStoredValue(STORAGE_KEYS.ACTIVE_VISIT, row.value)
                              setStoredValue(STORAGE_KEYS.ACTIVE_VISIT_LABEL, row.label)
                            } else if (mode === 'IP') {
                              setActiveAdmission(row.value)
                              setStoredValue(STORAGE_KEYS.ACTIVE_ADMISSION, row.value)
                              setStoredValue(STORAGE_KEYS.ACTIVE_ADMISSION_LABEL, row.label)
                            }
                            if (!hasPatient && row.patient) {
                              onPatientSelect(row.patient)
                              setGlobalPatient(row.patient)
                              const displayName = row.patient_name || row.patient
                              setSelectedPatientName(displayName)
                              setPatientQuery(displayName)
                              showPatientAlertsFromUserAction()
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
                            ? 'Type to search visits…'
                            : 'Type to search admissions…'}
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
            showPatientAlertsFromUserAction()
          }}
        />
      )}
    </>
  )
}