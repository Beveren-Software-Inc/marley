import { useEffect, useState } from 'react'
import { getPatientActiveAdmission } from '../../services/inpatientRecords'
import { fetchInpatientAdmissionOptions } from '../../services/common'
import {
  fetchDailyMedicationChart,
  type MedicationChartResponse,
  type MedicationChartSession,
  type MedicationChartRow,
} from '../../services/medicineGiven'
import { CreateMedicineGivenModal } from './CreateMedicineGivenModal'
import { toast } from '../../hooks/useToast'
import {
  displayMedicationDosage,
  displayMedicationDrugName,
  displayMedicationFrequency,
} from '../../utils/medicationOrderDisplayUtils'

interface DailyMedicationChartProps {
  patient?: string
  /** When provided (from the top navbar context), the admission dropdown is hidden. */
  admission?: string
}

type PendingCell = {
  prescription: string
  orderEntry: string
  drug: string
  sessionId: string
}

/** Default administration time when opening Record Given from a chart session. */
const SESSION_DEFAULT_TIME: Record<string, string> = {
  morning: '08:00',
  noon: '12:00',
  evening: '17:00',
  night: '20:00',
}

export const DailyMedicationChart = ({ patient, admission: admissionProp }: DailyMedicationChartProps) => {
  // If admission is provided from context (navbar selection), we don't show the dropdown at all.
  const admissionFromContext = !!admissionProp

  const [admissionOptions, setAdmissionOptions] = useState<{ name: string; label: string }[]>([])
  const [selectedAdmissionName, setSelectedAdmissionName] = useState<string>(admissionProp ?? '')
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [data, setData] = useState<MedicationChartResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingCell, setPendingCell] = useState<PendingCell | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // When an admission is pre-selected from context, sync it; otherwise try to auto-detect
  useEffect(() => {
    if (admissionProp) {
      setSelectedAdmissionName(admissionProp)
      return
    }
    // No admission from context — load the dropdown options and auto-detect active
    if (!patient) {
      setAdmissionOptions([])
      setSelectedAdmissionName('')
      return
    }
    fetchInpatientAdmissionOptions(undefined, patient)
      .then((opts) => {
        setAdmissionOptions(opts)
        getPatientActiveAdmission(patient)
          .then((adm) => { if (adm) setSelectedAdmissionName(adm.name) })
          .catch(() => {})
      })
      .catch(() => setAdmissionOptions([]))
  }, [patient, admissionProp])

  // Load chart when selected admission or date changes
  useEffect(() => {
    const load = async () => {
      if (!patient) {
        setData(null)
        setError(null)
        return
      }
      if (!selectedAdmissionName) {
        setData(null)
        setError(null)
        return
      }
      try {
        setLoading(true)
        setError(null)
        const chart = await fetchDailyMedicationChart(selectedAdmissionName, date)
        setData(chart)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load medication chart'
        setError(msg)
        setData(null)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [patient, selectedAdmissionName, date, refreshKey])

  const handleOpenGive = (row: MedicationChartRow, session: MedicationChartSession) => {
    if (!selectedAdmissionName || !patient) return
    setPendingCell({
      prescription: row.prescription,
      orderEntry: row.order_entry,
      drug: row.drug,
      sessionId: session.id,
    })
  }

  if (!patient) {
    return <div className="text-sm text-slate-600">Select a patient to view the medication chart.</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Daily Medication Chart</h2>
          <p className="text-xs text-slate-500">
            Daily-frequency medicines only, grouped by morning / noon / evening / night. Long-interval
            doses (e.g. Q3W) are recorded manually and do not appear here.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Admission selector — only shown when no admission is already selected from the navbar */}
          {!admissionFromContext && (
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium text-slate-600 whitespace-nowrap">Admission</label>
              <select
                value={selectedAdmissionName}
                onChange={(e) => setSelectedAdmissionName(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary bg-white min-w-[160px]"
              >
                <option value="">— Select admission —</option>
                {admissionOptions.map((a) => (
                  <option key={a.name} value={a.name}>{a.label}</option>
                ))}
              </select>
            </div>
          )}
          {/* Date selector */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-medium text-slate-600">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            />
          </div>
        </div>
      </div>

      {!selectedAdmissionName && !admissionFromContext && (
        <div className="text-sm text-slate-500 border border-dashed border-slate-300 rounded-md px-3 py-4 text-center">
          Please select an inpatient admission above.
        </div>
      )}
      {!selectedAdmissionName && admissionFromContext && (
        <div className="text-sm text-slate-500 border border-dashed border-slate-300 rounded-md px-3 py-4 text-center">
          No inpatient admission selected. Please select a patient with an active IP admission from the search bar.
        </div>
      )}

      {loading && selectedAdmissionName && (
        <div className="text-sm text-slate-600">Loading daily medication chart...</div>
      )}

      {!loading && error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {!loading && !error && selectedAdmissionName && (!data || data.rows.length === 0) && (
        <div className="text-sm text-slate-600 border border-dashed border-slate-300 rounded-md px-3 py-4 text-center">
          No daily-frequency medicines found for this admission on the selected date.
        </div>
      )}

      {!loading && data && data.rows.length > 0 && (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Medication</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Dose</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Form</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Frequency</th>
                {data.sessions
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((s) => (
                    <th key={s.id} className="px-3 py-2 text-center font-semibold text-slate-600">
                      {s.label}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.map((row) => (
                <tr key={row.order_entry} className="hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-900">
                    {displayMedicationDrugName(row)}
                    <div className="text-[11px] text-slate-500">{row.prescription}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-800">{displayMedicationDosage(row)}</td>
                  <td className="px-3 py-2 text-slate-800">{row.dosage_form || '-'}</td>
                  <td className="px-3 py-2 text-slate-800">{displayMedicationFrequency(row)}</td>
                  {data.sessions
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((session) => {
                      const slot = row.slots.find((x) => x.session_id === session.id)
                      if (!slot || !slot.due) {
                        return (
                          <td
                            key={session.id}
                            className="px-3 py-2 text-center text-[11px] text-slate-400"
                          >
                            -
                          </td>
                        )
                      }
                      if (slot.given) {
                        return (
                          <td key={session.id} className="px-3 py-2 text-center">
                            <div className="inline-flex flex-col items-center justify-center rounded-md bg-emerald-50 border border-emerald-200 px-2 py-1">
                              <span className="text-[11px] font-medium text-emerald-700">
                                Given {slot.given_time?.slice(0, 5)}
                              </span>
                              {slot.given_by && (
                                <span className="text-[10px] text-emerald-600 mt-0.5">
                                  {slot.given_by}
                                </span>
                              )}
                            </div>
                          </td>
                        )
                      }
                      return (
                        <td key={session.id} className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleOpenGive(row, session)}
                            className="inline-flex items-center justify-center rounded-md border border-primary/40 text-[11px] px-2 py-1 text-primary hover:bg-primary/5"
                          >
                            Mark Given
                          </button>
                        </td>
                      )
                    })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pendingCell && selectedAdmissionName && patient && (
        <CreateMedicineGivenModal
          initialPatient={patient}
          inpatientRecord={selectedAdmissionName}
          initialPrescription={pendingCell.prescription}
          initialOrderEntry={pendingCell.orderEntry}
          initialDate={date}
          initialTime={SESSION_DEFAULT_TIME[pendingCell.sessionId]}
          onClose={() => setPendingCell(null)}
          onSuccess={() => {
            setPendingCell(null)
            setRefreshKey((prev) => prev + 1)
            toast.success('Medicine administration recorded')
          }}
        />
      )}
    </div>
  )
}
