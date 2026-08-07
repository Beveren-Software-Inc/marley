import { useEffect, useMemo, useState, Fragment } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { getPatientActiveAdmission } from '../../services/inpatientRecords'
import { fetchInpatientAdmissionOptions } from '../../services/common'
import {
  fetchMedicationSheetDetail,
  type MedicationSheetDetail,
  type MedicationSheetMedicineRow,
} from '../../services/medicineGiven'
import { getMedicationTypeColor, isHexColor, medicationRowStyle } from '../../utils/medicationTypeColors'
import {
  displayMedicationDosage,
  displayMedicationDrugName,
  displayMedicationFrequency,
} from '../../utils/medicationOrderDisplayUtils'

interface MedicationSheetProps {
  patient?: string
  /** When set (navbar IP context), admission selector is hidden. */
  admission?: string
}

const formatTime = (time?: string | null) => {
  if (!time) return '—'
  return time.length >= 5 ? time.slice(0, 5) : time
}

/** Dosage and UOM on one line with a single space, e.g. "3 UNIT". */
function formatDosageWithUom(med: MedicationSheetMedicineRow): string {
  const dosage = displayMedicationDosage(med)
  const uom = (med.uom || '').trim()
  const hasDosage = Boolean(dosage && dosage !== '-')
  if (hasDosage && uom) return `${dosage} ${uom}`
  if (hasDosage) return dosage
  if (uom) return uom
  return '—'
}

