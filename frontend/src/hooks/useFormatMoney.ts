import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCareContext } from '../providers/CareContextProvider'
import { fetchDefaultCompanyCurrency } from '../services/common'
import {
  currencyAmountPlaceholder,
  currencyFractionDigits,
  currencyInputStep,
  formatMoneyAmount,
} from '../utils/currencyFormat'

function useResolvedCurrencyCode(companyName?: string | null): string {
  const { companyCurrency } = useCareContext()
  const [overrideCurrency, setOverrideCurrency] = useState<string | null>(null)

  useEffect(() => {
    const c = companyName?.trim()
    if (!c) {
      setOverrideCurrency(null)
      return
    }
    let cancelled = false
    fetchDefaultCompanyCurrency(c)
      .then((msg) => {
        if (!cancelled) setOverrideCurrency(msg.currency || null)
      })
      .catch(() => {
        if (!cancelled) setOverrideCurrency(null)
      })
    return () => {
      cancelled = true
    }
  }, [companyName])

  const resolved = ((overrideCurrency ?? companyCurrency) || '').trim()
  return resolved ? resolved.toUpperCase() : ''
}

/**
 * Format money using Company.default_currency.
 * Pass `companyName` when the UI has a specific company selected (e.g. invoice modal); otherwise uses session default from context.
 */
export function useFormatMoney(companyName?: string | null) {
  const code = useResolvedCurrencyCode(companyName)
  return useCallback(
    (amount: number) => {
      if (!code) {
        const safe = Number(amount)
        if (Number.isNaN(safe)) return ''
        return safe.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
      }
      return formatMoneyAmount(amount, code)
    },
    [code]
  )
}

/** HTML number input settings aligned with company currency (3 decimals for BHD, etc.). */
export function useMoneyInputConfig(companyName?: string | null) {
  const currencyCode = useResolvedCurrencyCode(companyName)
  return useMemo(() => {
    const step = currencyInputStep(currencyCode)
    return {
      currencyCode,
      fractionDigits: currencyFractionDigits(currencyCode),
      step,
      min: step,
      placeholder: currencyAmountPlaceholder(currencyCode),
      format: (amount: number) => formatMoneyAmount(amount, currencyCode),
    }
  }, [currencyCode])
}
