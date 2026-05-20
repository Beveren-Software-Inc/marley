import { useState, useEffect } from 'react'
import { fetchClinicalNotes, fetchPendingDoctorProgressEncounters, type ClinicalNote, type PendingDoctorProgressEncounter } from '../../services/clinicalNotes'
import { fetchHealthcarePractitioners, getCurrentUserPractitioner, type LinkFieldOption } from '../../services/common'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { DocDetailView } from '../ui/DocDetailView'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { useCareContext } from '../../providers/CareContextProvider'
import { useCardFilters, useDashboardCompactClinical } from '../../contexts/CardFilterContext'
import { CardRowMetaHint, dashboardCardRowHoverClass } from '../ui/dashboardCardListing'

// Helper function to strip HTML tags and decode HTML entities
const stripHtml = (html: string): string => {
  if (!html) return ''
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return tmp.textContent || tmp.innerText || ''
}

interface ClinicalNotesListProps {
  patient?: string
  medicalRole?: string
  clinicalNoteType?: string
  noteType?: string
  hideTypes?: boolean
  onPatientClick?: (patient: string) => void
}

export const ClinicalNotesList = ({ 
  patient, 
  medicalRole, 
  clinicalNoteType,
  noteType,
  hideTypes = false,
  onPatientClick,
}: ClinicalNotesListProps) => {
  const { mode, activeVisit, activeAdmission } = useCareContext()
  const [clinicalNotes, setClinicalNotes] = useState<ClinicalNote[]>([])
  const [pendingEncounters, setPendingEncounters] = useState<PendingDoctorProgressEncounter[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)

  const cardFilters = useCardFilters()
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = cardFilters !== undefined ? cardFilters : showFiltersInternal
  const inDashboardCard = cardFilters !== undefined
  const compactClinical = useDashboardCompactClinical()

  const [postingDateFrom, setPostingDateFrom] = useState('')
  const [postingDateTo, setPostingDateTo] = useState('')
  const [notePractitionerFilter, setNotePractitionerFilter] = useState('')
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [myPractitionerId, setMyPractitionerId] = useState<string | null>(null)
  const [practitionerInitDone, setPractitionerInitDone] = useState(false)

  /** Any typed note/order list: default practitioner filter to logged-in user's practitioner. */
  const applyDefaultPractitionerFilter = Boolean(clinicalNoteType?.trim())

  const isOrderList = Boolean(clinicalNoteType?.trim().endsWith(' Order'))

  /** Without a patient: Doctor Progress Note aggregate list (pending encounters banner). */
  const hasRefContext = Boolean(
    (mode === 'OP' && activeVisit) || (mode === 'IP' && activeAdmission),
  )
  const useDoctorProgressMineOnly =
    clinicalNoteType === 'Doctor Progress Note' && !patient && !hasRefContext

  /** Aggregate order sheet (no patient): optional widen to all practitioners. */
  const isAggregateOrderList = isOrderList && !patient && !hasRefContext

  const [showAllPractitionersOrders, setShowAllPractitionersOrders] = useState(false)

  const mineOnlyRequest =
    !notePractitionerFilter &&
    (useDoctorProgressMineOnly ||
      (isAggregateOrderList && !showAllPractitionersOrders))

  const showAdvancedNoteFilters =
    showFilters && (Boolean(patient) || applyDefaultPractitionerFilter)
  const showPractitionerPicker =
    showAdvancedNoteFilters && (Boolean(patient) || applyDefaultPractitionerFilter)

  useEffect(() => {
    if (!applyDefaultPractitionerFilter) {
      setPractitionerInitDone(true)
      return
    }
    let cancelled = false
    ;(async () => {
      const practId = await getCurrentUserPractitioner()
      if (cancelled) return
      setMyPractitionerId(practId)
      if (practId) {
        setNotePractitionerFilter(practId)
        try {
          const options = await fetchHealthcarePractitioners()
          const match = options.find((p) => p.name === practId)
          setPractitionerQuery(match?.label || practId)
        } catch {
          setPractitionerQuery(practId)
        }
      }
      setPractitionerInitDone(true)
    })()
    return () => {
      cancelled = true
    }
  }, [applyDefaultPractitionerFilter])

  useEffect(() => {
    if (!practitionerOpen || !showPractitionerPicker) return
    const t = setTimeout(() => {
      fetchHealthcarePractitioners(practitionerQuery || undefined)
        .then(setPractitionerOptions)
        .catch(() => setPractitionerOptions([]))
    }, practitionerQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [practitionerOpen, practitionerQuery, showPractitionerPicker])

  useEffect(() => {
    if (!practitionerInitDone) return

    const loadClinicalNotes = async () => {
      try {
        setLoading(true)
        setError(null)
        
        let referenceDoctype: string | undefined
        let referenceDocument: string | undefined
        
        // Add care context filters based on current mode and selected visit/admission
        if (mode === 'OP' && activeVisit) {
          referenceDoctype = 'Patient Visit'
          referenceDocument = activeVisit
        } else if (mode === 'IP' && activeAdmission) {
          referenceDoctype = 'Inpatient Admission'
          referenceDocument = activeAdmission
        }

        const practitionerForApi = notePractitionerFilter || undefined
        
        const response = await fetchClinicalNotes(
          50,
          0,
          patient,
          medicalRole,
          clinicalNoteType,
          noteType,
          referenceDoctype,
          referenceDocument,
          !practitionerForApi && mineOnlyRequest ? true : undefined,
          practitionerForApi,
          postingDateFrom || undefined,
          postingDateTo || undefined,
        )
        
        setClinicalNotes(response)
      } catch (err) {
        console.error('Error loading clinical notes:', err)
        setError(err instanceof Error ? err : new Error('Failed to fetch clinical notes'))
      } finally {
        setLoading(false)
      }
    }

    loadClinicalNotes()
  }, [
    patient,
    medicalRole,
    clinicalNoteType,
    noteType,
    mode,
    activeVisit,
    activeAdmission,
    mineOnlyRequest,
    postingDateFrom,
    postingDateTo,
    notePractitionerFilter,
    practitionerInitDone,
  ])

  useEffect(() => {
    if (!useDoctorProgressMineOnly || !clinicalNoteType) {
      setPendingEncounters([])
      return
    }
    let cancelled = false
    const loadPending = async () => {
      setPendingLoading(true)
      try {
        const rows = await fetchPendingDoctorProgressEncounters(clinicalNoteType)
        if (!cancelled) setPendingEncounters(rows)
      } catch (e) {
        console.error(e)
        if (!cancelled) setPendingEncounters([])
      } finally {
        if (!cancelled) setPendingLoading(false)
      }
    }
    loadPending()
    return () => {
      cancelled = true
    }
  }, [useDoctorProgressMineOnly, clinicalNoteType])

  const getContextLabel = () => {
    if (mode === 'OP' && activeVisit) {
      return `Showing notes for OP Visit: ${activeVisit}`
    }
    if (mode === 'IP' && activeAdmission) {
      return `Showing notes for IP Admission: ${activeAdmission}`
    }
    return null
  }

  const contextLabel = getContextLabel()
  const aggregateDoctorProgressLayout = useDoctorProgressMineOnly

  /** Read left-to-right: date/time → note → patient (if aggregate) → metadata → actions */
  const tableColumnOrderDoctorFirst = clinicalNoteType === 'Doctor Progress Note'
  /** Dashboard cards: date and note only; full listing keeps all columns. */
  const cardCompactLayout = compactClinical

  if (error && !loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Clinical Notes</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
        </div>
      </div>
    )
  }

  if (loading && !aggregateDoctorProgressLayout) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading clinical notes...</div>
      </div>
    )
  }

  const notePreview = (note: ClinicalNote, maxLen: number) => {
    if (!note.note) return '-'
    const plainText = stripHtml(note.note)
    return plainText.length > maxLen ? `${plainText.substring(0, maxLen)}…` : plainText
  }

  const notesTable = cardCompactLayout ? (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap w-[28%]">
              Date
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
              Note
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {clinicalNotes.map((note) => {
            const metaFields = [
              ['Note ID', note.name],
              ['Practitioner', note.practitioner_name || note.practitioner],
              ['Medical role', note.medical_role],
              ['Note type', note.clinical_note_type],
              ['Reference', note.reference_document ? `${note.reference_doctype}: ${note.reference_document}` : ''],
            ] as const
            return (
              <tr
                key={note.name}
                className={dashboardCardRowHoverClass}
                onClick={() => setDetailName(note.name)}
              >
                <td className="px-3 py-2.5 text-xs text-slate-700 whitespace-nowrap align-top">
                  <span className="text-primary font-medium">
                    {note.posting_date ? new Date(note.posting_date).toLocaleString() : '-'}
                  </span>
                  <CardRowMetaHint fields={metaFields} />
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-700 align-top">
                  <div className="line-clamp-4" title={note.note ? stripHtml(note.note) : ''}>
                    {notePreview(note, 280)}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1000px]">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            {tableColumnOrderDoctorFirst ? (
              <>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase min-w-[260px]">
                  Note
                </th>
                {!patient && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Patient
                  </th>
                )}
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Practitioner
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Medical Role
                </th>
                {!hideTypes && (
                  <>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Note Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Clinical Note Type</th>
                  </>
                )}
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Visit / reference</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Actions</th>
              </>
            ) : (
              <>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">
                  Date
                </th>
                {!patient && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Patient</th>
                )}
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Practitioner
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Medical Role
                </th>
                {!hideTypes && (
                  <>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                      Note Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                      Clinical Note Type
                    </th>
                  </>
                )}
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Reference</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Note</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Actions</th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {clinicalNotes.map((note) => (
            <tr key={note.name} className="hover:bg-slate-50">
              {tableColumnOrderDoctorFirst ? (
                <>
                  <td
                    className="px-4 py-3 text-sm text-slate-700 cursor-pointer whitespace-nowrap"
                    onClick={() => setDetailName(note.name)}
                  >
                    <span className="text-primary hover:underline">
                      {note.posting_date ? new Date(note.posting_date).toLocaleString() : '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700 align-top max-w-xl">
                    <div className="line-clamp-4" title={note.note ? stripHtml(note.note) : ''}>
                      {notePreview(note, 220)}
                    </div>
                  </td>
                  {!patient && (
                    <td
                      className="px-4 py-3 text-sm text-slate-700 cursor-pointer"
                      onClick={() => note.patient && onPatientClick?.(note.patient)}
                    >
                      <span className="font-medium text-primary hover:underline">
                        {note.patient_name || note.patient || '-'}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {note.practitioner_name || note.practitioner || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {note.medical_role_name || note.medical_role || '-'}
                  </td>
                  {!hideTypes && (
                    <>
                      <td className="px-4 py-3 text-sm text-slate-700">{note.note_type || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {note.clinical_note_type_name || note.clinical_note_type || '-'}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {note.reference_doctype && note.reference_document ? (
                      <div className="text-xs">
                        <div className="font-semibold text-slate-800">{note.reference_doctype}</div>
                        <div className="text-slate-500 truncate max-w-[150px]">{note.reference_document}</div>
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700 text-center align-middle">
                    <PrintFormatDropdown
                      doctype="Clinical Note"
                      docName={note.name}
                      noLetterhead={0}
                      triggerPrint={1}
                      className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-primary hover:bg-slate-50"
                    />
                  </td>
                </>
              ) : (
                <>
                  <td
                    className="px-4 py-3 text-sm text-slate-700 cursor-pointer whitespace-nowrap"
                    onClick={() => setDetailName(note.name)}
                  >
                    <span className="text-primary hover:underline">
                      {note.posting_date
                        ? new Date(note.posting_date).toLocaleString()
                        : '-'}
                    </span>
                  </td>
                  {!patient && (
                    <td
                      className="px-4 py-3 text-sm text-slate-700 cursor-pointer"
                      onClick={() => note.patient && onPatientClick?.(note.patient)}
                    >
                      <span className="font-medium text-primary hover:underline">
                        {note.patient_name || note.patient || '-'}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {note.practitioner_name || note.practitioner || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {note.medical_role_name || note.medical_role || '-'}
                  </td>
                  {!hideTypes && (
                    <>
                      <td className="px-4 py-3 text-sm text-slate-700">{note.note_type || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {note.clinical_note_type_name || note.clinical_note_type || '-'}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {note.reference_doctype && note.reference_document ? (
                      <div className="text-xs">
                        <div className="font-semibold text-slate-800">{note.reference_doctype}</div>
                        <div className="text-slate-500 truncate max-w-[150px]">{note.reference_document}</div>
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700 max-w-md">
                    <div className="truncate" title={note.note ? stripHtml(note.note) : ''}>
                      {notePreview(note, 100)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700 text-center align-middle">
                    <PrintFormatDropdown
                      doctype="Clinical Note"
                      docName={note.name}
                      noLetterhead={0}
                      triggerPrint={1}
                      className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-primary hover:bg-slate-50"
                    />
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="min-w-full flex flex-col flex-1 min-h-0 h-full">
      {!inDashboardCard && (Boolean(patient) || applyDefaultPractitionerFilter) && (
        <div className="flex justify-end mb-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowFiltersInternal((p) => !p)}
            className={`p-1.5 rounded-md border transition-colors ${showFilters ? 'bg-primary/10 border-primary text-primary' : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}
            title={showFilters ? 'Hide filters' : 'Show filters'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
          </button>
        </div>
      )}

      {contextLabel && (
        <div className="mb-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-700">
          {contextLabel}
        </div>
      )}

      {showAdvancedNoteFilters && (
        <div className="flex flex-wrap items-end gap-3 mb-3 px-1 flex-shrink-0">
          <div className="flex flex-col gap-1 min-w-[130px]">
            <label className="text-xs font-medium text-slate-500">Posting from</label>
            <input
              type="date"
              value={postingDateFrom}
              onChange={(e) => setPostingDateFrom(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[130px]">
            <label className="text-xs font-medium text-slate-500">Posting to</label>
            <input
              type="date"
              value={postingDateTo}
              onChange={(e) => setPostingDateTo(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          {showPractitionerPicker && (
            <div className="flex flex-col gap-1 min-w-[180px] relative">
              <label className="text-xs font-medium text-slate-500">Practitioner</label>
              <input
                type="text"
                value={
                  notePractitionerFilter
                    ? practitionerOptions.find((p) => p.name === notePractitionerFilter)?.label || practitionerQuery
                    : practitionerQuery
                }
                onChange={(e) => {
                  setPractitionerQuery(e.target.value)
                  setNotePractitionerFilter('')
                  setPractitionerOpen(true)
                }}
                onFocus={() => setPractitionerOpen(true)}
                placeholder="Search practitioner…"
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm w-full"
              />
              {practitionerOpen && practitionerOptions.length > 0 && (
                <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {practitionerOptions.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                      onClick={() => {
                        setNotePractitionerFilter(p.name)
                        setPractitionerQuery(p.label || p.name)
                        setPractitionerOpen(false)
                      }}
                    >
                      {p.label || p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {(postingDateFrom || postingDateTo || notePractitionerFilter) && (
            <button
              type="button"
              onClick={() => {
                setPostingDateFrom('')
                setPostingDateTo('')
                setNotePractitionerFilter('')
                setPractitionerQuery('')
              }}
              className="text-xs text-slate-600 underline self-end pb-1"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {isAggregateOrderList && clinicalNoteType && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm">
          <label className="flex items-center gap-2 cursor-pointer text-slate-800 select-none">
            <input
              type="checkbox"
              className="rounded border-slate-300 text-primary focus:ring-primary"
              checked={showAllPractitionersOrders}
              onChange={(e) => {
                const checked = e.target.checked
                setShowAllPractitionersOrders(checked)
                if (checked) {
                  setNotePractitionerFilter('')
                  setPractitionerQuery('')
                } else if (myPractitionerId) {
                  setNotePractitionerFilter(myPractitionerId)
                  const match = practitionerOptions.find((p) => p.name === myPractitionerId)
                  setPractitionerQuery(match?.label || myPractitionerId)
                }
              }}
            />
            <span>Show orders from all practitioners</span>
          </label>
          {!showAllPractitionersOrders ? (
            <span className="text-xs text-slate-500">
              Default is your orders only; turn on to see the full list and avoid repeating orders others placed.
            </span>
          ) : (
            <span className="text-xs text-slate-500">
              Showing everyone&apos;s {clinicalNoteType}. Uncheck to return to yours only.
            </span>
          )}
        </div>
      )}

      {aggregateDoctorProgressLayout && (
        <div className="mb-6 border border-amber-200 rounded-lg bg-amber-50/60 overflow-hidden">
          <div className="px-4 py-2 border-b border-amber-200 bg-amber-50">
            <h3 className="text-sm font-semibold text-slate-800">
              Admitted or today&apos;s visits — no Doctor Progress Note yet
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Shown until any practitioner adds a Doctor Progress Note for that admission or visit. Click a patient to open their file.
            </p>
          </div>
          {pendingLoading ? (
            <div className="px-4 py-3 text-sm text-slate-600">Loading pending encounters…</div>
          ) : pendingEncounters.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-500">None at the moment.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="bg-amber-100/80 border-b border-amber-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                      Patient
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                      Context
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                      Reference
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {pendingEncounters.map((row) => (
                    <tr key={`${row.reference_doctype}:${row.reference_document}`} className="hover:bg-white/80">
                      <td
                        className="px-4 py-2 text-sm cursor-pointer text-primary font-medium hover:underline"
                        onClick={() => row.patient && onPatientClick?.(row.patient)}
                      >
                        {row.patient_name || row.patient}
                      </td>
                      <td className="px-4 py-2 text-sm text-slate-700">
                        {row.context_label}
                        {row.encounter_date ? (
                          <span className="text-slate-500"> · {row.encounter_date}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 text-sm text-slate-700">
                        {row.context_status || '—'}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-600 font-mono">
                        {row.reference_document}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {aggregateDoctorProgressLayout && (
        <p className="text-xs text-slate-500 mb-2 px-1">
          Progress notes below are filtered to your practitioner by default. Clear the practitioner filter or open a patient file to change scope.
        </p>
      )}

      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto">
      {loading && aggregateDoctorProgressLayout ? (
        <div className="flex items-center justify-center p-8">
          <div className="text-slate-600">Loading clinical notes…</div>
        </div>
      ) : clinicalNotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8">
          <div className="text-slate-500 text-center">
            <p>No clinical notes found</p>
          </div>
        </div>
      ) : (
        notesTable
      )}
        </div>
      </div>

      {detailName && (
        <DetailSlideOver
          title="Clinical Note"
          subtitle={detailName}
          onClose={() => setDetailName(null)}
        >
          <DocDetailView doctype="Clinical Note" name={detailName} />
        </DetailSlideOver>
      )}
    </div>
  )
}