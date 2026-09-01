import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { ConfirmActionModal } from '../ui/ConfirmActionModal'
import { toast } from '../../hooks/useToast'
import { fetchHealthcarePractitioners, type LinkFieldOption } from '../../services/common'
import { fetchECTChartHtml } from '../../services/ectChartPrint'
import { useCareContext } from '../../providers/CareContextProvider'

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface ECTChartPrintButtonProps {
  patient?: string
}

export function ECTChartPrintButton({ patient }: ECTChartPrintButtonProps) {
  const { userCostCenter } = useCareContext()
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(currentMonth)
  const [anaesthetist, setAnaesthetist] = useState('')
  const [anaesthetistLabel, setAnaesthetistLabel] = useState('')
  const [anaesthetistQuery, setAnaesthetistQuery] = useState('')
  const [anaesthetistOpen, setAnaesthetistOpen] = useState(false)
  const [anaesthetistOptions, setAnaesthetistOptions] = useState<LinkFieldOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setMonth(currentMonth())
  }, [open])

  useEffect(() => {
    if (!open || !anaesthetistOpen) return
    let cancelled = false
    const t = window.setTimeout(() => {
      void fetchHealthcarePractitioners(anaesthetistQuery.trim() || undefined)
        .then((opts) => {
          if (!cancelled) setAnaesthetistOptions(opts)
        })
        .catch(() => {
          if (!cancelled) setAnaesthetistOptions([])
        })
    }, anaesthetistQuery.trim() ? 250 : 0)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [open, anaesthetistOpen, anaesthetistQuery])

  const confirm = async () => {
    if (!month) {
      toast.info('Select a month.')
      return
    }
    setLoading(true)
    try {
      const html = await fetchECTChartHtml({
        patient,
        month,
        anaesthetist: anaesthetist || undefined,
        costCenter: userCostCenter || undefined,
      })
      const win = window.open('', '_blank', 'width=1200,height=800')
      if (!win) {
        toast.error('Pop-up blocked. Allow pop-ups to download the PDF.')
        return
      }
      win.document.open()
      win.document.write(html)
      win.document.close()
      win.focus()
      setOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to export PDF')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-slate-300 rounded-md hover:bg-white bg-white/80 text-slate-700 font-medium"
        title="Print ECT Chart"
      >
        <FileText className="w-3.5 h-3.5" />
        PDF
      </button>

      <ConfirmActionModal
        open={open}
        title="ECT Chart"
        subtitle="Print a monthly summary of ECT Details."
        tone="primary"
        icon={<FileText className="h-5 w-5" />}
        loading={loading}
        confirmLabel={loading ? 'PDF…' : 'Print PDF'}
        onClose={() => setOpen(false)}
        onConfirm={() => void confirm()}
      >
        <div className="space-y-3">
          {patient ? (
            <p className="text-xs text-slate-600">
              Printing ECT Details for the selected patient. Clear the patient in the header to print all patients for the month.
            </p>
          ) : (
            <p className="text-xs text-slate-600">
              Printing all ECT Details for the month. Select a patient in the header to print one patient only.
            </p>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Month</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div className="relative">
            <label className="mb-1 block text-xs font-medium text-slate-600">Anaesthetist Doc</label>
            <input
              type="text"
              value={anaesthetistOpen ? anaesthetistQuery : anaesthetistLabel}
              onChange={(e) => {
                setAnaesthetistQuery(e.target.value)
                setAnaesthetistOpen(true)
                if (!e.target.value) {
                  setAnaesthetist('')
                  setAnaesthetistLabel('')
                }
              }}
              onFocus={() => {
                setAnaesthetistOpen(true)
                setAnaesthetistQuery(anaesthetistLabel)
              }}
              onBlur={() => window.setTimeout(() => setAnaesthetistOpen(false), 180)}
              placeholder="Optional"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            />
            {anaesthetistOpen && anaesthetistOptions.length > 0 ? (
              <div className="absolute z-20 mt-1 max-h-44 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
                {anaesthetistOptions.map((opt) => (
                  <button
                    key={opt.name}
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setAnaesthetist(opt.name)
                      setAnaesthetistLabel(opt.label || opt.practitioner_name || opt.name)
                      setAnaesthetistQuery('')
                      setAnaesthetistOpen(false)
                    }}
                  >
                    {opt.label || opt.practitioner_name || opt.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </ConfirmActionModal>
    </>
  )
}
