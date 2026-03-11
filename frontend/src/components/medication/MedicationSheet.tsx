import { useEffect, useState } from 'react'
import { getPatientActiveAdmission, type InpatientRecord } from '../../services/inpatientRecords'
import { fetchMedicationSheet, type MedicationSheetRow } from '../../services/medicineGiven'

interface MedicationSheetProps {
  patient?: string
}

export const MedicationSheet = ({ patient }: MedicationSheetProps) => {
  const [admission, setAdmission] = useState<InpatientRecord | null>(null)
  const [fromDate, setFromDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [toDate, setToDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [rows, setRows] = useState<MedicationSheetRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!patient) {
        setAdmission(null)
        setRows([])
        setError(null)
        return
      }
      try {
        setLoading(true)
        setError(null)
        const adm = await getPatientActiveAdmission(patient)
        if (!adm) {
          setAdmission(null)
          setRows([])
          setError('No active inpatient admission found for this patient')
          return
        }
        setAdmission(adm)
        const data = await fetchMedicationSheet(adm.name, fromDate, toDate)
        setRows(data)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load medication sheet'
        setError(msg)
        setRows([])
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [patient, fromDate, toDate])

  if (!patient) {
    return <div className="text-sm text-slate-600">Select a patient to view the medication sheet.</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Medication Sheet</h2>
          <p className="text-xs text-slate-500">
            List of recorded medicine administrations for the selected date range.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary bg-white"
          />
          <label className="text-xs font-medium text-slate-600">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary bg-white"
          />
        </div>
      </div>

      {loading && (
        <div className="text-sm text-slate-600">Loading medication sheet...</div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {!error && !loading && rows.length === 0 && (
        <div className="text-sm text-slate-600 border border-dashed border-slate-300 rounded-md px-3 py-4 text-center">
          No recorded medicine administrations in the selected range.
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Time</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Medicine</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Qty</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Unit</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Frequency</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Notes</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Given By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.name} className="hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-800">{row.date}</td>
                  <td className="px-3 py-2 text-slate-800">{row.time?.slice(0, 5)}</td>
                  <td className="px-3 py-2 text-slate-900">
                    {row.medicine_name || row.medicine_code}
                  </td>
                  <td className="px-3 py-2 text-slate-800">{row.qty}</td>
                  <td className="px-3 py-2 text-slate-800">{row.unit}</td>
                  <td className="px-3 py-2 text-slate-800">{row.frequency}</td>
                  <td className="px-3 py-2 text-slate-700">{row.dose_notes}</td>
                  <td className="px-3 py-2 text-slate-800">{row.user}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

