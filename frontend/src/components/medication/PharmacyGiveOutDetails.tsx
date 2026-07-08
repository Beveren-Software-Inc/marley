import { useEffect, useState } from 'react'
import { fetchPrescription, type Prescription } from '../../services/prescriptions'
import { MODAL_SECTION_CLASS, MODAL_SECTION_TITLE_CLASS } from '../ui/CreateModalChrome'
import { StatusPill } from '../ui/StatusPill'
import { displayMedicationDrugName } from '../../utils/medicationOrderDisplayUtils'

function DetailField({ label, value }: { label: string; value?: string | null }) {
  const display = value?.trim() ? value : '—'
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-900 break-words">{display}</p>
    </div>
  )
}

function invoiceForPrescription(prescription: Prescription): string | undefined {
  return prescription.invoice || undefined
}

interface PharmacyGiveOutDetailsProps {
  giveOutName: string
}

export function PharmacyGiveOutDetails({ giveOutName }: PharmacyGiveOutDetailsProps) {
  const [prescription, setPrescription] = useState<Prescription | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchPrescription(giveOutName)
        if (!cancelled) setPrescription(data)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error('Failed to load pharmacy give-out details'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [giveOutName])

  if (loading) {
    return <div className="p-6 text-sm text-slate-600">Loading details…</div>
  }

  if (error) {
    return (
      <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error.message}
      </div>
    )
  }

  if (!prescription) {
    return <div className="p-6 text-sm text-slate-500">Record not found.</div>
  }

  const sourcePrescription = prescription.source_prescription
  const medications = prescription.medication_orders || []

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 px-1">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Nursing pharmacy give-out</p>
          <p className="text-base font-semibold text-slate-900 mt-0.5">{prescription.name}</p>
        </div>
        {prescription.status ? (
          <StatusPill status={prescription.status} color="success" />
        ) : null}
      </div>

      <section className={MODAL_SECTION_CLASS}>
        <h3 className={MODAL_SECTION_TITLE_CLASS}>Summary</h3>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DetailField label="Patient" value={prescription.patient_name || prescription.patient} />
          <DetailField label="Date" value={prescription.posting_date || prescription.start_date} />
          <DetailField label="Inpatient admission" value={prescription.inpatient_record} />
          <DetailField label="Source prescription" value={sourcePrescription} />
          <DetailField label="Invoice" value={invoiceForPrescription(prescription)} />
          <DetailField
            label="Doctor"
            value={prescription.healthcare_practitioner_name || prescription.practitioner}
          />
        </div>
      </section>

      <section className={MODAL_SECTION_CLASS}>
        <h3 className={MODAL_SECTION_TITLE_CLASS}>Medications given out</h3>
        {medications.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No medication lines.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Drug</th>
                  <th className="py-2 pr-3">Qty</th>
                  <th className="py-2 pr-3">Unit of measure</th>
                </tr>
              </thead>
              <tbody>
                {medications.map((med) => (
                  <tr key={med.name} className="border-b border-slate-100">
                    <td className="py-2.5 pr-3 text-slate-900">{displayMedicationDrugName(med)}</td>
                    <td className="py-2.5 pr-3 text-slate-700">{med.quantity ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-slate-700">{med.uom || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
