import { useCallback, useEffect, useState } from 'react'
import { SignatureCaptureField } from '../generic/SignatureCaptureField'
import { fetchDoctypeRows } from '../../services/doctypeResource'

/**
 * REC-061 / REC-062 - e-signature capture with auto-upload on the admission forms.
 * Covers the guardian signature on the admission itself plus the two consent
 * documents (Patient Medical Consent, Informed Financial Consent).
 */

interface AdmissionSignaturesProps {
  patient?: string
  admission?: string
}

interface ConsentRow {
  name: string
  patient_name?: string
  status?: string
}

export const AdmissionSignatures = ({ patient, admission }: AdmissionSignaturesProps) => {
  const [medicalConsents, setMedicalConsents] = useState<ConsentRow[]>([])
  const [financialConsents, setFinancialConsents] = useState<ConsentRow[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!patient) return
    setLoading(true)
    try {
      const [m, f] = await Promise.all([
        fetchDoctypeRows('Patient Medical Consent', ['name', 'patient_name', 'status'],
          { patient }, 5),
        fetchDoctypeRows('Informed Financial Consent', ['name', 'patient_name', 'status'],
          { patient }, 5),
      ])
      setMedicalConsents(m as ConsentRow[])
      setFinancialConsents(f as ConsentRow[])
    } catch {
      setMedicalConsents([])
      setFinancialConsents([])
    } finally {
      setLoading(false)
    }
  }, [patient])

  useEffect(() => {
    load()
  }, [load])

  if (!patient) {
    return <p className="py-6 text-center text-sm text-slate-500">Select a patient first.</p>
  }

  return (
    <div className="space-y-5">
      {admission && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">
            Admission — Guardian &amp; Clinician Signatures
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <SignatureCaptureField
              doctype="Inpatient Admission"
              docname={admission}
              fieldname="signature"
              label="Legal Guardian Signature"
              hint="Signed at reception during admission processing."
            />
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Patient Medical Consent</h3>
        {loading && <p className="text-xs text-slate-500">Loading…</p>}
        {!loading && medicalConsents.length === 0 && (
          <p className="text-xs text-slate-500">
            No medical consent recorded for this patient yet — create one from the reception
            Patient Medical Consent screen, then sign it here.
          </p>
        )}
        {medicalConsents.map((c) => (
          <div key={c.name} className="mb-3">
            <div className="mb-1 text-[11px] text-slate-500">
              {c.name} · {c.status || 'Draft'}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <SignatureCaptureField doctype="Patient Medical Consent" docname={c.name}
                fieldname="patient_signature" label="Patient" />
              <SignatureCaptureField doctype="Patient Medical Consent" docname={c.name}
                fieldname="guardian_signature" label="Legal Guardian" />
              <SignatureCaptureField doctype="Patient Medical Consent" docname={c.name}
                fieldname="witness_signature" label="Witness" />
            </div>
          </div>
        ))}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Informed Financial Consent</h3>
        {!loading && financialConsents.length === 0 && (
          <p className="text-xs text-slate-500">
            No financial consent recorded for this patient yet — create one from the reception
            Informed Financial Consent screen, then sign it here.
          </p>
        )}
        {financialConsents.map((c) => (
          <div key={c.name} className="mb-3">
            <div className="mb-1 text-[11px] text-slate-500">
              {c.name} · {c.status || 'Draft'}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <SignatureCaptureField doctype="Informed Financial Consent" docname={c.name}
                fieldname="patient_signature" label="Patient" />
              <SignatureCaptureField doctype="Informed Financial Consent" docname={c.name}
                fieldname="guardian_signature" label="Legal Guardian" />
              <SignatureCaptureField doctype="Informed Financial Consent" docname={c.name}
                fieldname="witness_signature" label="Witness" />
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