export const MedicationSheet = ({ patient, admission: admissionProp }: MedicationSheetProps) => {
  const admissionFromContext = !!admissionProp

  const [admissionOptions, setAdmissionOptions] = useState<{ name: string; label: string }[]>([])
  const [selectedAdmission, setSelectedAdmission] = useState(admissionProp ?? '')
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 14)
    return d.toISOString().slice(0, 10)
  })
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [sheet, setSheet] = useState<MedicationSheetDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  useEffect(() => {
    if (admissionProp) {
      setSelectedAdmission(admissionProp)
      return
    }
    if (!patient) {
      setAdmissionOptions([])
      setSelectedAdmission('')
      return
    }
    fetchInpatientAdmissionOptions(undefined, patient)
      .then((opts) => {
        setAdmissionOptions(opts)
        getPatientActiveAdmission(patient)
          .then((adm) => {
            if (adm) setSelectedAdmission(adm.name)
          })
          .catch(() => {})
      })
      .catch(() => setAdmissionOptions([]))
  }, [patient, admissionProp])

  useEffect(() => {
    const load = async () => {
      if (!patient || !selectedAdmission) {
        setSheet(null)
        setError(null)
        return
      }
      try {
        setLoading(true)
        setError(null)
        const data = await fetchMedicationSheetDetail(selectedAdmission, fromDate, toDate)
        setSheet(data)
        setExpandedKey(null)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load medication sheet'
        setError(msg)
        setSheet(null)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [patient, selectedAdmission, fromDate, toDate])

  const medicines = sheet?.medicines ?? []

  const typeLegend = useMemo(() => {
    const types = new Set(medicines.map((m) => m.medication_type).filter(Boolean))
    return Array.from(types) as string[]
  }, [medicines])

  const toggleRow = (row: MedicationSheetMedicineRow) => {
    const key = `${row.prescription}::${row.drug}`
    setExpandedKey((prev) => (prev === key ? null : key))
  }

  if (!patient) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/80 px-6 py-10 text-center">
        <p className="text-sm font-medium text-slate-700">Medication Sheet</p>
        <p className="mt-1 text-xs text-slate-500">Select a patient to view prescriptions and administrations.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Medication Sheet</h2>
          <p className="text-xs text-slate-500">
            Shows medicines from the latest submitted prescription for this admission only. Expand a row to see
            administrations (given, by whom, remarks). Missed doses appear as blank rows.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {!admissionFromContext && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Inpatient admission
              </label>
              <select
                value={selectedAdmission}
                onChange={(e) => setSelectedAdmission(e.target.value)}
                className="min-w-[200px] rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select admission…</option>
                {admissionOptions.map((opt) => (
                  <option key={opt.name} value={opt.name}>
                    {opt.label || opt.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <label className="text-xs font-medium text-slate-600">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      {sheet && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-amber-200/80 bg-amber-50/50 px-4 py-3 text-xs md:grid-cols-4">
          <div>
            <span className="font-semibold text-slate-600">Admission</span>
            <p className="font-mono text-slate-900">{sheet.admission}</p>
          </div>
          <div>
            <span className="font-semibold text-slate-600">Patient</span>
            <p className="text-slate-900">{sheet.patient_name || '-'}</p>
          </div>
          <div>
            <span className="font-semibold text-slate-600">
              {(sheet.prescriptions?.length || 0) > 1
                ? `Current prescriptions (${sheet.prescriptions!.length})`
                : 'Current prescription'}
            </span>
            <p className="font-mono text-slate-900">
              {(sheet.prescriptions && sheet.prescriptions.length > 0
                ? sheet.prescriptions
                : sheet.prescription
                  ? [sheet.prescription]
                  : []
              ).join(' · ') || '—'}
            </p>
          </div>
          <div>
            <span className="font-semibold text-slate-600">Medicines</span>
            <p className="text-slate-900">{medicines.length}</p>
          </div>
        </div>
      )}

      {typeLegend.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {typeLegend.map((type) => {
            const color = getMedicationTypeColor(type)
            return (
              <span
                key={type}
                className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium text-slate-700"
                style={
                  isHexColor(color)
                    ? { backgroundColor: `${color}22`, borderColor: `${color}66` }
                    : undefined
                }
              >
                {type}
              </span>
            )
          })}
        </div>
      )}

      {!selectedAdmission && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          Choose an inpatient admission to load the medication sheet.
        </div>
      )}

      {loading && <div className="text-sm text-slate-600">Loading medication sheet…</div>}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      {!loading && !error && selectedAdmission && medicines.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-600">
          No submitted prescription found for this admission. Create a Patient Medication Order first.
        </div>
      )}

      {medicines.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
          <table className="min-w-full table-fixed text-left">
            <colgroup>
              <col className="w-[38%]" />
              <col className="w-[10%]" />
              <col className="w-[18%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-3 py-2">Medicine</th>
                <th className="px-3 py-2">Dosage</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Start</th>
                <th className="px-3 py-2">End</th>
                <th className="px-3 py-2">Given</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {medicines.map((med) => {
                const rowKey = `${med.prescription}::${med.drug}`
                const isExpanded = expandedKey === rowKey
                const givenCount = med.administrations.filter((a) => a.given).length
                const missedCount = med.administrations.filter((a) => !a.given).length
                const rowStyle = medicationRowStyle(med.medication_type, !!med.is_pink)
                const dosageLabel = formatDosageWithUom(med)
                const secondaryBits = [
                  med.dosage_form,
                  displayMedicationFrequency(med) !== '-' ? displayMedicationFrequency(med) : '',
                  med.route_of_administration,
                ].filter(Boolean)
                const borderLeftColor = med.is_pink
                  ? '#ec4899'
                  : isHexColor(getMedicationTypeColor(med.medication_type))
                    ? getMedicationTypeColor(med.medication_type)
                    : '#94a3b8'

                return (
                  <Fragment key={rowKey}>
                    <tr
                      className="cursor-pointer border-l-4 transition hover:brightness-[0.98]"
                      style={{
                        ...rowStyle,
                        borderLeftColor,
                      }}
                      onClick={() => toggleRow(med)}
                    >
                      <td className="px-3 py-3 align-top">
                        <span className="flex min-w-0 items-start gap-2">
                          {isExpanded ? (
                            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                          ) : (
                            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                          )}
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-slate-900">
                              {displayMedicationDrugName(med)}
                            </span>
                            {(sheet?.prescriptions?.length || 0) > 1 && med.prescription ? (
                              <span className="mt-0.5 block font-mono text-[11px] text-slate-500">
                                {med.prescription}
                              </span>
                            ) : null}
                            {secondaryBits.length > 0 ? (
                              <span className="mt-0.5 block text-[11px] text-slate-500">
                                {secondaryBits.join(' · ')}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-3 align-top text-sm font-medium text-slate-800 whitespace-nowrap">
                        {dosageLabel}
                      </td>
                      <td className="px-3 py-3 align-top text-xs text-slate-700">
                        {med.medication_type || '—'}
                        {med.is_pink ? (
                          <span className="ml-1 rounded bg-pink-100 px-1 text-[10px] text-pink-700">Pink</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-top text-xs text-slate-600">{med.start_date || '—'}</td>
                      <td className="px-3 py-3 align-top text-xs text-slate-600">{med.end_date || '—'}</td>
                      <td className="px-3 py-3 align-top text-xs font-medium text-slate-800">
                        {givenCount}
                        {missedCount > 0 ? (
                          <span className="text-amber-700"> / {missedCount} missed</span>
                        ) : null}
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="bg-slate-50/90">
                        <td colSpan={6} className="border-t border-slate-200 px-3 py-3">
                          {med.administrations.length === 0 ? (
                            <p className="text-xs italic text-slate-500">
                              No administrations recorded in this date range.
                            </p>
                          ) : (
                            <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                              <table className="min-w-full text-xs">
                                <thead className="border-b border-slate-200 bg-slate-100">
                                  <tr>
                                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Given</th>
                                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Time</th>
                                    <th className="px-3 py-2 text-left font-semibold text-slate-600">
                                      Medication given by
                                    </th>
                                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Qty</th>
                                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Remarks</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {med.administrations.map((adm) => (
                                    <tr
                                      key={adm.name}
                                      className={adm.given ? 'bg-white' : 'bg-amber-50/60 text-slate-400'}
                                    >
                                      <td className="px-3 py-2">
                                        {adm.given ? (
                                          <span className="font-bold text-emerald-700">✓</span>
                                        ) : (
                                          <span className="text-slate-300">—</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2">{adm.date || '—'}</td>
                                      <td className="px-3 py-2">
                                        {adm.given ? formatTime(adm.time) : adm.timing_label || '—'}
                                      </td>
                                      <td className="px-3 py-2">
                                        {adm.given ? adm.given_by_name || adm.given_by || '—' : '—'}
                                      </td>
                                      <td className="px-3 py-2">
                                        {adm.given && adm.qty != null
                                          ? `${adm.qty}${adm.unit ? ` ${adm.unit}` : ''}`
                                          : '—'}
                                      </td>
                                      <td className="max-w-xs px-3 py-2 text-slate-600">
                                        {adm.remarks || (adm.given ? '' : 'Missed dose')}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
