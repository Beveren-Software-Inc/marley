import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Building2,
  Calendar,
  ClipboardList,
  FlaskConical,
  Stethoscope,
  User,
  Wallet,
} from 'lucide-react'
import { fetchServiceRequest } from '../../services/serviceRequests'
import { useFormatMoney } from '../../hooks/useFormatMoney'
import { useCareContext } from '../../providers/CareContextProvider'
import { StatusPill } from '../ui/StatusPill'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import {
  MODAL_SECTION_CLASS,
  MODAL_SECTION_TITLE_CLASS,
} from '../ui/CreateModalChrome'

interface ServiceRequestDetailPanelProps {
  name: string
  onClose: () => void
  onEdit?: () => void
}

function formatDateTime(date?: string, time?: string) {
  if (!date) return '—'
  try {
    const iso = time ? `${date}T${time}` : date
    return new Date(iso).toLocaleString('en-GB')
  } catch {
    return [date, time].filter(Boolean).join(' ')
  }
}

function statusColor(status?: string): string {
  if (!status) return 'default'
  const s = status.toLowerCase()
  if (s.includes('completed')) return 'success'
  if (s.includes('pending') || s.includes('draft')) return 'warning'
  if (s.includes('cancel') || s.includes('revoked')) return 'danger'
  if (s.includes('active')) return 'info'
  return 'default'
}

function formatStatusLabel(status?: string) {
  if (!status) return '—'
  const part = status.split('-')[0].trim()
  return part.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

type LabLine = { label: string; kind?: string }

function parseLabLines(raw: unknown): LabLine[] {
  if (!raw) return []
  let items: unknown[] = []
  if (typeof raw === 'string') {
    try {
      items = JSON.parse(raw) as unknown[]
    } catch {
      return []
    }
  } else if (Array.isArray(raw)) {
    items = raw
  }
  return items.map((item) => {
    if (!item || typeof item !== 'object') return { label: String(item) }
    const row = item as Record<string, unknown>
    if (row.kind === 'group') {
      const parent = String(row.parent || 'Lab group')
      const children = Array.isArray(row.children) ? row.children.length : 0
      return { label: `${parent} (${children} tests)`, kind: 'group' }
    }
    return { label: String(row.template || row.template_dn || 'Lab test'), kind: 'single' }
  })
}

function InfoTile({
  icon,
  label,
  value,
  className = '',
}: {
  icon: ReactNode
  label: string
  value: string
  className?: string
}) {
  return (
    <div
      className={`flex min-w-0 items-start gap-2.5 rounded-lg border border-emerald-100/70 bg-white/80 px-3 py-2.5 shadow-sm ${className}`}
    >
      <div className="mt-0.5 shrink-0 text-emerald-600/80">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/65">{label}</p>
        <p className="mt-0.5 text-sm font-medium leading-snug text-emerald-950 break-words">{value}</p>
      </div>
    </div>
  )
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-slate-100 py-2.5 last:border-0 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900 break-words">{value}</dd>
    </div>
  )
}

