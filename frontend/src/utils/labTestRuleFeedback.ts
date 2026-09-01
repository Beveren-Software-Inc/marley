import type { LabTest } from '../services/labTests'
import { toast } from '../hooks/useToast'

type RuleMessage = {
  message?: string
  short_message?: string
  type?: string
  title?: string
}

const PANEL_LEVEL_RULE_PATTERNS = [
  /differential total/i,
  /differential counts for this panel/i,
]

/** Panel sum rules apply to the whole group, not the single row being saved. */
export function isPanelLevelRuleMessage(message: string, type?: string): boolean {
  if (type === 'sum_validation' || type === 'sum_validation_config') return true
  const text = message.trim()
  return PANEL_LEVEL_RULE_PATTERNS.some((pattern) => pattern.test(text))
}

export function formatLabResultSaveError(
  labTest: { lab_test_name?: string; name: string },
  message: string,
): string {
  const text = message.trim()
  if (!text) return text
  if (isPanelLevelRuleMessage(text)) return text
  const label = (labTest.lab_test_name || labTest.name).trim()
  return label ? `${label}: ${text}` : text
}

function ruleToastText(msg: RuleMessage): string {
  const text = (msg.short_message || msg.message || '').trim()
  return text.split('\n\n')[0] || text
}

function filterFormulaWarnings(warnings: RuleMessage[]): RuleMessage[] {
  return warnings.filter((w) => {
    if (w.type === 'formula_missing_inputs' || w.type === 'sum_validation_missing') return false
    const text = (w.short_message || w.message || '').trim()
    if (/could not calculate/i.test(text)) return false
    return true
  })
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
  const warnings = dedupeRuleMessages(filterFormulaWarnings(res.rule_warnings || []))

  for (const err of dedupeRuleMessages(res.rule_errors || [])) {
    const text = ruleToastText(err as RuleMessage)
    if (text) toast.error(text)
  }
  for (const warn of warnings) {
    const text = ruleToastText(warn)
    if (text) toast.warning(text)
  }
  for (const upd of calculatedUpdates) {
    if (upd.custom_result && upd.lab_test_name) {
      toast.success(`${upd.lab_test_name} calculated: ${upd.custom_result}`)
    }
  }
}
