import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Brain, Calendar, FileText, Link2, User } from 'lucide-react'
import { fetchMentalState, type MentalStateDoc, type MentalStateRow } from '../../services/mentalState'
import { resolveOwnerUsername } from '../../services/common'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'

interface MentalStateDetailPanelProps {
  name: string
  onClose: () => void
  preview?: MentalStateRow
  onPatientClick?: (patient: string) => void
}

const Tick = ({ v }: { v: 0 | 1 | undefined | null }) =>
  v ? (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
      ✓
    </span>
  ) : (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-400">
      —
    </span>
  )

const DetailRow = ({ label, value }: { label: string; value: 0 | 1 | undefined | null }) => (
  <div className="flex items-center justify-between border-b border-slate-100 py-1 last:border-0">
    <span className="text-xs text-slate-600">{label}</span>
    <Tick v={value} />
  </div>
)

const SubLabel = ({ label }: { label: string }) => (
  <div className="mb-1 mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
)

const DataField = ({ label, value }: { label: string; value: string | number | null | undefined }) => (
  <div>
    <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    <div className="text-sm font-semibold text-slate-800">{value ?? '—'}</div>
  </div>
)

function displayValue(value: unknown): string {
  if (value == null || value === '') return '—'
  return String(value)
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('en-GB')
  } catch {
    return value
  }
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
        onClick ? 'cursor-pointer text-primary hover:underline' : 'text-emerald-950'
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
          <button type="button" onClick={onClick} className="w-full text-left">
            {valueEl}
          </button>
        ) : (
          valueEl
        )}
      </div>
    </div>
  )
}

