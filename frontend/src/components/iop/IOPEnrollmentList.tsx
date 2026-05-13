import { useState, useEffect, useRef } from 'react'
import { fetchIOPEnrollments, type IOPEnrollment } from '../../services/iop'
import { CreateIOPEnrollmentModal } from './CreateIOPEnrollmentModal'
import { EditIOPEnrollmentModal } from './EditIOPEnrollmentModal'
import { CreatePatientVisitModal } from '../patientVisits/CreatePatientVisitModal'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { getPatientVisitFormUrl } from '../../services/appointments'

interface IOPEnrollmentListProps {
  refreshKey?: string | number
  iopDayFilter?: string
  patientFilter?: string
  onPatientClick?: (patient: string) => void
}

export const IOPEnrollmentList = ({
  refreshKey,
  iopDayFilter,
  patientFilter,
  onPatientClick,
}: IOPEnrollmentListProps) => {
  const [enrollments, setEnrollments] = useState<IOPEnrollment[]>([])
  const [loading, setLoading] = useState(true)
  const [createVisitForEnrollment, setCreateVisitForEnrollment] = useState<IOPEnrollment | null>(null)
  const [editEnrollmentName, setEditEnrollmentName] = useState<string | null>(null)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('[data-portal-actions-menu]')) return
      if (el.closest('button[aria-label="Actions"]')) return
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenActionRow(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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
              {!patientFilter && (
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Patient</th>
              )}
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">IOP Day</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[140px]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {enrollments.length === 0 ? (
              <tr>
                <td colSpan={patientFilter ? 4 : 5} className="px-4 py-6 text-center text-slate-500">
                  No enrollments. Enroll a patient in an IOP day.
                </td>
              </tr>
            ) : (
              enrollments.map((e) => (
                <tr key={e.name} className="hover:bg-slate-50">
                  {!patientFilter && (
                    <td
                      className="px-4 py-3 text-sm cursor-pointer"
                      onClick={() => e.patient && onPatientClick?.(e.patient)}
                    >
                      <span className="font-medium text-primary hover:underline">{e.patient_name || e.patient || '-'}</span>
                    </td>
                  )}
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
                  <td className="px-4 py-2 align-middle">
                    <div className="relative" ref={openActionRow === e.name ? menuRef : undefined}>
                      <button
                        type="button"
                        onClick={() => setOpenActionRow((prev) => (prev === e.name ? null : e.name))}
                        className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                        aria-label="Actions"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>
                      <PortalActionsMenu
                        open={openActionRow === e.name}
                        onClose={() => setOpenActionRow(null)}
                        triggerRef={menuRef}
                        minWidth={180}
                      >
                        <button
                          type="button"
                          onClick={() => { setCreateVisitForEnrollment(e); setOpenActionRow(null) }}
                          className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                        >
                          Create Patient Visit
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditEnrollmentName(e.name); setOpenActionRow(null) }}
                          className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                        >
                          Edit
                        </button>
                      </PortalActionsMenu>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {editEnrollmentName && (
        <EditIOPEnrollmentModal
          enrollmentName={editEnrollmentName}
          onClose={() => setEditEnrollmentName(null)}
          onSuccess={() => {
            setEditEnrollmentName(null)
            load()
          }}
        />
      )}
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
