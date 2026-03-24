import { useEffect, useState } from 'react'
import {
  fetchLongActingMedicationReminders,
  type LongActingMedicationReminder,
} from '../../services/medicineGiven'
import { CreateMedicineGivenModal } from './CreateMedicineGivenModal'

interface LongActingMedReminderListProps {
  /** If set, only show reminders for this patient */
  patient?: string
  /** Number of days ahead to show "due soon" (default 7) */
  daysAhead?: number
}

const statusConfig: Record<
  LongActingMedicationReminder['status'],
  { label: string; className: string }
> = {
  overdue: { label: 'Overdue', className: 'bg-red-100 text-red-800 border-red-200' },
  due_today: { label: 'Due today', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  due_soon: { label: 'Due soon', className: 'bg-blue-100 text-blue-800 border-blue-200' },
}

export const LongActingMedReminderList = ({ patient, daysAhead = 7 }: LongActingMedReminderListProps) => {
  const [reminders, setReminders] = useState<LongActingMedicationReminder[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recordingFor, setRecordingFor] = useState<LongActingMedicationReminder | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchLongActingMedicationReminders({
          patient: patient || undefined,
          days_ahead: daysAhead,
        })
        console.log("Here ius am ", data)
        setReminders(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load reminders')
        setReminders([])
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [patient, daysAhead, refreshKey])

  if (loading) {
    return (
      <div className="text-sm text-slate-600 py-4">
        Loading long-acting medication reminders…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
        {error}
      </div>
    )
  }

  if (reminders.length === 0) {
    return (
      <div className="text-sm text-slate-600 py-4 text-center border border-dashed border-slate-200 rounded-lg">
        No long-acting medication doses due in the next {daysAhead} days.
        {patient && ' Try clearing the patient filter to see all reminders.'}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Medications with extended intervals (Q1W, Q2W, Q3W, Q4W). Record administration when the dose is given.
      </p>
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Patient</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Medication</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Dose</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Frequency</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Last given</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Next due</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-600">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reminders.map((r) => {
              const config = statusConfig[r.status]
              return (
                <tr key={`${r.prescription}-${r.order_entry}`} className="hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-900">
                    {r.patient_name || r.patient}
                  </td>
                  <td className="px-3 py-2 text-slate-900">{r.drug_name}</td>
                  <td className="px-3 py-2 text-slate-700">{r.dosage || '–'}</td>
                  <td className="px-3 py-2 text-slate-700">{r.frequency}</td>
                  <td className="px-3 py-2 text-slate-700">{r.last_given_date}</td>
                  <td className="px-3 py-2 text-slate-800 font-medium">{r.next_due_date}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${config.className}`}
                    >
                      {config.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setRecordingFor(r)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Record administration
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {recordingFor && (
        <CreateMedicineGivenModal
          initialPatient={recordingFor.patient}
          onClose={() => setRecordingFor(null)}
          onSuccess={() => {
            setRecordingFor(null)
            setRefreshKey((k) => k + 1)
          }}
        />
      )}
    </div>
  )
}
