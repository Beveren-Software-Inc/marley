import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Building2,
  Calendar,
  ClipboardList,
  ShieldAlert,
  Stethoscope,
  User,
} from 'lucide-react'
import { fetchMorseFallScale, type MorseFallScale } from '../../services/morseFallScale'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'

interface MorseFallScaleDetailPanelProps {
  name: string
  onClose: () => void
  preview?: MorseFallScale
  onPatientClick?: (patient: string) => void
}

function displayValue(value: unknown): string {
  if (value == null || value === '') return '—'
  return String(value)
}

function formatDate(value?: string): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('en-GB')
  } catch {
    return value
  }
}

function getRiskLevel(total: number): { label: string; className: string } {
  if (total < 25) return { label: 'No Risk', className: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
  if (total < 51) return { label: 'Low Risk', className: 'text-yellow-700 bg-yellow-50 border-yellow-200' }
  return { label: 'High Risk', className: 'text-red-700 bg-red-50 border-red-200' }
}

function InfoTile({
  icon,
  label,
  value,
  onClick,
}: {
  icon: ReactNode
  label: string
  value: string
  onClick?: () => void
}) {
  const valueEl = (
    <p
      className={`mt-0.5 text-sm font-medium leading-snug break-words ${
        onClick ? 'text-primary hover:underline cursor-pointer' : 'text-emerald-950'
      }`}
    >
      {value}
    </p>
  )

  return (
    <div className="flex min-w-0 items-start gap-2.5 rounded-lg border border-emerald-100/70 bg-white/80 px-3 py-2.5 shadow-sm ring-1 ring-emerald-50/80">
      <div className="mt-0.5 shrink-0 text-emerald-600/80">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/65">{label}</p>
        {onClick ? (
          <button type="button" onClick={onClick} className="text-left w-full">
            {valueEl}
          </button>
        ) : (
          valueEl
        )}
      </div>
    </div>
  )
}

export function MorseFallScaleDetailPanel({
  name,
  onClose,
  preview,
  onPatientClick,
}: MorseFallScaleDetailPanelProps) {
  const [doc, setDoc] = useState<MorseFallScale | null>(preview ? { ...preview, name } : null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchMorseFallScale(name)
      .then((data) => {
        if (!cancelled) setDoc(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load Morse Fall Scale')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [name])

  const source = doc ?? preview
  const totalPoints = source?.total_points ?? 0
  const risk = getRiskLevel(totalPoints)
  const detailRows = source?.morse_fall_scale_detail ?? []

  const headerSubtitle = useMemo(() => {
    if (!source) return name
    const parts = [
      source.trans_no || source.name,
      source.patient_name || source.patient_no,
      source.date ? formatDate(source.date) : null,
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : name
  }, [source, name])

  return (
    <DetailSlideOver
      title="Morse Fall Scale"
      subtitle={headerSubtitle}
      icon={<ShieldAlert className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      headerActions={
        <div className="flex items-center gap-2">
          {source?.total_points != null ? (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${risk.className}`}>
              {totalPoints} pts · {risk.label}
            </span>
          ) : null}
          <PrintFormatDropdown
            doctype="Morse Fall Scale"
            docName={name}
            noLetterhead={0}
            triggerPrint={1}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200/80 bg-white/80 text-emerald-700 shadow-sm transition hover:bg-emerald-50"
          />
        </div>
      }
    >
      {loading && !source ? (
        <div className="flex items-center justify-center py-12">
          <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
          <span className="text-sm text-slate-500">Loading Morse Fall Scale…</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {source && !error ? (
        <div className="flex flex-col gap-5 pb-2">
          <section className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/70">Total score</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h3 className="text-2xl font-semibold text-emerald-950">{totalPoints}</h3>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${risk.className}`}>
                {risk.label}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              0 = no risk · &lt;25 = low · 25–45 = moderate · &gt;45 = high
            </p>
          </section>

          {detailRows.length > 0 ? (
            <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
              <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-3">
                <ClipboardList className="h-5 w-5 text-emerald-600" strokeWidth={2} />
                <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">Assessment details</h3>
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Item</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase w-20">Points</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detailRows.map((row, idx) => (
                      <tr key={`${row.text_message}-${idx}`}>
                        <td className="px-3 py-2.5 text-slate-800">{displayValue(row.text_message)}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-700">{row.points ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className={MODAL_SECTION_CLASS}>
            <h3 className={MODAL_SECTION_TITLE_CLASS}>
              <ClipboardList className="h-4 w-4 text-emerald-600" strokeWidth={2} />
              Record details
            </h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <InfoTile
                icon={<User className="h-4 w-4" strokeWidth={2} />}
                label="Patient"
                value={displayValue(source.patient_name || source.patient_no)}
                onClick={
                  source.patient_no && onPatientClick ? () => onPatientClick(source.patient_no) : undefined
                }
              />
              <InfoTile
                icon={<ClipboardList className="h-4 w-4" strokeWidth={2} />}
                label="Admission"
                value={displayValue(source.admission_no)}
              />
              <InfoTile
                icon={<Stethoscope className="h-4 w-4" strokeWidth={2} />}
                label="Practitioner"
                value={displayValue(source.practitioner_name || source.practitioner)}
              />
              <InfoTile
                icon={<Calendar className="h-4 w-4" strokeWidth={2} />}
                label="Date"
                value={formatDate(source.date)}
              />
              <InfoTile
                icon={<Building2 className="h-4 w-4" strokeWidth={2} />}
                label="Company"
                value={displayValue(source.company)}
              />
              <InfoTile
                icon={<Building2 className="h-4 w-4" strokeWidth={2} />}
                label="Branch"
                value={displayValue(source.cost_center)}
              />
              <InfoTile
                icon={<ClipboardList className="h-4 w-4" strokeWidth={2} />}
                label="Trans no"
                value={displayValue(source.trans_no || source.name)}
              />
              <InfoTile
                icon={<ClipboardList className="h-4 w-4" strokeWidth={2} />}
                label="Orderer number"
                value={displayValue(source.orderer_number)}
              />
            </div>
          </section>
        </div>
      ) : null}
    </DetailSlideOver>
  )
}
