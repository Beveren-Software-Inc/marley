import { useMemo, useState, Fragment } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { LabTest } from '../../services/labTests'
import { StatusPill } from '../ui/StatusPill'
import {
  CardRowMetaHint,
  dashboardCardRowHoverClass,
  formatDashboardDate,
} from '../ui/dashboardCardListing'
import { displayResultFlag, labTestResultPreview, resultFlagBadgeClass } from './labTestReviewUtils'
import { isLegacyHistoryLabRow, resolveLabTestDocName } from './labTestDisplayUtils'
import { looksLikeLabCode } from '../../utils/labBriefingGroups'

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

/** Sampling / sample date for lab report tables. */
export function labTestReportDate(lt: LabTest): string | undefined {
  return (
    lt.report_date ||
    lt.sample_creation ||
    lt.sampling_date ||
    lt.sample_collected_date ||
    lt.date ||
    lt.result_date ||
    lt.submitted_date ||
    undefined
  )
}

function groupKeyFor(lt: LabTest): string | null {
  if (!lt.is_group_lab_test || !lt.service_request) return null
  const group = (lt.lab_test_group || '').trim()
  const sr = (lt.service_request || '').trim()
  return group ? `${sr}::${group}` : sr
}

function groupLabelFor(children: LabTest[]): string {
  const rep = children[0]
  const name = (rep?.lab_test_group_name || '').trim()
  if (name && !looksLikeLabCode(name)) return name
  const code = (rep?.lab_test_group || '').trim()
  if (code && !looksLikeLabCode(code)) return code
  return name || code || 'Group'
}

type DisplayRow =
  | { kind: 'group'; key: string; label: string; children: LabTest[] }
  | { kind: 'standalone'; test: LabTest }

interface Props {
  labTests: LabTest[]
  onOpen: (name: string) => void
  onReview?: (name: string) => void
  /** Review every pending test in a grouped panel (CBC, etc.). */
  onReviewGroup?: (args: {
    serviceRequest: string
    groupLabel: string
    children: LabTest[]
  }) => void
  /** When set, clicking the test / group name opens lab trends. */
  onOpenTrends?: (testName: string) => void
  resolveDocName?: (lt: LabTest) => string
  /** Compact doctor dashboard: test, status, result, flag, date, action */
  variant?: 'default' | 'doctor'
}

