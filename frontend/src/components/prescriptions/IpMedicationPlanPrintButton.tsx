import { useState } from 'react'
import { Download } from 'lucide-react'
import { useCareContext } from '../../providers/CareContextProvider'
import { fetchIpMedicationPlanHtml } from '../../services/prescriptions'
import { toast } from '../../hooks/useToast'

type Props = {
  className?: string
  admission?: string | null
  disabled?: boolean
}

export function IpMedicationPlanPrintButton({
  className = 'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40',
  admission,
  disabled,
}: Props) {
  const { mode, activeAdmission } = useCareContext()
  const [printing, setPrinting] = useState(false)
  const admissionId = (admission || activeAdmission || '').trim()
  const isIp = mode === 'IP' && !!admissionId
  const isDisabled = disabled || printing || !isIp

  const printPlan = async () => {
    if (!admissionId) {
      toast.error('Select an inpatient admission first')
      return
    }
    setPrinting(true)
    try {
      const html = await fetchIpMedicationPlanHtml({ inpatientRecord: admissionId })
      const win = window.open('', '_blank', 'width=1200,height=900')
      if (!win) {
        toast.error('Pop-up blocked. Allow pop-ups to print the PDF.')
        return
      }
      win.document.open()
      win.document.write(html)
      win.document.close()
      win.focus()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to print medication plan')
    } finally {
      setPrinting(false)
    }
  }

  if (!isIp && !admission) return null

  return (
    <button
      type="button"
      onClick={() => void printPlan()}
      disabled={isDisabled}
      className={className}
      title="Print IP Patient Medication Plan"
      aria-label="Print IP Patient Medication Plan"
    >
      <Download className="h-3.5 w-3.5" strokeWidth={2.25} />
    </button>
  )
}
