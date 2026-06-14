import { useEffect, useMemo, useState } from 'react'
import { Activity, ClipboardList, HeartPulse, Scale } from 'lucide-react'
import { fetchDoc } from '../../services/common'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'
import {
  VS_CLINICAL_FIELDS,
  VS_CORE_VITAL_FIELDS,
  VS_NOTE_FIELDS,
  VS_VISIT_FIELDS,
} from './vitalSignsDetailConfig'

type VitalSignDoc = Record<string, unknown>

interface VitalSignsDetailPanelProps {
  name: string
  subtitle?: string
  onClose: () => void
}

function displayValue(value: unknown): string {
  if (value == null || value === '') return '—'
  if (typeof value === 'number' && !Number.isNaN(value)) return String(value)
  return String(value)
}

function formatSignsDateTime(doc: VitalSignDoc): string {
  const date = doc.signs_date as string | undefined
  const time = doc.signs_time as string | undefined
  if (!date && !time) return '—'
  if (date && time) {
    try {
      const iso = time.length <= 8 ? `${date}T${time}` : `${date}T${time}`
      const d = new Date(iso)
      if (!Number.isNaN(d.getTime())) return d.toLocaleString()
    } catch {
      /* fall through */
    }
    return `${date} ${time}`
  }
  if (date) {
    try {
      return new Date(date).toLocaleDateString()
    } catch {
      return date
    }
  }
  return time ?? '—'
}

function formatBloodPressure(doc: VitalSignDoc): string | null {
  const combined = doc.bp
  if (combined != null && String(combined).trim() !== '') return String(combined)
  const sys = doc.bp_systolic
  const dia = doc.bp_diastolic
  if (sys != null && sys !== '' && dia != null && dia !== '') {
    return `${sys}/${dia}`
  }
  if (sys != null && sys !== '') return String(sys)
  if (dia != null && dia !== '') return String(dia)
  return null
}

function DataTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-emerald-100/80 bg-white/90 px-3 py-2.5 shadow-sm ring-1 ring-emerald-50/80">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/60">{label}</p>
      <p className="mt-1 text-sm font-medium leading-snug text-emerald-950 break-words">{value}</p>
    </div>
  )
}

function NoteBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-emerald-100/70 bg-white/90 px-4 py-3 shadow-sm ring-1 ring-emerald-50/80">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/60">{label}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{value}</p>
    </div>
  )
}

function resolveFieldValue(doc: VitalSignDoc, key: string): string {
  return displayValue(doc[key])
}

function hasMeaningfulValue(doc: VitalSignDoc, key: string): boolean {
  const v = doc[key]
  return v != null && String(v).trim() !== ''
}

export function VitalSignsDetailPanel({ name, subtitle: subtitleProp, onClose }: VitalSignsDetailPanelProps) {
  const [doc, setDoc] = useState<VitalSignDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchDoc('Vital Signs', name)
      .then((data) => {
        if (!cancelled) setDoc(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load vital signs')
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
    const when = formatSignsDateTime(doc)
    const parts = [
      (doc.patient_name as string) || (doc.patient as string),
      (doc.trans_no as string) || (doc.name as string),
      when !== '—' ? when : null,
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : subtitleProp ?? name
  }, [doc, subtitleProp, name])

  const coreVitals = useMemo(() => {
    if (!doc) return []
    return VS_CORE_VITAL_FIELDS.filter((f) => hasMeaningfulValue(doc, f.key))
  }, [doc])

  const bloodPressureDisplay = doc ? formatBloodPressure(doc) : null

  const noteBlocks = useMemo(() => {
    if (!doc) return []
    return VS_NOTE_FIELDS.map((f) => ({
      ...f,
      text: displayValue(doc[f.key]),
    })).filter((n) => n.text !== '—')
  }, [doc])

  const clinicalFields = useMemo(() => {
    if (!doc) return []
    return VS_CLINICAL_FIELDS.filter((f) => hasMeaningfulValue(doc, f.key))
  }, [doc])

  return (
    <DetailSlideOver
      title="Vital Signs"
      subtitle={headerSubtitle}
      icon={<HeartPulse className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      headerActions={
        <PrintFormatDropdown
          doctype="Vital Signs"
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
          <span className="text-sm text-slate-500">Loading vital signs…</span>
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
              Patient & visit
            </h3>
            <div className="mb-2.5">
              <DataTile label="Recorded" value={formatSignsDateTime(doc)} />
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {VS_VISIT_FIELDS.map((field) => (
                <DataTile
                  key={field.key}
                  label={field.label}
                  value={resolveFieldValue(doc, field.key)}
                />
              ))}
            </div>
          </section>

          <section className={MODAL_SECTION_CLASS}>
            <h3 className={MODAL_SECTION_TITLE_CLASS}>
              <Activity className="h-4 w-4 text-emerald-600" strokeWidth={2} />
              Vitals
            </h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {coreVitals.map((field) => (
                <DataTile
                  key={field.key}
                  label={field.label}
                  value={resolveFieldValue(doc, field.key)}
                />
              ))}
              {bloodPressureDisplay ? (
                <DataTile label="Blood Pressure" value={bloodPressureDisplay} />
              ) : null}
            </div>
          </section>

          <section className={MODAL_SECTION_CLASS}>
            <h3 className={MODAL_SECTION_TITLE_CLASS}>
              <Scale className="h-4 w-4 text-emerald-600" strokeWidth={2} />
              Height & weight
            </h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <DataTile label="Height (cm)" value={displayValue(doc.height)} />
              <DataTile label="Weight (kg)" value={displayValue(doc.weight)} />
            </div>
            <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <DataTile label="BMI" value={displayValue(doc.bmi)} />
            </div>
          </section>

          {clinicalFields.length > 0 ? (
            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>Clinical examination</h3>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {clinicalFields.map((field) => (
                  <DataTile
                    key={field.key}
                    label={field.label}
                    value={resolveFieldValue(doc, field.key)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {noteBlocks.length > 0 ? (
            <section className="space-y-3">
              <h3 className={MODAL_SECTION_TITLE_CLASS}>Notes</h3>
              {noteBlocks.map((note) => (
                <NoteBlock key={note.key} label={note.label} value={note.text} />
              ))}
            </section>
          ) : null}

          {doc.creation ? (
            <p className="text-center text-xs text-slate-400">
              Created {new Date(String(doc.creation)).toLocaleString()}
            </p>
          ) : null}
        </div>
      ) : null}
    </DetailSlideOver>
  )
}
