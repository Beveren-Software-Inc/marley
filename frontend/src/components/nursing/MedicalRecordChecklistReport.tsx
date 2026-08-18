import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileDown, FileText } from 'lucide-react'
import { DateFilterInput } from '../ui/DateFilterInput'
import { toast } from '../../hooks/useToast'
import { useAuth } from '../../providers/AuthProvider'
import { useCareContext } from '../../providers/CareContextProvider'
import {
  fetchMedicalRecordChecklist,
  type MedicalRecordChecklistReport,
} from '../../services/medicalRecordChecklist'
import sereneLogo from '../../assets/serene-logo.png'

function toInputDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDisplayDate(iso?: string | null): string {
  if (!iso) return ''
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

function csvEscape(value: string | number | boolean): string {
  const s = String(value ?? '')
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function htmlEscape(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const HEADER_GREEN = '#548235'
const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white'

function Mark({ done }: { done: boolean }) {
  return done ? (
    <span className="font-bold text-slate-900">✓</span>
  ) : (
    <span className="font-bold text-red-600">X</span>
  )
}

export function MedicalRecordChecklistReport() {
  const { userCostCenter } = useCareContext()
  const { user } = useAuth()
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date()
    return toInputDate(new Date(d.getFullYear(), d.getMonth(), 1))
  })
  const [toDate, setToDate] = useState(() => toInputDate(new Date()))
  const [reportedTo, setReportedTo] = useState('')
  const [includeDischargeStarted, setIncludeDischargeStarted] = useState(false)
  const [data, setData] = useState<MedicalRecordChecklistReport | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const report = await fetchMedicalRecordChecklist({
        fromDate,
        toDate,
        costCenter: userCostCenter,
        includeDischargeStarted,
      })
      setData(report)
    } catch (err) {
      setData(null)
      toast.error(err instanceof Error ? err.message : 'Failed to load medical record checklist')
    } finally {
      setLoading(false)
    }
  }, [fromDate, toDate, userCostCenter, includeDischargeStarted])

  useEffect(() => {
    void load()
  }, [load])

  const preparedBy = data?.prepared_by || user?.full_name || user?.name || ''
  const branch = data?.branch || ''
  const titleRange = `${formatDisplayDate(fromDate)} to ${formatDisplayDate(toDate)}`
  const reportTitle = `Medical Record - Nursing Check List${branch ? ` ${branch}` : ''} ${titleRange}`
  const columns = data?.columns || []
  const rows = data?.rows || []

  const exportExcel = () => {
    if (!rows.length) {
      toast.info('No admitted patients to export.')
      return
    }
    const headers = ['S.No', 'Patient Name', 'File No', ...columns.map((c) => c.label), 'DOA', 'Remarks']
    const body = rows.map((row) => [
      row.sno,
      row.patient_name,
      row.file_no,
      ...columns.map((c) => (row.checks[c.key] ? 'Yes' : 'No')),
      row.doa,
      row.remarks,
    ])
    const csv = '\uFEFF' + [headers, ...body].map((r) => r.map(csvEscape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `medical-record-nursing-checklist-${fromDate || 'from'}-${toDate || 'to'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportPdf = () => {
    if (!rows.length) {
      toast.info('No admitted patients to print.')
      return
    }
    const win = window.open('', '_blank', 'width=1400,height=900')
    if (!win) {
      toast.error('Pop-up blocked. Allow pop-ups to download the PDF.')
      return
    }
    const checkHead = columns.map((c) => `<th>${htmlEscape(c.label)}</th>`).join('')
    const checkRows = rows
      .map((row) => {
        const marks = columns
          .map((c) => {
            const done = row.checks[c.key]
            return `<td class="mark ${done ? 'ok' : 'miss'}">${done ? '✓' : 'X'}</td>`
          })
          .join('')
        return `<tr>
          <td class="num">${row.sno}</td>
          <td class="name">${htmlEscape(row.patient_name)}</td>
          <td>${htmlEscape(row.file_no)}</td>
          ${marks}
        </tr>`
      })
      .join('')
    const remarkRows = rows
      .map(
        (row) => `<tr>
          <td class="num miss">${row.sno}</td>
          <td class="name">${htmlEscape(row.patient_name)}</td>
          <td>${htmlEscape(row.doa)}</td>
          <td>${htmlEscape(row.remarks)}</td>
        </tr>`
      )
      .join('')
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${reportTitle}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 12px; }
    .header { display: flex; align-items: center; gap: 16px; margin-bottom: 10px; }
    .header img { height: 56px; }
    h1 { flex: 1; text-align: center; font-size: 16px; margin: 0 48px 0 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; table-layout: auto; }
    th, td { border: 1px solid #333; padding: 3px 4px; font-size: 9px; text-align: center; vertical-align: middle; }
    th { background: ${HEADER_GREEN}; color: #fff; font-weight: 700; white-space: nowrap; }
    td.name, th.name { text-align: left; white-space: nowrap; }
    td.num { font-weight: 700; }
    td.mark.ok { font-weight: 700; }
    td.mark.miss, td.miss { color: #c00; font-weight: 700; }
    .footer { display: flex; gap: 48px; margin-top: 18px; font-size: 12px; font-weight: 700; }
    .footer span { border-bottom: 1px solid #333; min-width: 160px; display: inline-block; margin-left: 8px; font-weight: 500; }
  </style>
</head>
<body>
  <div class="header">
    <img src="${sereneLogo}" alt="SERENE Psychiatry Hospital" />
    <h1>${htmlEscape(reportTitle)}</h1>
  </div>
  <table>
    <thead>
      <tr>
        <th>S.NO</th>
        <th class="name">PATIENT NAME</th>
        <th>FILE NO</th>
        ${checkHead}
      </tr>
    </thead>
    <tbody>${checkRows}</tbody>
  </table>
  <table>
    <thead>
      <tr>
        <th>S.NO</th>
        <th class="name">PATIENT NAME</th>
        <th>DOA</th>
        <th>REMARKS</th>
      </tr>
    </thead>
    <tbody>${remarkRows}</tbody>
  </table>
  <div class="footer">
    <div>PREPARED BY: <span>${htmlEscape(preparedBy)}</span></div>
    <div>REPORTED TO: <span>${htmlEscape(reportedTo)}</span></div>
  </div>
  <script>window.onload = function () { window.print(); }<\/script>
</body>
</html>`)
    win.document.close()
  }

  const dateLabel = useMemo(() => titleRange, [titleRange])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3 flex-shrink-0">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">From Date</label>
          <DateFilterInput
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className={`${inputClass} w-40`}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">To Date</label>
          <DateFilterInput
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className={`${inputClass} w-40`}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Reported To</label>
          <input
            type="text"
            value={reportedTo}
            onChange={(e) => setReportedTo(e.target.value)}
            placeholder="Optional"
            className={`${inputClass} w-48`}
          />
        </div>
        <label className="flex h-[38px] items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={includeDischargeStarted}
            onChange={(e) => setIncludeDischargeStarted(e.target.checked)}
            className="h-4 w-4"
          />
          Include discharge started
        </label>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="h-[38px] rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <button
          type="button"
          onClick={exportPdf}
          disabled={loading || !rows.length}
          className="inline-flex h-[38px] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          title="Download PDF"
        >
          <FileText className="h-3.5 w-3.5" />
          PDF
        </button>
        <button
          type="button"
          onClick={exportExcel}
          disabled={loading || !rows.length}
          className="inline-flex h-[38px] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          title="Download Excel (CSV)"
        >
          <FileDown className="h-3.5 w-3.5" />
          Excel
        </button>
      </div>

      <p className="text-xs text-slate-500 flex-shrink-0">
        Active admitted patients only. Patients with a started discharge are hidden unless
        “Include discharge started” is ticked.
      </p>

      {loading && !data ? (
        <p className="py-10 text-center text-sm text-slate-500">Loading medical record checklist…</p>
      ) : !rows.length ? (
        <p className="py-10 text-center text-sm text-slate-500">
          No active admitted patients found for this branch.
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-200 bg-white p-3">
          <div className="mb-3 flex items-center gap-4">
            <img src={sereneLogo} alt="SERENE Psychiatry Hospital" className="h-12 w-auto" />
            <h2 className="flex-1 text-center text-base font-bold text-slate-900">
              Medical Record - Nursing Check List{branch ? ` ${branch}` : ''} {dateLabel}
            </h2>
          </div>

          <table className="mb-4 w-full border-collapse text-[10px]">
            <thead>
              <tr>
                <th className="border border-slate-700 px-1 py-1 text-white" style={{ background: HEADER_GREEN }}>
                  S.NO
                </th>
                <th
                  className="border border-slate-700 px-1.5 py-1 text-left text-white whitespace-nowrap"
                  style={{ background: HEADER_GREEN }}
                >
                  PATIENT NAME
                </th>
                <th className="border border-slate-700 px-1 py-1 text-white whitespace-nowrap" style={{ background: HEADER_GREEN }}>
                  FILE NO
                </th>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="border border-slate-700 px-1 py-1 text-white whitespace-nowrap"
                    style={{ background: HEADER_GREEN }}
                  >
                    {col.label.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.admission}>
                  <td className="border border-slate-400 px-1 py-1 text-center font-semibold">{row.sno}</td>
                  <td className="border border-slate-400 px-1.5 py-1 whitespace-nowrap font-medium">{row.patient_name}</td>
                  <td className="border border-slate-400 px-1 py-1 text-center whitespace-nowrap">{row.file_no}</td>
                  {columns.map((col) => (
                    <td key={col.key} className="border border-slate-400 px-1 py-1 text-center">
                      <Mark done={!!row.checks[col.key]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <table className="mb-4 w-full border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="border border-slate-700 px-1 py-1 text-white" style={{ background: HEADER_GREEN }}>
                  S.NO
                </th>
                <th
                  className="border border-slate-700 px-1.5 py-1 text-left text-white"
                  style={{ background: HEADER_GREEN }}
                >
                  PATIENT NAME
                </th>
                <th className="border border-slate-700 px-1 py-1 text-white" style={{ background: HEADER_GREEN }}>
                  DOA
                </th>
                <th
                  className="border border-slate-700 px-1.5 py-1 text-left text-white"
                  style={{ background: HEADER_GREEN }}
                >
                  REMARKS
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.admission}-remarks`}>
                  <td className="border border-slate-400 px-1 py-1 text-center font-semibold text-red-600">{row.sno}</td>
                  <td className="border border-slate-400 px-1.5 py-1 whitespace-nowrap">{row.patient_name}</td>
                  <td className="border border-slate-400 px-1 py-1 text-center whitespace-nowrap">{row.doa}</td>
                  <td className="border border-slate-400 px-1.5 py-1">{row.remarks}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex flex-wrap gap-10 text-sm font-semibold text-slate-800">
            <div>
              PREPARED BY: <span className="ml-2 font-medium underline decoration-slate-400">{preparedBy || '—'}</span>
            </div>
            <div>
              REPORTED TO:{' '}
              <span className="ml-2 font-medium underline decoration-slate-400">{reportedTo || '—'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
