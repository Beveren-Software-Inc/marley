import type { LabTest } from '../../services/labTests'
import { StatusPill } from '../ui/StatusPill'
import {
  CardRowMetaHint,
  dashboardCardRowHoverClass,
  formatDashboardDate,
} from '../ui/dashboardCardListing'
import { displayResultFlag, labTestResultPreview } from './labTestReviewUtils'

const statusColors: Record<string, string> = {
  Draft: 'default',
  'Pending Review': 'warning',
  Reviewed: 'success',
  Rejected: 'danger',
  Cancelled: 'danger',
  Submitted: 'info',
  Completed: 'success',
  Requested: 'info',
}

interface Props {
  labTests: LabTest[]
  onOpen: (name: string) => void
  onReview?: (name: string) => void
  /** Compact doctor dashboard: test, status, result, flag, action only */
  variant?: 'default' | 'doctor'
}

export function LabTestDashboardCardTable({
  labTests,
  onOpen,
  onReview,
  variant = 'default',
}: Props) {
  const isDoctor = variant === 'doctor'

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-2 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Test</th>
            <th className="px-2 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Status</th>
            <th className="px-2 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Result</th>
            {isDoctor && (
              <th className="px-2 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Flag</th>
            )}
            {!isDoctor && (
              <th className="px-2 py-2 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap w-[22%]">
                Date
              </th>
            )}
            {isDoctor && (
              <th className="px-2 py-2 text-right text-xs font-semibold text-slate-600 uppercase w-[72px]">
                Action
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {labTests.map((lt) => {
            const flag = displayResultFlag(lt)
            const metaFields = [
              ['Lab Test ID', lt.name],
              ['Practitioner', lt.practitioner_name || lt.practitioner],
              ['Department', lt.department],
              ['Service request', lt.service_request],
              ['Outsourced', lt.is_outsourced ? 'Yes' : ''],
              ['Lab technician', lt.lab_technician_name || lt.lab_technician],
              ['Date', formatDashboardDate(lt.result_date || lt.submitted_date || lt.date)],
              ['Group', lt.lab_test_group],
            ] as const
            return (
              <tr key={lt.name} className={dashboardCardRowHoverClass}>
                <td className="px-2 py-2 text-slate-800 font-medium align-top">
                  <div className="flex items-start gap-1 min-w-0">
                    <span className="line-clamp-2 min-w-0 flex-1">
                      {lt.lab_test_name || lt.template || '—'}
                    </span>
                    <CardRowMetaHint fields={metaFields} />
                  </div>
                </td>
                <td className="px-2 py-2 align-top">
                  <StatusPill
                    status={lt.status || 'Draft'}
                    color={statusColors[lt.status || 'Draft'] || 'default'}
                  />
                </td>
                <td className="px-2 py-2 text-slate-700 align-top max-w-[140px]">
                  <span className="line-clamp-2">{labTestResultPreview(lt)}</span>
                </td>
                {isDoctor && (
                  <td className="px-2 py-2 align-top">
                    {flag ? (
                      <span className="inline-flex items-center rounded-md bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">
                        {flag}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                )}
                {!isDoctor && (
                  <td className="px-2 py-2 text-slate-500 whitespace-nowrap align-top text-xs">
                    {formatDashboardDate(lt.result_date || lt.submitted_date || lt.date)}
                  </td>
                )}
                {isDoctor && (
                  <td className="px-2 py-2 align-top text-right">
                    {lt.status === 'Pending Review' && onReview ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onReview(lt.name)
                        }}
                        className="rounded border border-emerald-600 px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-50"
                      >
                        Review
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpen(lt.name)
                        }}
                        className="rounded border border-slate-300 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
                      >
                        View
                      </button>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
