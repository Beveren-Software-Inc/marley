import { useState, useEffect } from 'react'
import { fetchInpatientRecord, type InpatientRecord, type InpatientPackage } from '../../services/inpatientRecords'
import { StatusPill } from '../ui/StatusPill'
import { PackageSelectionModal } from './PackageSelectionModal'
import { AdmissionFormModal } from './AdmissionFormModal'
import { ScheduleDischargeModal } from './ScheduleDischargeModal'
import { DischargeModal } from './DischargeModal'

const statusColors: Record<string, string> = {
  'Admission Scheduled': 'warning',
  'Admitted': 'success',
  'Discharge Scheduled': 'info',
  'Discharged': 'default',
  'Cancelled': 'danger',
}

interface InpatientAdmissionDetailsProps {
  admissionName: string
  onUpdate?: () => void
}

const SectionTitle = ({ title }: { title: string }) => (
  <h3 className="text-sm font-semibold text-slate-700 mb-2 pb-1 border-b border-slate-100">{title}</h3>
)

const Field = ({ label, value }: { label: string; value?: string | number | null }) => {
  if (value === undefined || value === null || value === '' || value === 0) return null
  return (
    <div>
      <span className="font-medium text-slate-700">{label}:</span>{' '}
      <span className="text-slate-600">{value}</span>
    </div>
  )
}

const BoolField = ({ label, value }: { label: string; value?: boolean | number | null }) => {
  if (!value) return null
  return (
    <div>
      <span className="font-medium text-slate-700">{label}:</span>{' '}
      <span className="text-green-600 font-medium">Yes</span>
    </div>
  )
}

