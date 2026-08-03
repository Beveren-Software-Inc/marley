import { useEffect, useMemo, useState } from 'react'
import { Activity, ClipboardList, FileHeart, Stethoscope } from 'lucide-react'
import { fetchDoc } from '../../services/common'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'
import {
  AttachBlock,
  DataTile,
  MetaFooter,
  NoteBlock,
  VitalTile,
  displayValue,
  formatDate,
  formatDateTime,
  hasValue,
  type DocRecord,
} from './ectDetailUi'

interface ECTAdmissionDetailPanelProps {
  name: string
  subtitle?: string
  onClose: () => void
}

export function ECTAdmissionDetailPanel({ name, subtitle, onClose }: ECTAdmissionDetailPanelProps) {
  const [doc, setDoc] = useState<DocRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchDoc('ECT Admission', name)
      .then((data) => {
        if (!cancelled) setDoc(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load ECT Admission')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [name])

  const headerSubtitle = useMemo(() => {
    if (!doc) return subtitle ?? name
    const parts = [
      displayValue(doc.patient_name || doc.patient),
      hasValue(doc.date) ? formatDate(doc.date) : null,
    ].filter(Boolean)
    return parts.join(' · ') || subtitle || name
  }, [doc, subtitle, name])

  const vitals = [
    { key: 'bp', label: 'BP' },
    { key: 'hr', label: 'HR' },
    { key: 'resp_rate', label: 'Resp' },
    { key: 'spo2', label: 'SpO₂' },
  ].filter((f) => doc && hasValue(doc[f.key]))

  return (
    <DetailSlideOver
      title="ECT Admission"
      subtitle={headerSubtitle}
      icon={<FileHeart className="h-5 w-5 text-cyan-700" strokeWidth={2} />}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      headerActions={
        <PrintFormatDropdown
          doctype="ECT Admission"
          docName={name}
          noLetterhead={0}
          triggerPrint={1}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-200/80 bg-white/80 text-cyan-700 shadow-sm transition hover:bg-cyan-50"
        />
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-12 text-sm text-slate-500">
          Loading admission…
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {doc && !loading && !error ? (
        <div className="flex flex-col gap-5 pb-2">
          {vitals.length > 0 ? (
            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>
                <Activity className="h-4 w-4 text-cyan-600" strokeWidth={2} />
                Vitals on admission
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {vitals.map((f) => (
                  <VitalTile key={f.key} label={f.label} value={displayValue(doc[f.key])} />
                ))}
              </div>
            </section>
          ) : null}

          {(hasValue(doc.psychiatric_diagnosis) ||
            hasValue(doc.medical_history) ||
            hasValue(doc.patient_allergy_history) ||
            hasValue(doc.other_complications) ||
            hasValue(doc.instructions)) && (
            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>
                <ClipboardList className="h-4 w-4 text-cyan-600" strokeWidth={2} />
                Clinical history
              </h3>
              <div className="space-y-2.5">
                {hasValue(doc.psychiatric_diagnosis) ? (
                  <NoteBlock label="Psychiatric diagnosis" value={String(doc.psychiatric_diagnosis)} />
                ) : null}
                {hasValue(doc.medical_history) ? (
                  <NoteBlock label="Medical history" value={String(doc.medical_history)} />
                ) : null}
                {hasValue(doc.patient_allergy_history) ? (
                  <NoteBlock label="Allergy history" value={String(doc.patient_allergy_history)} />
                ) : null}
                {hasValue(doc.other_complications) ? (
                  <NoteBlock
                    label="Other complications / contradictions"
                    value={String(doc.other_complications)}
                  />
                ) : null}
                {hasValue(doc.instructions) ? (
                  <NoteBlock label="Instructions" value={String(doc.instructions)} />
                ) : null}
              </div>
            </section>
          )}

          <section className={MODAL_SECTION_CLASS}>
            <h3 className={MODAL_SECTION_TITLE_CLASS}>
              <Stethoscope className="h-4 w-4 text-cyan-600" strokeWidth={2} />
              Doctor
            </h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {hasValue(doc.doctors_name || doc.doctor) ? (
                <DataTile label="Doctor" value={displayValue(doc.doctors_name || doc.doctor)} />
              ) : null}
              <AttachBlock label="Doctor signature" path={doc.doctor_signature} />
            </div>
          </section>

          <MetaFooter>
            <DataTile label="Patient" value={displayValue(doc.patient_name || doc.patient)} />
            <DataTile label="Record ID" value={displayValue(doc.name)} />
            {hasValue(doc.date) ? <DataTile label="Date" value={formatDate(doc.date)} /> : null}
            {hasValue(doc.creation) ? (
              <DataTile label="Created" value={formatDateTime(doc.creation)} />
            ) : null}
          </MetaFooter>
        </div>
      ) : null}
    </DetailSlideOver>
  )
}
