import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Plus, MoreVertical, PenLine, X, ChevronRight } from 'lucide-react'
import {
  fetchPatientMedicalHistories,
  fetchPatientMedicalHistoryDetail,
  type PatientMedicalHistory,
} from '../../services/patients'
import { CreatePatientMedicalHistoryModal } from './CreatePatientMedicalHistoryModal'
import { EditPatientMedicalHistoryModal } from './EditPatientMedicalHistoryModal'
import { PastMedicalHistoryDisplay } from './PastMedicalHistoryDisplay'
import { useCardFilters, useDashboardCompactClinical } from '../../contexts/CardFilterContext'
import { ILLNESS_FIELDS, yesNoBadgeClass, pmhClinicalBlurb } from './pastMedicalHistoryUtils'
import { CardRowMetaHint } from '../ui/dashboardCardListing'

interface Props {
  patient: string
  patientName?: string
  refreshKey?: number
}

function formatDate(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// ── Detail slide-over ──────────────────────────────────────────────────────────
function MedicalHistoryDetailPanel({
  name,
  onClose,
  onEdit,
}: {
  name: string
  onClose: () => void
  onEdit: (h: PatientMedicalHistory) => void
}) {
  const [detail, setDetail] = useState<PatientMedicalHistory | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchPatientMedicalHistoryDetail(name)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [name])

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* backdrop */}
      <div className="flex-1 bg-black/30" onClick={onClose} />

      {/* panel */}
      <div className="w-full max-w-xl bg-white flex flex-col shadow-2xl overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Past Medical History</h3>
            {detail?.creation && (
              <p className="text-xs text-slate-500 mt-0.5">{formatDate(detail.creation)}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {detail && (
              <button
                type="button"
                onClick={() => onEdit(detail)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <PenLine className="w-3.5 h-3.5" />
                Edit
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-slate-100 text-slate-500 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* meta info */}
        {detail && (
          <div className="flex gap-6 px-5 py-2.5 border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
            {detail.inpatient_admission && (
              <span>Admission: <span className="font-medium text-slate-700">{detail.inpatient_admission}</span></span>
            )}
            {detail.creation && (
              <span>Date: <span className="font-medium text-slate-700">{formatDate(detail.creation)}</span></span>
            )}
          </div>
        )}

        {/* body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-16 text-sm text-slate-400">Loading…</div>
          )}
          {!loading && !detail && (
            <div className="flex items-center justify-center py-16 text-sm text-red-500">Failed to load details.</div>
          )}
          {!loading && detail && (
            <>
              <PastMedicalHistoryDisplay history={detail} />
              {detail.patient_history_details && detail.patient_history_details.length > 0 && (
                <div className="px-5 pb-4 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide py-3">
                    Legacy template data
                  </p>
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-slate-600">Attribute</th>
                        <th className="px-4 py-2 text-left font-semibold text-slate-600">Yes / No</th>
                        <th className="px-4 py-2 text-left font-semibold text-slate-600">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detail.patient_history_details.map((row, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 text-slate-800">{row.attributes || '—'}</td>
                          <td className="px-4 py-2">
                            {row.yesno ? (
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${yesNoBadgeClass(row.yesno)}`}
                              >
                                {row.yesno}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-4 py-2 text-slate-700 whitespace-pre-wrap">
                            {row.description || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!ILLNESS_FIELDS.some(({ key }) => detail[key]) &&
                !detail.allergies?.trim() &&
                !detail.previous_surgical_history?.trim() &&
                !detail.current_and_past_medications?.trim() &&
                !detail.social_history?.trim() &&
                !detail.addiction &&
                !detail.smoking &&
                (!detail.patient_history_details || detail.patient_history_details.length === 0) && (
                  <div className="flex items-center justify-center py-16 text-sm text-slate-400">
                    No details recorded.
                  </div>
                )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Row actions menu ───────────────────────────────────────────────────────────
function RowMenu({
  onEdit,
}: {
  onEdit: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className="p-1 rounded hover:bg-slate-100 text-slate-500 transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 w-36 bg-white border border-slate-200 rounded-md shadow-lg py-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit() }}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <PenLine className="w-3.5 h-3.5 text-blue-500" />
            Edit
          </button>
        </div>
      )}
    </div>
  )
}

function creationDay(iso?: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

// ── Main list component ────────────────────────────────────────────────────────
export function PatientMedicalHistoryList({ patient, patientName, refreshKey }: Props) {
  const [items, setItems] = useState<PatientMedicalHistory[]>([])
  const [loading, setLoading] = useState(false)
  const [internalRefresh, setInternalRefresh] = useState(0)
  const [showCreate, setShowCreate] = useState(false)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [editHistory, setEditHistory] = useState<PatientMedicalHistory | null>(null)

  const cardFilters = useCardFilters()
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = cardFilters !== undefined ? cardFilters : showFiltersInternal
  const inDashboardCard = cardFilters !== undefined
  const compactClinical = useDashboardCompactClinical()

  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      const day = creationDay(it.creation)
      if (fromDate && day && day < fromDate) return false
      if (toDate && day && day > toDate) return false
      return true
    })
  }, [items, fromDate, toDate])

  const hasActiveFilters = Boolean(fromDate || toDate)

  const load = useCallback(() => {
    if (!patient) return
    setLoading(true)
    fetchPatientMedicalHistories(patient)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [patient])

  useEffect(() => { load() }, [load, refreshKey, internalRefresh])

  const handleCreated = () => {
    setShowCreate(false)
    setInternalRefresh((v) => v + 1)
  }

  const handleSaved = () => {
    setEditHistory(null)
    // reload detail panel if open
    if (detailName) setDetailName(null)
    setInternalRefresh((v) => v + 1)
  }

  if (!patient) return null

  return (
    <div className="flex flex-col h-full flex-1 min-h-0">
      {/* toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 flex-shrink-0 gap-2">
        <span className="text-xs font-medium text-slate-500">
          {filteredItems.length} record{filteredItems.length !== 1 ? 's' : ''}
          {hasActiveFilters && items.length !== filteredItems.length ? ` (of ${items.length})` : ''}
        </span>
        <div className="flex items-center gap-2">
          {!inDashboardCard && (
            <>
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
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
              >
                +
              </button>
            </>
          )}
        </div>
      </div>

      {showFilters && (
        <div className="flex flex-wrap items-end gap-3 px-3 py-2 border-b border-slate-100 bg-slate-50/80">
          <div className="flex flex-col gap-1 min-w-[120px]">
            <label className="text-xs font-medium text-slate-500">Created from</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[120px]">
            <label className="text-xs font-medium text-slate-500">Created to</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            />
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setFromDate('')
                setToDate('')
              }}
              className="text-xs text-slate-600 underline self-end pb-1"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* table */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-10 text-sm text-slate-400">Loading…</div>
        )}
        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <p className="text-sm text-slate-500">No past medical history has been recorded yet.</p>
            {!inDashboardCard && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Past Medical History
              </button>
            )}
          </div>
        )}
        {!loading && items.length > 0 && filteredItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <p className="text-sm text-slate-500">No records match the current filters.</p>
            <button
              type="button"
              onClick={() => {
                setFromDate('')
                setToDate('')
              }}
              className="text-xs text-primary underline"
            >
              Clear filters
            </button>
          </div>
        )}
        {!loading && filteredItems.length > 0 && compactClinical && (
          <div className="px-2 py-2 space-y-3 overflow-y-auto">
            {filteredItems.slice(0, 3).map((item, idx) => {
              const metaFields = [
                ['Record', item.name],
                ['Admission', item.inpatient_admission],
                ['Visit', item.patient_visit],
              ] as const
              const isLatest = idx === 0
              return (
                <button
                  key={item.name!}
                  type="button"
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    isLatest ? 'border-emerald-200/80 bg-emerald-50/50' : 'border-slate-200'
                  }`}
                  onClick={() => setDetailName(item.name!)}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-[11px] font-medium text-slate-500">
                      {isLatest ? 'Latest' : formatDate(item.creation)}
                    </span>
                    <CardRowMetaHint fields={metaFields} />
                  </div>
                  {isLatest ? (
                    <div className="text-sm max-h-[200px] overflow-y-auto">
                      <PastMedicalHistoryDisplay history={item} />
                    </div>
                  ) : (
                    <p className="text-sm text-slate-800 line-clamp-3">{pmhClinicalBlurb(item)}</p>
                  )}
                </button>
              )
            })}
            {filteredItems.length > 3 && (
              <p className="text-xs text-slate-500 text-center">
                +{filteredItems.length - 3} more — open full list (↗)
              </p>
            )}
          </div>
        )}
        {!loading && filteredItems.length > 0 && !compactClinical && (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Summary</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Admission</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Date</th>
                <th className="px-3 py-2.5 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.map((item) => (
                <tr
                  key={item.name!}
                  className="hover:bg-slate-50 cursor-pointer group"
                  onClick={() => setDetailName(item.name!)}
                >
                  <td className="px-3 py-2.5 text-slate-800">
                    <span className="flex items-center gap-1">
                      <span className="line-clamp-2">
                        {item.summary || (
                          <span className="italic text-slate-400">Past medical history</span>
                        )}
                      </span>
                      <ChevronRight className="w-3 h-3 text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">
                    {item.inpatient_admission || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                    {formatDate(item.creation)}
                  </td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <RowMenu
                      onEdit={() => {
                        fetchPatientMedicalHistoryDetail(item.name!)
                          .then((h) => setEditHistory(h))
                          .catch(() => {})
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreatePatientMedicalHistoryModal
          patient={patient}
          patientName={patientName}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Detail slide-over */}
      {detailName && (
        <MedicalHistoryDetailPanel
          name={detailName}
          onClose={() => setDetailName(null)}
          onEdit={(h) => { setDetailName(null); setEditHistory(h) }}
        />
      )}

      {/* Edit modal */}
      {editHistory && (
        <EditPatientMedicalHistoryModal
          patient={patient}
          history={editHistory}
          onClose={() => setEditHistory(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}