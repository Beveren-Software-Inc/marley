import { useLabTests } from '../../hooks/useLabTests'
import { StatusPill } from '../ui/StatusPill'

const statusColors: Record<string, string> = {
  'Approved': 'success',
  'Rejected': 'danger',
  'Completed': 'success',
  'Submitted': 'info',
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
  const { labTests, loading, error, refetch } = useLabTests(
    patient,
    undefined,
    pendingReview
  )

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
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Lab Test ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Patient
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Test Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Practitioner
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Result Date
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {labTests.map((labTest) => (
            <tr key={labTest.name} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-sm font-medium text-slate-900">
                {labTest.name}
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}






