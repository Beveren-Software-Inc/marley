import { useEffect, useState } from 'react'
import { fetchPrescription, type Prescription } from '../../services/prescriptions'
import {
  fetchPharmacyGiveOutServices,
  type PharmacyGiveOutServiceLine,
} from '../../services/pharmacyGiveOut'
import { useFormatMoney } from '../../hooks/useFormatMoney'
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
  const formatCurrency = useFormatMoney()
  const [prescription, setPrescription] = useState<Prescription | null>(null)
  const [services, setServices] = useState<PharmacyGiveOutServiceLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const [data, serviceData] = await Promise.all([
          fetchPrescription(giveOutName),
          fetchPharmacyGiveOutServices(giveOutName).catch(() => ({ services: [] as PharmacyGiveOutServiceLine[] })),
        ])
        if (!cancelled) {
          setPrescription(data)
          setServices(serviceData.services || [])
        }
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
  const medicationsTotal = medications.reduce((sum, med) => {
    if (med.amount != null) return sum + Number(med.amount)
    const qty = Number(med.quantity ?? med.qty) || 0
    const rate = Number(med.rate) || 0
    return sum + qty * rate
  }, 0)
  const servicesTotal = services.reduce((sum, svc) => {
    const qty = Number(svc.qty) || 0
    const amount = svc.amount != null ? Number(svc.amount) : qty * (Number(svc.rate) || 0)
    return sum + amount
  }, 0)
  const grandTotal = medicationsTotal + servicesTotal

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
            label="Doctor Name"
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
                  <th className="py-2 pr-3 text-right">Rate</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {medications.map((med) => {
                  const qty = Number(med.quantity ?? med.qty) || 0
                  const rate = Number(med.rate) || 0
                  const amount = med.amount != null ? Number(med.amount) : qty * rate
                  return (
                    <tr key={med.name} className="border-b border-slate-100">
                      <td className="py-2.5 pr-3 text-slate-900">{displayMedicationDrugName(med)}</td>
                      <td className="py-2.5 pr-3 text-slate-700">{med.quantity ?? '—'}</td>
                      <td className="py-2.5 pr-3 text-slate-700">{med.uom || '—'}</td>
                      <td className="py-2.5 pr-3 text-slate-700 text-right">
                        {rate ? formatCurrency(rate) : '—'}
                      </td>
                      <td className="py-2.5 text-slate-900 text-right font-medium">
                        {amount ? formatCurrency(amount) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {medications.length > 0 ? (
                <tfoot>
                  <tr>
                    <td
                      colSpan={4}
                      className="py-2.5 pr-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      Medications total
                    </td>
                    <td className="py-2.5 text-right text-sm font-semibold text-slate-900">
                      {formatCurrency(medicationsTotal)}
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        )}
      </section>

      {services.length > 0 ? (
        <section className={MODAL_SECTION_CLASS}>
          <h3 className={MODAL_SECTION_TITLE_CLASS}>Services billed</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Service</th>
                  <th className="py-2 pr-3">Qty</th>
                  <th className="py-2 pr-3">Unit of measure</th>
                  <th className="py-2 pr-3 text-right">Price</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {services.map((svc) => {
                  const qty = Number(svc.qty) || 0
                  const rate = Number(svc.rate) || 0
                  const amount = svc.amount != null ? Number(svc.amount) : qty * rate
                  const key = `${svc.item_code || svc.item_name}-${qty}-${rate}`
                  return (
                    <tr key={key} className="border-b border-slate-100">
                      <td className="py-2.5 pr-3 text-slate-900">
                        {svc.item_name || svc.item_code || '—'}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-700">{svc.qty ?? '—'}</td>
                      <td className="py-2.5 pr-3 text-slate-700">{svc.uom || '—'}</td>
                      <td className="py-2.5 pr-3 text-slate-700 text-right">
                        {rate ? formatCurrency(rate) : '—'}
                      </td>
                      <td className="py-2.5 text-slate-900 text-right font-medium">
                        {amount ? formatCurrency(amount) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td
                    colSpan={4}
                    className="py-2.5 pr-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Services total
                  </td>
                  <td className="py-2.5 text-right text-sm font-semibold text-slate-900">
                    {formatCurrency(servicesTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      ) : null}

      {(medications.length > 0 || services.length > 0) && services.length > 0 ? (
        <div className="flex justify-end px-1">
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Grand total</p>
            <p className="text-base font-semibold text-slate-900">{formatCurrency(grandTotal)}</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