export function LabTestDashboardCardTable({
  labTests,
  onOpen,
  onReview,
  onReviewGroup,
  onOpenTrends,
  resolveDocName = resolveLabTestDocName,
  variant = 'default',
}: Props) {
  const isDoctor = variant === 'doctor'
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const displayRows = useMemo((): DisplayRow[] => {
    const groups = new Map<string, LabTest[]>()
    const standalone: LabTest[] = []
    for (const lt of labTests) {
      const key = groupKeyFor(lt)
      if (!key) {
        standalone.push(lt)
        continue
      }
      const arr = groups.get(key) || []
      arr.push(lt)
      groups.set(key, arr)
    }
    const rows: DisplayRow[] = []
    for (const [key, children] of groups.entries()) {
      rows.push({ kind: 'group', key, label: groupLabelFor(children), children })
    }
    for (const test of standalone) {
      rows.push({ kind: 'standalone', test })
    }
    return rows
  }, [labTests])

  const renderTestRow = (lt: LabTest, opts?: { nested?: boolean }) => {
    const flag = displayResultFlag(lt)
    const docName = resolveDocName(lt)
    const testLabel = (lt.lab_test_name || lt.template || '').trim()
    const reportDate = labTestReportDate(lt)
    const metaFields = [
      ['Lab Test ID', docName],
      ['Practitioner', lt.practitioner_name || lt.practitioner],
      ['Department', lt.department],
      ['Service request', lt.service_request],
      ['Outsourced', lt.is_outsourced ? 'Yes' : ''],
      ['Lab technician', lt.lab_technician_name || lt.lab_technician],
      ['Date', formatDashboardDate(reportDate)],
      ['Group', lt.lab_test_group_name || lt.lab_test_group],
    ] as const
    return (
      <tr key={lt.name} className={dashboardCardRowHoverClass}>
        <td className={`px-2 py-2 text-slate-800 font-medium align-top ${opts?.nested ? 'pl-5' : ''}`}>
          <div className="flex items-start gap-1 min-w-0">
            {opts?.nested ? <span className="text-slate-400 text-xs mt-0.5 shrink-0">↳</span> : null}
            <button
              type="button"
              className={`line-clamp-2 min-w-0 flex-1 text-left ${
                onOpenTrends ? 'cursor-pointer text-primary hover:underline' : 'cursor-default'
              }`}
              onClick={() => {
                if (onOpenTrends && testLabel) {
                  onOpenTrends(testLabel)
                  return
                }
                onOpen(docName)
              }}
              title={onOpenTrends ? 'Open lab trends for this test' : 'View lab test'}
            >
              {isLegacyHistoryLabRow(lt) && (
                <span className="mr-1 inline-flex items-center rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold uppercase text-amber-800">
                  History
                </span>
              )}
              {testLabel || '—'}
            </button>
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
              <span
                className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${resultFlagBadgeClass(
                  lt.result_flag || flag,
                )}`}
              >
                {flag}
              </span>
            ) : (
              <span className="text-slate-300 text-xs">—</span>
            )}
          </td>
        )}
        <td className="px-2 py-2 text-slate-500 whitespace-nowrap align-top text-xs">
          {formatDashboardDate(reportDate)}
        </td>
        {isDoctor && (
          <td className="px-2 py-2 align-top text-right">
            {lt.status === 'Pending Review' && onReview && !isLegacyHistoryLabRow(lt) ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onReview(docName)
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
                  onOpen(docName)
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
  }

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
            <th className="px-2 py-2 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">
              Date
            </th>
            {isDoctor && (
              <th className="px-2 py-2 text-right text-xs font-semibold text-slate-600 uppercase w-[72px]">
                Action
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {displayRows.map((row) => {
            if (row.kind === 'standalone') {
              return renderTestRow(row.test)
            }
            const isOpen = !!expanded[row.key]
            const pendingCount = row.children.filter((c) => c.status === 'Pending Review').length
            const latestDate = row.children.reduce((latest, c) => {
              const d = labTestReportDate(c) || ''
              return d > latest ? d : latest
            }, '')
            const firstPending = row.children.find(
              (c) => c.status === 'Pending Review' && !isLegacyHistoryLabRow(c),
            )
            return (
              <Fragment key={row.key}>
                <tr className="bg-indigo-50/80 hover:bg-indigo-50 border-l-4 border-indigo-400">
                  <td className="px-2 py-2 align-top">
                    <div className="flex items-start gap-1.5 min-w-0">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-200 text-indigo-700 shrink-0 mt-0.5">
                        GROUP
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded((prev) => ({ ...prev, [row.key]: !prev[row.key] }))
                        }
                        className="inline-flex items-center justify-center p-0.5 rounded text-indigo-700 hover:bg-indigo-200/60 shrink-0 mt-0.5"
                        title={isOpen ? 'Collapse group' : 'Expand group'}
                        aria-label={isOpen ? 'Collapse group' : 'Expand group'}
                      >
                        {isOpen ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        className={`min-w-0 flex-1 text-left font-semibold text-indigo-800 ${
                          onOpenTrends ? 'hover:underline cursor-pointer' : 'cursor-default'
                        }`}
                        onClick={() => {
                          if (onOpenTrends && row.label) onOpenTrends(row.label)
                        }}
                        title={
                          onOpenTrends
                            ? `Open lab trends for ${row.label}`
                            : `${row.children.length} tests in this group`
                        }
                      >
                        <span className="line-clamp-2">{row.label}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-700">
                            {row.children.length}
                          </span>
                          {pendingCount > 0 ? (
                            <span className="text-[10px] font-medium text-amber-700">
                              {pendingCount} pending review
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-2 align-top text-xs text-indigo-500 italic">— group —</td>
                  <td className="px-2 py-2 align-top text-xs text-indigo-400 italic">—</td>
                  {isDoctor && <td className="px-2 py-2 align-top text-slate-300 text-xs">—</td>}
                  <td className="px-2 py-2 text-slate-500 whitespace-nowrap align-top text-xs">
                    {formatDashboardDate(latestDate || undefined)}
                  </td>
                  {isDoctor && (
                    <td className="px-2 py-2 align-top text-right">
                      {pendingCount > 0 && (onReviewGroup || onReview) ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (onReviewGroup) {
                              onReviewGroup({
                                serviceRequest: (row.children[0]?.service_request || '').trim(),
                                groupLabel: row.label,
                                children: row.children,
                              })
                              return
                            }
                            if (firstPending && onReview) onReview(resolveDocName(firstPending))
                          }}
                          className="rounded border border-emerald-600 px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-50"
                          title="Review all pending tests in this group"
                        >
                          Review
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setExpanded((prev) => ({ ...prev, [row.key]: !prev[row.key] }))
                          }
                          className="rounded border border-slate-300 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
                        >
                          {isOpen ? 'Hide' : 'Show'}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
                {isOpen
                  ? row.children.map((child) => renderTestRow(child, { nested: true }))
                  : null}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
