import type { LabTest } from '../../services/labTests'
import { StatusPill } from '../ui/StatusPill'
import {
  CardRowMetaHint,
  dashboardCardRowHoverClass,
  formatDashboardDate,
  stripHtmlToText,
} from '../ui/dashboardCardListing'

const statusColors: Record<string, string> = {
  Draft: 'default',
  'Pending Review': 'warning',
  Completed: 'success',
  Approved: 'success',
  Cancelled: 'danger',
  Submitted: 'info',
}

function resultPreview(lt: LabTest): string {
  const raw =
    lt.custom_result ||
    lt.descriptive_result ||
    (typeof lt.results === 'string' ? lt.results : '') ||
    ''
  const text = stripHtmlToText(raw) || lt.result_flag || ''
  if (!text) return '—'
  return text.length > 120 ? `${text.slice(0, 120)}…` : text
}

interface Props {
  labTests: LabTest[]
  onOpen: (name: string) => void
}

export function LabTestDashboardCardTable({ labTests, onOpen }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Test</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Status</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Result</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap w-[22%]">
              Date
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {labTests.map((lt) => {
            const metaFields = [
              ['Lab Test ID', lt.name],
              ['Practitioner', lt.practitioner_name || lt.practitioner],
              ['Department', lt.department],
              ['Service request', lt.service_request],
              ['Outsourced', lt.is_outsourced ? 'Yes' : ''],
              ['Lab technician', lt.lab_technician_name || lt.lab_technician],
            ] as const
            return (
              <tr
                key={lt.name}
                className={dashboardCardRowHoverClass}
                onClick={() => onOpen(lt.name)}
              >
                <td className="px-3 py-2.5 text-slate-800 font-medium align-top">
                  <span className="line-clamp-2">{lt.lab_test_name || lt.template || '—'}</span>
                  <CardRowMetaHint fields={metaFields} />
                </td>
                <td className="px-3 py-2.5 align-top">
                  <StatusPill
                    status={lt.status || 'Draft'}
                    color={statusColors[lt.status || 'Draft'] || 'default'}
                  />
                </td>
                <td className="px-3 py-2.5 text-slate-700 align-top">
                  <span className="line-clamp-3">{resultPreview(lt)}</span>
                </td>
                <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap align-top text-xs">
                  {formatDashboardDate(lt.result_date || lt.submitted_date || lt.date)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
