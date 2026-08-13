import type { NurseBriefingLabTest } from '../services/nurseBriefing'

export type LabBriefingDisplayRow<T extends NurseBriefingLabTest = NurseBriefingLabTest> =
  | {
      kind: 'group'
      key: string
      label: string
      tests: T[]
      representative: T
    }
  | { kind: 'standalone'; test: T }

export function labBriefingGroupKey(test: NurseBriefingLabTest): string | null {
  if (!Number(test.is_group_lab_test) || !test.service_request) return null
  const group = (test.lab_test_group || '').trim()
  return group ? `${test.service_request}::${group}` : test.service_request
}

export function labBriefingDisplayRows<T extends NurseBriefingLabTest>(
  labTests: T[]
): LabBriefingDisplayRow<T>[] {
  const groups = new Map<string, T[]>()
  const standalone: T[] = []

  for (const test of labTests) {
    const key = labBriefingGroupKey(test)
    if (!key) {
      standalone.push(test)
      continue
    }
    const arr = groups.get(key) || []
    arr.push(test)
    groups.set(key, arr)
  }

  const rows: LabBriefingDisplayRow<T>[] = []
  for (const [key, tests] of groups.entries()) {
    const representative = tests[0]
    rows.push({
      kind: 'group',
      key,
      label: representative.lab_test_group_name || representative.lab_test_group || 'Group',
      tests,
      representative,
    })
  }
  for (const test of standalone) {
    rows.push({ kind: 'standalone', test })
  }
  return rows
}

export function labBriefingChildPreview(tests: NurseBriefingLabTest[]): string {
  const names = tests
    .map((t) => t.lab_test_name || t.template)
    .filter((name): name is string => Boolean(name))
  if (!names.length) return ''
  const shown = names.slice(0, 3).join(', ')
  return names.length > 3 ? `${shown} +${names.length - 3}` : shown
}
