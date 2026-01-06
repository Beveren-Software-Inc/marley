import { useEffect, useState } from 'react'
import { fetchPatientSummary, type PatientSummary } from '../../services/patients'

interface PatientSummaryCardProps {
  patient?: string
}

export const PatientSummaryCard = ({ patient }: PatientSummaryCardProps) => {
  const [summary, setSummary] = useState<PatientSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!patient) {
      setSummary(null)
      return
    }

    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchPatientSummary(patient)
        setSummary(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load patient info')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [patient])

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold text-slate-900">Patient Information</div>
        {summary?.file_no && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
            File: {summary.file_no}
          </span>
        )}
      </div>
      {loading && (
        <div className="text-sm text-slate-500">Loading patient information...</div>
      )}
      {error && (
        <div className="text-sm text-red-600">Error: {error}</div>
      )}
      {!loading && !error && summary && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <div className="text-xs font-medium text-slate-500">Name</div>
            <div className="text-slate-900">{summary.patient_name || summary.name}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Sex</div>
            <div className="text-slate-900">{summary.sex || '-'}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Date of Birth</div>
            <div className="text-slate-900">
              {summary.dob ? new Date(summary.dob).toLocaleDateString() : '-'}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Marital Status</div>
            <div className="text-slate-900">{summary.marital_status || '-'}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Mobile</div>
            <div className="text-slate-900">{summary.mobile || '-'}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Category</div>
            <div className="text-slate-900">{summary.category || '-'}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Blacklist</div>
            <div className={summary.is_blacklist ? 'text-red-600 font-semibold' : 'text-slate-900'}>
              {summary.is_blacklist ? 'Yes' : 'No'}
            </div>
          </div>
        </div>
      )}
      {!loading && !error && !summary && (
        <div className="text-sm text-slate-500">
          Select a patient to view information.
        </div>
      )}
    </section>
  )
}

