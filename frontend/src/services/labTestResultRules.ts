import { type NormalTestResultRow } from './labTests'

export interface LabTestResultRuleEvent {
  lab_test_event: string
  aliases?: string
}

export interface LabTestResultRuleLine {
  rule_type: 'Formula' | 'Ratio'
  target_event: string
  formula?: string
  source_events?: string
  numerator_event?: string
  denominator_event?: string
  readonly?: boolean
}

export interface LabTestResultRulesConfig {
  name?: string
  lab_test_template?: string
  enabled?: boolean
  sum_events?: LabTestResultRuleEvent[]
  sum_target?: number
  sum_tolerance?: number
  sum_block_save?: boolean
  rule_lines?: LabTestResultRuleLine[]
}

export interface LabTestResultRuleMessage {
  type?: string
  message: string
  ok?: boolean
  block_save?: boolean
}

export interface ApplyLabTestResultRulesResult {
  items: NormalTestResultRow[]
  warnings: LabTestResultRuleMessage[]
  errors: LabTestResultRuleMessage[]
  readonly_events: string[]
}

export async function fetchLabTestResultRules(
  template: string,
  serviceRequest?: string | null,
): Promise<LabTestResultRulesConfig | null> {
  const params = new URLSearchParams({ template })
  if (serviceRequest) params.set('service_request', serviceRequest)
  const res = await fetch(
    `/api/method/healthcare.api.lab_test_result_rules.get_lab_test_result_rules?${params.toString()}`
  )
  const data = await res.json()
  const message = data?.message
  if (!message || !Object.keys(message).length) return null
  return message as LabTestResultRulesConfig
}

export async function applyLabTestResultRules(
  template: string,
  items: NormalTestResultRow[],
  serviceRequest?: string | null,
  labTestGroup?: string | null
): Promise<ApplyLabTestResultRulesResult> {
  const { apiRequest } = await import('./apiClient')
  return apiRequest<ApplyLabTestResultRulesResult>(
    '/api/method/healthcare.api.lab_test_result_rules.apply_lab_test_result_rules',
    {
      method: 'POST',
      body: JSON.stringify({
        template,
        normal_test_items: items,
        service_request: serviceRequest || undefined,
        lab_test_group: labTestGroup || undefined,
      }),
    }
  )
}
