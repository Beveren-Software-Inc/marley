import { useState } from 'react'
import { Download } from 'lucide-react'
import { DateFilterInput } from '../ui/DateFilterInput'
import { fetchLabResultAssessmentHtml, fetchLabTestSummaryHtml } from '../../services/labTests'
import { toast } from '../../hooks/useToast'
import { useCareContext } from '../../providers/CareContextProvider'

type LabReportTab = 'assessment' | 'summary'

function currentMonthRange(): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const last = String(new Date(y, now.getMonth() + 1, 0).getDate()).padStart(2, '0')
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${last}` }
}

const TABS: { id: LabReportTab; label: string }[] = [
  { id: 'assessment', label: 'Lab Result Assessment' },
  { id: 'summary', label: 'Lab Test Summary' },
]

export function LabReportsView() {
  const { userCostCenter } = useCareContext()
  const month = currentMonthRange()
  const [tab, setTab] = useState<LabReportTab>('assessment')
  const [fromDate, setFromDate] = useState(month.from)
  const [toDate, setToDate] = useState(month.to)
  const [exporting, setExporting] = useState(false)

  const downloadPdf = async () => {
    if (!fromDate || !toDate) {
      toast.error('Select From Date and To Date')
      return
    }
    if (toDate < fromDate) {
      toast.error('To Date cannot be before From Date')
      return
    }
    setExporting(true)
    try {
      const opts = {
        dateFrom: fromDate,
        dateTo: toDate,
        costCenter: userCostCenter || undefined,
      }
      const html =
        tab === 'assessment'
          ? await fetchLabResultAssessmentHtml(opts)
          : await fetchLabTestSummaryHtml(opts)
      const win = window.open('', '_blank', 'width=1400,height=900')
      if (!win) {
        toast.error('Pop-up blocked. Allow pop-ups to download the PDF.')
        return
      }
      win.document.open()
      win.document.write(html)
      win.document.close()
      win.focus()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to export report')
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium border transition-colors ${
              tab === id
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="mb-4 text-sm text-slate-600">
        {tab === 'assessment'
          ? 'Detailed lab result assessment listing with transaction, patient, and workflow dates.'
          : 'Summary of lab tests by template with OP / IP counts and amounts for the selected period.'}
      </p>

      <div className="card-filter-bar flex flex-wrap items-end gap-3 mb-4 px-1 py-2 border-b border-slate-100 bg-slate-50/80 rounded-md">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">From Date</label>
          <DateFilterInput
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white w-40"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">To Date</label>
          <DateFilterInput
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white w-40"
          />
        </div>
        <button
          type="button"
          onClick={() => void downloadPdf()}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {exporting ? 'Preparing…' : 'Download PDF'}
        </button>
      </div>
    </section>
  )
}
