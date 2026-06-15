import { CheckCircle2, AlertCircle } from 'lucide-react'
import {
  canSubmitDischargeWithChecklist,
  isChecklistRowComplete,
  isFinanceChecklistItem,
  summarizeDischargeChecklistStatus,
} from '../../utils/dischargeChecklistStatus'

export type ChecklistStatusRow = {
  action_required?: string
  click?: boolean | number | null
}

function incompleteTaskLabels(rows: ChecklistStatusRow[] | undefined, excludeFinance = true): string[] {
  return (rows ?? [])
    .filter((row) => !isChecklistRowComplete(row.click))
    .filter((row) => !excludeFinance || !isFinanceChecklistItem(row.action_required))
    .map((row) => (row.action_required || '').trim() || 'Task')
}

interface DischargeChecklistStatusCardProps {
  dischargeChecklist: ChecklistStatusRow[]
  nursingChecklist: ChecklistStatusRow[]
  loading?: boolean
  className?: string
}

export function DischargeChecklistStatusCard({
  dischargeChecklist,
  nursingChecklist,
  loading = false,
  className = '',
}: DischargeChecklistStatusCardProps) {
  const dischargeSummary = summarizeDischargeChecklistStatus(dischargeChecklist)
  const dischargeIncompleteTasks = incompleteTaskLabels(dischargeChecklist)
  const nursingTotal = nursingChecklist.length
  const nursingCompleted = nursingChecklist.filter((row) => isChecklistRowComplete(row.click)).length
  const nursingComplete = nursingTotal > 0 && nursingCompleted === nursingTotal
  const nursingIncompleteTasks = incompleteTaskLabels(nursingChecklist, false)
  const canProceed =
    canSubmitDischargeWithChecklist(dischargeChecklist) &&
    (nursingTotal === 0 || nursingComplete)

  if (loading) {
    return (
      <div className={`rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 ${className}`}>
        Loading checklist status…
      </div>
    )
  }

  return (
    <div className={`rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4 ${className}`}>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Checklist status</h4>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-600">Discharge checklist</p>
        {dischargeSummary.checklist_status === 'none' ? (
          <p className="text-sm text-slate-500">Not started</p>
        ) : dischargeSummary.checklist_status === 'complete' ? (
          <p className="text-sm font-medium text-green-700">Discharge checklist complete</p>
        ) : dischargeSummary.checklist_status === 'finance_pending' ? (
          <p className="text-sm font-medium text-amber-700">Discharge checklist complete (finance pending)</p>
        ) : (
          <div>
            <p className="text-sm font-medium text-red-700">Discharge checklist incomplete</p>
            {dischargeIncompleteTasks.length > 0 ? (
              <ul className="mt-1.5 space-y-1 text-xs text-slate-600">
                {dischargeIncompleteTasks.map((task) => (
                  <li key={task} className="flex items-start gap-1.5">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-red-400" />
                    <span>{task}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-slate-200 pt-3">
        <p className="text-xs font-semibold text-slate-600">Nursing checklist</p>
        {nursingTotal === 0 ? (
          <p className="text-sm text-slate-500">Not started</p>
        ) : nursingComplete ? (
          <p className="text-sm font-medium text-green-700">Nursing checklist complete</p>
        ) : (
          <div>
            <p className="text-sm font-medium text-amber-700">Nursing checklist incomplete</p>
            {nursingIncompleteTasks.length > 0 ? (
              <ul className="mt-1.5 space-y-1 text-xs text-slate-600">
                {nursingIncompleteTasks.slice(0, 5).map((task) => (
                  <li key={task} className="flex items-start gap-1.5">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                    <span>{task}</span>
                  </li>
                ))}
                {nursingIncompleteTasks.length > 5 ? (
                  <li className="text-slate-400">+{nursingIncompleteTasks.length - 5} more</li>
                ) : null}
              </ul>
            ) : null}
          </div>
        )}
      </div>

      {canProceed ? (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2} />
          Go ahead
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={2} />
          Complete checklists before discharge
        </div>
      )}
    </div>
  )
}