export function ServiceRequestDetailPanel({ name, onClose, onEdit }: ServiceRequestDetailPanelProps) {
  const formatMoney = useFormatMoney()
  const { guardClinicalEdit } = useCareContext()
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchServiceRequest(name)
      .then((data) => {
        if (!cancelled) setDoc(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load service request')
          setDoc(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [name])

  const labLines = useMemo(() => parseLabLines(doc?.lab_request_items), [doc])

  const grandTotal = doc?.grand_total != null ? Number(doc.grand_total) : NaN
  const cost = doc?.cost != null ? Number(doc.cost) : NaN
  const amount = doc?.amount != null ? Number(doc.amount) : NaN
  const displayTotal = Number.isFinite(grandTotal)
    ? grandTotal
    : Number.isFinite(cost)
      ? cost
      : Number.isFinite(amount)
        ? amount
        : null

  const patientLabel =
    (doc?.patient_name as string) || (doc?.patient as string) || '—'
  const practitionerLabel =
    (doc?.practitioner_name as string) || (doc?.practitioner as string) || '—'
  const templateLabel =
    (doc?.template_name as string) ||
    (doc?.template_dn as string) ||
    '—'

  return (
    <DetailSlideOver
      title="Service Request"
      subtitle={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-medium text-emerald-950">{name}</span>
          {doc?.order_date ? (
            <>
              <span className="text-emerald-700/40">·</span>
              <span>{formatDateTime(doc.order_date as string, doc.order_time as string)}</span>
            </>
          ) : null}
        </span>
      }
      icon={<ClipboardList className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
      onClose={onClose}
      headerActions={
        <div className="flex items-center gap-2">
          {doc?.status ? (
            <StatusPill
              status={formatStatusLabel(doc.status as string)}
              color={statusColor(doc.status as string)}
            />
          ) : null}
          <PrintFormatDropdown
            doctype="Service Request"
            docName={name}
            noLetterhead={0}
            triggerPrint={1}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200/80 bg-white/80 text-emerald-700 shadow-sm transition hover:bg-emerald-50"
          />
        </div>
      }
      footer={
        onEdit ? (
          <button
            type="button"
            onClick={() => {
              guardClinicalEdit(() => {
                onEdit()
                onClose()
              })
            }}
            className="rounded-lg border border-emerald-200/80 bg-white px-4 py-2 text-sm font-medium text-emerald-900 shadow-sm transition hover:bg-emerald-50"
          >
            Edit request
          </button>
        ) : undefined
      }
    >
      {loading && <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {doc && !loading && !error && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <InfoTile icon={<User className="h-4 w-4" />} label="Patient" value={patientLabel} />
            <InfoTile
              icon={<Stethoscope className="h-4 w-4" />}
              label="Practitioner"
              value={practitionerLabel}
            />
            <InfoTile
              icon={<FlaskConical className="h-4 w-4" />}
              label="Template"
              value={templateLabel}
              className="sm:col-span-2"
            />
            {displayTotal != null && (
              <InfoTile
                icon={<Wallet className="h-4 w-4" />}
                label="Total"
                value={formatMoney(displayTotal)}
              />
            )}
            {doc.cost_center ? (
              <InfoTile
                icon={<Building2 className="h-4 w-4" />}
                label="Branch"
                value={String(doc.cost_center)}
              />
            ) : null}
          </div>

          {labLines.length > 0 && (
            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>
                <FlaskConical className="h-4 w-4 text-emerald-600" />
                Lab request items
              </h3>
              <ul className="space-y-1.5">
                {labLines.map((line, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm text-slate-800"
                  >
                    <span className="text-emerald-600/70">•</span>
                    {line.label}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={MODAL_SECTION_CLASS}>
            <h3 className={MODAL_SECTION_TITLE_CLASS}>
              <Calendar className="h-4 w-4 text-emerald-600" />
              Order details
            </h3>
            <dl>
              <FieldRow label="ID" value={name} />
              <FieldRow
                label="Template type"
                value={String(doc.template_dt || '—')}
              />
              <FieldRow label="Status" value={formatStatusLabel(doc.status as string)} />
              <FieldRow
                label="Order date"
                value={formatDateTime(doc.order_date as string, doc.order_time as string)}
              />
              {doc.patient_visit ? (
                <FieldRow label="Patient visit" value={String(doc.patient_visit)} />
              ) : null}
              {doc.inpatient_record ? (
                <FieldRow label="Admission" value={String(doc.inpatient_record)} />
              ) : null}
              {doc.medical_department ? (
                <FieldRow label="Department" value={String(doc.medical_department)} />
              ) : null}
              {doc.priority ? <FieldRow label="Priority" value={String(doc.priority)} /> : null}
              {doc.intent ? <FieldRow label="Intent" value={String(doc.intent)} /> : null}
            </dl>
          </section>

          {(doc.discount != null || doc.discount_amount != null) && (
            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>
                <Wallet className="h-4 w-4 text-emerald-600" />
                Billing
              </h3>
              <dl>
                {doc.cost != null && (
                  <FieldRow label="List amount" value={formatMoney(Number(doc.cost))} />
                )}
                {doc.discount != null && (
                  <FieldRow label="Discount %" value={`${doc.discount}%`} />
                )}
                {doc.discount_amount != null && (
                  <FieldRow
                    label="Discount amount"
                    value={formatMoney(Number(doc.discount_amount))}
                  />
                )}
                {displayTotal != null && (
                  <FieldRow label="Grand total" value={formatMoney(displayTotal)} />
                )}
                {doc.billing_status ? (
                  <FieldRow label="Billing status" value={String(doc.billing_status)} />
                ) : null}
              </dl>
            </section>
          )}

          {doc.patient_instructions ? (
            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>Patient instructions</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                {String(doc.patient_instructions)}
              </p>
            </section>
          ) : null}

          {doc.order_description ? (
            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>Description</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                {String(doc.order_description)}
              </p>
            </section>
          ) : null}
        </div>
      )}
    </DetailSlideOver>
  )
}
