import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { LabTest } from '../../services/labTests'
import { StatusPill } from '../ui/StatusPill'
import { stripHtmlToText } from '../ui/dashboardCardListing'
import {
  displayResultFlag,
  labTestResultPreview,
  resultFlagBadgeClass,
} from './labTestReviewUtils'

const statusColors: Record<string, string> = {
  Draft: 'default',
  'Pending Review': 'warning',
  Reviewed: 'success',
  Rejected: 'danger',
  Submitted: 'info',
  Completed: 'success',
}

type NestedResultRow = {
  key: string
  name: string
  value: string
  flag?: string
  range?: string
}

function nestedRowsForTest(test: LabTest): NestedResultRow[] {
  const items = test.normal_test_items || []
  if (items.length > 1) {
    return items.map((item, i) => ({
      key: `${test.name}-n-${i}`,
      name: (item.lab_test_event || item.lab_test_name || '').trim() || '—',
      value: (item.result_value || '').trim() || '—',
      flag: (item.result_status || '').trim(),
      range: (item.normal_range || '').trim(),
    }))
  }

  const lines = (test.lab_test_lines || []).filter(
    (line) => (line.lab_result_value || '').trim() || (line.lab_sub_num || '').trim()
  )
  if (lines.length > 1) {
    return lines.map((line, i) => ({
      key: `${test.name}-l-${line.sr_num || i}`,
      name:
        (line.lab_sub_template_name || '').trim() ||
        (line.lab_sub_num || '').trim() ||
        (line.group_name || '').trim() ||
        '—',
      value: (line.lab_result_value || '').trim() || '—',
      range: (line.normal_range || '').trim(),
    }))
  }

  return []
}

function flatResultForTest(test: LabTest): string {
  const items = test.normal_test_items || []
  if (items.length === 1) {
    const value = (items[0].result_value || '').trim()
    if (value) return value
  }

  const lines = (test.lab_test_lines || []).filter((line) => (line.lab_result_value || '').trim())
  if (lines.length === 1) {
    const value = (lines[0].lab_result_value || '').trim()
    if (value) return value
  }

  if (typeof test.custom_result === 'string' && test.custom_result.includes('<')) {
    return stripHtmlToText(test.custom_result)
  }

  const preview = labTestResultPreview(test)
  return preview === '—' ? '' : preview
}

function FlagBadge({ flag }: { flag?: string | null }) {
  const label = displayResultFlag({ result_flag: flag } as LabTest) || (flag || '').trim()
  if (!label) return <span className="text-slate-300">—</span>
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${resultFlagBadgeClass(
        flag || label
      )}`}
    >
      {label}
    </span>
  )
}

export function LabTestReviewResultsPanel({ tests }: { tests: LabTest[] }) {
  const [open, setOpen] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    if (tests.length !== 1) return {}
    const only = tests[0]
    return nestedRowsForTest(only).length ? { [only.name]: true } : {}
  })

  const rows = useMemo(
    () =>
      tests.map((test) => ({
        test,
        nested: nestedRowsForTest(test),
      })),
    [tests]
  )

  if (!rows.length) return null

  const title =
    rows.length === 1
      ? 'Results'
      : `Results · ${rows.length} test${rows.length === 1 ? '' : 's'}`

  return (
    <div className="overflow-hidden rounded-xl border border-emerald-200/80 bg-white/80 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition hover:bg-emerald-50/70"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-emerald-950">{title}</span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
          {open ? 'Hide' : 'Show'}
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
          />
        </span>
      </button>

      {open ? (
        <div className="overflow-y-auto border-t border-emerald-100" style={{ scrollbarWidth: 'thin' }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-emerald-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Test</th>
                <th className="px-3 py-2 text-left">Result</th>
                <th className="px-3 py-2 text-left">Flag</th>
                {rows.length > 1 ? <th className="px-3 py-2 text-left">Status</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ test, nested }) => {
                const isExpanded = !!expanded[test.name]
                const label = test.lab_test_name || test.template || test.name
                const value = nested.length > 0 ? '' : flatResultForTest(test)
                return (
                  <Fragment key={test.name}>
                    <tr className="align-top">
                      <td className="px-3 py-2 font-medium text-slate-800">
                        <div className="flex items-start gap-1">
                          {nested.length > 1 ? (
                            <button
                              type="button"
                              className="mt-0.5 rounded p-0.5 text-slate-500 hover:bg-slate-100"
                              onClick={() =>
                                setExpanded((prev) => ({ ...prev, [test.name]: !prev[test.name] }))
                              }
                              aria-label={isExpanded ? `Collapse ${label}` : `Expand ${label}`}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                            </button>
                          ) : null}
                          <span>
                            {label}
                            {nested.length > 1 ? (
                              <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                                {nested.length}
                              </span>
                            ) : null}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {nested.length > 1 ? (
                          <span className="text-xs italic text-slate-400">
                            {isExpanded ? 'See details below' : `${nested.length} values`}
                          </span>
                        ) : value ? (
                          <span className="whitespace-pre-wrap">{value}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <FlagBadge flag={test.result_flag} />
                      </td>
                      {rows.length > 1 ? (
                        <td className="px-3 py-2">
                          <StatusPill
                            status={test.status || 'Draft'}
                            color={statusColors[test.status || 'Draft'] || 'default'}
                          />
                        </td>
                      ) : null}
                    </tr>
                    {isExpanded && nested.length > 1
                      ? nested.map((row) => (
                          <tr key={row.key} className="bg-slate-50/70">
                            <td className="px-3 py-1.5 pl-9 text-slate-600">{row.name}</td>
                            <td className="px-3 py-1.5 font-medium text-slate-800">
                              {row.value}
                              {row.range ? (
                                <span className="ml-2 text-xs font-normal text-slate-400">
                                  {row.range}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-1.5">
                              <FlagBadge flag={row.flag} />
                            </td>
                            {rows.length > 1 ? (
                              <td className="px-3 py-1.5 text-xs text-slate-400">
                                {row.range || ''}
                              </td>
                            ) : null}
                          </tr>
                        ))
                      : null}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
