import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Stethoscope } from 'lucide-react'
import { fetchDoc } from '../../services/common'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'
import { PE_FINDING_SECTIONS, PE_VISIT_FIELDS } from './physicalExamDetailConfig'

type PhysicalExamDoc = Record<string, unknown>

interface PhysicalExaminationDetailPanelProps {
  name: string
  /** Fallback before doc loads (e.g. from list row) */
  subtitle?: string
  onClose: () => void
}

function displayValue(value: unknown): string {
  if (value == null || value === '') return '—'
  return String(value)
}

function DataTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-emerald-100/80 bg-white/90 px-3 py-2.5 shadow-sm ring-1 ring-emerald-50/80">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/60">{label}</p>
      <p className="mt-1 text-sm font-medium leading-snug text-emerald-950 break-words">{value}</p>
    </div>
  )
}

function FindingBlock({
  label,
  value,
  accent,
  titleClass,
}: {
  label: string
  value: string
  accent: string
  titleClass: string
}) {
  return (
    <div className={`rounded-lg border border-emerald-100/60 border-l-4 px-4 py-3 ${accent}`}>
      <p className={`text-xs font-bold uppercase tracking-wide ${titleClass}`}>{label}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{value}</p>
    </div>
  )
}

export function PhysicalExaminationDetailPanel({
  name,
  subtitle: subtitleProp,
  onClose,
}: PhysicalExaminationDetailPanelProps) {
  const [doc, setDoc] = useState<PhysicalExamDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchDoc('Physical Examination', name)
      .then(async (data) => {
        const owner = String(data?.owner || '').trim()
        if (owner) {
          try {
            const params = new URLSearchParams({
              doctype: 'User',
              fields: JSON.stringify(['name', 'full_name', 'username']),
              filters: JSON.stringify([['name', '=', owner]]),
              limit_page_length: '1',
            })
            const res = await fetch(`/api/method/frappe.client.get_list?${params}`)
            const payload = await res.json()
            const user = Array.isArray(payload?.message) ? payload.message[0] : null
            if (user) {
              data.owner_username = user.username || user.full_name || user.name
            }
          } catch {
            /* keep owner id */
          }
        }
        if (!cancelled) setDoc(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load examination')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [name])

  const headerSubtitle = useMemo(() => {
    if (!doc) return subtitleProp ?? name
    const parts = [
      (doc.patient_name as string) || (doc.patient as string),
      (doc.trans_no as string) || (doc.name as string),
    ]
    if (doc.inpatient_admission) {
      parts.push(doc.inpatient_admission as string)
    } else if (doc.patient_visit) {
      parts.push(doc.patient_visit as string)
    }
    return parts.filter(Boolean).join(' · ') || (subtitleProp ?? name)
  }, [doc, subtitleProp, name])

  const visitFields = useMemo(() => {
    if (!doc) return PE_VISIT_FIELDS
    const hasIp = Boolean(doc.inpatient_admission)
    const hasOp = Boolean(doc.patient_visit)
    return PE_VISIT_FIELDS.filter((field) => {
      if (field.key === 'patient_visit' && hasIp) return false
      if (field.key === 'inpatient_admission' && hasOp && !hasIp) return false
      return true
    })
  }, [doc])

  const findingSections = useMemo(() => {
    if (!doc) return []
    return PE_FINDING_SECTIONS.map((section) => ({
      ...section,
      text: displayValue(doc[section.key]),
    })).filter((s) => s.text !== '—')
  }, [doc])

  return (
    <DetailSlideOver
      title="Physical Examination"
      subtitle={headerSubtitle}
      icon={<Stethoscope className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      headerActions={
        <PrintFormatDropdown
          doctype="Physical Examination"
          docName={name}
          noLetterhead={0}
          triggerPrint={1}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200/80 bg-white/80 text-emerald-700 shadow-sm transition hover:bg-emerald-50"
        />
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
          <span className="text-sm text-slate-500">Loading examination…</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {doc && !loading && !error ? (
        <div className="flex flex-col gap-5 pb-2">
          <section className={MODAL_SECTION_CLASS}>
            <h3 className={MODAL_SECTION_TITLE_CLASS}>
              <ClipboardList className="h-4 w-4 text-emerald-600" strokeWidth={2} />
              Visit & patient
            </h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {visitFields.map((field) => (
                <DataTile
                  key={field.key}
                  label={field.label}
                  value={displayValue(doc[field.key])}
                />
              ))}
              <DataTile
                label="Username"
                value={displayValue(doc.owner_username || doc.owner)}
              />
            </div>
          </section>

          {findingSections.length > 0 ? (
            <section className="space-y-3">
              <h3 className={MODAL_SECTION_TITLE_CLASS}>
                <Stethoscope className="h-4 w-4 text-emerald-600" strokeWidth={2} />
                Examination findings
              </h3>
              <div className="space-y-3">
                {findingSections.map((section) => (
                  <FindingBlock
                    key={section.key}
                    label={section.label}
                    value={section.text}
                    accent={section.accent}
                    titleClass={section.titleClass}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {doc.creation ? (
            <p className="text-center text-xs text-slate-400">
              Recorded {new Date(String(doc.creation)).toLocaleString()}
            </p>
          ) : null}
        </div>
      ) : null}
    </DetailSlideOver>
  )
}
