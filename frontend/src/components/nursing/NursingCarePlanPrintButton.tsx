import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { ConfirmActionModal } from '../ui/ConfirmActionModal'
import { DateFilterInput } from '../ui/DateFilterInput'
import { toast } from '../../hooks/useToast'
import { fetchNursingCarePlanHtml } from '../../services/nursingCarePlan'
import { getPatientActiveAdmission } from '../../services/inpatientRecords'
import { useCareContext } from '../../providers/CareContextProvider'

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface NursingCarePlanPrintButtonProps {
  patient?: string
}

export function NursingCarePlanPrintButton({ patient }: NursingCarePlanPrintButtonProps) {
  const { activeAdmission, mode } = useCareContext()
  const [open, setOpen] = useState(false)
  const [reportDate, setReportDate] = useState(todayIso)
  const [admission, setAdmission] = useState(activeAdmission || '')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setReportDate(todayIso())
    if (activeAdmission) {
      setAdmission(activeAdmission)
      return
    }
    if (!patient) {
      setAdmission('')
      return
    }
    let cancelled = false
    void getPatientActiveAdmission(patient)
      .then((row) => {
        if (!cancelled) setAdmission(row?.name || '')
      })
      .catch(() => {
        if (!cancelled) setAdmission('')
      })
    return () => {
      cancelled = true
    }
  }, [open, patient, activeAdmission])

  const startPrint = () => {
    if (!patient) {
      toast.info('Select a patient to print the nursing care plan.')
      return
    }
    setOpen(true)
  }

  const confirm = async () => {
    if (!patient) {
      toast.info('Select a patient to print the nursing care plan.')
      return
    }
    if (!admission) {
      toast.info('Select an IP admission in the patient header (switch to IP and pick the admission).')
      return
    }
    if (!reportDate) {
      toast.info('Select a date.')
      return
    }
    setLoading(true)
    try {
      const html = await fetchNursingCarePlanHtml({
        patient,
        admission,
        date: reportDate,
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
        onClick={startPrint}
        disabled={!patient}
        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-slate-300 rounded-md hover:bg-slate-50 bg-white text-slate-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        title="Print Nursing Care Plan"
      >
        <FileText className="w-3.5 h-3.5" />
        PDF
      </button>

      <ConfirmActionModal
        open={open}
        title="Nursing Care Plan"
        subtitle="Print one day with Morning, Evening and Night rows."
        tone="primary"
        icon={<FileText className="h-5 w-5" />}
        loading={loading}
        confirmLabel={loading ? 'PDF…' : 'Print PDF'}
        onClose={() => setOpen(false)}
        onConfirm={() => void confirm()}
      >
        <div className="space-y-3">
          {mode !== 'IP' ? (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Switch the header to IP and select the admission number, then print.
            </p>
          ) : null}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Admission No.</label>
            <input
              type="text"
              value={admission}
              onChange={(e) => setAdmission(e.target.value)}
              placeholder="IP admission number"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Date</label>
            <DateFilterInput
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </div>
        </div>
      </ConfirmActionModal>
    </>
  )
}
