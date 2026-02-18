import { useState, useRef, useEffect } from 'react'
import { useLabTests } from '../../hooks/useLabTests'
import { StatusPill } from '../ui/StatusPill'
import { updateLabTestStatus, getLabTestUrl } from '../../services/labTests'
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

  const handleOpenLabTest = (name: string) => {
    window.open(getLabTestUrl(name), '_blank')
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

              {/* Clickable Lab Test ID → opens full report */}
              <td className="px-4 py-3 text-sm font-medium">
                <button
                  type="button"
                  onClick={() => handleOpenLabTest(labTest.name)}
                  className="text-primary hover:underline text-left focus:outline-none"
                  title="Open full lab test report"
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

                      {/* Open full report */}
                      <button
                        type="button"
                        onClick={() => { setOpenActionRow(null); handleOpenLabTest(labTest.name) }}
                        className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                      >
                        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Open Report
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
  )
}