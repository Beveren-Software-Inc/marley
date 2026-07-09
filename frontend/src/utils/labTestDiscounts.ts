import type { LabRequestItem } from '../services/serviceRequests'

export type DiscountType = 'Amount'

export interface LabLineDiscount {
  discount_type: DiscountType
  discount_rate: number
  discount: number
}

export const defaultLineDiscount = (): LabLineDiscount => ({
  discount_type: 'Amount',
  discount_rate: 0,
  discount: 0,
})

export function computeLineNet(
  amount: number,
  d: LabLineDiscount
): { net: number; applied: number } {
  const gross = amount || 0
  const applied = Math.min(gross, Math.max(0, d.discount || 0))
  return { net: Math.max(0, gross - applied), applied }
}

export function mergeDiscountsIntoBasket(
  items: LabRequestItem[],
  lineDiscounts: Record<string, LabLineDiscount>
): LabRequestItem[] {
  return items.map((item) => {
    if (item.kind === 'single') {
      const d = lineDiscounts[item.template]
      if (!d || !d.discount) return item
      return {
        ...item,
        discount_type: 'Amount',
        discount_rate: 0,
        discount: d.discount,
      }
    }
    const child_discounts: Record<string, LabLineDiscount> = {}
    for (const tpl of item.children) {
      const d = lineDiscounts[tpl]
      if (d && d.discount) {
        child_discounts[tpl] = {
          discount_type: 'Amount',
          discount_rate: 0,
          discount: d.discount,
        }
      }
    }
    return Object.keys(child_discounts).length ? { ...item, child_discounts } : item
  })
}

export function extractLineDiscountsFromBasket(
  items: LabRequestItem[]
): Record<string, LabLineDiscount> {
  const out: Record<string, LabLineDiscount> = {}
  for (const item of items) {
    if (item.kind === 'single') {
      out[item.template] = {
        discount_type: 'Amount',
        discount_rate: 0,
        discount: item.discount || 0,
      }
    } else if (item.kind === 'group') {
      for (const tpl of item.children) {
        const d = item.child_discounts?.[tpl]
        out[tpl] = d
          ? {
              discount_type: 'Amount',
              discount_rate: 0,
              discount: d.discount || 0,
            }
          : defaultLineDiscount()
      }
    }
  }
  return out
}

export function parseLabRequestItems(raw: unknown): LabRequestItem[] {
  if (!raw) return []
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? (parsed as LabRequestItem[]) : []
    } catch {
      return []
    }
  }
  return Array.isArray(raw) ? (raw as LabRequestItem[]) : []
}
