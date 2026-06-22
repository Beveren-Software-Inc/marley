import { useState, useEffect } from 'react'
import { fetchDoc } from '../../services/common'
import {
  appointmentNeedsRegistration,
  formatAppointmentTimeLabel,
  getPatientVisitForAppointment,
  isWalkInAppointment,
} from '../../services/appointments'
import { StatusPill } from '../ui/StatusPill'
import { useCareContext } from '../../providers/CareContextProvider'
import { ExternalLink } from 'lucide-react'

type AppointmentDoc = Record<string, unknown>

const statusColorMap: Record<string, string> = {
  Scheduled: 'info',
  Open: 'warning',
  Confirmed: 'success',
  'Checked In': 'success',
  'Patient Arrived': 'success',
  'Checked Out': 'default',
  Closed: 'default',
  Cancelled: 'danger',
  'No Show': 'danger',
}

function formatDate(val?: string | null): string {
  if (!val) return '—'
  try {
    return new Date(val).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return val
  }
}

function str(val: unknown): string {
  if (val == null || val === '') return '—'
  return String(val)
}

interface InfoRowProps {
  label: string
  value: string
  highlight?: boolean
}
function InfoRow({ label, value, highlight }: InfoRowProps) {
  return (
    <div className={`flex flex-col gap-0.5 ${highlight ? 'bg-primary/5 rounded-md px-2 py-1.5' : ''}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <span className={`text-sm font-medium ${value === '—' ? 'text-slate-400' : 'text-slate-800'}`}>{value}</span>
    </div>
  )
}

interface SectionProps {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  accent?: string
}
function Section({ title, icon, children, accent = 'border-slate-200' }: SectionProps) {
  return (
    <div className={`rounded-xl border ${accent} bg-white shadow-sm overflow-hidden`}>
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
        <span className="text-slate-400">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</span>
      </div>
      <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-3">{children}</div>
    </div>
  )
}

interface AppointmentDetailPanelProps {
  name: string
  refreshKey?: string | number
  receptionWalkInActions?: boolean
  onRegisterWalkIn?: () => void
  onCreateVisit?: () => void
  onMarkArrived?: () => void
  onMarkCheckedOut?: () => void
  onAddRemarks?: () => void
  onAddDoctorNote?: () => void
  /** Sync parent page patient bar when opening OP visit from this appointment. */
  onPatientSelect?: (patient: string) => void
}

export function AppointmentDetailPanel({
  name,
  refreshKey,
  receptionWalkInActions = false,
  onRegisterWalkIn,
  onCreateVisit,
  onMarkArrived,
  onMarkCheckedOut,
  onAddRemarks,
  onAddDoctorNote,
  onPatientSelect,
}: AppointmentDetailPanelProps) {
  const { applyOpCareContext } = useCareContext()
  const [doc, setDoc] = useState<AppointmentDoc | null>(null)
  const [patientVisit, setPatientVisit] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchDoc('Patient Appointment', name)
      .then((data) => {
        if (!cancelled) setDoc(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [name, refreshKey])

  useEffect(() => {
    if (!doc) {
      setPatientVisit(null)
      return
    }
    const linked = typeof doc.patient_visit === 'string' ? doc.patient_visit.trim() : ''
    if (linked) {
      setPatientVisit(linked)
      return
    }
    let cancelled = false
    getPatientVisitForAppointment(name)
      .then((visit) => {
        if (!cancelled) setPatientVisit(visit)
      })
      .catch(() => {
        if (!cancelled) setPatientVisit(null)
      })
    return () => {
      cancelled = true
    }
  }, [doc, name, refreshKey])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <svg className="w-7 h-7 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span className="text-sm">Loading appointment…</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">{error}</div>
    )
  }

  if (!doc) return null

  const aptForCheck = {
    patient: doc.patient as string | undefined,
    temporary_patient_name: doc.temporary_patient_name as string | undefined,
  }
  const isWalkIn = isWalkInAppointment(aptForCheck)
  const status = str(doc.status)
  const displayName = isWalkIn ? str(doc.temporary_patient_name) : str(doc.patient_name || doc.patient)
  const hasPatient = Boolean(doc.patient)

  return (
    <div className="space-y-4">
      {isWalkIn && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <span className="mt-0.5 text-amber-500 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold text-amber-800">Walk-in Patient — No File on Record</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Choose Register patient when they arrive — a patient file is created, they are marked arrived, and a visit is opened automatically.
            </p>
          </div>
        </div>
      )}

      {receptionWalkInActions &&
        isWalkIn &&
        (onRegisterWalkIn || onCreateVisit || onMarkArrived || onMarkCheckedOut) && (
        <div className="flex flex-wrap gap-2">
          {onRegisterWalkIn && !(appointmentNeedsRegistration(aptForCheck) && onMarkArrived) && (
            <button
              type="button"
              onClick={onRegisterWalkIn}
              className="inline-flex items-center px-3 py-2 text-xs font-semibold rounded-md border border-primary bg-primary text-white hover:bg-primary/90"
            >
              Register patient
            </button>
          )}
          {onCreateVisit && (
            <button
              type="button"
              onClick={onCreateVisit}
              disabled={!hasPatient}
              title={!hasPatient ? 'Register patient first' : undefined}
              className="inline-flex items-center px-3 py-2 text-xs font-semibold rounded-md border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create visit
            </button>
          )}
          {onMarkArrived && (
            <button
              type="button"
              onClick={onMarkArrived}
              className="inline-flex items-center px-3 py-2 text-xs font-semibold rounded-md border border-emerald-600 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            >
              {!hasPatient ? 'Register patient' : 'Patient arrived'}
            </button>
          )}
          {onMarkCheckedOut && (
            <button
              type="button"
              onClick={onMarkCheckedOut}
              className="inline-flex items-center px-3 py-2 text-xs font-semibold rounded-md border border-slate-400 bg-slate-50 text-slate-800 hover:bg-slate-100"
            >
              Check out patient
            </button>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-primary/5 to-white shadow-sm p-4 flex items-start gap-4">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-slate-900 truncate">{displayName}</h3>
            {isWalkIn && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 border border-amber-300 rounded-full px-2 py-0.5">
                Walk-in
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{str(doc.name)}</p>
          <div className="mt-2">
            <StatusPill status={status} color={statusColorMap[status] || 'default'} />
          </div>
        </div>
      </div>

      <Section
        title="Patient"
        icon={
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        }
        accent={isWalkIn ? 'border-amber-200' : 'border-slate-200'}
      >
        {isWalkIn ? (
          <>
            <InfoRow label="Temporary Name" value={str(doc.temporary_patient_name)} highlight />
            <InfoRow label="Mobile No" value={str(doc.temporary_mobile_no)} highlight />
          </>
        ) : (
          <>
            <InfoRow label="Patient ID" value={str(doc.patient)} />
            <InfoRow label="Patient Name" value={str(doc.patient_name)} />
            {!!doc.patient_sex && <InfoRow label="Sex" value={str(doc.patient_sex)} />}
            {!!doc.patient_age && <InfoRow label="Age" value={str(doc.patient_age)} />}
          </>
        )}
      </Section>

      <Section
        title="Appointment"
        icon={
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        }
      >
        <InfoRow label="Date" value={formatDate(doc.appointment_date as string)} />
        <InfoRow
          label="Time"
          value={formatAppointmentTimeLabel(
            doc.appointment_time as string,
            doc.old_time as string
          )}
        />
        <InfoRow label="Type" value={str(doc.appointment_type)} />
        <InfoRow label="Status" value={status} />
        {!!doc.service_unit && <InfoRow label="Service Unit" value={str(doc.service_unit)} />}
        {!!doc.cost_center && <InfoRow label="Branch" value={str(doc.cost_center)} />}
        {!!doc.company && <InfoRow label="Company" value={str(doc.company)} />}
        {!!doc.source && <InfoRow label="Source" value={str(doc.source)} />}
        {patientVisit ? (
          <div className="col-span-2 flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Patient Visit</span>
            <button
              type="button"
              onClick={() => {
                const patientId = typeof doc.patient === 'string' ? doc.patient : undefined
                applyOpCareContext({ patient: patientId, visit: patientVisit })
                if (patientId) onPatientSelect?.(patientId)
              }}
              className="inline-flex items-center gap-1.5 text-left text-sm font-medium text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              {patientVisit}
              <span className="text-xs font-normal text-slate-500">— open in OP header</span>
            </button>
          </div>
        ) : null}
      </Section>

      {!!(doc.practitioner || doc.department) && (
        <Section
          title="Doctor"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          }
        >
          <InfoRow label="Doctor" value={str(doc.practitioner_name || doc.practitioner)} />
          <InfoRow label="Department" value={str(doc.department)} />
          {!!doc.referring_practitioner && (
            <InfoRow label="Referring Doctor" value={str(doc.referring_practitioner)} />
          )}
        </Section>
      )}

      {!!(doc.mode_of_payment || doc.paid_amount) && (
        <Section
          title="Billing"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          }
        >
          <InfoRow label="Mode of Payment" value={str(doc.mode_of_payment)} />
          <InfoRow label="Paid Amount" value={doc.paid_amount ? String(doc.paid_amount) : '—'} />
        </Section>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
          <div className="flex items-center gap-2 min-w-0">
            <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Remarks &amp; Notes</span>
          </div>
          <div className="flex flex-wrap gap-1.5 shrink-0">
            {onAddRemarks && (
              <button
                type="button"
                onClick={onAddRemarks}
                className="inline-flex items-center px-2 py-1 text-[11px] font-semibold rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              >
                {doc.remarks ? 'Edit remarks' : 'Add remarks'}
              </button>
            )}
            {onAddDoctorNote && (
              <button
                type="button"
                onClick={onAddDoctorNote}
                className="inline-flex items-center px-2 py-1 text-[11px] font-semibold rounded border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
              >
                {doc.notes ? "Edit doctor's note" : "Add doctor's note"}
              </button>
            )}
          </div>
        </div>
        <div className="px-4 py-3 space-y-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Reception remarks</p>
            {doc.remarks ? (
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{str(doc.remarks)}</p>
            ) : (
              <p className="text-sm text-slate-400 italic">No reception remarks added.</p>
            )}
          </div>
          <div className="border-t border-slate-100 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Doctor&apos;s note</p>
            {doc.notes ? (
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{str(doc.notes)}</p>
            ) : (
              <p className="text-sm text-slate-400 italic">No doctor&apos;s note added.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
