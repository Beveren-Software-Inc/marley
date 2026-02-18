import { useState, useRef, useEffect } from 'react'
import { useLabTests } from '../../hooks/useLabTests'
import { StatusPill } from '../ui/StatusPill'
import { updateLabTestStatus } from '../../services/labTests'
import { LabTestDetails } from './LabTestDetails'
import { toast } from '../../hooks/useToast'

const statusColors: Record<string, string> = {
  'Approved': 'success',
  'Rejected': 'danger',
  'Completed': 'success',
  'Submitted': 'info',
  'Pending Review': 'warning',
  'Cancelled': 'default',
  'Draft': 'warning'
}

export const LabTestReportsList = ({
  patient,
  pendingReview = false
}: {
  patient?: string
  pendingReview?: boolean
}) => {
  const { labTests, loading, error, refetch } = useLabTests(patient, undefined, pendingReview)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [selectedLabTest, setSelectedLabTest] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenActionRow(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleStatusChange = async (name: string, newStatus: 'Approved' | 'Rejected') => {
    setOpenActionRow(null)
    setActionLoading(name)
    try {
      await updateLabTestStatus(name, newStatus)
      toast.success(`Lab test ${newStatus.toLowerCase()}`)
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to ${newStatus.toLowerCase()} lab test`)
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading lab test reports...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Lab Test Reports</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (labTests.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">
          {pendingReview ? 'No lab tests pending review' : 'No lab test reports found'}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="min-w-full">
        <table className="w-full min-w-[900px] min-h-[300px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Lab Test ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Patient</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Test Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Practitioner</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Result Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[80px]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {labTests.map((labTest) => (
              <tr key={labTest.name} className="hover:bg-slate-50">

                {/* Clickable Lab Test ID → opens LabTestDetails modal */}
                <td className="px-4 py-3 text-sm font-medium">
                  <button
                    type="button"
                    onClick={() => setSelectedLabTest(labTest.name)}
                    className="text-primary hover:underline text-left focus:outline-none"
                    title="View lab test details"
                  >
                    {labTest.name}
                  </button>
                </td>

                <td className="px-4 py-3 text-sm text-slate-700">
                  {labTest.patient_name || labTest.patient}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {labTest.lab_test_name || labTest.template || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {labTest.practitioner_name || labTest.practitioner || '-'}
                </td>
                <td className="px-4 py-3">
                  <StatusPill
                    status={labTest.status || 'Draft'}
                    color={statusColors[labTest.status || 'Draft'] || 'default'}
                  />
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {labTest.result_date
                    ? new Date(labTest.result_date).toLocaleDateString()
                    : labTest.submitted_date
                      ? new Date(labTest.submitted_date).toLocaleDateString()
                      : '-'}
                </td>

                {/* ── Actions dropdown ── */}
                <td className="px-4 py-2 align-middle">
                  <div
                    className="relative inline-block"
                    ref={openActionRow === labTest.name ? menuRef : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenActionRow((prev) => (prev === labTest.name ? null : labTest.name))}
                      disabled={!!actionLoading}
                      className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      aria-label="Actions"
                    >
                      {actionLoading === labTest.name ? (
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      )}
                    </button>

                    {openActionRow === labTest.name && (
                      <div className="absolute right-0 bottom-full mb-1 z-10 min-w-[160px] rounded-md border border-slate-200 bg-white py-1 shadow-lg">

                        {/* View Details */}
                        <button
                          type="button"
                          onClick={() => { setOpenActionRow(null); setSelectedLabTest(labTest.name) }}
                          className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                        >
                          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          View Details
                        </button>

                        <div className="border-t border-slate-100 my-1" />

                        {/* Approve — hidden if already approved */}
                        {labTest.status !== 'Approved' && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(labTest.name, 'Approved')}
                            className="block w-full text-left px-3 py-2 text-sm text-green-700 font-medium hover:bg-green-50"
                          >
                            ✓ Approve
                          </button>
                        )}

                        {/* Reject — hidden if already rejected */}
                        {labTest.status !== 'Rejected' && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(labTest.name, 'Rejected')}
                            className="block w-full text-left px-3 py-2 text-sm text-red-600 font-medium hover:bg-red-50"
                          >
                            ✗ Reject
                          </button>
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

      {/* ── LabTestDetails Modal ── */}
      {selectedLabTest && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-end"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedLabTest(null) }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30" />

          {/* Slide-over panel */}
          <div className="relative z-10 h-full w-full max-w-2xl bg-white shadow-xl flex flex-col">
            {/* Panel header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Lab Test Details</p>
                <p className="text-sm font-semibold text-slate-800">{selectedLabTest}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLabTest(null)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-6">
              <LabTestDetails
                labTestName={selectedLabTest}
                onUpdate={() => refetch()}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}