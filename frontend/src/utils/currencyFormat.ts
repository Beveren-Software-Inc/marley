/**
 * ISO 4217 currencies that use three fraction digits (e.g. BHD fils, KWD).
 * Others default to two decimals.
 */
const THREE_DECIMAL_CURRENCIES = new Set([
  'BHD',
  'IQD',
  'JOD',
  'KWD',
  'LYD',
  'OMR',
  'TND',
])

export function currencyFractionDigits(currencyCode: string): number {
  const c = (currencyCode || '').toUpperCase()
  if (!c) return 2
  return THREE_DECIMAL_CURRENCIES.has(c) ? 3 : 2
}

/** Round to currency minor units (avoids float compare bugs, e.g. BHD 3 dp). */
export function roundMoneyAmount(amount: number, currencyCode: string): number {
  const digits = currencyFractionDigits(currencyCode)
  const f = 10 ** digits
  const n = Number(amount)
  if (!Number.isFinite(n)) return 0
  return Math.round((n + Number.EPSILON) * f) / f
}

/** True when a > b beyond half a minor unit (currency-safe). */
export function moneyGreaterThan(a: number, b: number, currencyCode: string): boolean {
  const digits = currencyFractionDigits(currencyCode)
  const eps = 0.5 * 10 ** -digits
  return roundMoneyAmount(a, currencyCode) - roundMoneyAmount(b, currencyCode) > eps
}

/** Smallest currency unit for HTML number inputs (e.g. 0.001 for BHD, 0.01 for USD). */
export function currencyInputStep(currencyCode: string): number {
  return 10 ** -currencyFractionDigits(currencyCode)
}

export function currencyAmountPlaceholder(currencyCode: string): string {
  const digits = currencyFractionDigits(currencyCode)
  return `0.${'0'.repeat(digits)}`
}

/**
 * Format a monetary amount using the company's ISO currency (from ERPNext Company.default_currency).
 */
export function formatMoneyAmount(
  amount: number,
  currencyCode: string,
  locale: string = 'en'
): string {
  const currency = (currencyCode || '').toUpperCase()
  const safe = Number(amount)
  if (Number.isNaN(safe)) return ''
  if (!currency) {
    return safe.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 3 })
  }
  const digits = currencyFractionDigits(currency)
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(safe)
  } catch {
    return `${safe.toFixed(digits)} ${currency}`
  }
}
