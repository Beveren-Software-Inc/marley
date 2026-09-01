import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal, Pencil } from 'lucide-react'
import { fetchMainNursingNotes, updateMainNursingNote, type MainNursingNoteEntryRow, type MainNursingNoteRow } from '../../services/mainNursingNote'
import { fetchHealthcarePractitioners, type LinkFieldOption } from '../../services/common'
import { useCardFilters, useCardHeaderSlot } from '../../contexts/CardFilterContext'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { CardRowTextHint } from '../ui/dashboardCardListing'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { NursingCarePlanPrintButton } from './NursingCarePlanPrintButton'
import {
  isMainNursingNoteEditable,
  MAIN_NURSING_NOTE_EDIT_LOCKED_MESSAGE,
  NURSING_SHIFTS,
} from '../../constants/nursingShift'
import { EditMainNursingNoteModal } from './EditMainNursingNoteModal'
import { NursingNoteEditableCard } from './NursingNoteEditableCard'
import { useCareContext } from '../../providers/CareContextProvider'
import { DateFilterInput } from '../ui/DateFilterInput'
import { toast } from '../../hooks/useToast'

interface MainNursingNoteListProps {
  patient?: string
  admission?: string
  refreshKey?: number
  onPatientClick?: (patient: string) => void
  title?: string
  onAdd?: () => void
  addButtonTitle?: string
  /** When false, hides row edit actions. */
  manageRows?: boolean
}

const FilterToggleButton = ({
  active,
  onClick,
}: {
  active: boolean
  onClick: () => void
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`p-1.5 rounded-md border transition-colors ${
      active ? 'bg-primary/10 border-primary text-primary' : 'border-slate-300 text-slate-500 hover:bg-slate-50'
    }`}
    title={active ? 'Hide filters' : 'Show filters'}
    aria-label={active ? 'Hide filters' : 'Show filters'}
  >
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
      />
    </svg>
  </button>
)

const formatNursingNoteDate = (val: string | null | undefined) => {
  if (!val) return '—'
  try {
    return new Date(val).toLocaleDateString('en-GB')
  } catch {
    return val
  }
}

function nursingNoteAuthorsLabel(row: MainNursingNoteRow): string {
  const authors = (row.authors || []).filter(Boolean)
  if (authors.length > 0) return authors.join(' · ')
  const created = row.user_name || row.user
  const last = row.last_appended_by_name || row.last_appended_by
  if (created && last && last !== created && last !== row.user) {
    return `${created} · ${last}`
  }
  return created || last || '—'
}