export const InpatientAdmissionDetails = ({ admissionName, onUpdate }: InpatientAdmissionDetailsProps) => {
  const [record, setRecord] = useState<InpatientRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Action modal state
  const [showPackages, setShowPackages] = useState(false)
  const [showAdmissionForm, setShowAdmissionForm] = useState(false)
  const [selectedPackage, setSelectedPackage] = useState<InpatientPackage | null>(null)
  const [showScheduleDischarge, setShowScheduleDischarge] = useState(false)
  const [showDischargeModal, setShowDischargeModal] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchInpatientRecord(admissionName)
      setRecord(data)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch admission details'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [admissionName])

  const fmt = (d?: string) => d ? new Date(d).toLocaleDateString() : undefined
  const fmtDt = (d?: string) => d ? new Date(d).toLocaleString() : undefined

  const handleAdmissionComplete = () => {
    setShowAdmissionForm(false)
    setSelectedPackage(null)
    load()
    onUpdate?.()
  }

  const handleDischargeScheduled = () => {
    setShowScheduleDischarge(false)
    load()
    onUpdate?.()
  }

  const handleDischargeComplete = () => {
    setShowDischargeModal(false)
    load()
    onUpdate?.()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading admission details...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-semibold mb-2">Error Loading Admission</h3>
        <p className="text-red-700 text-sm mb-3">{error.message}</p>
        <button onClick={load} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700">
          Retry
        </button>
      </div>
    )
  }

  if (!record) {
    return <div className="text-slate-500 text-center p-8">Admission not found</div>
  }

  return (
    <>
      <div className="space-y-5 text-sm">

        {/* ── Header ── */}
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Inpatient Admission</p>
            <h2 className="text-lg font-bold text-slate-900">{record.name}</h2>
          </div>
          {record.status && (
            <StatusPill status={record.status} color={statusColors[record.status] || 'default'} />
          )}
        </div>

        {/* ── Actions ── */}
        {(record.status === 'Admission Scheduled' || record.status === 'Admitted' || record.status === 'Discharge Scheduled') && (
          <div className="flex flex-wrap gap-2 pb-1">
            {record.status === 'Admission Scheduled' && (
              <button
                onClick={() => setShowPackages(true)}
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-md hover:bg-primary/90"
              >
                Admit Patient
              </button>
            )}
            {record.status === 'Admitted' && (
              <button
                onClick={() => setShowScheduleDischarge(true)}
                className="px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-md hover:bg-orange-700"
              >
                Schedule Discharge
              </button>
            )}
            {record.status === 'Discharge Scheduled' && (
              <button
                onClick={() => setShowDischargeModal(true)}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700"
              >
                Discharge Patient
              </button>
            )}
          </div>
        )}

        {/* ── Grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Patient Information */}
          <div>
            <SectionTitle title="Patient Information" />
            <div className="space-y-1">
              <Field label="Patient" value={record.patient_name || record.patient} />
              <Field label="Patient ID" value={record.patient} />
              <Field label="Gender" value={record.gender} />
              <Field label="Blood Group" value={record.blood_group} />
              <Field label="Date of Birth" value={fmt(record.dob)} />
              <Field label="Mobile" value={record.mobile} />
              <Field label="Email" value={record.email} />
              <Field label="Phone" value={record.phone} />
            </div>
          </div>

          {/* Admission Details */}
          <div>
            <SectionTitle title="Admission Details" />
            <div className="space-y-1">
              <Field label="Scheduled Date" value={fmt(record.scheduled_date)} />
              <Field label="Admitted" value={fmtDt(record.admitted_datetime)} />
              <Field label="Expected Discharge" value={fmt(record.expected_discharge)} />
              <Field label="Expected Length of Stay" value={record.expected_length_of_stay ? `${record.expected_length_of_stay} days` : undefined} />
              <Field label="Admission Ordered For" value={fmt(record.admission_ordered_for)} />
              <Field label="Company" value={record.company} />
              <Field label="Cost Center" value={record.cost_center} />
              <Field label="Admission By CPR" value={record.admission_by_cpr} />
              <Field label="Reference By" value={record.reference_by} />
            </div>
          </div>

          {/* Medical Team */}
          <div>
            <SectionTitle title="Medical Team" />
            <div className="space-y-1">
              <Field label="Department" value={record.medical_department} />
              <Field label="Primary Practitioner" value={record.primary_practitioner} />
              <Field label="Secondary Practitioner" value={record.secondary_practitioner} />
              <Field label="Admission By Doctor" value={record.admission_doctor_name || record.admission_by_doctor} />
              <Field label="Admission By NM" value={record.admission_by_nm} />
              <Field label="Psychologist" value={record.psychologist_doctor_name || record.psychologist_doctor} />
              <Field label="Resident Doctor" value={record.resident_doctor_name || record.residents_doctor_no} />
              <BoolField label="Escort Required" value={record.escort} />
            </div>
          </div>

          {/* Emergency Contact */}
          <div>
            <SectionTitle title="Emergency Contact" />
            <div className="space-y-1">
              <Field label="Guardian Name" value={record.guardian_name} />
              <Field label="Relationship" value={record.contact_relationship} />
              <Field label="Contact No" value={record.contact_mobile} />
              <Field label="Emergency Phone" value={record.contact_phone} />
              <Field label="Email" value={record.contact_email} />
            </div>
          </div>

          {/* Costs */}
          {(record.admission_cost || record.case_management_fee || record.room_charges) && (
            <div>
              <SectionTitle title="Costs" />
              <div className="space-y-1">
                <Field label="Admission Cost" value={record.admission_cost} />
                <Field label="Case Management Fee" value={record.case_management_fee} />
                <Field label="Room Charges" value={record.room_charges} />
              </div>
            </div>
          )}

          {/* References */}
          <div>
            <SectionTitle title="References" />
            <div className="space-y-1">
              <Field label="Admission Encounter" value={record.admission_encounter} />
              <Field label="Admission Practitioner" value={record.admission_practitioner} />
              <Field label="Service Unit Type" value={record.admission_service_unit_type} />
            </div>
          </div>
        </div>

        {/* ── Admission Instructions ── */}
        {record.admission_instruction && (
          <div>
            <SectionTitle title="Admission Instructions" />
            <p className="text-slate-700 bg-slate-50 rounded-md p-3 whitespace-pre-wrap">
              {record.admission_instruction}
            </p>
          </div>
        )}

        {/* ── Physical Examination ── */}
        {(record.weight || record.height || record.blood_pressure || record.pulse || record.temp || record.resp_rate) && (
          <div>
            <SectionTitle title="Physical Examination" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {record.weight && (
                <div className="bg-slate-50 rounded-md p-2 text-center">
                  <p className="text-xs text-slate-500">Weight</p>
                  <p className="font-semibold text-slate-800">{record.weight} kg</p>
                </div>
              )}
              {record.height && (
                <div className="bg-slate-50 rounded-md p-2 text-center">
                  <p className="text-xs text-slate-500">Height</p>
                  <p className="font-semibold text-slate-800">{record.height} cm</p>
                </div>
              )}
              {record.blood_pressure && (
                <div className="bg-slate-50 rounded-md p-2 text-center">
                  <p className="text-xs text-slate-500">Blood Pressure</p>
                  <p className="font-semibold text-slate-800">{record.blood_pressure}</p>
                </div>
              )}
              {record.pulse && (
                <div className="bg-slate-50 rounded-md p-2 text-center">
                  <p className="text-xs text-slate-500">Pulse</p>
                  <p className="font-semibold text-slate-800">{record.pulse} bpm</p>
                </div>
              )}
              {record.temp && (
                <div className="bg-slate-50 rounded-md p-2 text-center">
                  <p className="text-xs text-slate-500">Temperature</p>
                  <p className="font-semibold text-slate-800">{record.temp} °C</p>
                </div>
              )}
              {record.resp_rate && (
                <div className="bg-slate-50 rounded-md p-2 text-center">
                  <p className="text-xs text-slate-500">Resp Rate</p>
                  <p className="font-semibold text-slate-800">{record.resp_rate}/min</p>
                </div>
              )}
            </div>
            {(record.general_condition || record.cns || record.cvs_resp || record.git || record.others) && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                {record.general_condition && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-0.5">General Condition</p>
                    <p className="text-slate-700 bg-slate-50 rounded p-2 text-xs">{record.general_condition}</p>
                  </div>
                )}
                {record.cns && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-0.5">CNS</p>
                    <p className="text-slate-700 bg-slate-50 rounded p-2 text-xs">{record.cns}</p>
                  </div>
                )}
                {record.cvs_resp && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-0.5">CVS / RESP</p>
                    <p className="text-slate-700 bg-slate-50 rounded p-2 text-xs">{record.cvs_resp}</p>
                  </div>
                )}
                {record.git && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-0.5">GIT</p>
                    <p className="text-slate-700 bg-slate-50 rounded p-2 text-xs">{record.git}</p>
                  </div>
                )}
                {record.others && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-0.5">Others</p>
                    <p className="text-slate-700 bg-slate-50 rounded p-2 text-xs">{record.others}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Medical History ── */}
        {(record.allergies || record.medication_history || record.medical_history || record.surgical_history) && (
          <div>
            <SectionTitle title="Medical History" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {record.allergies && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-0.5">Allergies</p>
                  <p className="text-slate-700 bg-red-50 border border-red-100 rounded p-2 text-xs">{record.allergies}</p>
                </div>
              )}
              {record.medication_history && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-0.5">Medication History</p>
                  <p className="text-slate-700 bg-slate-50 rounded p-2 text-xs">{record.medication_history}</p>
                </div>
              )}
              {record.medical_history && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-0.5">Medical History</p>
                  <p className="text-slate-700 bg-slate-50 rounded p-2 text-xs">{record.medical_history}</p>
                </div>
              )}
              {record.surgical_history && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-0.5">Surgical History</p>
                  <p className="text-slate-700 bg-slate-50 rounded p-2 text-xs">{record.surgical_history}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Discharge Details ── */}
        {(record.discharge_ordered_date || record.discharge_datetime || record.discharge_instructions || record.discharge_note || record.followup_date) && (
          <div>
            <SectionTitle title="Discharge Details" />
            <div className="space-y-1 mb-3">
              <Field label="Discharge Ordered" value={fmt(record.discharge_ordered_date)} />
              <Field label="Discharge Date" value={fmtDt(record.discharge_datetime)} />
              <Field label="Follow Up Date" value={fmt(record.followup_date)} />
              <Field label="Discharge Practitioner" value={record.discharge_practitioner} />
            </div>
            {record.discharge_instructions && (
              <div className="mb-2">
                <p className="text-xs font-medium text-slate-500 mb-0.5">Discharge Instructions</p>
                <p className="text-slate-700 bg-slate-50 rounded p-2 text-xs">{record.discharge_instructions}</p>
              </div>
            )}
            {record.discharge_note && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-0.5">Discharge Notes</p>
                <div
                  className="text-slate-700 bg-slate-50 rounded p-2 text-xs prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: record.discharge_note }}
                />
              </div>
            )}
          </div>
        )}

        {/* ── Inpatient Occupancy ── */}
        {record.inpatient_occupancies && record.inpatient_occupancies.length > 0 && (
          <div>
            <SectionTitle title="Room / Occupancy History" />
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="min-w-full text-xs divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Service Unit</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Check In</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Check Out</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Invoiced</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {record.inpatient_occupancies.map((occ: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-800">{occ.service_unit}</td>
                      <td className="px-3 py-2 text-slate-600">{occ.check_in ? new Date(occ.check_in).toLocaleString() : '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{occ.check_out ? new Date(occ.check_out).toLocaleString() : '—'}</td>
                      <td className="px-3 py-2">
                        {occ.invoiced
                          ? <span className="inline-flex px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700">Yes</span>
                          : <span className="inline-flex px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-600">No</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* ── Action Modals ── */}
      {showPackages && (
        <PackageSelectionModal
          admissionNo={record.name}
          onSelect={(pkg) => {
            setSelectedPackage(pkg)
            setShowPackages(false)
            setShowAdmissionForm(true)
          }}
          onClose={() => setShowPackages(false)}
        />
      )}

      {showAdmissionForm && selectedPackage && (
        <AdmissionFormModal
          admissionNo={record.name}
          selectedPackage={selectedPackage}
          onComplete={handleAdmissionComplete}
          onClose={() => { setShowAdmissionForm(false); setSelectedPackage(null) }}
        />
      )}

      {showScheduleDischarge && (
        <ScheduleDischargeModal
          admission={{ name: record.name, patient: record.patient, patient_name: record.patient_name }}
          onClose={() => setShowScheduleDischarge(false)}
          onSuccess={handleDischargeScheduled}
        />
      )}

      {showDischargeModal && (
        <DischargeModal
          admission={{ name: record.name, patient: record.patient, patient_name: record.patient_name }}
          onClose={() => setShowDischargeModal(false)}
          onSuccess={handleDischargeComplete}
        />
      )}
    </>
  )
}