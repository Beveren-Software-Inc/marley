import { useState, useEffect, useRef } from 'react'
import { usePatientVisits } from '../../hooks/usePatientVisits'
import { StatusPill } from '../ui/StatusPill'
import { PatientVisitDetails } from './PatientVisitDetails'
import { cancelVisit, createInvoice, type PatientVisit } from '../../services/patientVisits'
import { CreateAdmissionModal } from '../admissions/CreateAdmissionModal'
import { CancelVisitModal } from './CancelVisitModal'
import { toast } from '../../hooks/useToast'

const statusColors: Record<string, string> = {
  'Open': 'warning',
  'Ordered': 'info',
  'Completed': 'success',
  'Cancelled': 'danger'
}

interface PatientVisitListProps {
  onVisitSelect?: (visitName: string) => void
  searchQuery?: string
  patient?: string
  refreshKey?: string | number
}

export const PatientVisitList = ({
  onVisitSelect,
  searchQuery: externalSearchQuery = '',
  patient,
  refreshKey
}: PatientVisitListProps = {}) => {
  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [detailVisit, setDetailVisit] = useState<string | null>(null)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [admissionModalVisit, setAdmissionModalVisit] = useState<PatientVisit | null>(null)

  const menuRef = useRef<HTMLDivElement>(null)

  const { visits, loading, error, refetch } = usePatientVisits(
    selectedStatus || undefined,
    externalSearchQuery || undefined,
    patient
  )

  // Refresh when refreshKey changes
  useEffect(() => { if (refreshKey !== undefined) refetch() }, [refreshKey])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenActionRow(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const statuses = ['Open', 'Ordered', 'Completed', 'Cancelled']

const [showCancelModal, setShowCancelModal] = useState(false)
const [cancelLoading, setCancelLoading] = useState(false)

const handleCancelVisitConfirm = async (reason: string) => {
  if (!visit) return
  setCancelLoading(true)
  try {
    await cancelVisit(visit.name, reason)
    toast.success('Visit cancelled successfully')
    loadVisit()
    onUpdate?.()
    setShowCancelModal(false)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to cancel visit')
  } finally {
    setCancelLoading(false)
  }
}

  const handleCreateInvoice = async (visitName: string) => {
    setActionLoading(visitName + '_invoice')
    try {
      const invoiceName = await createInvoice(visitName)
      toast.success('Invoice created: ' + invoiceName)
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create invoice')
    } finally {
      setActionLoading(null)
      setOpenActionRow(null)
    }
  }

  const handleScheduleAdmission = (visit: PatientVisit) => {
    setAdmissionModalVisit(visit) // open CreateAdmissionModal directly
    setOpenActionRow(null)
  }

  if (loading) return <div className="flex items-center justify-center p-8 text-slate-600">Loading patient visits...</div>
  if (error) return (
    <div className="flex flex-col items-center justify-center p-8">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
        <h3 className="text-red-800 font-semibold mb-2">Error Loading Patient Visits</h3>
        <p className="text-red-700 text-sm mb-2">{error.message}</p>
        <button onClick={() => refetch()} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700">Retry</button>
      </div>
    </div>
  )

  return (
    <>
      {/* Status Filter */}
      <div className="flex gap-2 flex-wrap mb-4">
        <button onClick={() => setSelectedStatus('')} className={`px-4 py-2 rounded-md text-sm font-medium ${selectedStatus === '' ? 'bg-primary text-white' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'}`}>All</button>
        {statuses.map(status => (
          <button key={status} onClick={() => setSelectedStatus(status)} className={`px-4 py-2 rounded-md text-sm font-medium ${selectedStatus === status ? 'bg-primary text-white' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'}`}>{status}</button>
        ))}
      </div>

      {/* Visits Table */}
      <div className="min-w-full">
        <table className="w-full min-w-[900px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Visit No</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Patient</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Practitioner</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Encounter Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[100px]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {visits.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">{externalSearchQuery ? 'No visits match your search.' : 'No patient visits found'}</td>
              </tr>
            ) : visits.map(visit => (
              <tr key={visit.name} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-sm font-medium text-primary hover:underline cursor-pointer" onClick={() => { setDetailVisit(visit.name); onVisitSelect?.(visit.name) }}>{visit.name}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{visit.patient_name || visit.patient}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{visit.practitioner_name || visit.practitioner}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{visit.encounter_date ? new Date(visit.encounter_date).toLocaleDateString() : '-'}</td>
                <td className="px-4 py-3"><StatusPill status={visit.status} color={statusColors[visit.status] || 'default'} /></td>

                {/* Actions Dropdown */}
                <td className="px-4 py-2 align-middle">
                  <div className="relative" ref={openActionRow === visit.name ? menuRef : undefined}>
                    <button
                      type="button"
                      onClick={() => setOpenActionRow(prev => (prev === visit.name ? null : visit.name))}
                      className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      aria-label="Actions"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>

                    {openActionRow === visit.name && (
                      <div className="absolute right-0 top-full mt-1 z-10 min-w-[160px] rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                        {!visit.invoice_created && visit.status === 'Completed' && (
                          <button
                            type="button"
                            onClick={() => handleCreateInvoice(visit.name)}
                            disabled={actionLoading === visit.name + '_invoice'}
                            className="block w-full text-left px-3 py-2 text-sm text-green-600 hover:bg-green-50 disabled:opacity-50"
                          >
                            {actionLoading === visit.name + '_invoice' ? 'Creating…' : 'Create Invoice'}
                          </button>
                        )}

                        {visit.status === 'Completed' && (
                          <button
                            type="button"
                            onClick={() => handleScheduleAdmission(visit)}
                            className="block w-full text-left px-3 py-2 text-sm text-primary hover:bg-primary/5"
                          >
                            Schedule Admission
                          </button>
                        )}

                        {visit.status !== 'Cancelled' && (
                    <button
                      onClick={() => setShowCancelModal(true)}
                      className="px-4 py-2 text-sm font-medium text-red-500  rounded-md hover:text-red-700"
                    >
                      Cancel Visit
                    </button>
                  )}

                  {showCancelModal && visit && (
                    <CancelVisitModal
                      visitName={visit.name}
                      onClose={() => setShowCancelModal(false)}
                      onConfirm={handleCancelVisitConfirm}
                      loading={cancelLoading}
                    />
                  )}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Slide-over Detail */}
      {detailVisit && (
        <div className="fixed inset-0 z-50 flex items-start justify-end" onClick={e => { if (e.target === e.currentTarget) setDetailVisit(null) }}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative z-10 h-full w-full max-w-2xl bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Patient Visit</p>
                <p className="text-sm font-semibold text-slate-800">{detailVisit}</p>
              </div>
              <button type="button" onClick={() => setDetailVisit(null)} className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200" aria-label="Close">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <PatientVisitDetails visitNo={detailVisit} onUpdate={() => refetch()} />
            </div>
          </div>
        </div>
      )}

      {/* Create Admission Modal */}
      {admissionModalVisit && (
        <CreateAdmissionModal
          patientName={admissionModalVisit.patient}
          encounterName={admissionModalVisit.name}
          onClose={() => setAdmissionModalVisit(null)}
          onSuccess={() => { setAdmissionModalVisit(null); refetch() }}
        />
      )}
    </>
  )
}