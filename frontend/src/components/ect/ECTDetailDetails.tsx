import { useState, useEffect } from 'react'
import { fetchECTDetail, type ECTDetail } from '../../services/ectDetails'

interface ECTDetailDetailsProps {
  ectName: string
  onUpdate?: () => void
}

const Field = ({ label, value }: { label: string; value?: string | number | null }) => {
  if (value === undefined || value === null || value === '') return null
  return (
    <div className="py-0.5">
      <span className="font-medium text-slate-700">{label}:</span>{' '}
      <span className="text-slate-600">{value}</span>
    </div>
  )
}

const SectionTitle = ({ title }: { title: string }) => (
  <h3 className="text-sm font-semibold text-slate-700 mb-2 pb-1 border-b border-slate-100">{title}</h3>
)

export const ECTDetailDetails = ({ ectName }: ECTDetailDetailsProps) => {
  const [ect, setEct] = useState<ECTDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const load = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchECTDetail(ectName)
      setEct(data)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch ECT detail'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [ectName])

  const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString('en-GB') : undefined)
  const fmtTime = (t?: string) => (t ? String(t).slice(0, 8) : undefined)
  const fmtDt = (d?: string) => (d ? new Date(d).toLocaleString('en-GB') : undefined)

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading ECT detail...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-semibold mb-2">Error Loading ECT Detail</h3>
        <p className="text-red-700 text-sm mb-3">{error.message}</p>
        <button onClick={load} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700">
          Retry
        </button>
      </div>
    )
  }

  if (!ect) {
    return <div className="text-slate-500 text-center p-8">ECT detail not found</div>
  }

  return (
    <div className="space-y-5 text-sm">
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wide">ECT Details</p>
        <h2 className="text-lg font-bold text-slate-900">{ect.name}</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <SectionTitle title="Procedure" />
          <div className="space-y-0.5">
            <Field label="Patient" value={ect.patient_name || ect.patient} />
            <Field label="Branch" value={ect.cost_center} />
            <Field label="Date" value={fmt(ect.date)} />
            <Field label="Time" value={fmtTime(ect.time)} />
            <Field label="Source" value={ect.source} />
            <Field label="Duration" value={ect.duration} />
            <Field label="Energy" value={ect.energy} />
            <Field label="% Age" value={ect._age} />
            <Field label="Success" value={ect.success} />
            <Field label="Repeated" value={ect.repeated} />
            <Field label="Vitals" value={ect.vitals} />
            <Field label="ECG" value={ect.ecg} />
            <Field label="Propofol Detail" value={ect.propofol_detail} />
            <Field label="Succinylcholine Detail" value={ect.succinycholine_detail} />
            <Field label="Reference Doctype" value={ect.reference_doctype} />
            <Field label="Reference Name" value={ect.reference_name} />
          </div>
        </div>

        <div>
          <SectionTitle title="Doctor & Nurse" />
          <div className="space-y-0.5">
            <Field label="Anathesiologist" value={ect.anathesiologist} />
            <Field label="Assist Doctor" value={ect.assist_doctor} />
            <Field label="Psychiatrist" value={ect.psychiatrist} />
            <Field label="Nurse" value={ect.nurse} />
            <Field label="Doctor's Name" value={ect.doctors_name} />
            <Field label="Date and Time (Doctor)" value={fmtDt(ect.date_and_time)} />
            <Field label="Nurse Name" value={ect.nurse_name} />
            <Field label="Date and Time (Nurse)" value={fmtDt(ect.n_date_and_time)} />
          </div>
          {ect.ect_doctors_notes && (
            <div className="mt-2">
              <span className="font-medium text-slate-700">ECT Doctor's Notes:</span>
              <p className="text-slate-600 mt-0.5 whitespace-pre-wrap">{ect.ect_doctors_notes}</p>
            </div>
          )}
          {ect.ect_nurse_notes && (
            <div className="mt-2">
              <span className="font-medium text-slate-700">ECT Nurse Notes:</span>
              <p className="text-slate-600 mt-0.5 whitespace-pre-wrap">{ect.ect_nurse_notes}</p>
            </div>
          )}
        </div>

        <div className="md:col-span-2">
          <SectionTitle title="Other Information" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="BP 1" value={ect.bp_1} />
            <Field label="BP 2" value={ect.bp_2} />
            <Field label="Max BP 1" value={ect.max_bp_1} />
            <Field label="Max BP 2" value={ect.max_bp2} />
            <Field label="Propofol Detail" value={ect.propofol_detail} />
            <Field label="Succinylcholine Detail" value={ect.succinycholine_detail} />
            <Field label="Psychology Doctor" value={ect.psychology_doctor} />
            <Field label="Anaesthetic Doctor" value={ect.anaesthetic_doctor} />
          </div>
        </div>
      </div>
    </div>
  )
}
