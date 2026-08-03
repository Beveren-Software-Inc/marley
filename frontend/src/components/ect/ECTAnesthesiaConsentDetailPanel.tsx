import { useEffect, useMemo, useState } from 'react'
import { FileSignature, Shield, Users } from 'lucide-react'
import { fetchDoc } from '../../services/common'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'
import {
  AttachBlock,
  DataTile,
  MetaFooter,
  NoteBlock,
  displayValue,
  formatDate,
  formatDateTime,
  formatTime,
  hasValue,
  type DocRecord,
} from './ectDetailUi'

interface ECTAnesthesiaConsentDetailPanelProps {
  name: string
  subtitle?: string
  onClose: () => void
}

export function ECTAnesthesiaConsentDetailPanel({
  name,
  subtitle,
  onClose,
}: ECTAnesthesiaConsentDetailPanelProps) {
  const [doc, setDoc] = useState<DocRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchDoc('ECT Anesthesia Consent', name)
      .then((data) => {
        if (!cancelled) setDoc(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load Anesthesia Consent')
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
    if (!doc) return subtitle ?? name
    const parts = [
      displayValue(doc.patient_name || doc.patient),
      hasValue(doc.anesthesiologit_name || doc.anesthesiologist)
        ? displayValue(doc.anesthesiologit_name || doc.anesthesiologist)
        : null,
    ].filter(Boolean)
    return parts.join(' · ') || subtitle || name
  }, [doc, subtitle, name])

  return (
    <DetailSlideOver
      title="Anesthesia Consent"
      subtitle={headerSubtitle}
      icon={<FileSignature className="h-5 w-5 text-indigo-700" strokeWidth={2} />}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      headerActions={
        <PrintFormatDropdown
          doctype="ECT Anesthesia Consent"
          docName={name}
          noLetterhead={0}
          triggerPrint={1}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-indigo-200/80 bg-white/80 text-indigo-700 shadow-sm transition hover:bg-indigo-50"
        />
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-12 text-sm text-slate-500">
          Loading consent…
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {doc && !loading && !error ? (
        <div className="flex flex-col gap-5 pb-2">
          <section className={MODAL_SECTION_CLASS}>
            <h3 className={MODAL_SECTION_TITLE_CLASS}>
              <Shield className="h-4 w-4 text-indigo-600" strokeWidth={2} />
              Anesthesiologist
            </h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {hasValue(doc.anesthesiologit_name || doc.anesthesiologist) ? (
                <DataTile
                  label="Anesthesiologist"
                  value={displayValue(doc.anesthesiologit_name || doc.anesthesiologist)}
                />
              ) : null}
              <AttachBlock label="Anesthesiologist signature" path={doc.signature} />
            </div>
          </section>

          <section className={MODAL_SECTION_CLASS}>
            <h3 className={MODAL_SECTION_TITLE_CLASS}>
              <Users className="h-4 w-4 text-indigo-600" strokeWidth={2} />
              Patient &amp; guardian
            </h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {hasValue(doc.cpr_no) ? <DataTile label="Patient CPR" value={displayValue(doc.cpr_no)} /> : null}
              <AttachBlock label="Patient signature" path={doc.signature_of_the_patient} />
              {hasValue(doc.patients_legal_guardian) ? (
                <DataTile label="Legal guardian" value={displayValue(doc.patients_legal_guardian)} />
              ) : null}
              {hasValue(doc.relation_to_patient) ? (
                <DataTile label="Relation" value={displayValue(doc.relation_to_patient)} />
              ) : null}
              {hasValue(doc.guardian_cpr_no) ? (
                <DataTile label="Guardian CPR" value={displayValue(doc.guardian_cpr_no)} />
              ) : null}
              <AttachBlock label="Guardian signature" path={doc.guardian_signature} />
            </div>
          </section>

          {(hasValue(doc.witness_name) || hasValue(doc.witness_signature)) && (
            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>Witness</h3>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {hasValue(doc.witness_name) ? (
                  <DataTile label="Witness" value={displayValue(doc.witness_name)} />
                ) : null}
                {hasValue(doc.witness_cpr_no) ? (
                  <DataTile label="Witness CPR" value={displayValue(doc.witness_cpr_no)} />
                ) : null}
                <AttachBlock label="Witness signature" path={doc.witness_signature} />
              </div>
            </section>
          )}

          {(hasValue(doc.conscious_sedation_consent_form) || hasValue(doc.conscious)) && (
            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>Consent terms</h3>
              <div className="space-y-2.5">
                {hasValue(doc.termsenglish) ? (
                  <DataTile label="Terms (English)" value={displayValue(doc.termsenglish)} />
                ) : null}
                {hasValue(doc.conscious_sedation_consent_form) ? (
                  <NoteBlock
                    label="Consent form (English)"
                    value={String(doc.conscious_sedation_consent_form)}
                  />
                ) : null}
                {hasValue(doc.termsarabic) ? (
                  <DataTile label="Terms (Arabic)" value={displayValue(doc.termsarabic)} />
                ) : null}
                {hasValue(doc.conscious) ? (
                  <NoteBlock label="Consent form (Arabic)" value={String(doc.conscious)} />
                ) : null}
              </div>
            </section>
          )}

          <MetaFooter>
            <DataTile label="Patient" value={displayValue(doc.patient_name || doc.patient)} />
            <DataTile label="Record ID" value={displayValue(doc.name)} />
            {hasValue(doc.inpatient_admission) ? (
              <DataTile label="Admission" value={displayValue(doc.inpatient_admission)} />
            ) : null}
            {hasValue(doc.patient_visit) ? (
              <DataTile label="Visit" value={displayValue(doc.patient_visit)} />
            ) : null}
            {hasValue(doc.date) ? <DataTile label="Date" value={formatDate(doc.date)} /> : null}
            {hasValue(doc.time) ? <DataTile label="Time" value={formatTime(doc.time)} /> : null}
            {hasValue(doc.guardian_sign_date) ? (
              <DataTile
                label="Guardian signed"
                value={`${formatDate(doc.guardian_sign_date)}${hasValue(doc.guardian_sign_time) ? ` ${formatTime(doc.guardian_sign_time)}` : ''}`}
              />
            ) : null}
            {hasValue(doc.witness_sign_date) ? (
              <DataTile
                label="Witness signed"
                value={`${formatDate(doc.witness_sign_date)}${hasValue(doc.witness_sign_time) ? ` ${formatTime(doc.witness_sign_time)}` : ''}`}
              />
            ) : null}
            {hasValue(doc.creation) ? (
              <DataTile label="Created" value={formatDateTime(doc.creation)} />
            ) : null}
          </MetaFooter>
        </div>
      ) : null}
    </DetailSlideOver>
  )
}
