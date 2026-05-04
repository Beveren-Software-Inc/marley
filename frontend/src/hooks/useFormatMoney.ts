import { useCallback, useEffect, useState } from 'react'
import { useCareContext } from '../providers/CareContextProvider'
import { fetchDefaultCompanyCurrency } from '../services/common'
import { formatMoneyAmount } from '../utils/currencyFormat'

/**
 * Format money using Company.default_currency.
 * Pass `companyName` when the UI has a specific company selected (e.g. invoice modal); otherwise uses session default from context.
 */
export function useFormatMoney(companyName?: string | null) {
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

  const code = ((overrideCurrency ?? companyCurrency) || 'USD').toUpperCase()
  return useCallback((amount: number) => formatMoneyAmount(amount, code), [code])
}
