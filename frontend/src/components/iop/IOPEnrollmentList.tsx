import { useState, useEffect } from 'react'
import { fetchIOPEnrollments, type IOPEnrollment } from '../../services/iop'
import { CreateIOPEnrollmentModal } from './CreateIOPEnrollmentModal'
import { CreatePatientVisitModal } from '../patientVisits/CreatePatientVisitModal'
import { getPatientVisitFormUrl } from '../../services/appointments'

interface IOPEnrollmentListProps {
  refreshKey?: string | number
  iopDayFilter?: string
  patientFilter?: string
}

export const IOPEnrollmentList = ({
  refreshKey,
  iopDayFilter,
  patientFilter
}: IOPEnrollmentListProps) => {
  const [enrollments, setEnrollments] = useState<IOPEnrollment[]>([])
  const [loading, setLoading] = useState(true)
  const [createVisitForEnrollment, setCreateVisitForEnrollment] = useState<IOPEnrollment | null>(null)

  const load = () => {
    setLoading(true)
    fetchIOPEnrollments(50, 0, iopDayFilter, patientFilter)
      .then(setEnrollments)
      .catch(() => setEnrollments([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [refreshKey, iopDayFilter, patientFilter])

  const handleVisitCreated = (visitName: string) => {
    setCreateVisitForEnrollment(null)
    window.open(getPatientVisitFormUrl(visitName), '_blank')
    load()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6 text-slate-600">
        Loading enrollments…
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[500px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Patient</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">IOP Day</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[140px]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {enrollments.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No enrollments. Enroll a patient in an IOP day.
                </td>
              </tr>
            ) : (
              enrollments.map((e) => (
                <tr key={e.name} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-700">{e.patient_name || e.patient || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{e.iop_day || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{e.posting_date || '-'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                        e.status === 'Attended'
                          ? 'bg-green-100 text-green-800'
                          : e.status === 'Absent'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {e.status || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => setCreateVisitForEnrollment(e)}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Create Patient Visit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {createVisitForEnrollment && (
        <CreatePatientVisitModal
          onClose={() => setCreateVisitForEnrollment(null)}
          onSuccess={handleVisitCreated}
          initialPatient={createVisitForEnrollment.patient}
          initialIOPEnrollment={createVisitForEnrollment.name}
        />
      )}
    </div>
  )
}

export function IOPEnrollmentListWithHeader({
  refreshKey: externalRefreshKey,
  iopDayFilter,
  patientFilter
}: IOPEnrollmentListProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [localRefreshKey, setLocalRefreshKey] = useState(0)
  const effectiveRefreshKey = `${externalRefreshKey ?? ''}-${localRefreshKey}`
  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h3 className="font-semibold text-slate-900">IOP Enrollments</h3>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 text-sm font-bold"
          title="New Enrollment"
        >
          +
        </button>
      </div>
      <div className="overflow-auto flex-1 min-h-0">
        <IOPEnrollmentList
          refreshKey={effectiveRefreshKey}
          iopDayFilter={iopDayFilter}
          patientFilter={patientFilter}
        />
      </div>
      {showCreate && (
        <CreateIOPEnrollmentModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false)
            setLocalRefreshKey((k) => k + 1)
          }}
        />
      )}
    </section>
  )
}