export function MentalStateDetailPanel({
  name,
  onClose,
  preview,
  onPatientClick,
}: MentalStateDetailPanelProps) {
  const [doc, setDoc] = useState<MentalStateDoc | null>(preview ? { ...preview, name } : null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createdBy, setCreatedBy] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchMentalState(name)
      .then(async (data) => {
        const username = await resolveOwnerUsername(data.owner)
        if (!cancelled) {
          setDoc(data)
          setCreatedBy(username)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load mental state')
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

  const headerSubtitle = useMemo(() => {
    if (!source) return name
    const parts = [
      source.patient_name || source.file_no,
      source.creation ? formatDateTime(source.creation) : null,
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : name
  }, [source, name])

  return (
    <DetailSlideOver
      title="Mental Status"
      subtitle={headerSubtitle}
      icon={<Brain className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      headerActions={
        <PrintFormatDropdown
          doctype="Mental State"
          docName={name}
          noLetterhead={0}
          triggerPrint={1}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200/80 bg-white/80 text-emerald-700 shadow-sm transition hover:bg-emerald-50"
        />
      }
    >
      {loading && !source ? (
        <div className="flex items-center justify-center py-12">
          <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
          <span className="text-sm text-slate-500">Loading mental status…</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {source && !error ? (
        <div className="flex flex-col gap-5 pb-2">
          <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
            <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-3">
              <Brain className="h-5 w-5 text-emerald-600" strokeWidth={2} />
              <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">Behaviour & Speech</h3>
            </div>
            {source.normal_at ? (
              <div className="mb-3">
                <DataField label="Normal AT" value={source.normal_at} />
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-3">
              <div>
                <SubLabel label="Behaviour" />
                <DetailRow label="Cooperative" value={source.cooperative} />
                <DetailRow label="Aggressive" value={source.aggressive} />
                <DetailRow label="Paranoid" value={source.paranoid} />
                <DetailRow label="Demanding" value={source.demanding} />
                <DetailRow label="Preoccupied" value={source.preoccupied} />
                <DetailRow label="Defence" value={source.defence} />
                <DetailRow label="Impulsive" value={source.impulsive} />
                <DetailRow label="Sedative" value={source.sedative} />
                <DetailRow label="Delusion" value={source.dellusion} />
              </div>
              <div>
                <SubLabel label="Speech" />
                <DetailRow label="Normal S" value={source.normal_s} />
                <DetailRow label="Rapid" value={source.rapid} />
                <DetailRow label="Slow" value={source.slow} />
                <DetailRow label="Poor SP" value={source.poor_sp} />
                <DetailRow label="Slurred" value={source.slurred} />
                <DetailRow label="Coherent" value={source.coherent} />
                <DetailRow label="Incoherent" value={source.incoherent} />
                <DetailRow label="Talkative" value={source.talkative} />
                <SubLabel label="Mood / Affect" />
                <DetailRow label="Anxious" value={source.anxious} />
                <DetailRow label="Angry" value={source.angry} />
                <DetailRow label="Depressed" value={source.depressed} />
                <DetailRow label="Elated" value={source.elated} />
                <DetailRow label="Euthymic" value={source.euthymic} />
                <DetailRow label="Irritable" value={source.irritable} />
              </div>
              <div>
                <SubLabel label="Motor" />
                <DetailRow label="Twitches" value={source.twitches} />
                <DetailRow label="Hyperactive" value={source.hyperactive} />
                <DetailRow label="Stereotypes" value={source.stereotypes} />
                <DetailRow label="Restless" value={source.restless} />
                <DetailRow label="Gait" value={source.gait} />
                <DetailRow label="Tics" value={source.tics} />
                <DetailRow label="Agitated" value={source.agitated} />
                <DetailRow label="Abnormal" value={source.abnormal} />
                <DetailRow label="Hallucinatory Behaviour" value={source.hallucinatory_behaviour} />
                <DetailRow label="Normal" value={source.normal} />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
            <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">Orientation & Appetite</h3>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-x-6 sm:grid-cols-3">
              <DetailRow label="Place" value={source.place} />
              <DetailRow label="Time" value={source.time} />
              <DetailRow label="Person" value={source.person} />
            </div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Appetite</div>
            <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
              <DetailRow label="Normal Appetite" value={source.normal_ap} />
              <DetailRow label="Increased" value={source.increased} />
              <DetailRow label="Poor Appetite" value={source.poor_ap} />
            </div>
          </section>

          <section className="rounded-xl border border-emerald-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-emerald-100/80 sm:px-5 sm:py-5">
            <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">Sleep & Consciousness</h3>
            </div>
            <div className="mb-3">
              <DataField label="Sleep Duration (hrs)" value={source.sleep_duration} />
            </div>
            <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
              <DetailRow label="Normal Sleep" value={source.normal_sleep} />
              <DetailRow label="Disturbed" value={source.disturbed} />
              <DetailRow label="Intermittent" value={source.intermittent} />
              <DetailRow label="Excessive" value={source.excessive} />
              <DetailRow label="A Little" value={source.a_little} />
              <DetailRow label="Conscious" value={source.conscious} />
              <DetailRow label="Alert" value={source.alert} />
              <DetailRow label="Disturbed Con" value={source.disturbed_con} />
              <DetailRow label="Delusion" value={source.delusion} />
              <DetailRow label="Perception" value={source.perception} />
            </div>
            {source.remark ? (
              <div className="mt-3">
                <DataField label="Remark" value={source.remark} />
              </div>
            ) : null}
          </section>

          <section className={MODAL_SECTION_CLASS}>
            <h3 className={MODAL_SECTION_TITLE_CLASS}>
              <FileText className="h-4 w-4 text-emerald-600" strokeWidth={2} />
              Details
            </h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <InfoTile
                icon={<User className="h-4 w-4" strokeWidth={2} />}
                label="Patient"
                value={displayValue(doc?.patient_name || doc?.file_no || preview?.patient_name || preview?.file_no)}
                onClick={
                  (doc?.file_no || preview?.file_no) && onPatientClick
                    ? () => onPatientClick((doc?.file_no || preview?.file_no)!)
                    : undefined
                }
              />
              <InfoTile
                icon={<Link2 className="h-4 w-4" strokeWidth={2} />}
                label="Admission"
                value={displayValue(doc?.admission_no || preview?.admission_no)}
              />
              <InfoTile
                icon={<Calendar className="h-4 w-4" strokeWidth={2} />}
                label="Recorded"
                value={formatDateTime(doc?.creation || preview?.creation)}
              />
              <InfoTile
                icon={<FileText className="h-4 w-4" strokeWidth={2} />}
                label="Branch"
                value={displayValue(doc?.branch || preview?.branch)}
              />
              <InfoTile
                icon={<FileText className="h-4 w-4" strokeWidth={2} />}
                label="Trans Shift"
                value={displayValue(
                  doc?.trans_shift != null ? String(doc.trans_shift) : preview?.trans_shift != null ? String(preview.trans_shift) : null
                )}
              />
              <InfoTile
                icon={<User className="h-4 w-4" strokeWidth={2} />}
                label="Username"
                value={displayValue(createdBy)}
              />
            </div>
          </section>

          {doc?.creation ? (
            <p className="text-center text-xs text-slate-400">
              Recorded {formatDateTime(doc.creation)}
              {doc.modified && doc.modified !== doc.creation ? ` · Updated ${formatDateTime(doc.modified)}` : ''}
            </p>
          ) : null}
        </div>
      ) : null}
    </DetailSlideOver>
  )
}
