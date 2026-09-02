/** Space-insensitive match: "T.Bilirubin" == "T. Bilirubin". */
export function labResultNameKey(value: string | undefined | null): string {
  return (value || '').replace(/\s+/g, '').toLowerCase()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function formulaNameVariants(name: string): string[] {
  const raw = name.trim()
  if (!raw) return []
  const variants = [raw]
  const nospace = raw.replace(/\s+/g, '')
  if (nospace && !variants.includes(nospace)) variants.push(nospace)
  const dotted = raw.replace(/\.(?=\S)/g, '. ')
  if (dotted && !variants.includes(dotted)) variants.push(dotted)
  return variants
}

const PATIENT_FORMULA_TOKENS = ['@Age', '@Kappa', '@Alpha'] as const

/** Parse display age strings like "50 Years" into whole years. */
export function parsePatientAgeYears(age?: string | null): number | null {
  const text = (age || '').trim()
  if (!text) return null
  const match = text.match(/(\d+(?:\.\d+)?)/)
  if (!match) return null
  const n = Number(match[1])
  return Number.isFinite(n) ? n : null
}

/** CKD-EPI sex constants for formula preview (@Kappa, @Alpha, @Age). */
export function buildPatientFormulaContext(
  sex?: string | null,
  age?: string | null,
): Record<string, number> {
  const ctx: Record<string, number> = {}
  const sexNorm = (sex || '').trim().toLowerCase()
  const isFemale = sexNorm === 'female' || sexNorm === 'f'
  ctx['@Kappa'] = isFemale ? 0.7 : 0.9
  ctx['@Alpha'] = isFemale ? -0.241 : -0.302
  const ageYears = parsePatientAgeYears(age)
  if (ageYears != null) ctx['@Age'] = ageYears
  return ctx
}

function substitutePatientFormulaTokens(
  text: string,
  patientContext: Record<string, number>,
): string | null {
  let out = text
  for (const token of PATIENT_FORMULA_TOKENS) {
    if (!out.includes(token)) continue
    const val = patientContext[token]
    if (val == null || Number.isNaN(val)) return null
    out = out.split(token).join(`(${val})`)
  }
  return out
}

function formulaHasUnresolvedIdentifiers(text: string): boolean {
  let scrubbed = text.replace(/\bmin\s*\(/gi, '(').replace(/\bmax\s*\(/gi, '(')
  scrubbed = scrubbed.replace(/\bMath\b/g, '')
  return /[a-zA-Z_]/.test(scrubbed)
}

/** Evaluate a lab result formula like `T.Bilirubin - D. Bilirubin`. */
export function evaluateLabResultFormula(
  formula: string,
  values: Record<string, number>,
  patientContext?: Record<string, number>,
): number | null {
  let text = (formula || '').trim()
  if (!text) return null

  if (patientContext && Object.keys(patientContext).length) {
    const withPatient = substitutePatientFormulaTokens(text, patientContext)
    if (withPatient == null) return null
    text = withPatient
  }

  const names = Object.keys(values).sort((a, b) => b.length - a.length)
  for (const name of names) {
    const val = values[name]
    if (val == null || Number.isNaN(val)) continue
    for (const variant of formulaNameVariants(name)) {
      const re = new RegExp(`(?<![\\w./@-])${escapeRegExp(variant)}(?![\\w.-])`, 'gi')
      if (!re.test(text)) continue
      text = text.replace(
        new RegExp(`(?<![\\w./@-])${escapeRegExp(variant)}(?![\\w.-])`, 'gi'),
        `(${val})`,
      )
      break
    }
  }

  text = text.replace(/\bmin\s*\(/gi, 'Math.min(').replace(/\bmax\s*\(/gi, 'Math.max(')
  if (formulaHasUnresolvedIdentifiers(text)) return null

  try {
    const n = Function(`"use strict"; return (${text})`)()
    if (typeof n !== 'number' || !Number.isFinite(n)) return null
    return n
  } catch {
    return null
  }
}

export function formatLabResultFormulaValue(value: number): string {
  const rounded = Math.round(value * 100) / 100
  if (rounded === Math.trunc(rounded)) return String(Math.trunc(rounded))
  return String(rounded)
}