function formatEntryTime(value?: string | null): string {
  if (!value) return ''
  const text = String(value)
  const clock = text.includes(' ') ? text.split(' ').pop() || text : text
  const parts = clock.split(':')
  if (parts.length >= 2) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`
  return text
}

function compactNursingNoteText(value?: string | null): string {
  return (value || '').replace(/\s+/g, ' ').trim()
}

/** Parent field is the original creator blob; child table also stores that same first note. */
function nursingNotePanelContent(row: MainNursingNoteRow) {
  const entries = row.entries || []
  const mainText = (row.nursing_notes || '').trim()
  const compactMain = compactNursingNoteText(mainText)

  if (!entries.length) {
    return { mainText, mainEntry: undefined as MainNursingNoteEntryRow | undefined, entries }
  }

  const everyChildAlreadyInMain =
    Boolean(compactMain) &&
    entries.every((entry) => {
      const note = compactNursingNoteText(entry.note)
      return !note || compactMain.includes(note)
    })

  // before_save concatenates every child into nursing_notes — show children only.
  if (everyChildAlreadyInMain && entries.length > 1) {
    return { mainText: '', mainEntry: undefined, entries }
  }

  const creatorUser = (row.user || '').trim()
  const extraEntries = entries.filter((entry) => {
    const note = compactNursingNoteText(entry.note)
    if (!note) return false
    if (compactMain && note === compactMain) return false
    const byCreator = Boolean(creatorUser && entry.authored_by === creatorUser)
    if (byCreator && compactMain && (compactMain.includes(note) || note.includes(compactMain))) {
      return false
    }
    return true
  })

  const mainEntry = entries.find((entry) => extraEntries.indexOf(entry) === -1 && compactNursingNoteText(entry.note))
  return { mainText, mainEntry, entries: extraEntries }
}

export const MainNursingNoteList = ({
  patient,
  admission,
  refreshKey,
  onPatientClick,
  title = 'Nursing Notes',
  onAdd,
  addButtonTitle = 'Add Nursing Note',
  manageRows = true,
}: MainNursingNoteListProps) => {
  const { guardClinicalEdit } = useCareContext()
  const cardFilters = useCardFilters()
  const headerSlot = useCardHeaderSlot()
  const inDashboardCard = cardFilters !== undefined
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = inDashboardCard ? cardFilters : showFiltersInternal

  const [records, setRecords] = useState<MainNursingNoteRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [shiftFilter, setShiftFilter] = useState('')
  const [practitionerFilter, setPractitionerFilter] = useState('')
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [selected, setSelected] = useState<MainNursingNoteRow | null>(null)
  const [editRow, setEditRow] = useState<MainNursingNoteRow | null>(null)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const practitionerFilterRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hasActiveFilters = Boolean(search || dateFrom || dateTo || shiftFilter || practitionerFilter)

  const load = useCallback(
    async (q?: string) => {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchMainNursingNotes(patient, q, admission, 1, 50, {
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          practitioner: practitionerFilter || undefined,
          shift: shiftFilter || undefined,
        })
        setRecords(data)
        return data
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load nursing notes')
      } finally {
        setLoading(false)
      }
    },
    [patient, admission, dateFrom, dateTo, shiftFilter, practitionerFilter]
  )

  useEffect(() => {
    load(search || undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshKey])

  const handleSearchChange = (q: string) => {
    setSearch(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(q || undefined), 350)
  }

  useEffect(() => {
    if (!practitionerOpen) return
    const t = setTimeout(async () => {
      try {
        const opts = await fetchHealthcarePractitioners(practitionerQuery || undefined)
        setPractitionerOptions(opts)
      } catch {
        setPractitionerOptions([])
      }
    }, practitionerQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [practitionerQuery, practitionerOpen])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (practitionerFilterRef.current?.contains(el)) return
      setPractitionerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!selected) return
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setSelected(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [selected])

  const clearFilters = () => {
    setSearch('')
    setDateFrom('')
    setDateTo('')
    setShiftFilter('')
    setPractitionerFilter('')
    setPractitionerQuery('')
    setPractitionerOpen(false)
  }

  const selectedPractitionerLabel =
    practitionerOptions.find((o) => o.name === practitionerFilter)?.label || practitionerFilter || ''

  const canEditRow = (row: MainNursingNoteRow) =>
    isMainNursingNoteEditable(row.modified || row.creation)

  const openEditRow = (row: MainNursingNoteRow) => {
    if (!canEditRow(row)) {
      setError(MAIN_NURSING_NOTE_EDIT_LOCKED_MESSAGE)
      return
    }
    guardClinicalEdit(() => setEditRow(row))
  }

  const selectedPanel = selected ? nursingNotePanelContent(selected) : null
  const canEditSelected = Boolean(selected && manageRows && canEditRow(selected))

  const refreshSelectedNote = async () => {
    const data = await load(search || undefined)
    if (!data || !selected) return
    const fresh = data.find((row) => row.name === selected.name)
    if (fresh) setSelected(fresh)
  }

  const saveSelectedNote = async (next: string, entryName?: string) => {
    if (!selected) return
    const result = await updateMainNursingNote({
      name: selected.name,
      note: next,
      entry_name: entryName,
    })
    if (!result.success) {
      throw new Error(result.message || 'Failed to update nursing note')
    }
    toast.success('Note updated')
    await refreshSelectedNote()
  }

  const carePlanButton = <NursingCarePlanPrintButton patient={patient} />

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {inDashboardCard && headerSlot ? createPortal(carePlanButton, headerSlot) : null}

      {!inDashboardCard && (
        <div className="flex items-center justify-between gap-2 mb-3 flex-shrink-0">
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <div className="flex items-center gap-2 shrink-0">
            <FilterToggleButton
              active={Boolean(showFilters)}
              onClick={() => setShowFiltersInternal((prev) => !prev)}
            />
            {carePlanButton}
            {onAdd && (
              <button
                type="button"
                onClick={onAdd}
                className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-lg font-bold flex-shrink-0"
                title={addButtonTitle}
              >
                +
              </button>
            )}
          </div>
        </div>
      )}

      {showFilters && (
        <div className="card-filter-bar flex flex-wrap items-end gap-3 mb-3 px-1 py-2 border-b border-slate-100 bg-slate-50/80 rounded-md flex-shrink-0">
          {!patient && (
            <div className="flex flex-col gap-1 min-w-[180px]">
              <label className="text-xs font-medium text-slate-500">Search patient</label>
              <input
                type="search"
                placeholder="Search by patient name…"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
              />
            </div>
          )}
          <div className="flex flex-col gap-1 min-w-[130px]">
            <label className="text-xs font-medium text-slate-500">From Date</label>
            <DateFilterInput
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[130px]">
            <label className="text-xs font-medium text-slate-500">To Date</label>
            <DateFilterInput
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[130px]">
            <label className="text-xs font-medium text-slate-500">Shift</label>
            <select
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            >
              <option value="">Select All</option>
              {NURSING_SHIFTS.map((shift) => (
                <option key={shift} value={shift}>
                  {shift}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-[180px] relative" ref={practitionerFilterRef}>
            <label className="text-xs font-medium text-slate-500">Recorded by</label>
            <input
              type="text"
              value={practitionerOpen ? practitionerQuery : selectedPractitionerLabel}
              onChange={(e) => {
                setPractitionerQuery(e.target.value)
                setPractitionerOpen(true)
                if (!e.target.value) setPractitionerFilter('')
              }}
              onFocus={() => setPractitionerOpen(true)}
              placeholder="Search doctor…"
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white w-full"
            />
            {practitionerOpen && practitionerOptions.length > 0 && (
              <ul className="absolute z-20 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg text-sm">
                {practitionerOptions.map((opt) => (
                  <li key={opt.name}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-slate-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setPractitionerFilter(opt.name)
                        setPractitionerQuery(opt.label || opt.name)
                        setPractitionerOpen(false)
                      }}
                    >
                      {opt.label || opt.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {hasActiveFilters && <ClearFiltersButton onClick={clearFilters} />}
        </div>
      )}

      {loading && <div className="text-sm text-slate-500 py-4 text-center">Loading…</div>}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">{error}</div>
      )}

      {!loading && !error && records.length === 0 && (
        <div className="p-4 text-sm text-slate-600 border border-dashed border-slate-300 rounded-md text-center">
          NO NURSING NOTES FOUND.
        </div>
      )}

      {!loading && records.length > 0 && (
        <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-[min(60vh,32rem)] overflow-y-auto [scrollbar-width:thin]">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-[1]">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Shift</th>
                {!patient && (
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Patient</th>
                )}
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Admission</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Notes</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Created / appended by</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((row) => (
                <tr
                  key={row.name}
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => setSelected(row)}
                >
                  <td className="px-3 py-2 whitespace-nowrap">{formatNursingNoteDate(row.date)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.shift || '—'}</td>
                  {!patient && (
                    <td className="px-3 py-2">
                      {row.file_no && onPatientClick ? (
                        <button
                          type="button"
                          className="text-primary hover:underline text-left"
                          onClick={(e) => {
                            e.stopPropagation()
                            onPatientClick(row.file_no!)
                          }}
                        >
                          {row.patient_name || row.file_no}
                        </button>
                      ) : (
                        row.patient_name || row.file_no || '—'
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2 whitespace-nowrap">{row.admission || '—'}</td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <CardRowTextHint text={row.nursing_notes} title="Nursing notes" />
                  </td>
                  <td
                    className="px-3 py-2 text-slate-600"
                    title={nursingNoteAuthorsLabel(row)}
                  >
                    <div>{row.user_name || row.user || '—'}</div>
                    {row.last_appended_by_name &&
                    row.last_appended_by &&
                    row.last_appended_by !== row.user ? (
                      <div className="text-[10px] text-slate-500">
                        Last: {row.last_appended_by_name}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center justify-end gap-1">
                      {manageRows ? (
                        <div
                          className="relative inline-block"
                          ref={openActionRow === row.name ? menuRef : undefined}
                        >
                          <button
                            type="button"
                            aria-label="Actions"
                            onClick={() =>
                              setOpenActionRow((prev) => (prev === row.name ? null : row.name))
                            }
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                          >
                            <MoreHorizontal className="h-4 w-4" aria-hidden />
                          </button>
                          <PortalActionsMenu
                            open={openActionRow === row.name}
                            onClose={() => setOpenActionRow(null)}
                            triggerRef={menuRef}
                            minWidth={160}
                          >
                            {canEditRow(row) ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionRow(null)
                                  openEditRow(row)
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                              >
                                <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                                Edit
                              </button>
                            ) : (
                              <div
                                className="px-3 py-2 text-xs text-slate-500"
                                title={MAIN_NURSING_NOTE_EDIT_LOCKED_MESSAGE}
                              >
                                Edit locked (24h)
                              </div>
                            )}
                          </PortalActionsMenu>
                        </div>
                      ) : null}
                      <PrintFormatDropdown
                        doctype="Main Nursing Note"
                        docName={row.name}
                        noLetterhead={0}
                        triggerPrint={1}
                        className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-primary hover:bg-slate-50"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30">
          <div
            ref={panelRef}
            className="w-full max-w-md h-full bg-white shadow-xl flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-semibold text-slate-900">Nursing Note</h3>
              <div className="flex items-center gap-2">
                <PrintFormatDropdown
                  doctype="Main Nursing Note"
                  docName={selected.name}
                  noLetterhead={0}
                  triggerPrint={1}
                  className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-primary hover:bg-slate-50"
                />
                {manageRows && canEditRow(selected) ? (
                  <button
                    type="button"
                    onClick={() => {
                      openEditRow(selected)
                      setSelected(null)
                    }}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Edit
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-slate-500 hover:text-slate-800 text-lg leading-none"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold">Trans No</div>
                <div className="font-medium">{selected.trans_no || selected.name}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-slate-500 uppercase font-semibold">Date</div>
                  <div>{formatNursingNoteDate(selected.date)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase font-semibold">Start time</div>
                  <div>{selected.data || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase font-semibold">Shift</div>
                  <div>{selected.shift || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase font-semibold">Branch</div>
                  <div>{selected.cost_center || '—'}</div>
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold">Patient</div>
                <div>{selected.patient_name || selected.file_no || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold">Admission</div>
                <div>{selected.admission || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold">Nursing notes</div>
                {!selectedPanel?.mainText && !selectedPanel?.entries.length ? (
                  <p className="mt-1 whitespace-pre-wrap text-slate-800 rounded-md bg-slate-50 border border-slate-200 p-3">
                    —
                  </p>
                ) : (
                  <div className="mt-1 space-y-2">
                    {selectedPanel.mainText ? (
                      <NursingNoteEditableCard
                        note={selectedPanel.mainText}
                        authorLabel={selected.user_name || selected.user || 'Note'}
                        canEdit={canEditSelected}
                        onSave={(next) =>
                          saveSelectedNote(next, selectedPanel.mainEntry?.name)
                        }
                      />
                    ) : null}
                    {selectedPanel.entries.map((entry, index) => (
                      <NursingNoteEditableCard
                        key={entry.name || `${entry.authored_by}-${index}`}
                        note={entry.note || ''}
                        authorLabel={entry.authored_by_name || entry.authored_by || 'Unknown'}
                        timeLabel={formatEntryTime(entry.note_time)}
                        canEdit={canEditSelected}
                        onSave={(next) => saveSelectedNote(next, entry.name)}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold">Created by</div>
                <div>{selected.user_name || selected.user || '—'}</div>
              </div>
              {selected.last_appended_by_name &&
              selected.last_appended_by &&
              selected.last_appended_by !== selected.user ? (
                <div>
                  <div className="text-xs text-slate-500 uppercase font-semibold">Last appended by</div>
                  <div>{selected.last_appended_by_name}</div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {editRow && (
        <EditMainNursingNoteModal
          row={editRow}
          onClose={() => setEditRow(null)}
          onSuccess={() => {
            setEditRow(null)
            setSelected(null)
            void load(search || undefined)
          }}
        />
      )}
    </div>
  )
}
