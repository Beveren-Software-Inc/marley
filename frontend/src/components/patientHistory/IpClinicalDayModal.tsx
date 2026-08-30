import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardList, NotebookPen, Pill, UserRound, X } from 'lucide-react'
import {
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { RichTextContent } from '../ui/RichTextContent'
import { formatDoseAndUom } from '../../utils/medicationOrderDisplayUtils'
import type {
  AdmissionClinicalBundle,
  AdmissionClinicalDoctorOrder,
  AdmissionClinicalNote,
  AdmissionClinicalPrescriptionMed,
} from '../../services/patientAdmissionClinical'
import { DateFilterInput } from '../ui/DateFilterInput'

function dateKey(value?: string | null): string {
  if (!value) return ''
  const s = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  try {
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return ''
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  } catch {
    return ''
  }
}

function todayKey(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + delta)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function daysBetweenInclusive(from: string, to: string): string[] {
  if (!from || !to || from > to) return from ? [from] : []
  const out: string[] = []
  let cur = from
  while (cur <= to) {
    out.push(cur)
    cur = addDays(cur, 1)
    if (out.length > 400) break
  }
  return out
}

function formatDayHeading(key: string): string {
  try {
    const [y, m, d] = key.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return key
  }
}

function isDoctorProgressNote(type?: string | null): boolean {
  const t = (type || '').trim().toLowerCase()
  if (!t || t.includes('nurse')) return false
  return (
    t.includes('doctor progress') ||
    t.includes('patient progress') ||
    t === 'progress note' ||
    t.includes('doctors note') ||
    t.includes("doctor's note") ||
    t === 'doctor note' ||
    t === 'doctor notes'
  )
}

function flattenMedications(bundle: AdmissionClinicalBundle): AdmissionClinicalPrescriptionMed[] {
  const out: AdmissionClinicalPrescriptionMed[] = []
  for (const rx of bundle.prescriptions || []) {
    for (const med of rx.medications || []) {
      out.push(med)
    }
  }
  return out
}

function medicationOnDay(med: AdmissionClinicalPrescriptionMed, day: string): boolean {
  const start = dateKey(med.date || med.start_date)
  const end = dateKey(med.end_date)
  const stoppedOn = dateKey(med.stopped_date)
  const discontinued =
    String(med.medication_status || '').trim() === 'Discontinued' || Boolean(med.stopped)
  if (!start) return false
  if (start > day) return false
  if (end && end < day) return false
  if (discontinued) {
    if (stoppedOn) return start <= day && day < stoppedOn
    return start === day
  }
  return true
}

function orderOnDay(order: AdmissionClinicalDoctorOrder, day: string): boolean {
  const key = dateKey(order.trans_date || order.doctor_entry_date)
  return key === day
}

function noteOnDay(note: AdmissionClinicalNote, day: string): boolean {
  return dateKey(note.posting_date) === day
}

export function IpClinicalDayModal({
  bundle,
  onClose,
}: {
  bundle: AdmissionClinicalBundle
  onClose: () => void
}) {
  const adm = bundle.admission_doc
  const dayList = useMemo(() => {
    const admitted = dateKey(adm?.admitted_datetime)
    const discharged = dateKey(adm?.discharge_datetime) || todayKey()
    const end = discharged > todayKey() ? todayKey() : discharged
    const start = admitted || end
    return daysBetweenInclusive(start, end < start ? start : end)
  }, [adm?.admitted_datetime, adm?.discharge_datetime])

  const [day, setDay] = useState(() => {
    const last = dayList[dayList.length - 1]
    const t = todayKey()
    if (last && t > last) return last
    if (dayList.includes(t)) return t
    return last || t
  })

  useEffect(() => {
    if (!dayList.length) return
    if (!dayList.includes(day)) {
      setDay(dayList[dayList.length - 1])
    }
  }, [day, dayList])

  const idx = Math.max(0, dayList.indexOf(day))
  const canPrev = idx > 0
  const canNext = idx >= 0 && idx < dayList.length - 1

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && canPrev) setDay(dayList[idx - 1])
      if (e.key === 'ArrowRight' && canNext) setDay(dayList[idx + 1])
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [canPrev, canNext, dayList, idx, onClose])

  const notes = useMemo(
    () =>
      (bundle.clinical_notes || []).filter(
        (n) => isDoctorProgressNote(n.clinical_note_type) && noteOnDay(n, day),
      ),
    [bundle.clinical_notes, day],
  )
  const medications = useMemo(
    () => flattenMedications(bundle).filter((m) => medicationOnDay(m, day)),
    [bundle, day],
  )
  const orders = useMemo(
    () => (bundle.doctor_orders || []).filter((o) => orderOnDay(o, day)),
    [bundle.doctor_orders, day],
  )
  const nursingNotes = useMemo(
    () => (bundle.nursing_notes || []).filter((n) => dateKey(n.date) === day),
    [bundle.nursing_notes, day],
  )

  const goPrev = () => {
    if (canPrev) setDay(dayList[idx - 1])
  }
  const goNext = () => {
    if (canNext) setDay(dayList[idx + 1])
  }

  return createPortal(
    <div
      className={CREATE_MODAL_OVERLAY}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ip-clinical-day-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={createModalShellClass('max-w-3xl w-full max-h-[90vh]')}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-emerald-100 px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700/80">
              Daily clinical record
            </p>
            <h2 id="ip-clinical-day-title" className="mt-0.5 text-lg font-semibold text-emerald-950">
              {formatDayHeading(day)}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {adm?.name ? `${adm.name} · ` : ''}
              Day {idx + 1} of {dayList.length || 1}
              {' · '}
              Progress notes, medications, doctor orders, and nursing notes for this day only
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-emerald-800/70 hover:bg-emerald-100 hover:text-emerald-950"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={!canPrev}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous day
          </button>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <CalendarDays className="h-4 w-4 text-emerald-700" />
            <DateFilterInput
              value={day}
              min={dayList[0]}
              max={dayList[dayList.length - 1]}
              onChange={(e) => {
                const next = e.target.value
                if (dayList.includes(next)) setDay(next)
              }}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
            />
          </label>
          <button
            type="button"
            onClick={goNext}
            disabled={!canNext}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next day
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <section>
            <div className="mb-2 flex items-center gap-2 text-emerald-900">
              <NotebookPen className="h-4 w-4" />
              <h3 className="text-xs font-bold uppercase tracking-wide">Doctor’s progress notes</h3>
            </div>
            {notes.length === 0 ? (
              <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-sm italic text-slate-400">
                No doctor’s progress notes on this day.
              </p>
            ) : (
              <ul className="space-y-2">
                {notes.map((note) => (
                  <li key={note.name} className="rounded-lg border border-slate-100 bg-white px-3 py-3">
                    <p className="text-xs text-slate-500">
                      {[note.clinical_note_type, note.practitioner_name].filter(Boolean).join(' · ')}
                    </p>
                    <RichTextContent value={note.note || ''} className="mt-1 text-sm text-slate-800" />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-emerald-900">
              <Pill className="h-4 w-4" />
              <h3 className="text-xs font-bold uppercase tracking-wide">Medications prescribed or active</h3>
            </div>
            {medications.length === 0 ? (
              <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-sm italic text-slate-400">
                No medications prescribed or active on this day.
              </p>
            ) : (
              <ul className="space-y-2">
                {medications.map((med, idxMed) => {
                  const start = dateKey(med.date || med.start_date)
                  const prescribedToday = start === day
                  return (
                    <li
                      key={`${med.display_drug_name || med.drug_name}-${idxMed}`}
                      className="rounded-lg border border-slate-100 bg-white px-3 py-3 text-sm text-slate-800"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {med.display_drug_name || med.drug_name || 'Medication'}
                        </span>
                        {prescribedToday ? (
                          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-sky-800">
                            Prescribed this day
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-slate-600">
                        {[
                          formatDoseAndUom(med.display_dosage || med.dosage, med.uom),
                          med.frequency,
                        ]
                          .filter((v) => v && v !== '-')
                          .join(' · ')}
                      </p>
                      {med.instructions ? (
                        <p className="mt-0.5 text-xs text-slate-500">{med.instructions}</p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-emerald-900">
              <ClipboardList className="h-4 w-4" />
              <h3 className="text-xs font-bold uppercase tracking-wide">Doctor’s orders</h3>
            </div>
            {orders.length === 0 ? (
              <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-sm italic text-slate-400">
                No doctor’s orders issued on this day.
              </p>
            ) : (
              <ul className="space-y-2">
                {orders.map((order) => (
                  <li key={order.name} className="rounded-lg border border-slate-100 bg-white px-3 py-3">
                    <p className="text-xs text-slate-500">
                      {[order.trans_no || order.name, order.doctor_name, order.status]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                      {order.doctor_order || order.request || '—'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-emerald-900">
              <UserRound className="h-4 w-4" />
              <h3 className="text-xs font-bold uppercase tracking-wide">Nursing notes</h3>
            </div>
            {nursingNotes.length === 0 ? (
              <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-sm italic text-slate-400">
                No nursing notes on this day.
              </p>
            ) : (
              <ul className="space-y-2">
                {nursingNotes.map((note) => (
                  <li key={note.name} className="rounded-lg border border-slate-100 bg-white px-3 py-3">
                    <p className="text-xs text-slate-500">
                      {[note.shift, note.user_name || note.last_appended_by_name, note.trans_no]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {note.nursing_notes?.trim() ? (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{note.nursing_notes}</p>
                    ) : null}
                    {(note.entries || []).length > 0 ? (
                      <ul className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
                        {(note.entries || []).map((entry, entryIdx) => (
                          <li key={entry.name || entryIdx} className="text-sm text-slate-800">
                            <p className="text-[11px] text-slate-500">
                              {[entry.note_time, entry.authored_by_name].filter(Boolean).join(' · ')}
                            </p>
                            <p className="whitespace-pre-wrap">{entry.note}</p>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {!note.nursing_notes?.trim() && !(note.entries || []).length ? (
                      <p className="mt-1 text-sm italic text-slate-400">Empty note</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  )
}
