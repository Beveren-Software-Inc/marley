import type { LabTest } from '../services/labTests'
import { toast } from '../hooks/useToast'

type RuleMessage = { message?: string; short_message?: string; type?: string }

function filterFormulaWarnings(
  warnings: RuleMessage[],
  calculatedUpdates: LabTest['calculated_updates']
): RuleMessage[] {
  if (!calculatedUpdates?.length) return warnings
  return warnings.filter(
    (w) => w.type !== 'formula_missing_inputs' && w.type !== 'sum_validation_missing'
  )
}

function dedupeRuleMessages(messages: RuleMessage[]): RuleMessage[] {
  const seen = new Set<string>()
  const out: RuleMessage[] = []
  for (const msg of messages) {
    const key = (msg.short_message || msg.message || '').trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(msg)
  }
  return out
}

/** Show rule validation toasts after saving lab results (one toast set per save action). */
export function showLabTestRuleFeedback(res: LabTest) {
  const calculatedUpdates = res.calculated_updates || []
  const warnings = dedupeRuleMessages(
    filterFormulaWarnings(res.rule_warnings || [], calculatedUpdates)
  )

  for (const err of dedupeRuleMessages(res.rule_errors || [])) {
    const text = (err as RuleMessage).short_message || err?.message || ''
    if (text) toast.error(text.split('\n\n')[0] || text)
  }
  for (const warn of warnings) {
    const text = warn.short_message || warn.message || ''
    if (text) toast.warning(text.split('\n\n')[0] || text)
  }
  for (const upd of calculatedUpdates) {
    if (upd.custom_result && upd.lab_test_name) {
      toast.success(`${upd.lab_test_name} calculated: ${upd.custom_result}`)
    }
  }
}
