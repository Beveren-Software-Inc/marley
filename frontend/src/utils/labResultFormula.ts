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

/** Evaluate a lab result formula like `T.Bilirubin - D. Bilirubin`. */
export function evaluateLabResultFormula(
  formula: string,
  values: Record<string, number>
): number | null {
  let text = (formula || '').trim()
  if (!text) return null
  const names = Object.keys(values).sort((a, b) => b.length - a.length)
  for (const name of names) {
    const val = values[name]
    if (val == null || Number.isNaN(val)) continue
    for (const variant of formulaNameVariants(name)) {
      const re = new RegExp(`(?<![\\w./-])${escapeRegExp(variant)}(?![\\w./-])`, 'gi')
      if (!re.test(text)) continue
      text = text.replace(
        new RegExp(`(?<![\\w./-])${escapeRegExp(variant)}(?![\\w./-])`, 'gi'),
        `(${val})`
      )
      break
    }
  }
  if (/[a-zA-Z_]/.test(text)) return null
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
